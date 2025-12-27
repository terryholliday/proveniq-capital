/**
 * Proveniq Capital - Payout Transaction Types
 * Settlement layer for ClaimsIQ verdicts
 */

export type PayoutStatus = 
  | 'PENDING'           // Awaiting processing
  | 'LOCKED'            // Funds locked, processing
  | 'MANUAL_REVIEW'     // Above threshold, needs approval
  | 'PROCESSING'        // In transit
  | 'CLEARED'           // Successfully settled
  | 'FAILED';           // Settlement failed

export type PayoutRail = 'STRIPE' | 'USDC' | 'WIRE';

export interface PayoutTransaction {
  id: string;                    // UUID
  claim_id: string;              // Foreign Key to ClaimsIQ Decision
  policy_id: string;             // Source policy
  recipient_did: string;         // Decentralized ID of recipient
  recipient_address: string;     // Payout destination (bank/wallet)
  amount: bigint;                // Amount in cents
  currency: 'USD' | 'USDC';
  rail: PayoutRail;
  status: PayoutStatus;
  tx_hash: string | null;        // Bank ref or Blockchain hash
  stripe_transfer_id: string | null;
  ledger_entry_id: string;       // Link to GeneralLedgerEntry
  created_at: Date;
  processed_at: Date | null;
  cleared_at: Date | null;
  failure_reason: string | null;
  idempotency_key: string;       // Prevents double-pay
}

export interface PayoutRequest {
  claim_id: string;
  policy_id: string;
  recipient_did: string;
  recipient_address: string;
  amount: bigint;
  currency: 'USD' | 'USDC';
  preferred_rail?: PayoutRail;
}

export interface PayoutResult {
  success: boolean;
  payout_id: string;
  status: PayoutStatus;
  tx_hash: string | null;
  error?: string;
}
