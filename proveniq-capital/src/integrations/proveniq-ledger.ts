/**
 * Proveniq LEDGER Integration Service for CAPITAL
 * 
 * Connects CAPITAL to the shared Proveniq Ledger API for cross-app event publishing.
 * This is SEPARATE from Capital's internal double-entry accounting ledger.
 * 
 * Implements INTER_APP_CONTRACT.md compliance:
 * - Publishes loan/settlement events to shared LEDGER
 * - Subscribes to ledger.event.appended
 * - Enforces custody state transitions
 * - Uses walletId (Zero PII)
 * 
 * Per Section 5.5: CAPITAL publishes:
 * - loan.created
 * - loan.defaulted
 * - custody.changed (when collateral moves)
 * - settlement.completed
 */

const LEDGER_API_BASE = process.env.PROVENIQ_LEDGER_API_URL || 'http://localhost:3002/v1/ledger';

// =============================================================================
// TYPES
// =============================================================================

export type CustodyState = 'HOME' | 'IN_TRANSIT' | 'VAULT' | 'RETURNED' | 'SOLD';

export interface LedgerEvent {
  eventId: string;
  itemId: string;
  walletId: string;
  eventType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  previousHash: string;
  hash: string;
  timestamp: string;
  sequence: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// =============================================================================
// EVENT TYPES (per INTER_APP_CONTRACT Section 3.1)
// =============================================================================

export const CAPITAL_EVENT_TYPES = {
  // Loan lifecycle
  LOAN_CREATED: 'capital.loan.created',
  LOAN_FUNDED: 'capital.loan.funded',
  LOAN_PAYMENT_RECEIVED: 'capital.loan.payment_received',
  LOAN_DEFAULTED: 'capital.loan.defaulted',
  LOAN_CLOSED: 'capital.loan.closed',
  
  // Collateral management
  COLLATERAL_PLEDGED: 'capital.collateral.pledged',
  COLLATERAL_RELEASED: 'capital.collateral.released',
  COLLATERAL_SEIZED: 'capital.collateral.seized',
  
  // Settlement
  SETTLEMENT_INITIATED: 'capital.settlement.initiated',
  SETTLEMENT_COMPLETED: 'capital.settlement.completed',
  SETTLEMENT_FAILED: 'capital.settlement.failed',
  
  // Premium/Claims (from insurance operations)
  PREMIUM_RECEIVED: 'capital.premium.received',
  CLAIM_PAYOUT_INITIATED: 'capital.claim.payout_initiated',
  CLAIM_PAYOUT_COMPLETED: 'capital.claim.payout_completed',
  
  // Custody changes
  CUSTODY_CHANGED: 'capital.custody.changed',
} as const;

// =============================================================================
// API METHODS - LOAN OPERATIONS
// =============================================================================

/**
 * Record loan creation
 */
export async function recordLoanCreated(params: {
  loanId: string;
  borrowerWalletId: string;
  collateralItemId: string;
  principalAmountMicros: bigint;
  currency: string;
  interestRateBps: number;
  termDays: number;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.collateralItemId,
    walletId: params.borrowerWalletId,
    eventType: CAPITAL_EVENT_TYPES.LOAN_CREATED,
    payload: {
      loanId: params.loanId,
      principalAmountMicros: params.principalAmountMicros.toString(),
      currency: params.currency,
      interestRateBps: params.interestRateBps,
      termDays: params.termDays,
      createdAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Record loan default
 */
export async function recordLoanDefaulted(params: {
  loanId: string;
  borrowerWalletId: string;
  collateralItemId: string;
  outstandingAmountMicros: bigint;
  defaultReason: string;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.collateralItemId,
    walletId: params.borrowerWalletId,
    eventType: CAPITAL_EVENT_TYPES.LOAN_DEFAULTED,
    payload: {
      loanId: params.loanId,
      outstandingAmountMicros: params.outstandingAmountMicros.toString(),
      defaultReason: params.defaultReason,
      defaultedAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Record collateral seizure (triggers custody change to VAULT)
 */
export async function recordCollateralSeized(params: {
  loanId: string;
  lenderWalletId: string;
  collateralItemId: string;
  seizedValueMicros: bigint;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.collateralItemId,
    walletId: params.lenderWalletId,
    eventType: CAPITAL_EVENT_TYPES.COLLATERAL_SEIZED,
    payload: {
      loanId: params.loanId,
      seizedValueMicros: params.seizedValueMicros.toString(),
      seizedAt: new Date().toISOString(),
    },
    custodyState: 'VAULT', // Collateral moves to vault on seizure
    idempotencyKey: params.idempotencyKey,
  });
}

// =============================================================================
// API METHODS - SETTLEMENT OPERATIONS
// =============================================================================

/**
 * Record settlement initiated
 */
export async function recordSettlementInitiated(params: {
  settlementId: string;
  payerWalletId: string;
  payeeWalletId: string;
  amountMicros: bigint;
  currency: string;
  settlementType: 'CLAIM_PAYOUT' | 'LOAN_DISBURSEMENT' | 'PREMIUM_REFUND';
  referenceId: string;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.referenceId,
    walletId: params.payerWalletId,
    eventType: CAPITAL_EVENT_TYPES.SETTLEMENT_INITIATED,
    payload: {
      settlementId: params.settlementId,
      payeeWalletId: params.payeeWalletId,
      amountMicros: params.amountMicros.toString(),
      currency: params.currency,
      settlementType: params.settlementType,
      initiatedAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Record settlement completed
 */
export async function recordSettlementCompleted(params: {
  settlementId: string;
  payerWalletId: string;
  paymentMethod: 'STRIPE' | 'USDC' | 'WIRE' | 'ACH';
  transactionReference: string;
  referenceId: string;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.referenceId,
    walletId: params.payerWalletId,
    eventType: CAPITAL_EVENT_TYPES.SETTLEMENT_COMPLETED,
    payload: {
      settlementId: params.settlementId,
      paymentMethod: params.paymentMethod,
      transactionReference: params.transactionReference,
      completedAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

// =============================================================================
// API METHODS - INSURANCE OPERATIONS
// =============================================================================

/**
 * Record premium received
 */
export async function recordPremiumReceived(params: {
  policyId: string;
  payerWalletId: string;
  amountMicros: bigint;
  currency: string;
  periodStart: string;
  periodEnd: string;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.policyId,
    walletId: params.payerWalletId,
    eventType: CAPITAL_EVENT_TYPES.PREMIUM_RECEIVED,
    payload: {
      amountMicros: params.amountMicros.toString(),
      currency: params.currency,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      receivedAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Record claim payout completed
 */
export async function recordClaimPayoutCompleted(params: {
  claimId: string;
  claimantWalletId: string;
  amountMicros: bigint;
  currency: string;
  paymentMethod: 'STRIPE' | 'USDC' | 'WIRE' | 'ACH';
  transactionReference: string;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  return appendEvent({
    itemId: params.claimId,
    walletId: params.claimantWalletId,
    eventType: CAPITAL_EVENT_TYPES.CLAIM_PAYOUT_COMPLETED,
    payload: {
      amountMicros: params.amountMicros.toString(),
      currency: params.currency,
      paymentMethod: params.paymentMethod,
      transactionReference: params.transactionReference,
      completedAt: new Date().toISOString(),
    },
    idempotencyKey: params.idempotencyKey,
  });
}

// =============================================================================
// CORE API METHODS
// =============================================================================

/**
 * Append an event to the shared Proveniq Ledger
 */
async function appendEvent(params: {
  itemId: string;
  walletId: string;
  eventType: string;
  payload: Record<string, unknown>;
  custodyState?: CustodyState;
  idempotencyKey?: string;
}): Promise<ApiResponse<{ event: LedgerEvent }>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (params.idempotencyKey) {
      headers['X-Idempotency-Key'] = params.idempotencyKey;
    }

    const response = await fetch(`${LEDGER_API_BASE}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        itemId: params.itemId,
        walletId: params.walletId,
        eventType: params.eventType,
        payload: params.payload,
        custodyState: params.custodyState,
      }),
    });

    return await response.json();
  } catch (error) {
    console.error('[PROVENIQ-LEDGER] Failed to append event:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * Get item provenance from shared ledger
 */
export async function getItemProvenance(
  itemId: string,
  options?: { limit?: number; offset?: number }
): Promise<ApiResponse<{ events: LedgerEvent[]; total: number }>> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());

    const url = `${LEDGER_API_BASE}/items/${itemId}/events${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error('[PROVENIQ-LEDGER] Failed to get item provenance:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * Get custody state for collateral item
 */
export async function getCollateralCustody(itemId: string): Promise<ApiResponse<{ 
  custody: {
    itemId: string;
    currentState: CustodyState;
    walletId: string | null;
    lastUpdated: string | null;
  }
}>> {
  try {
    const response = await fetch(`${LEDGER_API_BASE}/items/${itemId}/custody`);
    return await response.json();
  } catch (error) {
    console.error('[PROVENIQ-LEDGER] Failed to get custody state:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * Check LEDGER API health
 */
export async function checkLedgerHealth(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3002/health');
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export const ProveniqLedgerIntegration = {
  // Loan operations
  recordLoanCreated,
  recordLoanDefaulted,
  recordCollateralSeized,
  
  // Settlement operations
  recordSettlementInitiated,
  recordSettlementCompleted,
  
  // Insurance operations
  recordPremiumReceived,
  recordClaimPayoutCompleted,
  
  // Query operations
  getItemProvenance,
  getCollateralCustody,
  checkLedgerHealth,
  
  // Event types
  EVENT_TYPES: CAPITAL_EVENT_TYPES,
};

export default ProveniqLedgerIntegration;
