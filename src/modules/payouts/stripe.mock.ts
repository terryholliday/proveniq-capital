/**
 * Proveniq Capital - Stripe Mock Adapter
 * THE HAND: Mock implementation of Stripe payment gateway
 * 
 * DESIGN:
 * - Simulates real bank latency (500ms)
 * - Enforces $10,000 safety limit
 * - Returns mock transaction hashes
 */

import {
  BankGateway,
  PaymentInstruction,
  TransferReceipt,
  GatewayResult,
  LimitExceededError,
} from './bank.port';

/**
 * Safety limit: $10,000 in micros
 * Transactions above this require manual approval
 */
const TRANSFER_LIMIT_MICROS = 10_000_000_000n; // $10,000.00

/**
 * Simulated bank latency in milliseconds
 */
const BANK_LATENCY_MS = 500;

/**
 * StripeAdapter - Mock implementation of Stripe payment gateway
 */
export class StripeAdapter implements BankGateway {
  readonly name = 'STRIPE_MOCK';

  private transferHistory: Map<string, TransferReceipt> = new Map();

  constructor() {
    console.log('[STRIPE MOCK] Adapter initialized');
    console.log(`[STRIPE MOCK] Transfer limit: $${Number(TRANSFER_LIMIT_MICROS) / 1_000_000}`);
  }

  /**
   * Transfer funds via Stripe (mocked)
   * 
   * LOGIC:
   * 1. Simulate bank latency (500ms)
   * 2. Validate amount against safety limit
   * 3. Return mock transaction hash
   */
  async transfer(instruction: PaymentInstruction): Promise<GatewayResult<TransferReceipt>> {
    const amountDollars = Number(instruction.amount_micros) / 1_000_000;
    
    console.log(`[STRIPE MOCK] ========================================`);
    console.log(`[STRIPE MOCK] Transferring $${amountDollars.toFixed(2)} to ${instruction.recipient_did}`);
    console.log(`[STRIPE MOCK] Reference: ${instruction.reference_id}`);
    console.log(`[STRIPE MOCK] ========================================`);

    // Step 1: Simulate bank latency (banks are slow)
    console.log(`[STRIPE MOCK] Connecting to bank... (${BANK_LATENCY_MS}ms latency)`);
    await this.sleep(BANK_LATENCY_MS);

    // Step 2: Validate amount against safety limit
    if (instruction.amount_micros > TRANSFER_LIMIT_MICROS) {
      const limitDollars = Number(TRANSFER_LIMIT_MICROS) / 1_000_000;
      console.error(`[STRIPE MOCK] REJECTED: Amount $${amountDollars.toFixed(2)} exceeds limit $${limitDollars.toFixed(2)}`);
      
      throw new LimitExceededError(
        instruction.amount_micros,
        TRANSFER_LIMIT_MICROS
      );
    }

    // Step 3: Generate mock transaction hash
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const txHash = `tx_stripe_${timestamp}_${random}`;

    const receipt: TransferReceipt = {
      tx_hash: txHash,
      gateway: this.name,
      amount_micros: instruction.amount_micros,
      currency: instruction.currency,
      recipient_did: instruction.recipient_did,
      processed_at: new Date(),
      status: 'CLEARED',
      raw_response: {
        stripe_transfer_id: `tr_${random}`,
        stripe_payout_id: `po_${random}`,
      },
    };

    // Store in history for status lookups
    this.transferHistory.set(txHash, receipt);

    console.log(`[STRIPE MOCK] SUCCESS: Transfer completed`);
    console.log(`[STRIPE MOCK] Transaction Hash: ${txHash}`);

    return { success: true, value: receipt };
  }

  /**
   * Check if Stripe is available (always true for mock)
   */
  async isAvailable(): Promise<boolean> {
    console.log('[STRIPE MOCK] Health check: OK');
    return true;
  }

  /**
   * Get transfer status by hash
   */
  async getTransferStatus(txHash: string): Promise<GatewayResult<TransferReceipt>> {
    const receipt = this.transferHistory.get(txHash);

    if (!receipt) {
      return {
        success: false,
        error: `Transfer not found: ${txHash}`,
        retryable: false,
      };
    }

    return { success: true, value: receipt };
  }

  /**
   * Get all transfer history (for testing)
   */
  getTransferHistory(): TransferReceipt[] {
    return Array.from(this.transferHistory.values());
  }

  /**
   * Clear transfer history (for testing)
   */
  clearHistory(): void {
    this.transferHistory.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * FailingStripeAdapter - For testing failure scenarios
 */
export class FailingStripeAdapter implements BankGateway {
  readonly name = 'STRIPE_FAILING';

  constructor(private readonly failureMessage: string = 'Simulated Stripe failure') {
    console.log('[STRIPE FAILING] Adapter initialized (will fail all transfers)');
  }

  async transfer(_instruction: PaymentInstruction): Promise<GatewayResult<TransferReceipt>> {
    console.error(`[STRIPE FAILING] Transfer failed: ${this.failureMessage}`);
    return {
      success: false,
      error: this.failureMessage,
      retryable: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getTransferStatus(_txHash: string): Promise<GatewayResult<TransferReceipt>> {
    return {
      success: false,
      error: 'Gateway unavailable',
      retryable: true,
    };
  }
}
