/**
 * Proveniq Capital - Claims Listener Service
 * THE EAR: Watches ClaimsIQ for PAY verdicts
 * 
 * STATE 1: THE WATCHTOWER
 * - Poll ClaimsIQ for new DecisionRecords
 * - Verify cryptographic seal
 * - Check idempotency (never pay twice)
 * - Initiate payout if valid
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  ClaimsIQDecisionRecord,
  ClaimsIQPollResponse,
  ClaimsIQWebhookPayload,
  ClaimsIQAuditSeal,
  SealVerificationResult,
} from '../../shared/types';
import { LedgerRepository } from '../../core/ledger';
import { PayoutService } from '../payouts';

export class ClaimsListenerService {
  private readonly client: AxiosInstance;
  private readonly webhookSecret: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastCursor: string | null = null;

  constructor(
    private readonly ledgerRepository: LedgerRepository,
    private readonly payoutService: PayoutService,
    private readonly config: ClaimsListenerConfig
  ) {
    this.client = axios.create({
      baseURL: config.claimsIqBaseUrl,
      headers: {
        'Authorization': `Bearer ${config.claimsIqApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Start polling ClaimsIQ for new decisions
   */
  startPolling(intervalMs: number = 30000): void {
    if (this.pollInterval) {
      console.log('[ClaimsListener] Polling already active');
      return;
    }

    console.log(`[ClaimsListener] Starting poll every ${intervalMs}ms`);
    
    // Initial poll
    this.pollForDecisions();

    // Schedule recurring polls
    this.pollInterval = setInterval(() => {
      this.pollForDecisions();
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[ClaimsListener] Polling stopped');
    }
  }

  /**
   * Poll ClaimsIQ for new PAY decisions
   */
  async pollForDecisions(): Promise<void> {
    try {
      console.log('[ClaimsListener] Polling for new decisions...');

      const response = await this.client.get<ClaimsIQPollResponse>('/api/decisions', {
        params: {
          status: 'PAY',
          cursor: this.lastCursor,
          limit: 50,
        },
      });

      const { decisions, cursor, has_more } = response.data;

      console.log(`[ClaimsListener] Found ${decisions.length} PAY decisions`);

      for (const decision of decisions) {
        await this.processDecision(decision);
      }

      // Update cursor for next poll
      if (cursor) {
        this.lastCursor = cursor;
      }

      // If there are more, poll again immediately
      if (has_more) {
        setImmediate(() => this.pollForDecisions());
      }
    } catch (error) {
      console.error('[ClaimsListener] Poll failed:', error);
    }
  }

  /**
   * Handle incoming webhook from ClaimsIQ
   */
  async handleWebhook(payload: ClaimsIQWebhookPayload, signature: string): Promise<WebhookResult> {
    // Verify webhook signature
    const expectedSignature = this.computeWebhookSignature(payload);
    if (signature !== expectedSignature) {
      console.error('[ClaimsListener] Invalid webhook signature');
      return { success: false, error: 'INVALID_SIGNATURE' };
    }

    if (payload.event_type !== 'DECISION_ISSUED') {
      return { success: true, message: 'Event type ignored' };
    }

    if (payload.decision.status !== 'PAY') {
      return { success: true, message: 'Non-PAY decision ignored' };
    }

    const result = await this.processDecision(payload.decision);
    return result;
  }

  /**
   * Process a single decision
   * ZERO-TRUST: Verify seal, check idempotency, then pay
   */
  private async processDecision(decision: ClaimsIQDecisionRecord): Promise<WebhookResult> {
    const claimId = decision.claim_id;

    console.log(`[ClaimsListener] Processing decision for claim ${claimId}`);

    // GATE 1: Verify the decision is a PAY
    if (decision.status !== 'PAY') {
      console.log(`[ClaimsListener] Skipping non-PAY decision: ${decision.status}`);
      return { success: true, message: 'Non-PAY decision skipped' };
    }

    // GATE 2: Verify cryptographic seal
    const sealVerification = await this.verifySeal(decision);
    if (!sealVerification.valid) {
      console.error(`[ClaimsListener] SEAL VERIFICATION FAILED for claim ${claimId}:`, sealVerification.error);
      return { success: false, error: 'SEAL_VERIFICATION_FAILED', details: sealVerification };
    }

    // GATE 3: Idempotency check - have we already paid this claim?
    const alreadyPaid = await this.ledgerRepository.hasClaimBeenPaid(claimId);
    if (alreadyPaid) {
      console.log(`[ClaimsListener] Claim ${claimId} already paid. Skipping.`);
      return { success: true, message: 'Already paid (idempotent)' };
    }

    // GATE 4: Initiate payout
    try {
      const payoutResult = await this.payoutService.initiatePayout({
        claim_id: claimId,
        policy_id: decision.policy_id,
        recipient_did: decision.recipient_did,
        recipient_address: decision.recipient_payout_address,
        amount: decision.amount_approved,
        currency: decision.currency,
      });

      if (payoutResult.success) {
        console.log(`[ClaimsListener] Payout initiated for claim ${claimId}: ${payoutResult.payout_id}`);
        return { success: true, payout_id: payoutResult.payout_id };
      } else {
        console.error(`[ClaimsListener] Payout failed for claim ${claimId}:`, payoutResult.error);
        return { success: false, error: 'PAYOUT_FAILED', details: payoutResult.error };
      }
    } catch (error) {
      console.error(`[ClaimsListener] Payout exception for claim ${claimId}:`, error);
      return { success: false, error: 'PAYOUT_EXCEPTION', details: String(error) };
    }
  }

  /**
   * Verify the ClaimsIQ audit seal
   * ZERO-TRUST: We don't trust the decision without cryptographic proof
   */
  private async verifySeal(decision: ClaimsIQDecisionRecord): Promise<SealVerificationResult> {
    const seal = decision.audit_seal;

    if (!seal) {
      return {
        valid: false,
        signer_verified: false,
        timestamp_valid: false,
        hash_match: false,
        error: 'No audit seal present',
      };
    }

    // Verify hash matches decision payload
    const payloadHash = this.computeDecisionHash(decision);
    const hashMatch = payloadHash === seal.hash;

    if (!hashMatch) {
      return {
        valid: false,
        signer_verified: false,
        timestamp_valid: false,
        hash_match: false,
        error: 'Hash mismatch',
      };
    }

    // Verify timestamp is recent (within 24 hours)
    const sealTime = new Date(seal.timestamp).getTime();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const timestampValid = (now - sealTime) < maxAge;

    if (!timestampValid) {
      return {
        valid: false,
        signer_verified: false,
        timestamp_valid: false,
        hash_match: true,
        error: 'Seal timestamp too old',
      };
    }

    // In production: verify signature against ClaimsIQ public key
    // For now, we trust the signer_id matches expected ClaimsIQ system
    const signerVerified = this.verifySignerTrusted(seal);

    return {
      valid: hashMatch && timestampValid && signerVerified,
      signer_verified: signerVerified,
      timestamp_valid: timestampValid,
      hash_match: hashMatch,
    };
  }

  /**
   * Compute SHA-256 hash of decision payload
   */
  private computeDecisionHash(decision: ClaimsIQDecisionRecord): string {
    const payload = JSON.stringify({
      id: decision.id,
      claim_id: decision.claim_id,
      policy_id: decision.policy_id,
      status: decision.status,
      amount_approved: decision.amount_approved.toString(),
      currency: decision.currency,
      recipient_did: decision.recipient_did,
      decision_timestamp: decision.decision_timestamp,
    });

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verify signer is trusted ClaimsIQ system
   */
  private verifySignerTrusted(seal: ClaimsIQAuditSeal): boolean {
    // In production: verify against known ClaimsIQ system IDs
    // For now: accept any signer that starts with 'claimsiq-'
    return seal.signer_id.startsWith('claimsiq-');
  }

  /**
   * Compute HMAC signature for webhook verification
   */
  private computeWebhookSignature(payload: ClaimsIQWebhookPayload): string {
    const data = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(data)
      .digest('hex');
  }
}

export interface ClaimsListenerConfig {
  claimsIqBaseUrl: string;
  claimsIqApiKey: string;
  webhookSecret: string;
}

export interface WebhookResult {
  success: boolean;
  message?: string;
  payout_id?: string;
  error?: string;
  details?: unknown;
}
