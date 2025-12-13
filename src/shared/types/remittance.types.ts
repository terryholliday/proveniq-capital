/**
 * Proveniq Capital - Remittance Types
 * THE RETURN PIPE: Pool-specific funds ingress from external systems (Bids)
 * 
 * BUSINESS CONTEXT:
 * Capital manages pools on behalf of others (Insurers, Lenders, Investors).
 * When Bids liquidates an asset (salvage or collateral), proceeds return
 * to the specific pool that owned the asset.
 * 
 * This is NOT a generic payment endpoint.
 * It is a narrowly-scoped, pool-specific remittance pipe.
 */

import { Currency } from './ledger.types';

/**
 * Authorized source modules that can send remittances
 * 
 * BIDS: Proveniq Marketplace - sends auction/liquidation proceeds
 * RECOVERY_AGENCY: External recovery agents - sends recovered funds
 */
export type RemittanceSource = 'BIDS' | 'RECOVERY_AGENCY';

/**
 * RemittanceRequest - Incoming funds from an authorized source
 * 
 * Bids sends this when an auction completes and proceeds are ready
 * to be credited to the owning pool.
 */
export interface RemittanceRequest {
  /** Source module sending the remittance */
  readonly source_module: RemittanceSource;
  
  /** Target pool ID (e.g., "pool_insurance_A1", "pool_lending_B2") */
  readonly target_pool_id: string;
  
  /** Reference ID from source (e.g., auction_id, liquidation_id) */
  readonly reference_id: string;
  
  /** Amount in micros ($1.00 = 1,000,000) */
  readonly amount_micros: bigint;
  
  /** Currency */
  readonly currency: Currency;
  
  /** Optional metadata */
  readonly metadata?: {
    /** Original claim ID if salvage */
    readonly claim_id?: string;
    /** Original loan ID if collateral */
    readonly loan_id?: string;
    /** Asset description */
    readonly asset_description?: string;
  };
}

/**
 * RemittanceResult - Response after processing remittance
 */
export interface RemittanceResult {
  readonly success: boolean;
  readonly transaction_id?: string;
  readonly pool_id?: string;
  readonly amount_micros?: bigint;
  readonly error?: string;
  readonly error_code?: RemittanceErrorCode;
}

/**
 * Remittance error codes
 */
export type RemittanceErrorCode =
  | 'INVALID_SOURCE'        // Source module not authorized
  | 'INVALID_POOL'          // Pool does not exist
  | 'INVALID_AMOUNT'        // Amount <= 0
  | 'DUPLICATE_REFERENCE'   // Reference already processed (idempotency)
  | 'LEDGER_ERROR';         // Ledger commit failed

/**
 * Validate a remittance request
 */
export function validateRemittanceRequest(req: Partial<RemittanceRequest>): string[] {
  const errors: string[] = [];

  const AUTHORIZED_SOURCES: RemittanceSource[] = ['BIDS', 'RECOVERY_AGENCY'];
  
  if (!req.source_module) {
    errors.push('source_module is required');
  } else if (!AUTHORIZED_SOURCES.includes(req.source_module as RemittanceSource)) {
    errors.push(`Invalid source_module: ${req.source_module}. Authorized: ${AUTHORIZED_SOURCES.join(', ')}`);
  }

  if (!req.target_pool_id) {
    errors.push('target_pool_id is required');
  } else if (!req.target_pool_id.startsWith('pool_')) {
    errors.push('target_pool_id must start with "pool_"');
  }

  if (!req.reference_id) {
    errors.push('reference_id is required');
  }

  if (req.amount_micros === undefined || req.amount_micros === null) {
    errors.push('amount_micros is required');
  } else if (req.amount_micros <= 0n) {
    errors.push('amount_micros must be positive');
  }

  if (!req.currency) {
    errors.push('currency is required');
  } else if (req.currency !== 'USD' && req.currency !== 'USDC') {
    errors.push(`Invalid currency: ${req.currency}`);
  }

  return errors;
}
