/**
 * Proveniq Capital - Remittance Service
 * THE RETURN PIPE: Pool-specific funds ingress from Bids
 * 
 * BUSINESS CONTEXT:
 * Capital is a multi-tenant clearing house managing pools on behalf of
 * Insurers, Lenders, and Investors. When Bids liquidates an asset
 * (salvage or collateral), proceeds return to the specific pool.
 * 
 * LEDGER ACTION:
 * DEBIT: ASSET_TREASURY (Cash enters the bank)
 * CREDIT: LIABILITY_POOL_{ID} (The specific pool gets its money back)
 */

import { LedgerService } from '../../core/ledger';
import {
  RemittanceRequest,
  RemittanceResult,
  validateRemittanceRequest,
  createPoolAccount,
} from '../../shared/types';

export class RemittanceService {
  constructor(private readonly ledger: LedgerService) {}

  /**
   * Process a remittance from an authorized source (Bids)
   * 
   * @param request - Remittance request from Bids
   * @returns RemittanceResult with transaction ID on success
   */
  async processRemittance(request: RemittanceRequest): Promise<RemittanceResult> {
    console.log(`[Remittance] Processing remittance from ${request.source_module}`);
    console.log(`  Pool: ${request.target_pool_id}`);
    console.log(`  Reference: ${request.reference_id}`);
    console.log(`  Amount: ${request.amount_micros} micros`);

    // VALIDATION
    const validationErrors = validateRemittanceRequest(request);
    if (validationErrors.length > 0) {
      console.error(`[Remittance] Validation failed:`, validationErrors);
      return {
        success: false,
        error: validationErrors.join('; '),
        error_code: 'INVALID_AMOUNT',
      };
    }

    // SOURCE AUTHORIZATION
    // Authorized sources: BIDS, RECOVERY_AGENCY
    const AUTHORIZED_SOURCES = ['BIDS', 'RECOVERY_AGENCY'];
    if (!AUTHORIZED_SOURCES.includes(request.source_module)) {
      console.error(`[Remittance] Unauthorized source: ${request.source_module}`);
      return {
        success: false,
        error: `Unauthorized source module: ${request.source_module}. Authorized: ${AUTHORIZED_SOURCES.join(', ')}`,
        error_code: 'INVALID_SOURCE',
      };
    }

    // IDEMPOTENCY CHECK
    // Use reference_id to prevent duplicate processing
    const existingEntries = await this.ledger.getEntriesByReference(request.reference_id);
    if (existingEntries.length > 0) {
      console.log(`[Remittance] Reference ${request.reference_id} already processed (idempotency)`);
      return {
        success: false,
        error: `Reference ${request.reference_id} already processed`,
        error_code: 'DUPLICATE_REFERENCE',
      };
    }

    // BUILD POOL ACCOUNT
    // Convert pool_insurance_A1 -> LIABILITY_POOL_insurance_A1
    const poolAccountId = request.target_pool_id.replace('pool_', '');
    const poolAccount = createPoolAccount(poolAccountId);

    console.log(`[Remittance] Target ledger account: ${poolAccount}`);

    // LEDGER COMMIT
    // DEBIT: ASSET_TREASURY (Cash enters the bank) +amount
    // CREDIT: LIABILITY_POOL_{ID} (Pool liability increases) -amount
    try {
      const transaction = await this.ledger.recordTransaction(
        [
          { account: 'ASSET_TREASURY', amount_micros: request.amount_micros },  // DEBIT
          { account: poolAccount, amount_micros: -request.amount_micros },       // CREDIT
        ],
        request.currency,
        request.reference_id,
        'REMITTANCE',
        `Remittance from ${request.source_module}: ${request.reference_id} to ${request.target_pool_id}`,
        request.source_module
      );

      console.log(`[Remittance] ✓ LEDGER COMMITTED: Transaction ${transaction.id}`);
      console.log(`  DEBIT ASSET_TREASURY: +${request.amount_micros} micros`);
      console.log(`  CREDIT ${poolAccount}: -${request.amount_micros} micros`);

      return {
        success: true,
        transaction_id: transaction.id,
        pool_id: request.target_pool_id,
        amount_micros: request.amount_micros,
      };

    } catch (error) {
      console.error(`[Remittance] Ledger error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown ledger error',
        error_code: 'LEDGER_ERROR',
      };
    }
  }

  /**
   * Get remittance history for a pool
   */
  async getPoolRemittances(poolId: string): Promise<{ entries: any[]; total_micros: bigint }> {
    const poolAccountId = poolId.replace('pool_', '');
    const poolAccount = createPoolAccount(poolAccountId);
    
    const balance = await this.ledger.getAccountBalance(poolAccount, 'USD');
    
    return {
      entries: [], // Would need to query by account, not implemented yet
      total_micros: balance.balance_micros,
    };
  }
}
