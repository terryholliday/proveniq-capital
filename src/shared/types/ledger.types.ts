/**
 * Proveniq Capital - General Ledger Types
 * 
 * FINANCIAL PHYSICS (IMMUTABLE LAWS):
 * 1. NO FLOATING POINT: All currency stored as BigInt micros. $1.00 = 1000000n
 * 2. ATOMIC BALANCE: Sum of all entries in a transaction_id must equal ZERO
 * 3. IMMUTABILITY: Never UPDATE a ledger row. Only INSERT to correct balances.
 */

export type Currency = 'USD' | 'USDC';

/**
 * Core Account Types (System Accounts)
 */
export type CoreAccountType = 
  | 'ASSET_TREASURY'        // Real cash in bank
  | 'LIABILITY_RESERVE'     // Legacy: Money owed to policyholders (use LIABILITY_POOL_* for multi-tenant)
  | 'EXPENSE_CLAIMS'        // Money paid out
  | 'REVENUE_PREMIUMS'      // Money received from premiums
  | 'REVENUE_LIQUIDATION'   // Revenue from asset sales (salvage, collateral liquidation)
  | 'EQUITY_CAPITAL';       // Founder/investor capital injection

/**
 * AccountType - Supports both core accounts and dynamic pool accounts
 * 
 * Core accounts: ASSET_TREASURY, LIABILITY_RESERVE, etc.
 * Pool accounts: LIABILITY_POOL_{pool_id} (e.g., LIABILITY_POOL_insurance_A1)
 * 
 * Pool accounts are multi-tenant liability accounts for segregated funds.
 */
export type AccountType = CoreAccountType | `LIABILITY_POOL_${string}`;

export type ReferenceType = 'CLAIM' | 'PREMIUM' | 'ADJUSTMENT' | 'TRANSFER' | 'REMITTANCE';

/**
 * Validate if an account string is a valid pool account
 */
export function isPoolAccount(account: string): account is `LIABILITY_POOL_${string}` {
  return account.startsWith('LIABILITY_POOL_');
}

/**
 * Extract pool ID from a pool account type
 */
export function extractPoolId(account: `LIABILITY_POOL_${string}`): string {
  return account.replace('LIABILITY_POOL_', '');
}

/**
 * Create a pool account type from a pool ID
 */
export function createPoolAccount(poolId: string): `LIABILITY_POOL_${string}` {
  return `LIABILITY_POOL_${poolId}`;
}

/**
 * LedgerEntry - The atomic unit of the General Ledger
 * 
 * CRITICAL: amount_micros is SIGNED
 * - Positive = DEBIT (increases assets/expenses, decreases liabilities/revenue)
 * - Negative = CREDIT (decreases assets/expenses, increases liabilities/revenue)
 * 
 * $1.00 = 1,000,000 micros
 */
export interface LedgerEntry {
  readonly id: string;              // UUID - immutable
  readonly transaction_id: string;  // Groups the debit/credit pair(s)
  readonly account: AccountType;
  readonly amount_micros: bigint;   // Positive (Debit) or Negative (Credit)
  readonly currency: Currency;
  readonly reference_id: string;    // Claim ID, Payment ID, Policy ID
  readonly reference_type: ReferenceType;
  readonly created_at: Date;
  readonly memo?: string;           // Human-readable description
}

/**
 * LedgerTransaction - A balanced set of entries
 * 
 * INVARIANT: Sum of all amount_micros in entries MUST equal 0n
 */
export interface LedgerTransaction {
  readonly id: string;              // Transaction UUID
  readonly entries: LedgerEntry[];  // 2+ entries that sum to zero
  readonly description: string;
  readonly created_at: Date;
  readonly created_by: string;      // System or Admin ID
}

/**
 * AccountBalance - Computed running balance for an account
 * This is a derived view, not source of truth (entries are truth)
 */
export interface AccountBalance {
  readonly account: AccountType;
  readonly currency: Currency;
  readonly balance_micros: bigint;  // Current balance
  readonly last_entry_id: string;   // Last entry that affected this balance
  readonly last_updated: Date;
}

/**
 * Utility: Convert dollars to micros
 * $1.00 = 1,000,000 micros
 */
export function dollarsToMicros(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1_000_000));
}

/**
 * Utility: Convert micros to dollars (for display only)
 */
export function microsToDollars(micros: bigint): number {
  return Number(micros) / 1_000_000;
}

/**
 * Utility: Format micros as currency string
 */
export function formatMicros(micros: bigint, currency: Currency = 'USD'): string {
  const dollars = microsToDollars(micros);
  const symbol = currency === 'USD' ? '$' : 'USDC ';
  return `${symbol}${dollars.toFixed(2)}`;
}
