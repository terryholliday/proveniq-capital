/**
 * Proveniq Capital - Payout Service
 * THE HAND: Executes settlements via payment rails
 * 
 * STATE 3: THE RAIL SWITCH
 * - Check amount threshold
 * - Route to appropriate adapter (Stripe/USDC)
 * - Record in ledger
 */

import { v4 as uuidv4 } from 'uuid';
import {
  PayoutTransaction,
  PayoutRequest,
  PayoutResult,
  PayoutStatus,
  PayoutRail,
} from '../../shared/types';
import { LedgerService } from '../../core/ledger';
import { TreasuryService } from '../../core/treasury';
import { PayoutRepository } from './payout.repository';
import { StripeAdapter } from './adapters/stripe.adapter';
import { USDCAdapter } from './adapters/usdc.adapter';

export class PayoutService {
  private readonly manualApprovalThreshold: bigint;

  constructor(
    private readonly repository: PayoutRepository,
    private readonly ledger: LedgerService,
    private readonly treasury: TreasuryService,
    private readonly stripeAdapter: StripeAdapter,
    private readonly usdcAdapter: USDCAdapter
  ) {
    this.manualApprovalThreshold = BigInt(process.env.MANUAL_APPROVAL_THRESHOLD_CENTS || '1000000');
  }

  /**
   * Initiate a payout for an approved claim
   */
  async initiatePayout(request: PayoutRequest): Promise<PayoutResult> {
    const payoutId = uuidv4();
    const idempotencyKey = `payout-${request.claim_id}`;

    // Check for existing payout (idempotency)
    const existing = await this.repository.getByClaimId(request.claim_id);
    if (existing) {
      return {
        success: existing.status === 'CLEARED',
        payout_id: existing.id,
        status: existing.status,
        tx_hash: existing.tx_hash,
        error: existing.status === 'FAILED' ? existing.failure_reason || undefined : undefined,
      };
    }

    // Determine rail
    const rail = this.determineRail(request);

    // Create payout record
    const payout: PayoutTransaction = {
      id: payoutId,
      claim_id: request.claim_id,
      policy_id: request.policy_id,
      recipient_did: request.recipient_did,
      recipient_address: request.recipient_address,
      amount: request.amount,
      currency: request.currency,
      rail,
      status: 'PENDING',
      tx_hash: null,
      stripe_transfer_id: null,
      ledger_entry_id: '',
      created_at: new Date(),
      processed_at: null,
      cleared_at: null,
      failure_reason: null,
      idempotency_key: idempotencyKey,
    };

    await this.repository.create(payout);

    // Check if manual approval required
    if (this.treasury.requiresManualApproval(request.amount)) {
      await this.repository.updateStatus(payoutId, 'MANUAL_REVIEW');
      console.log(`[Payout] Amount ${request.amount} requires manual approval`);
      return {
        success: true,
        payout_id: payoutId,
        status: 'MANUAL_REVIEW',
        tx_hash: null,
      };
    }

    // Get default pool and lock funds
    const pool = await this.treasury.getDefaultPool(request.currency);
    if (!pool) {
      await this.repository.updateStatus(payoutId, 'FAILED', 'No liquidity pool available');
      return {
        success: false,
        payout_id: payoutId,
        status: 'FAILED',
        tx_hash: null,
        error: 'No liquidity pool available',
      };
    }

    const lock = await this.treasury.lockFunds(pool.id, request.claim_id, request.amount);
    if (!lock) {
      await this.repository.updateStatus(payoutId, 'FAILED', 'Insufficient liquidity');
      return {
        success: false,
        payout_id: payoutId,
        status: 'FAILED',
        tx_hash: null,
        error: 'Insufficient liquidity',
      };
    }

    // Record claim approved in ledger
    await this.ledger.recordClaimApproved(
      request.claim_id,
      request.amount,
      request.currency,
      'SYSTEM'
    );

    // Update status to processing
    await this.repository.updateStatus(payoutId, 'PROCESSING');

    // Execute payout via appropriate rail
    try {
      const result = await this.executePayoutViaRail(payout);

      if (result.success) {
        // Record claim paid in ledger
        await this.ledger.recordClaimPaid(
          request.claim_id,
          request.amount,
          request.currency,
          'SYSTEM'
        );

        // Release the lock
        await this.treasury.releaseLock(lock.id);

        // Update payout record
        await this.repository.markCleared(payoutId, result.tx_hash || '');

        return {
          success: true,
          payout_id: payoutId,
          status: 'CLEARED',
          tx_hash: result.tx_hash,
        };
      } else {
        // Return funds to pool
        await this.treasury.releaseLock(lock.id);
        await this.repository.updateStatus(payoutId, 'FAILED', result.error);

        return {
          success: false,
          payout_id: payoutId,
          status: 'FAILED',
          tx_hash: null,
          error: result.error,
        };
      }
    } catch (error) {
      // Return funds to pool on exception
      await this.treasury.releaseLock(lock.id);
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.repository.updateStatus(payoutId, 'FAILED', errorMsg);

      return {
        success: false,
        payout_id: payoutId,
        status: 'FAILED',
        tx_hash: null,
        error: errorMsg,
      };
    }
  }

  /**
   * Approve a payout that was queued for manual review
   */
  async approveManualPayout(payoutId: string, approvedBy: string): Promise<PayoutResult> {
    const payout = await this.repository.getById(payoutId);
    
    if (!payout) {
      return { success: false, payout_id: payoutId, status: 'FAILED', tx_hash: null, error: 'Payout not found' };
    }

    if (payout.status !== 'MANUAL_REVIEW') {
      return { success: false, payout_id: payoutId, status: payout.status, tx_hash: null, error: 'Payout not in manual review' };
    }

    console.log(`[Payout] Manual approval by ${approvedBy} for payout ${payoutId}`);

    // Re-initiate the payout flow (skip threshold check)
    const pool = await this.treasury.getDefaultPool(payout.currency);
    if (!pool) {
      await this.repository.updateStatus(payoutId, 'FAILED', 'No liquidity pool');
      return { success: false, payout_id: payoutId, status: 'FAILED', tx_hash: null, error: 'No liquidity pool' };
    }

    const lock = await this.treasury.lockFunds(pool.id, payout.claim_id, payout.amount);
    if (!lock) {
      await this.repository.updateStatus(payoutId, 'FAILED', 'Insufficient liquidity');
      return { success: false, payout_id: payoutId, status: 'FAILED', tx_hash: null, error: 'Insufficient liquidity' };
    }

    await this.ledger.recordClaimApproved(payout.claim_id, payout.amount, payout.currency, approvedBy);
    await this.repository.updateStatus(payoutId, 'PROCESSING');

    try {
      const result = await this.executePayoutViaRail(payout);

      if (result.success) {
        await this.ledger.recordClaimPaid(payout.claim_id, payout.amount, payout.currency, approvedBy);
        await this.treasury.releaseLock(lock.id);
        await this.repository.markCleared(payoutId, result.tx_hash || '');
        return { success: true, payout_id: payoutId, status: 'CLEARED', tx_hash: result.tx_hash };
      } else {
        await this.treasury.releaseLock(lock.id);
        await this.repository.updateStatus(payoutId, 'FAILED', result.error);
        return { success: false, payout_id: payoutId, status: 'FAILED', tx_hash: null, error: result.error };
      }
    } catch (error) {
      await this.treasury.releaseLock(lock.id);
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.repository.updateStatus(payoutId, 'FAILED', errorMsg);
      return { success: false, payout_id: payoutId, status: 'FAILED', tx_hash: null, error: errorMsg };
    }
  }

  /**
   * Get payout by ID
   */
  async getPayoutById(payoutId: string): Promise<PayoutTransaction | null> {
    return this.repository.getById(payoutId);
  }

  /**
   * Get all payouts for a claim
   */
  async getPayoutsByClaimId(claimId: string): Promise<PayoutTransaction[]> {
    return this.repository.getByClaimId(claimId).then(p => p ? [p] : []);
  }

  /**
   * Get payouts pending manual review
   */
  async getPendingManualReview(): Promise<PayoutTransaction[]> {
    return this.repository.getByStatus('MANUAL_REVIEW');
  }

  /**
   * Determine which payment rail to use
   */
  private determineRail(request: PayoutRequest): PayoutRail {
    if (request.preferred_rail) {
      return request.preferred_rail;
    }

    // USDC for crypto, Stripe for fiat
    if (request.currency === 'USDC') {
      return 'USDC';
    }

    return 'STRIPE';
  }

  /**
   * Execute payout via the appropriate adapter
   */
  private async executePayoutViaRail(payout: PayoutTransaction): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
    switch (payout.rail) {
      case 'STRIPE':
        return this.stripeAdapter.transfer(
          payout.recipient_address,
          payout.amount,
          payout.idempotency_key
        );

      case 'USDC':
        return this.usdcAdapter.transfer(
          payout.recipient_address,
          payout.amount,
          payout.idempotency_key
        );

      case 'WIRE':
        // Wire transfers always require manual processing
        return { success: false, error: 'Wire transfers require manual processing' };

      default:
        return { success: false, error: `Unknown rail: ${payout.rail}` };
    }
  }
}
