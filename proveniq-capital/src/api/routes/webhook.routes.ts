/**
 * Proveniq Capital - Webhook Routes
 * Incoming webhooks from ClaimsIQ
 */

import { Router, Request, Response } from 'express';
import { ClaimsListenerService } from '../../modules/claims-listener';

export function createWebhookRoutes(claimsListener: ClaimsListenerService): Router {
  const router = Router();

  /**
   * POST /webhooks/claimsiq
   * Receive decision notifications from ClaimsIQ
   */
  router.post('/claimsiq', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-claimsiq-signature'] as string;

      if (!signature) {
        res.status(401).json({ error: 'Missing signature header' });
        return;
      }

      const result = await claimsListener.handleWebhook(req.body, signature);

      if (result.success) {
        res.json({
          received: true,
          message: result.message,
          payout_id: result.payout_id,
        });
      } else {
        res.status(400).json({
          received: false,
          error: result.error,
          details: result.details,
        });
      }
    } catch (error) {
      console.error('[Webhook] Error processing ClaimsIQ webhook:', error);
      res.status(500).json({
        received: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
