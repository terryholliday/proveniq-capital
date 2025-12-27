/**
 * Proveniq Capital - Treasury Repository
 * PostgreSQL persistence for liquidity pools
 */

import { Pool } from 'pg';
import {
  LiquidityPool,
  FundLock,
  TreasuryAlert,
} from '../../shared/types';

export class TreasuryRepository {
  constructor(private readonly pool: Pool) {}

  async createPool(liquidityPool: LiquidityPool): Promise<void> {
    await this.pool.query(
      `INSERT INTO liquidity_pools 
       (id, name, account_type, currency, balance, minimum_reserve, status, created_at, last_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        liquidityPool.id,
        liquidityPool.name,
        liquidityPool.account_type,
        liquidityPool.currency,
        liquidityPool.balance.toString(),
        liquidityPool.minimum_reserve.toString(),
        liquidityPool.status,
        liquidityPool.created_at,
        liquidityPool.last_activity,
      ]
    );
  }

  async getPool(poolId: string): Promise<LiquidityPool | null> {
    const result = await this.pool.query(
      `SELECT * FROM liquidity_pools WHERE id = $1`,
      [poolId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToPool(result.rows[0]);
  }

  async getDefaultPool(currency: 'USD' | 'USDC'): Promise<LiquidityPool | null> {
    const result = await this.pool.query(
      `SELECT * FROM liquidity_pools 
       WHERE currency = $1 AND status = 'ACTIVE' 
       ORDER BY balance DESC LIMIT 1`,
      [currency]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToPool(result.rows[0]);
  }

  async getAllPools(): Promise<LiquidityPool[]> {
    const result = await this.pool.query(`SELECT * FROM liquidity_pools`);
    return result.rows.map(this.mapRowToPool);
  }

  async increasePoolBalance(poolId: string, amount: bigint): Promise<void> {
    await this.pool.query(
      `UPDATE liquidity_pools 
       SET balance = balance + $2, last_activity = NOW()
       WHERE id = $1`,
      [poolId, amount.toString()]
    );
  }

  async decreasePoolBalance(poolId: string, amount: bigint): Promise<void> {
    await this.pool.query(
      `UPDATE liquidity_pools 
       SET balance = balance - $2, last_activity = NOW()
       WHERE id = $1`,
      [poolId, amount.toString()]
    );
  }

  async createLock(lock: FundLock): Promise<void> {
    await this.pool.query(
      `INSERT INTO fund_locks 
       (id, pool_id, claim_id, amount, locked_at, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        lock.id,
        lock.pool_id,
        lock.claim_id,
        lock.amount.toString(),
        lock.locked_at,
        lock.expires_at,
        lock.status,
      ]
    );
  }

  async updateLockStatus(lockId: string, status: 'LOCKED' | 'RELEASED' | 'EXPIRED'): Promise<void> {
    await this.pool.query(
      `UPDATE fund_locks SET status = $2 WHERE id = $1`,
      [lockId, status]
    );
  }

  async getStaleLocks(): Promise<FundLock[]> {
    const result = await this.pool.query(
      `SELECT * FROM fund_locks 
       WHERE status = 'LOCKED' AND expires_at < NOW()`
    );
    return result.rows.map(this.mapRowToLock);
  }

  async getActiveLocks(): Promise<FundLock[]> {
    const result = await this.pool.query(
      `SELECT * FROM fund_locks WHERE status = 'LOCKED'`
    );
    return result.rows.map(this.mapRowToLock);
  }

  async getLockByClaimId(claimId: string): Promise<FundLock | null> {
    const result = await this.pool.query(
      `SELECT * FROM fund_locks WHERE claim_id = $1 AND status = 'LOCKED'`,
      [claimId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToLock(result.rows[0]);
  }

  async createAlert(alert: TreasuryAlert): Promise<void> {
    await this.pool.query(
      `INSERT INTO treasury_alerts 
       (id, type, pool_id, current_balance, threshold, message, created_at, acknowledged)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        alert.id,
        alert.type,
        alert.pool_id,
        alert.current_balance.toString(),
        alert.threshold.toString(),
        alert.message,
        alert.created_at,
        alert.acknowledged,
      ]
    );
  }

  async getUnacknowledgedAlerts(): Promise<TreasuryAlert[]> {
    const result = await this.pool.query(
      `SELECT * FROM treasury_alerts WHERE acknowledged = false ORDER BY created_at DESC`
    );
    return result.rows.map(this.mapRowToAlert);
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    await this.pool.query(
      `UPDATE treasury_alerts SET acknowledged = true WHERE id = $1`,
      [alertId]
    );
  }

  private mapRowToPool(row: any): LiquidityPool {
    return {
      id: row.id,
      name: row.name,
      account_type: row.account_type,
      currency: row.currency,
      balance: BigInt(row.balance),
      minimum_reserve: BigInt(row.minimum_reserve),
      status: row.status,
      created_at: row.created_at,
      last_activity: row.last_activity,
    };
  }

  private mapRowToLock(row: any): FundLock {
    return {
      id: row.id,
      pool_id: row.pool_id,
      claim_id: row.claim_id,
      amount: BigInt(row.amount),
      locked_at: row.locked_at,
      expires_at: row.expires_at,
      status: row.status,
    };
  }

  private mapRowToAlert(row: any): TreasuryAlert {
    return {
      id: row.id,
      type: row.type,
      pool_id: row.pool_id,
      current_balance: BigInt(row.current_balance),
      threshold: BigInt(row.threshold),
      message: row.message,
      created_at: row.created_at,
      acknowledged: row.acknowledged,
    };
  }
}
