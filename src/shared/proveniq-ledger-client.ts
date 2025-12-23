/**
 * Proveniq Capital - External Ledger Client
 * 
 * CANONICAL SCHEMA v1.0.0
 * - Uses DOMAIN_NOUN_VERB_PAST event naming
 * - Publishes to /api/v1/events/canonical endpoint
 * - Includes idempotency_key for duplicate prevention
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

const LEDGER_API_URL = process.env.PROVENIQ_LEDGER_URL || 'http://localhost:8006';
const SCHEMA_VERSION = '1.0.0';
const PRODUCER = 'capital';
const PRODUCER_VERSION = '1.0.0';

export type CapitalLedgerEventType =
  | 'CAPITAL_PREMIUM_RECEIVED'
  | 'CAPITAL_CLAIM_PAYOUT'
  | 'CAPITAL_LOAN_ORIGINATED'
  | 'CAPITAL_LOAN_REPAID'
  | 'CAPITAL_COLLATERAL_LOCKED'
  | 'CAPITAL_COLLATERAL_RELEASED'
  | 'CAPITAL_RESERVE_TRANSFER'
  | 'CAPITAL_MANUAL_ADJUSTMENT';

export interface LedgerWriteResult {
  eventId: string;
  sequenceNumber: number;
  entryHash: string;
  timestamp: string;
}

function hashPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(json).digest('hex');
}

class ProveniqLedgerClient {
  /**
   * Write canonical event to Proveniq Ledger
   * POST /api/v1/events/canonical
   */
  async writeEvent(
    eventType: CapitalLedgerEventType,
    assetId: string | null,
    actorId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
    subject?: { policy_id?: string; loan_id?: string; claim_id?: string }
  ): Promise<LedgerWriteResult | null> {
    const corrId = correlationId || uuidv4();
    const idempotencyKey = `capital_${uuidv4()}`;
    const occurredAt = new Date().toISOString();
    const canonicalHashHex = hashPayload(payload);

    const canonicalEvent = {
      schema_version: SCHEMA_VERSION,
      event_type: eventType,
      occurred_at: occurredAt,
      committed_at: occurredAt,
      correlation_id: corrId,
      idempotency_key: idempotencyKey,
      producer: PRODUCER,
      producer_version: PRODUCER_VERSION,
      subject: {
        asset_id: assetId || 'SYSTEM',
        ...subject,
      },
      payload: {
        ...payload,
        actor_id: actorId,
      },
      canonical_hash_hex: canonicalHashHex,
    };

    try {
      const response = await fetch(`${LEDGER_API_URL}/api/v1/events/canonical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canonicalEvent),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[PROVENIQ_LEDGER] Write failed: ${response.status} ${errorText}`);
        return null;
      }

      const data = await response.json() as any;
      console.log(`[PROVENIQ_LEDGER] Event ${eventType} written: ${data.event_id}`);
      
      return {
        eventId: data.event_id,
        sequenceNumber: data.sequence_number,
        entryHash: data.entry_hash,
        timestamp: data.committed_at,
      };
    } catch (error) {
      console.error('[PROVENIQ_LEDGER] Write error:', error);
      return null;
    }
  }

  /**
   * Write premium received event
   */
  async writePremiumReceived(
    policyId: string,
    payerId: string,
    amountMicros: bigint,
    currency: string,
    transactionId: string
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_PREMIUM_RECEIVED',
      policyId,
      payerId,
      {
        policy_id: policyId,
        amount_micros: amountMicros.toString(),
        currency,
        internal_transaction_id: transactionId,
      }
    );
  }

  /**
   * Write claim payout event
   */
  async writeClaimPayout(
    claimId: string,
    recipientId: string,
    amountMicros: bigint,
    currency: string,
    payoutId: string,
    decision: string
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_CLAIM_PAYOUT',
      claimId,
      recipientId,
      {
        claim_id: claimId,
        payout_id: payoutId,
        amount_micros: amountMicros.toString(),
        currency,
        decision,
      }
    );
  }

  /**
   * Write loan originated event
   */
  async writeLoanOriginated(
    loanId: string,
    borrowerId: string,
    principalMicros: bigint,
    collateralAssetId: string,
    collateralValueMicros: bigint,
    termDays: number
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_LOAN_ORIGINATED',
      collateralAssetId,
      borrowerId,
      {
        loan_id: loanId,
        principal_micros: principalMicros.toString(),
        collateral_asset_id: collateralAssetId,
        collateral_value_micros: collateralValueMicros.toString(),
        term_days: termDays,
        originated_at: new Date().toISOString(),
      }
    );
  }

  /**
   * Write loan repaid event
   */
  async writeLoanRepaid(
    loanId: string,
    borrowerId: string,
    principalMicros: bigint,
    interestMicros: bigint,
    collateralAssetId: string
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_LOAN_REPAID',
      collateralAssetId,
      borrowerId,
      {
        loan_id: loanId,
        principal_repaid_micros: principalMicros.toString(),
        interest_paid_micros: interestMicros.toString(),
        collateral_asset_id: collateralAssetId,
        repaid_at: new Date().toISOString(),
      }
    );
  }

  /**
   * Write collateral locked event
   */
  async writeCollateralLocked(
    loanId: string,
    assetId: string,
    ownerId: string,
    valueMicros: bigint,
    anchorId?: string
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_COLLATERAL_LOCKED',
      assetId,
      ownerId,
      {
        loan_id: loanId,
        value_micros: valueMicros.toString(),
        anchor_id: anchorId,
        locked_at: new Date().toISOString(),
      }
    );
  }

  /**
   * Write collateral released event
   */
  async writeCollateralReleased(
    loanId: string,
    assetId: string,
    ownerId: string,
    reason: 'LOAN_REPAID' | 'LOAN_DEFAULT' | 'MANUAL_RELEASE'
  ): Promise<LedgerWriteResult | null> {
    return this.writeEvent(
      'CAPITAL_COLLATERAL_RELEASED',
      assetId,
      ownerId,
      {
        loan_id: loanId,
        reason,
        released_at: new Date().toISOString(),
      }
    );
  }
}

// Singleton
let clientInstance: ProveniqLedgerClient | null = null;

export function getProveniqLedgerClient(): ProveniqLedgerClient {
  if (!clientInstance) {
    clientInstance = new ProveniqLedgerClient();
  }
  return clientInstance;
}
