/**
 * Proveniq Capital - Treasury Types
 * Liquidity Pool Management
 */

export type PoolStatus = 'ACTIVE' | 'SUSPENDED' | 'DEPLETED';

export interface LiquidityPool {
  id: string;                    // Pool UUID
  name: string;                  // e.g., "Auto Insurance Reserve"
  account_type: 'LIABILITY_RESERVE';
  currency: 'USD' | 'USDC';
  balance: bigint;               // Current balance in cents
  minimum_reserve: bigint;       // Critical threshold
  status: PoolStatus;
  created_at: Date;
  last_activity: Date;
}

export interface FundLock {
  id: string;                    // Lock UUID
  pool_id: string;
  claim_id: string;
  amount: bigint;
  locked_at: Date;
  expires_at: Date;              // Auto-release if not settled
  status: 'LOCKED' | 'RELEASED' | 'EXPIRED';
}

export interface LiquidityCheckResult {
  sufficient: boolean;
  pool_id: string;
  available_balance: bigint;
  requested_amount: bigint;
  shortfall: bigint;             // 0 if sufficient
  pool_status: PoolStatus;
}

export interface TreasuryAlert {
  id: string;
  type: 'CRITICAL_LOW' | 'WARNING_LOW' | 'LIQUIDITY_FAILURE';
  pool_id: string;
  current_balance: bigint;
  threshold: bigint;
  message: string;
  created_at: Date;
  acknowledged: boolean;
}

export interface TreasuryConfig {
  manual_approval_threshold: bigint;  // Amount requiring human approval
  critical_reserve_minimum: bigint;   // Halt threshold
  auto_release_lock_hours: number;    // Lock expiry
}
