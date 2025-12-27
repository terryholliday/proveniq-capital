/**
 * Proveniq Capital - Claims Adapter
 * THE EAR: Fetches decisions from ClaimsIQ
 * 
 * DESIGN PHILOSOPHY:
 * - Polling + Idempotency > Webhooks alone
 * - We actively check, we don't wait to be told
 * - Defensive coding: ClaimsIQ might be down
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * DecisionRecord - The verdict from ClaimsIQ
 */
export interface DecisionRecord {
  readonly claim_id: string;
  readonly policy_id: string;
  readonly status: 'PAY' | 'DENY' | 'REVIEW' | 'PENDING';
  readonly amount_micros: bigint;
  readonly currency: 'USD' | 'USDC';
  readonly recipient_did: string;
  readonly recipient_address: string;
  readonly decision_timestamp: Date;
  readonly audit_hash: string;
}

/**
 * RetryableError - Thrown when ClaimsIQ is temporarily unavailable
 * Caller should retry with exponential backoff
 */
export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterMs: number = 5000
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * ClaimsAdapterConfig
 */
export interface ClaimsAdapterConfig {
  readonly apiUrl: string;           // ClaimsIQ API URL
  readonly apiKey?: string;          // Optional API key
  readonly timeoutMs: number;        // Request timeout
  readonly retryAttempts: number;    // Max retry attempts
}

const DEFAULT_CONFIG: ClaimsAdapterConfig = {
  apiUrl: process.env.CLAIMSIQ_API_URL || 'http://localhost:3000/api/v1/claims',
  apiKey: process.env.CLAIMSIQ_API_KEY,
  timeoutMs: 10000,
  retryAttempts: 3,
};

/**
 * ClaimsAdapter - Fetches decisions from ClaimsIQ
 */
export class ClaimsAdapter {
  private readonly client: AxiosInstance;
  private readonly config: ClaimsAdapterConfig;

  constructor(config: Partial<ClaimsAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
    });

    console.log(`[ClaimsAdapter] Initialized with URL: ${this.config.apiUrl}`);
  }

  /**
   * getDecision - Fetch a claim decision from ClaimsIQ
   * 
   * @param claimId - The claim ID to fetch
   * @returns DecisionRecord
   * @throws RetryableError if ClaimsIQ is temporarily unavailable
   * @throws Error if claim not found or other permanent error
   */
  async getDecision(claimId: string): Promise<DecisionRecord> {
    console.log(`[ClaimsAdapter] Fetching decision for claim: ${claimId}`);

    try {
      const response = await this.client.get(`/decisions/${claimId}`);
      
      const data = response.data;
      
      // Parse and validate response
      const decision: DecisionRecord = {
        claim_id: data.claim_id || claimId,
        policy_id: data.policy_id,
        status: data.status,
        amount_micros: BigInt(data.amount_micros || data.amount || 0),
        currency: data.currency || 'USD',
        recipient_did: data.recipient_did,
        recipient_address: data.recipient_address || data.payout_address,
        decision_timestamp: new Date(data.decision_timestamp || data.created_at),
        audit_hash: data.audit_hash || data.hash,
      };

      console.log(`[ClaimsAdapter] Decision received: ${claimId} -> ${decision.status}`);
      return decision;

    } catch (error) {
      return this.handleError(error as AxiosError, claimId);
    }
  }

  /**
   * Handle API errors with appropriate error types
   */
  private handleError(error: AxiosError, claimId: string): never {
    const status = error.response?.status;

    // Network error or timeout - retryable
    if (!error.response || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.error(`[ClaimsAdapter] Network error for claim ${claimId}: ${error.message}`);
      throw new RetryableError(
        `ClaimsIQ unreachable: ${error.message}`,
        0,
        5000
      );
    }

    // Server errors (5xx) - retryable
    if (status && status >= 500) {
      console.error(`[ClaimsAdapter] Server error ${status} for claim ${claimId}`);
      throw new RetryableError(
        `ClaimsIQ server error: ${status}`,
        status,
        10000
      );
    }

    // Rate limited (429) - retryable with longer delay
    if (status === 429) {
      const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '30', 10) * 1000;
      console.warn(`[ClaimsAdapter] Rate limited, retry after ${retryAfter}ms`);
      throw new RetryableError(
        'ClaimsIQ rate limited',
        429,
        retryAfter
      );
    }

    // Not found (404) - permanent error
    if (status === 404) {
      console.error(`[ClaimsAdapter] Claim not found: ${claimId}`);
      throw new Error(`Claim not found: ${claimId}`);
    }

    // Other client errors (4xx) - permanent error
    console.error(`[ClaimsAdapter] Client error ${status} for claim ${claimId}`);
    throw new Error(`ClaimsIQ error ${status}: ${error.message}`);
  }

  /**
   * getDecisionWithRetry - Fetch with automatic retry on transient failures
   */
  async getDecisionWithRetry(claimId: string): Promise<DecisionRecord> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.getDecision(claimId);
      } catch (error) {
        lastError = error as Error;

        if (error instanceof RetryableError) {
          console.warn(`[ClaimsAdapter] Attempt ${attempt}/${this.config.retryAttempts} failed, retrying in ${error.retryAfterMs}ms...`);
          
          if (attempt < this.config.retryAttempts) {
            await this.sleep(error.retryAfterMs);
            continue;
          }
        }

        // Non-retryable error or max attempts reached
        throw error;
      }
    }

    throw lastError || new Error('Unknown error');
  }

  /**
   * checkHealth - Verify ClaimsIQ is reachable
   */
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/health');
      console.log('[ClaimsAdapter] ClaimsIQ health check: OK');
      return true;
    } catch (error) {
      console.error('[ClaimsAdapter] ClaimsIQ health check: FAILED');
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * MockClaimsAdapter - For testing without real ClaimsIQ
 */
export class MockClaimsAdapter extends ClaimsAdapter {
  private mockDecisions: Map<string, DecisionRecord> = new Map();

  constructor() {
    super({ apiUrl: 'http://mock' });
    console.log('[MockClaimsAdapter] Initialized in mock mode');
  }

  /**
   * Set a mock decision for testing
   */
  setMockDecision(decision: DecisionRecord): void {
    this.mockDecisions.set(decision.claim_id, decision);
    console.log(`[MockClaimsAdapter] Mock decision set: ${decision.claim_id} -> ${decision.status}`);
  }

  /**
   * Override getDecision to return mock data
   */
  async getDecision(claimId: string): Promise<DecisionRecord> {
    console.log(`[MockClaimsAdapter] Fetching mock decision for: ${claimId}`);
    
    const decision = this.mockDecisions.get(claimId);
    
    if (!decision) {
      throw new Error(`Mock decision not found: ${claimId}`);
    }

    return decision;
  }

  /**
   * Clear all mock decisions
   */
  clearMocks(): void {
    this.mockDecisions.clear();
  }
}
