/**
 * Proveniq Capital - Payout Repository
 * PostgreSQL persistence for payout transactions
 */

import { Pool } from 'pg';
import { PayoutTransaction, PayoutStatus } from '../../shared/types';

export class PayoutRepository {
  constructor(private readonly pool: Pool) {}

  async create(payout: PayoutTransaction): Promise<void> {
    await this.pool.query(
      `INSERT INTO payout_transactions 
       (id, claim_id, policy_id, recipient_did, recipient_address, amount, currency, 
        rail, status, tx_hash, stripe_transfer_id, ledger_entry_id, created_at, 
        processed_at, cleared_at, failure_reason, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        payout.id,
        payout.claim_id,
        payout.policy_id,
        payout.recipient_did,
        payout.recipient_address,
        payout.amount.toString(),
        payout.currency,
        payout.rail,
        payout.status,
        payout.tx_hash,
        payout.stripe_transfer_id,
        payout.ledger_entry_id,
        payout.created_at,
        payout.processed_at,
        payout.cleared_at,
        payout.failure_reason,
        payout.idempotency_key,
      ]
    );
  }

  async getById(payoutId: string): Promise<PayoutTransaction | null> {
    const result = await this.pool.query(
      `SELECT * FROM payout_transactions WHERE id = $1`,
      [payoutId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToPayout(result.rows[0]);
  }

  async getByClaimId(claimId: string): Promise<PayoutTransaction | null> {
    const result = await this.pool.query(
      `SELECT * FROM payout_transactions WHERE claim_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [claimId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToPayout(result.rows[0]);
  }

  async getByStatus(status: PayoutStatus): Promise<PayoutTransaction[]> {
    const result = await this.pool.query(
      `SELECT * FROM payout_transactions WHERE status = $1 ORDER BY created_at`,
      [status]
    );

    return result.rows.map(this.mapRowToPayout);
  }

  async updateStatus(payoutId: string, status: PayoutStatus, failureReason?: string): Promise<void> {
    if (failureReason) {
      await this.pool.query(
        `UPDATE payout_transactions SET status = $2, failure_reason = $3 WHERE id = $1`,
        [payoutId, status, failureReason]
      );
    } else {
      await this.pool.query(
        `UPDATE payout_transactions SET status = $2 WHERE id = $1`,
        [payoutId, status]
      );
    }
  }

  async markCleared(payoutId: string, txHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE payout_transactions 
       SET status = 'CLEARED', tx_hash = $2, cleared_at = NOW() 
       WHERE id = $1`,
      [payoutId, txHash]
    );
  }

  async markProcessing(payoutId: string): Promise<void> {
    await this.pool.query(
      `UPDATE payout_transactions 
       SET status = 'PROCESSING', processed_at = NOW() 
       WHERE id = $1`,
      [payoutId]
    );
  }

  private mapRowToPayout(row: any): PayoutTransaction {
    return {
      id: row.id,
      claim_id: row.claim_id,
      policy_id: row.policy_id,
      recipient_did: row.recipient_did,
      recipient_address: row.recipient_address,
      amount: BigInt(row.amount),
      currency: row.currency,
      rail: row.rail,
      status: row.status,
      tx_hash: row.tx_hash,
      stripe_transfer_id: row.stripe_transfer_id,
      ledger_entry_id: row.ledger_entry_id,
      created_at: row.created_at,
      processed_at: row.processed_at,
      cleared_at: row.cleared_at,
      failure_reason: row.failure_reason,
      idempotency_key: row.idempotency_key,
    };
  }
}
