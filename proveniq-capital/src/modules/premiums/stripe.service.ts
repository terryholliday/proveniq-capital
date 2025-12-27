/**
 * Proveniq Capital - Stripe Ingress Service
 * THE FUEL LINE: Revenue Pump for Premium Collection
 * 
 * This service handles incoming fiat via Stripe Payment Intents.
 * Every successful payment triggers a Ledger commit via webhook.
 */

import Stripe from 'stripe';
import { Currency } from '../../shared/types';

export interface PaymentIntentResult {
  readonly paymentIntentId: string;
  readonly clientSecret: string;
  readonly amount_micros: bigint;
  readonly currency: Currency;
}

export interface StripeIngressConfig {
  readonly secretKey: string;
  readonly webhookSecret: string;
}

export class StripeIngressService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: StripeIngressConfig) {
    this.stripe = new Stripe(config.secretKey);
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create a Payment Intent for premium collection
   * 
   * @param amountMicros - Amount in micros ($1.00 = 1,000,000)
   * @param currency - USD or USDC (Stripe only supports USD for now)
   * @param customerDid - Customer's DID for tracking
   * @param policyId - Policy ID this premium is for
   * @returns PaymentIntentResult with client_secret for frontend
   */
  async createPaymentIntent(
    amountMicros: bigint,
    currency: 'usd',
    customerDid: string,
    policyId: string
  ): Promise<PaymentIntentResult> {
    // Convert micros to cents (Stripe uses cents)
    // $1.00 = 1,000,000 micros = 100 cents
    const amountCents = Number(amountMicros / 10000n);

    if (amountCents < 50) {
      throw new StripeIngressError(
        'AMOUNT_TOO_LOW',
        'Minimum payment amount is $0.50 (50 cents)'
      );
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency,
      metadata: {
        // CRITICAL: These metadata fields are used by the webhook
        // to commit the correct ledger entries
        target_ledger_account: 'LIABILITY_RESERVE',
        customer_did: customerDid,
        policy_id: policyId,
        amount_micros: amountMicros.toString(),
        source: 'PROVENIQ_CAPITAL',
      },
      description: `Premium payment for policy ${policyId}`,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new StripeIngressError(
        'NO_CLIENT_SECRET',
        'Stripe did not return a client secret'
      );
    }

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount_micros: amountMicros,
      currency: 'USD',
    };
  }

  /**
   * Verify and construct a Stripe webhook event
   * 
   * @param payload - Raw request body
   * @param signature - Stripe-Signature header
   * @returns Verified Stripe Event
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
    } catch (err) {
      throw new StripeIngressError(
        'WEBHOOK_SIGNATURE_INVALID',
        `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract payment data from a payment_intent.succeeded event
   */
  extractPaymentData(event: Stripe.Event): {
    paymentIntentId: string;
    amountMicros: bigint;
    currency: Currency;
    customerDid: string;
    policyId: string;
    targetAccount: string;
  } | null {
    if (event.type !== 'payment_intent.succeeded') {
      return null;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const metadata = paymentIntent.metadata;

    // Convert cents back to micros
    const amountMicros = BigInt(paymentIntent.amount) * 10000n;

    return {
      paymentIntentId: paymentIntent.id,
      amountMicros,
      currency: 'USD',
      customerDid: metadata.customer_did || 'UNKNOWN',
      policyId: metadata.policy_id || 'UNKNOWN',
      targetAccount: metadata.target_ledger_account || 'LIABILITY_RESERVE',
    };
  }

  /**
   * Get Stripe instance for advanced operations
   */
  getStripeInstance(): Stripe {
    return this.stripe;
  }
}

/**
 * Stripe Ingress Error
 */
export class StripeIngressError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'StripeIngressError';
  }
}
