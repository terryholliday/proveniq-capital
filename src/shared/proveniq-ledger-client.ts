/**
 * Proveniq Capital - External Ledger Client
 * 
 * Writes financial events to the PROVENIQ Ledger (port 8006) for
 * ecosystem-wide audit trail alongside the internal double-entry ledger.
 */

import { v4 as uuidv4 } from 'uuid';

const LEDGER_API_URL = process.env.PROVENIQ_LEDGER_URL || 'http://localhost:8006/api/v1';

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

class ProveniqLedgerClient {
  /**
   * Write event to Proveniq Ledger for ecosystem audit trail
   */
  async writeEvent(
    eventType: CapitalLedgerEventType,
    assetId: string | null,
    actorId: string,
    payload: Record<string, unknown>,
    correlationId?: string
  ): Promise<LedgerWriteResult | null> {
    const corrId = correlationId || `capital_${uuidv4().substring(0, 12)}`;

    try {
      const response = await fetch(`${LEDGER_API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'capital',
          event_type: eventType,
          asset_id: assetId,
          actor_id: actorId,
          correlation_id: corrId,
          payload,
        }),
      });

      if (!response.ok) {
        console.warn(`[PROVENIQ_LEDGER] Write failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      console.log(`[PROVENIQ_LEDGER] Event ${eventType} written: ${data.data?.event?.eventId}`);
      
      return {
        eventId: data.data?.event?.eventId || data.event_id,
        sequenceNumber: data.data?.event?.sequenceNumber || data.sequence_number,
        entryHash: data.data?.event?.entryHash || data.entry_hash,
        timestamp: data.data?.event?.createdAt || data.created_at,
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
