/**
 * Proveniq Capital - Bank Gateway Port
 * THE HAND: Abstract interface for external financial gateways
 * 
 * ARCHITECTURAL CONCEPT (THE AIR GAP):
 * The Treasury (Ledger) never touches the Bank (Stripe) directly.
 * We use an Adapter Pattern.
 * 
 * Input: PaymentInstruction (Who, Amount, Currency)
 * Output: TransactionHash (Proof of movement)
 */

/**
 * Result type for gateway operations
 */
export type GatewayResult<T> = 
  | { success: true; value: T }
  | { success: false; error: string; retryable: boolean };

/**
 * PaymentInstruction - What to pay
 */
export interface PaymentInstruction {
  readonly recipient_did: string;       // Who to pay
  readonly recipient_address: string;   // Bank account / wallet address
  readonly amount_micros: bigint;       // Amount in micros ($1 = 1000000n)
  readonly currency: 'USD' | 'USDC';
  readonly reference_id: string;        // Claim ID for reconciliation
  readonly memo?: string;               // Payment description
}

/**
 * TransferReceipt - Proof of payment
 */
export interface TransferReceipt {
  readonly tx_hash: string;             // Transaction hash / reference ID
  readonly gateway: string;             // Which gateway processed it
  readonly amount_micros: bigint;
  readonly currency: 'USD' | 'USDC';
  readonly recipient_did: string;
  readonly processed_at: Date;
  readonly status: 'PENDING' | 'CLEARED' | 'FAILED';
  readonly raw_response?: unknown;      // Gateway-specific response
}

/**
 * BankGateway - Interface for payment adapters
 * 
 * Implementations:
 * - StripeAdapter (Fiat USD)
 * - USDCAdapter (Crypto USDC)
 * - MockAdapter (Testing)
 */
export interface BankGateway {
  /**
   * Gateway identifier
   */
  readonly name: string;

  /**
   * Transfer funds to a recipient
   * 
   * @param instruction - Payment details
   * @returns TransferReceipt on success, error on failure
   */
  transfer(instruction: PaymentInstruction): Promise<GatewayResult<TransferReceipt>>;

  /**
   * Check if gateway is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get transfer status by hash
   */
  getTransferStatus(txHash: string): Promise<GatewayResult<TransferReceipt>>;
}

/**
 * GatewayError - Thrown by gateway implementations
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * LimitExceededError - Thrown when transfer exceeds safety limits
 */
export class LimitExceededError extends GatewayError {
  constructor(
    public readonly amount_micros: bigint,
    public readonly limit_micros: bigint
  ) {
    super(
      `Transfer limit exceeded: ${amount_micros} > ${limit_micros} micros`,
      'LIMIT_EXCEEDED',
      false // Not retryable - requires manual approval
    );
    this.name = 'LimitExceededError';
  }
}
