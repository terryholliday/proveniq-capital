/**
 * Proveniq Capital - USDC Adapter
 * Crypto payment rail (Mock implementation)
 * 
 * In production: integrate with Circle API or direct blockchain interaction
 */

import {
  BankGateway,
  PaymentInstruction,
  TransferReceipt,
  GatewayResult,
} from '../bank.port';

export class USDCAdapter implements BankGateway {
  readonly name = 'USDC';
  private readonly enabled: boolean;
  private readonly network: string;

  constructor() {
    this.enabled = process.env.USDC_MOCK_ENABLED === 'true';
    this.network = process.env.USDC_NETWORK || 'ethereum-sepolia';
    
    console.log(`[USDCAdapter] Initialized on ${this.network} (mock: ${this.enabled})`);
  }

  /**
   * Transfer USDC to a wallet address
   */
  async transfer(instruction: PaymentInstruction): Promise<GatewayResult<TransferReceipt>> {
    const { recipient_address } = instruction;

    // Validate wallet address format
    if (!this.isValidAddress(recipient_address)) {
      return {
        success: false,
        error: 'Invalid wallet address format',
        retryable: false,
      };
    }

    if (this.enabled) {
      return this.mockTransfer(instruction);
    }

    // In production: implement actual USDC transfer
    return {
      success: false,
      error: 'USDC transfers not yet implemented in production mode',
      retryable: false,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.enabled;
  }

  async getTransferStatus(txHash: string): Promise<GatewayResult<TransferReceipt>> {
    return {
      success: false,
      error: `Transfer status lookup not implemented: ${txHash}`,
      retryable: false,
    };
  }

  /**
   * Mock transfer for development/testing
   */
  private mockTransfer(instruction: PaymentInstruction): GatewayResult<TransferReceipt> {
    const { recipient_address, recipient_did, amount_micros, currency, reference_id } = instruction;
    
    console.log(`[USDCAdapter] MOCK transfer: ${amount_micros} micros to ${recipient_address}`);

    // Simulate occasional failures
    if (recipient_address.toLowerCase().includes('fail')) {
      return {
        success: false,
        error: 'Mock failure: wallet marked for failure',
        retryable: false,
      };
    }

    // Generate mock transaction hash
    const mockTxHash = `0x${this.generateMockTxHash(reference_id)}`;

    console.log(`[USDCAdapter] MOCK tx hash: ${mockTxHash}`);

    return {
      success: true,
      value: {
        tx_hash: mockTxHash,
        gateway: this.name,
        amount_micros,
        currency,
        recipient_did,
        processed_at: new Date(),
        status: 'CLEARED',
      },
    };
  }

  /**
   * Validate Ethereum address format
   */
  private isValidAddress(address: string): boolean {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Generate mock transaction hash
   */
  private generateMockTxHash(seed: string): string {
    let hash = '';
    const chars = '0123456789abcdef';
    
    // Use seed to generate deterministic-ish hash
    for (let i = 0; i < 64; i++) {
      const charCode = seed.charCodeAt(i % seed.length);
      hash += chars[(charCode + i) % 16];
    }
    
    return hash;
  }

  /**
   * Get current network
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Check if running in mock mode
   */
  isMockMode(): boolean {
    return this.enabled;
  }

  /**
   * Get USDC balance for a wallet (mock)
   */
  async getBalance(walletAddress: string): Promise<bigint> {
    if (!this.isValidAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    // Mock: return random balance
    return BigInt(Math.floor(Math.random() * 1000000) * 1000000);
  }
}
