/**
 * Proveniq Capital - Remittance Routes
 * POST /api/v1/remittance
 * 
 * THE RETURN PIPE: Pool-specific funds ingress from Bids
 * 
 * AUTHORIZATION: Only BIDS module is authorized to send remittances.
 * IDEMPOTENCY: Duplicate reference_ids are rejected.
 */

import { Router, Request, Response } from 'express';
import { RemittanceService } from '../../modules/remittance';
import { RemittanceRequest, Currency } from '../../shared/types';

export interface RemittanceDependencies {
  remittanceService: RemittanceService;
}

export function createRemittanceRoutes(deps: RemittanceDependencies): Router {
  const router = Router();

  /**
   * POST /api/v1/remittance
   * 
   * Receive funds from Bids and credit to the appropriate pool.
   * 
   * Payload:
   * {
   *   "source_module": "BIDS",
   *   "target_pool_id": "pool_insurance_A1",
   *   "reference_id": "auction_123",
   *   "amount_micros": 50000000,
   *   "currency": "USD"
   * }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body;

      // Parse BigInt from string (JSON doesn't support BigInt natively)
      const amountMicros = typeof body.amount_micros === 'string' 
        ? BigInt(body.amount_micros)
        : BigInt(body.amount_micros || 0);

      const request: RemittanceRequest = {
        source_module: body.source_module,
        target_pool_id: body.target_pool_id,
        reference_id: body.reference_id,
        amount_micros: amountMicros,
        currency: body.currency as Currency,
        metadata: body.metadata,
      };

      console.log(`[Remittance API] Received remittance request:`, {
        source: request.source_module,
        pool: request.target_pool_id,
        reference: request.reference_id,
        amount: request.amount_micros.toString(),
      });

      const result = await deps.remittanceService.processRemittance(request);

      if (result.success) {
        res.status(200).json({
          success: true,
          transaction_id: result.transaction_id,
          pool_id: result.pool_id,
          amount_micros: result.amount_micros?.toString(),
          message: 'Remittance processed successfully',
        });
      } else {
        const statusCode = result.error_code === 'DUPLICATE_REFERENCE' ? 409 
          : result.error_code === 'INVALID_SOURCE' ? 403
          : 400;

        res.status(statusCode).json({
          success: false,
          error: result.error,
          error_code: result.error_code,
        });
      }

    } catch (error) {
      console.error('[Remittance API] Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      });
    }
  });

  return router;
}
