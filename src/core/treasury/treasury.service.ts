/**
 * Proveniq Capital - Treasury Service
 * Liquidity Pool Management & Fund Locking
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LiquidityPool,
  FundLock,
  LiquidityCheckResult,
  TreasuryAlert,
  TreasuryConfig,
} from '../../shared/types';
import { TreasuryRepository } from './treasury.repository';
import { LedgerService } from '../ledger';

export class TreasuryService {
  private config: TreasuryConfig;

  constructor(
    private readonly repository: TreasuryRepository,
    private readonly ledger: LedgerService
  ) {
    this.config = {
      manual_approval_threshold: BigInt(process.env.MANUAL_APPROVAL_THRESHOLD_CENTS || '1000000'),
      critical_reserve_minimum: BigInt(process.env.CRITICAL_RESERVE_MINIMUM_CENTS || '10000000'),
      auto_release_lock_hours: 24,
    };
  }

  /**
   * Check if pool has sufficient liquidity for a payout
   * STATE 2: THE LIQUIDITY CHECK
   */
  async checkLiquidity(
    poolId: string,
    amount: bigint,
    currency: 'USD' | 'USDC'
  ): Promise<LiquidityCheckResult> {
    const pool = await this.repository.getPool(poolId);

    if (!pool) {
      return {
        sufficient: false,
        pool_id: poolId,
        available_balance: 0n,
        requested_amount: amount,
        shortfall: amount,
        pool_status: 'DEPLETED',
      };
    }

    const available = pool.balance;
    const sufficient = available >= amount;
    const shortfall = sufficient ? 0n : amount - available;

    // Check for critical low
    if (pool.balance < pool.minimum_reserve) {
      await this.createAlert({
        type: pool.balance === 0n ? 'LIQUIDITY_FAILURE' : 'CRITICAL_LOW',
        pool_id: poolId,
        current_balance: pool.balance,
        threshold: pool.minimum_reserve,
        message: `Pool ${pool.name} below critical reserve`,
      });
    }

    return {
      sufficient,
      pool_id: poolId,
      available_balance: available,
      requested_amount: amount,
      shortfall,
      pool_status: pool.status,
    };
  }

  /**
   * Lock funds for a pending payout
   * Prevents double-spending during settlement
   */
  async lockFunds(
    poolId: string,
    claimId: string,
    amount: bigint
  ): Promise<FundLock | null> {
    // First check liquidity
    const check = await this.checkLiquidity(poolId, amount, 'USD');

    if (!check.sufficient) {
      await this.createAlert({
        type: 'LIQUIDITY_FAILURE',
        pool_id: poolId,
        current_balance: check.available_balance,
        threshold: amount,
        message: `Insufficient funds for claim ${claimId}. Shortfall: ${check.shortfall}`,
      });
      return null;
    }

    const lock: FundLock = {
      id: uuidv4(),
      pool_id: poolId,
      claim_id: claimId,
      amount,
      locked_at: new Date(),
      expires_at: new Date(Date.now() + this.config.auto_release_lock_hours * 60 * 60 * 1000),
      status: 'LOCKED',
    };

    await this.repository.createLock(lock);
    await this.repository.decreasePoolBalance(poolId, amount);

    return lock;
  }

  /**
   * Release locked funds after successful payout
   */
  async releaseLock(lockId: string): Promise<void> {
    await this.repository.updateLockStatus(lockId, 'RELEASED');
  }

  /**
   * Expire and return funds for stale locks
   */
  async expireStaleLocksAndReturnFunds(): Promise<number> {
    const staleLocks = await this.repository.getStaleLocks();
    let expiredCount = 0;

    for (const lock of staleLocks) {
      await this.repository.increasePoolBalance(lock.pool_id, lock.amount);
      await this.repository.updateLockStatus(lock.id, 'EXPIRED');
      expiredCount++;
    }

    return expiredCount;
  }

  /**
   * Check if amount requires manual approval
   * STATE 3: THE RAIL SWITCH (threshold check)
   */
  requiresManualApproval(amount: bigint): boolean {
    return amount > this.config.manual_approval_threshold;
  }

  /**
   * Get the default pool for a currency
   */
  async getDefaultPool(currency: 'USD' | 'USDC'): Promise<LiquidityPool | null> {
    return this.repository.getDefaultPool(currency);
  }

  /**
   * Create a new liquidity pool
   */
  async createPool(
    name: string,
    currency: 'USD' | 'USDC',
    minimumReserve: bigint
  ): Promise<LiquidityPool> {
    const pool: LiquidityPool = {
      id: uuidv4(),
      name,
      account_type: 'LIABILITY_RESERVE',
      currency,
      balance: 0n,
      minimum_reserve: minimumReserve,
      status: 'ACTIVE',
      created_at: new Date(),
      last_activity: new Date(),
    };

    await this.repository.createPool(pool);
    return pool;
  }

  /**
   * Fund a pool (from premium collection)
   */
  async fundPool(poolId: string, amount: bigint): Promise<void> {
    await this.repository.increasePoolBalance(poolId, amount);
  }

  /**
   * Create treasury alert
   */
  private async createAlert(
    alert: Omit<TreasuryAlert, 'id' | 'created_at' | 'acknowledged'>
  ): Promise<void> {
    const fullAlert: TreasuryAlert = {
      ...alert,
      id: uuidv4(),
      created_at: new Date(),
      acknowledged: false,
    };

    await this.repository.createAlert(fullAlert);
    
    // In production: trigger webhook/notification here
    console.error(`[TREASURY ALERT] ${alert.type}: ${alert.message}`);
  }

  /**
   * Get all unacknowledged alerts
   */
  async getActiveAlerts(): Promise<TreasuryAlert[]> {
    return this.repository.getUnacknowledgedAlerts();
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    await this.repository.acknowledgeAlert(alertId);
  }

  /**
   * Get treasury health summary
   */
  async getHealthSummary(): Promise<TreasuryHealthSummary> {
    const pools = await this.repository.getAllPools();
    const alerts = await this.repository.getUnacknowledgedAlerts();
    const activeLocks = await this.repository.getActiveLocks();

    let totalBalance = 0n;
    let totalLocked = 0n;
    let poolsAtRisk = 0;

    for (const pool of pools) {
      totalBalance += pool.balance;
      if (pool.balance < pool.minimum_reserve) {
        poolsAtRisk++;
      }
    }

    for (const lock of activeLocks) {
      totalLocked += lock.amount;
    }

    return {
      total_balance: totalBalance,
      total_locked: totalLocked,
      available_balance: totalBalance - totalLocked,
      pool_count: pools.length,
      pools_at_risk: poolsAtRisk,
      active_alerts: alerts.length,
      active_locks: activeLocks.length,
      status: poolsAtRisk > 0 ? 'WARNING' : 'HEALTHY',
    };
  }
}

export interface TreasuryHealthSummary {
  total_balance: bigint;
  total_locked: bigint;
  available_balance: bigint;
  pool_count: number;
  pools_at_risk: number;
  active_alerts: number;
  active_locks: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}
