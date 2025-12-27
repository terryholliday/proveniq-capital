/**
 * Proveniq Capital - Stripe Adapter
 * Fiat payment rail via Stripe Connect
 */

import Stripe from 'stripe';

export class StripeAdapter {
  private readonly stripe: Stripe;
  private readonly enabled: boolean;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey || secretKey.startsWith('sk_test_your')) {
      console.warn('[StripeAdapter] No valid Stripe key configured. Running in mock mode.');
      this.enabled = false;
      this.stripe = null as any;
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16',
      });
      this.enabled = true;
    }
  }

  /**
   * Transfer funds to a connected account or bank
   */
  async transfer(
    destination: string,
    amountCents: bigint,
    idempotencyKey: string
  ): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
    if (!this.enabled) {
      return this.mockTransfer(destination, amountCents, idempotencyKey);
    }

    try {
      // For Stripe Connect payouts
      const transfer = await this.stripe.transfers.create(
        {
          amount: Number(amountCents),
          currency: 'usd',
          destination,
          description: `Proveniq Capital Payout`,
        },
        {
          idempotencyKey,
        }
      );

      console.log(`[StripeAdapter] Transfer created: ${transfer.id}`);

      return {
        success: true,
        tx_hash: transfer.id,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      console.error('[StripeAdapter] Transfer failed:', stripeError.message);

      return {
        success: false,
        error: stripeError.message,
      };
    }
  }

  /**
   * Create a payout to an external bank account
   */
  async payout(
    amountCents: bigint,
    idempotencyKey: string
  ): Promise<{ success: boolean; tx_hash?: string; error?: string }> {
    if (!this.enabled) {
      return this.mockTransfer('bank', amountCents, idempotencyKey);
    }

    try {
      const payout = await this.stripe.payouts.create(
        {
          amount: Number(amountCents),
          currency: 'usd',
        },
        {
          idempotencyKey,
        }
      );

      console.log(`[StripeAdapter] Payout created: ${payout.id}`);

      return {
        success: true,
        tx_hash: payout.id,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      console.error('[StripeAdapter] Payout failed:', stripeError.message);

      return {
        success: false,
        error: stripeError.message,
      };
    }
  }

  /**
   * Mock transfer for development/testing
   */
  private mockTransfer(
    destination: string,
    amountCents: bigint,
    idempotencyKey: string
  ): { success: boolean; tx_hash?: string; error?: string } {
    console.log(`[StripeAdapter] MOCK transfer: ${amountCents} cents to ${destination}`);
    
    // Simulate occasional failures for testing
    if (destination.includes('fail')) {
      return {
        success: false,
        error: 'Mock failure: destination marked for failure',
      };
    }

    const mockTxHash = `mock_stripe_${Date.now()}_${idempotencyKey.slice(0, 8)}`;
    
    return {
      success: true,
      tx_hash: mockTxHash,
    };
  }

  /**
   * Check if Stripe is properly configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
