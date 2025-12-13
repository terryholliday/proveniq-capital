/**
 * Proveniq Capital - Claims Listener Module Export
 * THE EAR: Listens to ClaimsIQ and triggers payouts
 */

// Adapter - Fetches decisions from ClaimsIQ
export { 
  ClaimsAdapter, 
  MockClaimsAdapter,
  DecisionRecord,
  ClaimsAdapterConfig,
  RetryableError,
} from './claims.adapter';

// Orchestrator - Manages claim-to-payout flow
export {
  PayoutOrchestrator,
  PayoutRecord,
  PayoutResult,
} from './payout.orchestrator';

// Legacy service (can be deprecated)
export { ClaimsListenerService, ClaimsListenerConfig, WebhookResult } from './claims-listener.service';
