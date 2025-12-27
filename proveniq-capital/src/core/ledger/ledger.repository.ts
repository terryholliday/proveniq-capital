/**
 * Proveniq Capital - Ledger Repository
 * PostgreSQL persistence layer for General Ledger
 * 
 * IMMUTABILITY: This repository only INSERTs. Never UPDATE or DELETE.
 */

import { Pool } from 'pg';
import {
  LedgerEntry,
  LedgerTransaction,
  AccountType,
  Currency,
  AccountBalance,
} from '../../shared/types';

export class LedgerRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Save a complete transaction atomically
   * CRITICAL: INSERT only - never UPDATE
   */
  async saveTransaction(transaction: LedgerTransaction): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert transaction record
      await client.query(
        `INSERT INTO ledger_transactions 
         (id, description, created_at, created_by)
         VALUES ($1, $2, $3, $4)`,
        [
          transaction.id,
          transaction.description,
          transaction.created_at,
          transaction.created_by,
        ]
      );

      // Insert all entries (immutable - no updates ever)
      for (const entry of transaction.entries) {
        await client.query(
          `INSERT INTO ledger_entries
           (id, transaction_id, account, amount_micros, currency,
            reference_id, reference_type, created_at, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entry.id,
            entry.transaction_id,
            entry.account,
            entry.amount_micros.toString(),
            entry.currency,
            entry.reference_id,
            entry.reference_type,
            entry.created_at,
            entry.memo || null,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Compute account balance from entries (source of truth)
   * Balance = SUM of all amount_micros for this account
   */
  async computeAccountBalance(
    account: AccountType,
    currency: Currency
  ): Promise<AccountBalance> {
    const result = await this.pool.query(
      `SELECT 
         COALESCE(SUM(amount_micros), 0) as balance,
         MAX(id) as last_entry_id,
         MAX(created_at) as last_updated
       FROM ledger_entries
       WHERE account = $1 AND currency = $2`,
      [account, currency]
    );

    const row = result.rows[0];
    return {
      account,
      currency,
      balance_micros: BigInt(row.balance || '0'),
      last_entry_id: row.last_entry_id || '',
      last_updated: row.last_updated || new Date(),
    };
  }

  /**
   * Get all account balances
   */
  async getAllAccountBalances(): Promise<AccountBalance[]> {
    const result = await this.pool.query(
      `SELECT 
         account,
         currency,
         SUM(amount_micros) as balance,
         MAX(id) as last_entry_id,
         MAX(created_at) as last_updated
       FROM ledger_entries
       GROUP BY account, currency
       ORDER BY account, currency`
    );

    return result.rows.map(row => ({
      account: row.account,
      currency: row.currency,
      balance_micros: BigInt(row.balance || '0'),
      last_entry_id: row.last_entry_id || '',
      last_updated: row.last_updated || new Date(),
    }));
  }

  /**
   * Get all entries for a reference
   */
  async getEntriesByReference(referenceId: string): Promise<LedgerEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM ledger_entries WHERE reference_id = $1 ORDER BY created_at`,
      [referenceId]
    );

    return result.rows.map(this.mapRowToEntry);
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId: string): Promise<LedgerTransaction | null> {
    const txResult = await this.pool.query(
      `SELECT * FROM ledger_transactions WHERE id = $1`,
      [transactionId]
    );

    if (txResult.rows.length === 0) return null;

    const txRow = txResult.rows[0];
    const entriesResult = await this.pool.query(
      `SELECT * FROM ledger_entries WHERE transaction_id = $1 ORDER BY created_at`,
      [transactionId]
    );

    return {
      id: txRow.id,
      entries: entriesResult.rows.map(this.mapRowToEntry),
      description: txRow.description,
      created_at: txRow.created_at,
      created_by: txRow.created_by,
    };
  }

  /**
   * Get all transactions (for integrity check)
   */
  async getAllTransactions(): Promise<LedgerTransaction[]> {
    const txResult = await this.pool.query(
      `SELECT * FROM ledger_transactions ORDER BY created_at`
    );

    const transactions: LedgerTransaction[] = [];

    for (const txRow of txResult.rows) {
      const entriesResult = await this.pool.query(
        `SELECT * FROM ledger_entries WHERE transaction_id = $1`,
        [txRow.id]
      );

      transactions.push({
        id: txRow.id,
        entries: entriesResult.rows.map(this.mapRowToEntry),
        description: txRow.description,
        created_at: txRow.created_at,
        created_by: txRow.created_by,
      });
    }

    return transactions;
  }

  /**
   * Check if a claim has already been paid (idempotency check)
   * Looks for EXPENSE_CLAIMS entries with this claim as reference
   */
  async hasClaimBeenPaid(claimId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM ledger_entries 
       WHERE reference_id = $1 
       AND reference_type = 'CLAIM'
       AND account = 'EXPENSE_CLAIMS'
       AND amount_micros > 0
       LIMIT 1`,
      [claimId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get entries by account
   */
  async getEntriesByAccount(
    account: AccountType,
    currency: Currency,
    limit: number = 100
  ): Promise<LedgerEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM ledger_entries 
       WHERE account = $1 AND currency = $2 
       ORDER BY created_at DESC 
       LIMIT $3`,
      [account, currency, limit]
    );

    return result.rows.map(this.mapRowToEntry);
  }

  private mapRowToEntry(row: any): LedgerEntry {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      account: row.account,
      amount_micros: BigInt(row.amount_micros),
      currency: row.currency,
      reference_id: row.reference_id,
      reference_type: row.reference_type,
      created_at: row.created_at,
      memo: row.memo,
    };
  }
}
