/**
 * Proveniq Capital - Payouts Module Export
 * THE HAND: Payment Rails (Stripe/Blockchain)
 */

// Bank Gateway Interface (THE AIR GAP)
export {
  BankGateway,
  PaymentInstruction,
  TransferReceipt,
  GatewayResult,
  GatewayError,
  LimitExceededError,
} from './bank.port';

// Stripe Mock Adapter
export { StripeAdapter, FailingStripeAdapter } from './stripe.mock';

// Legacy adapters (can be deprecated)
export { PayoutService } from './payout.service';
export { PayoutRepository } from './payout.repository';
export { StripeAdapter as LegacyStripeAdapter } from './adapters/stripe.adapter';
export { USDCAdapter } from './adapters/usdc.adapter';
