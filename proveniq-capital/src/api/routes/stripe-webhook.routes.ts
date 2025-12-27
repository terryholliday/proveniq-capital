/**
 * Proveniq Capital - Stripe Webhook Routes
 * THE TRUTH RECEIVER: Money entering the system
 * 
 * This endpoint receives payment_intent.succeeded events from Stripe
 * and commits the funds to the General Ledger.
 */

import { Router, Request, Response } from 'express';
import { StripeIngressService } from '../../modules/premiums';
import { LedgerService } from '../../core/ledger';

export interface StripeWebhookDependencies {
  stripeIngress: StripeIngressService;
  ledger: LedgerService;
}

export function createStripeWebhookRoutes(deps: StripeWebhookDependencies): Router {
  const router = Router();

  /**
   * POST /api/v1/webhooks/stripe
   * THE FUEL LINE TERMINUS
   * 
   * Receives Stripe webhook events and commits to ledger.
   * CRITICAL: Uses raw body for signature verification.
   */
  router.post(
    '/stripe',
    async (req: Request, res: Response) => {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        console.error('[Stripe Webhook] Missing stripe-signature header');
        res.status(400).json({ error: 'Missing stripe-signature header' });
        return;
      }

      try {
        // Verify webhook signature and construct event
        // CRITICAL: req.body must be raw buffer for signature verification
        const event = deps.stripeIngress.constructWebhookEvent(
          req.body,
          signature
        );

        console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

        // Only process payment_intent.succeeded
        if (event.type !== 'payment_intent.succeeded') {
          console.log(`[Stripe Webhook] Ignoring event type: ${event.type}`);
          res.json({ received: true, processed: false, reason: 'Event type not handled' });
          return;
        }

        // Extract payment data
        const paymentData = deps.stripeIngress.extractPaymentData(event);

        if (!paymentData) {
          console.error('[Stripe Webhook] Failed to extract payment data');
          res.status(400).json({ error: 'Failed to extract payment data' });
          return;
        }

        console.log(`[Stripe Webhook] Processing payment: ${paymentData.paymentIntentId}`);
        console.log(`  Amount: ${paymentData.amountMicros} micros`);
        console.log(`  Customer: ${paymentData.customerDid}`);
        console.log(`  Policy: ${paymentData.policyId}`);

        // IDEMPOTENCY CHECK: Use Stripe event.id as reference
        // If we've already processed this event, skip
        const existingEntries = await deps.ledger.getEntriesByReference(event.id);
        if (existingEntries.length > 0) {
          console.log(`[Stripe Webhook] Event ${event.id} already processed (idempotency)`);
          res.json({ received: true, processed: false, reason: 'Already processed' });
          return;
        }

        // THE LEDGER COMMIT (CRITICAL)
        // Premium received:
        // DEBIT: ASSET_TREASURY (Cash goes UP) +amount
        // CREDIT: LIABILITY_RESERVE (Insurance Pool goes UP) -amount
        const transaction = await deps.ledger.recordTransaction(
          [
            { account: 'ASSET_TREASURY', amount_micros: paymentData.amountMicros },      // DEBIT
            { account: 'LIABILITY_RESERVE', amount_micros: -paymentData.amountMicros }, // CREDIT
          ],
          paymentData.currency,
          event.id, // Use Stripe event ID for idempotency
          'PREMIUM',
          `Premium received: ${paymentData.paymentIntentId} for policy ${paymentData.policyId} from ${paymentData.customerDid}`,
          'STRIPE_WEBHOOK'
        );

        console.log(`[Stripe Webhook] LEDGER COMMITTED: Transaction ${transaction.id}`);
        console.log(`  DEBIT ASSET_TREASURY: +${paymentData.amountMicros} micros`);
        console.log(`  CREDIT LIABILITY_RESERVE: -${paymentData.amountMicros} micros`);

        res.json({
          received: true,
          processed: true,
          transaction_id: transaction.id,
          amount_micros: paymentData.amountMicros.toString(),
        });

      } catch (error) {
        console.error('[Stripe Webhook] Error:', error);
        
        if (error instanceof Error && error.name === 'StripeIngressError') {
          res.status(400).json({ error: error.message });
          return;
        }

        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
