/**
 * Proveniq Capital - Payout Orchestrator
 * THE MANAGER: Connects the Ear (ClaimsAdapter) to the Vault (Ledger)
 * 
 * DESIGN PHILOSOPHY:
 * - Idempotency First: Never pay the same claim twice
 * - Log Everything: Financial systems must be noisy
 * - Defensive: Assume ClaimsIQ might be down
 */

import { ClaimsAdapter, DecisionRecord, MockClaimsAdapter, RetryableError } from './claims.adapter';
import { LedgerService, TransactionManifest } from '../../core/ledger';
import { LedgerEntry } from '../../shared/types';
import { BankGateway, PaymentInstruction, TransferReceipt, LimitExceededError } from '../payouts/bank.port';
import { StripeAdapter } from '../payouts/stripe.mock';

/**
 * PayoutRecord - Tracks settled claims for idempotency
 */
export interface PayoutRecord {
  readonly claim_id: string;
  readonly transaction_id: string;
  readonly amount_micros: bigint;
  readonly currency: 'USD' | 'USDC';
  readonly settled_at: Date;
  readonly status: 'SETTLED' | 'FAILED';
  readonly failure_reason?: string;
  readonly tx_hash?: string;  // Bank/blockchain transaction hash
}

/**
 * In-memory payout storage for simulation
 * In production, this would be a database table
 */
const PAYOUT_LEDGER: PayoutRecord[] = [];

/**
 * PayoutOrchestrator - Manages the claim-to-payout flow
 * 
 * NEW FLOW (with BankGateway):
 * 1. Idempotency Check
 * 2. ClaimsIQ Status Check ('PAY')
 * 3. Ledger Lock: Pending debit
 * 4. EXTERNAL CALL: BankGateway.transfer()
 * 5. Ledger Finalize: Commit as CLEARED
 */
export class PayoutOrchestrator {
  constructor(
    private readonly claimsAdapter: ClaimsAdapter,
    private readonly ledger: LedgerService,
    private readonly bankGateway?: BankGateway
  ) {
    console.log('[PayoutOrchestrator] Initialized');
    if (bankGateway) {
      console.log(`[PayoutOrchestrator] Bank Gateway: ${bankGateway.name}`);
    }
  }

  /**
   * processClaim - The main entry point for settling a claim
   * 
   * FLOW:
   * 1. Idempotency Check: Have we already paid this claim?
   * 2. Fetch Decision: Get the verdict from ClaimsIQ
   * 3. Verify Verdict: Is it approved for payment?
   * 4. Execute Settlement: Post to the Ledger
   * 5. Record Payout: Seal idempotency
   * 
   * @param claimId - The claim to process
   * @returns PayoutResult with success/failure details
   */
  async processClaim(claimId: string): Promise<PayoutResult> {
    console.log(`\n[PAYOUT ORCHESTRATOR] ========================================`);
    console.log(`[PAYOUT ORCHESTRATOR] Processing claim: ${claimId}`);
    console.log(`[PAYOUT ORCHESTRATOR] ========================================`);

    // ----------------------------------------
    // STEP 1: IDEMPOTENCY CHECK
    // Query local storage: Have we already paid this claim?
    // ----------------------------------------
    const existingPayout = this.getPayoutRecord(claimId);
    
    if (existingPayout) {
      console.log(`[PAYOUT SKIPPED] Claim ${claimId} already settled at ${existingPayout.settled_at.toISOString()}`);
      console.log(`[PAYOUT SKIPPED] Previous transaction: ${existingPayout.transaction_id}`);
      return {
        success: false,
        claim_id: claimId,
        reason: 'ALREADY_SETTLED',
        message: `Claim already settled on ${existingPayout.settled_at.toISOString()}`,
        existing_transaction_id: existingPayout.transaction_id,
      };
    }

    // ----------------------------------------
    // STEP 2: FETCH DECISION FROM CLAIMSIQ
    // ----------------------------------------
    let decision: DecisionRecord;
    
    try {
      console.log(`[PAYOUT ORCHESTRATOR] Fetching decision from ClaimsIQ...`);
      decision = await this.claimsAdapter.getDecision(claimId);
      console.log(`[PAYOUT ORCHESTRATOR] Decision received: ${decision.status}`);
    } catch (error) {
      if (error instanceof RetryableError) {
        console.error(`[PAYOUT FAILED] ClaimsIQ temporarily unavailable: ${error.message}`);
        return {
          success: false,
          claim_id: claimId,
          reason: 'CLAIMSIQ_UNAVAILABLE',
          message: `ClaimsIQ error: ${error.message}`,
          retryable: true,
        };
      }
      
      console.error(`[PAYOUT FAILED] Could not fetch decision: ${(error as Error).message}`);
      return {
        success: false,
        claim_id: claimId,
        reason: 'FETCH_FAILED',
        message: `Failed to fetch decision: ${(error as Error).message}`,
      };
    }

    // ----------------------------------------
    // STEP 3: VERIFY VERDICT
    // Only process if status === 'PAY'
    // ----------------------------------------
    if (decision.status !== 'PAY') {
      console.log(`[PAYOUT SKIPPED] Claim ${claimId} not approved for payment. Status: ${decision.status}`);
      return {
        success: false,
        claim_id: claimId,
        reason: 'NOT_APPROVED',
        message: `Claim status is ${decision.status}, not PAY`,
        decision_status: decision.status,
      };
    }

    console.log(`[PAYOUT APPROVED] Claim ${claimId} approved for ${this.formatMicros(decision.amount_micros)}`);

    // ----------------------------------------
    // STEP 4: LEDGER LOCK (Pending Debit)
    // Post to the Ledger using double-entry accounting
    // DEBIT: EXPENSE_CLAIMS (money spent)
    // CREDIT: ASSET_TREASURY (money leaves bank)
    // ----------------------------------------
    console.log(`[PAYOUT INITIATED] Executing ledger transaction...`);

    const manifest: TransactionManifest = {
      type: 'CLAIM_PAYOUT',
      reference_id: claimId,
      amount_micros: decision.amount_micros,
      currency: decision.currency,
      description: `Claim payout for ${claimId} to ${decision.recipient_did}`,
      created_by: 'PAYOUT_ORCHESTRATOR',
    };

    const ledgerResult = this.ledger.postTransaction(manifest);

    if (!ledgerResult.success) {
      console.error(`[PAYOUT FAILED] Ledger rejected transaction: ${ledgerResult.error}`);
      
      // Record failed payout for audit
      this.recordPayout({
        claim_id: claimId,
        transaction_id: '',
        amount_micros: decision.amount_micros,
        currency: decision.currency,
        settled_at: new Date(),
        status: 'FAILED',
        failure_reason: ledgerResult.error,
      });

      return {
        success: false,
        claim_id: claimId,
        reason: 'LEDGER_REJECTED',
        message: `Ledger error: ${ledgerResult.error}`,
      };
    }

    const transactionId = ledgerResult.value;
    console.log(`[LEDGER LOCKED] Transaction posted: ${transactionId}`);

    // ----------------------------------------
    // STEP 5: EXTERNAL CALL - Bank Gateway Transfer
    // THE AIR GAP: Treasury never touches Bank directly
    // ----------------------------------------
    let txHash: string | undefined;

    if (this.bankGateway) {
      console.log(`[BANK TRANSFER] Initiating external transfer via ${this.bankGateway.name}...`);

      const instruction: PaymentInstruction = {
        recipient_did: decision.recipient_did,
        recipient_address: decision.recipient_address,
        amount_micros: decision.amount_micros,
        currency: decision.currency,
        reference_id: claimId,
        memo: `Claim payout: ${claimId}`,
      };

      try {
        const transferResult = await this.bankGateway.transfer(instruction);

        if (!transferResult.success) {
          // Bank transfer failed - CRITICAL: We have a ledger entry but no bank transfer
          console.error(`[CRITICAL] Bank transfer failed but ledger is committed!`);
          console.error(`[CRITICAL] RECONCILIATION REQUIRED for claim ${claimId}`);
          console.error(`[CRITICAL] Ledger TX: ${transactionId}, Error: ${transferResult.error}`);

          // Record as failed with reconciliation note
          this.recordPayout({
            claim_id: claimId,
            transaction_id: transactionId,
            amount_micros: decision.amount_micros,
            currency: decision.currency,
            settled_at: new Date(),
            status: 'FAILED',
            failure_reason: `RECONCILIATION_REQUIRED: ${transferResult.error}`,
          });

          return {
            success: false,
            claim_id: claimId,
            reason: 'BANK_TRANSFER_FAILED',
            message: `Bank transfer failed: ${transferResult.error}. RECONCILIATION REQUIRED.`,
            transaction_id: transactionId,
          };
        }

        txHash = transferResult.value.tx_hash;
        console.log(`[BANK TRANSFER] SUCCESS: ${txHash}`);

      } catch (error) {
        if (error instanceof LimitExceededError) {
          console.error(`[PAYOUT BLOCKED] Amount exceeds safety limit: ${error.message}`);
          return {
            success: false,
            claim_id: claimId,
            reason: 'LIMIT_EXCEEDED',
            message: error.message,
            transaction_id: transactionId,
          };
        }
        throw error;
      }
    } else {
      console.log(`[BANK TRANSFER] No gateway configured - simulating transfer`);
      txHash = `tx_simulated_${Date.now()}`;
    }

    // ----------------------------------------
    // STEP 6: RECORD PAYOUT (SEAL IDEMPOTENCY) - CLEARED
    // ----------------------------------------
    this.recordPayout({
      claim_id: claimId,
      transaction_id: transactionId,
      amount_micros: decision.amount_micros,
      currency: decision.currency,
      settled_at: new Date(),
      status: 'SETTLED',
      tx_hash: txHash,
    });

    console.log(`[PAYOUT COMPLETE] Claim ${claimId} settled successfully`);
    console.log(`[PAYOUT COMPLETE] Amount: ${this.formatMicros(decision.amount_micros)}`);
    console.log(`[PAYOUT COMPLETE] Ledger TX: ${transactionId}`);
    console.log(`[PAYOUT COMPLETE] Bank TX: ${txHash}`);

    return {
      success: true,
      claim_id: claimId,
      transaction_id: transactionId,
      amount_micros: decision.amount_micros,
      currency: decision.currency,
    };
  }

  /**
   * Get payout record by claim ID (idempotency check)
   */
  getPayoutRecord(claimId: string): PayoutRecord | undefined {
    return PAYOUT_LEDGER.find(p => p.claim_id === claimId && p.status === 'SETTLED');
  }

  /**
   * Record a payout (for idempotency)
   */
  private recordPayout(record: PayoutRecord): void {
    PAYOUT_LEDGER.push(record);
    console.log(`[PAYOUT RECORDED] Claim ${record.claim_id} -> ${record.status}`);
  }

  /**
   * Get all payout records (for testing/audit)
   */
  getAllPayouts(): PayoutRecord[] {
    return [...PAYOUT_LEDGER];
  }

  /**
   * Clear payout records (for testing)
   */
  clearPayouts(): void {
    PAYOUT_LEDGER.length = 0;
  }

  /**
   * Format micros as currency string
   */
  private formatMicros(micros: bigint): string {
    const dollars = Number(micros) / 1_000_000;
    return `$${dollars.toFixed(2)}`;
  }
}

/**
 * PayoutResult - Result of processClaim
 */
export interface PayoutResult {
  success: boolean;
  claim_id: string;
  transaction_id?: string;
  amount_micros?: bigint;
  currency?: 'USD' | 'USDC';
  reason?: string;
  message?: string;
  decision_status?: string;
  existing_transaction_id?: string;
  retryable?: boolean;
}

// ============================================
// SELF-EXECUTING TEST
// ============================================

/**
 * Test the Payout Orchestrator with Stripe Mock
 * Run with: npx ts-node src/modules/claims-listener/payout.orchestrator.ts
 */
async function testPayoutOrchestrator(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  THE HAND - PAYOUT ORCHESTRATOR + STRIPE TEST');
  console.log('='.repeat(60));

  // Create mock adapter, ledger, and STRIPE GATEWAY
  const mockAdapter = new MockClaimsAdapter();
  const ledger = new LedgerService(); // In-memory mode
  const stripeGateway = new StripeAdapter(); // THE HAND
  const orchestrator = new PayoutOrchestrator(mockAdapter, ledger, stripeGateway);

  // Clear any previous state
  orchestrator.clearPayouts();
  ledger.clearInMemoryState();
  stripeGateway.clearHistory();

  // ----------------------------------------
  // SETUP: Mock a PAY decision
  // ----------------------------------------
  const testClaimId = 'CLAIM-TEST-001';
  const testAmount = 500_000_000n; // $500.00

  mockAdapter.setMockDecision({
    claim_id: testClaimId,
    policy_id: 'POLICY-001',
    status: 'PAY',
    amount_micros: testAmount,
    currency: 'USD',
    recipient_did: 'did:proveniq:user123',
    recipient_address: 'acct_stripe_123',
    decision_timestamp: new Date(),
    audit_hash: 'abc123',
  });

  // ----------------------------------------
  // TEST 1: Valid Payout
  // ----------------------------------------
  console.log('\n[TEST 1] Valid Payout - First Attempt');
  console.log('  Expected: SUCCESS');

  const result1 = await orchestrator.processClaim(testClaimId);

  if (result1.success) {
    console.log(`\n  ✓ TEST 1 PASSED: Payout succeeded`);
    console.log(`    Transaction: ${result1.transaction_id}`);
  } else {
    console.log(`\n  ✗ TEST 1 FAILED: ${result1.message}`);
  }

  // Check ledger state
  const state1 = ledger.getInMemoryState();
  console.log(`\n  Ledger State After Test 1:`);
  console.log(`    Transactions: ${state1.transactions.length}`);
  console.log(`    Entries: ${state1.entries.length}`);

  // Calculate balances
  const treasuryBalance = state1.entries
    .filter((e: LedgerEntry) => e.account === 'ASSET_TREASURY')
    .reduce((sum: bigint, e: LedgerEntry) => sum + e.amount_micros, 0n);
  const expenseBalance = state1.entries
    .filter((e: LedgerEntry) => e.account === 'EXPENSE_CLAIMS')
    .reduce((sum: bigint, e: LedgerEntry) => sum + e.amount_micros, 0n);

  console.log(`    ASSET_TREASURY: ${treasuryBalance} micros (${Number(treasuryBalance) / 1_000_000})`);
  console.log(`    EXPENSE_CLAIMS: ${expenseBalance} micros (${Number(expenseBalance) / 1_000_000})`);

  // ----------------------------------------
  // TEST 2: Replay Attack (Idempotency Test)
  // ----------------------------------------
  console.log('\n[TEST 2] Replay Attack - Second Attempt (Same Claim)');
  console.log('  Expected: REJECTED (Already Settled)');

  const result2 = await orchestrator.processClaim(testClaimId);

  if (!result2.success && result2.reason === 'ALREADY_SETTLED') {
    console.log(`\n  ✓ TEST 2 PASSED: Replay attack blocked`);
    console.log(`    Reason: ${result2.reason}`);
  } else {
    console.log(`\n  ✗ TEST 2 FAILED: Replay attack was not blocked!`);
  }

  // Verify ledger did NOT change
  const state2 = ledger.getInMemoryState();
  console.log(`\n  Ledger State After Test 2 (Should be unchanged):`);
  console.log(`    Transactions: ${state2.transactions.length} (expected: 1)`);
  console.log(`    Entries: ${state2.entries.length} (expected: 2)`);

  const treasuryBalance2 = state2.entries
    .filter((e: LedgerEntry) => e.account === 'ASSET_TREASURY')
    .reduce((sum: bigint, e: LedgerEntry) => sum + e.amount_micros, 0n);

  if (treasuryBalance2 === treasuryBalance) {
    console.log(`    ✓ Balance unchanged: ${treasuryBalance2} micros`);
  } else {
    console.log(`    ✗ Balance changed! Was ${treasuryBalance}, now ${treasuryBalance2}`);
  }

  // ----------------------------------------
  // TEST 3: Non-PAY Decision
  // ----------------------------------------
  console.log('\n[TEST 3] Non-PAY Decision (DENY)');
  console.log('  Expected: REJECTED (Not Approved)');

  const deniedClaimId = 'CLAIM-DENIED-001';
  mockAdapter.setMockDecision({
    claim_id: deniedClaimId,
    policy_id: 'POLICY-002',
    status: 'DENY',
    amount_micros: 100_000_000n,
    currency: 'USD',
    recipient_did: 'did:proveniq:user456',
    recipient_address: 'acct_stripe_456',
    decision_timestamp: new Date(),
    audit_hash: 'def456',
  });

  const result3 = await orchestrator.processClaim(deniedClaimId);

  if (!result3.success && result3.reason === 'NOT_APPROVED') {
    console.log(`\n  ✓ TEST 3 PASSED: DENY claim correctly rejected`);
  } else {
    console.log(`\n  ✗ TEST 3 FAILED: DENY claim was not rejected properly`);
  }

  // ----------------------------------------
  // SUMMARY
  // ----------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(60));

  const finalState = ledger.getInMemoryState();
  const globalSum = finalState.entries.reduce((acc: bigint, e: LedgerEntry) => acc + e.amount_micros, 0n);

  console.log(`  Total Transactions: ${finalState.transactions.length}`);
  console.log(`  Total Entries: ${finalState.entries.length}`);
  console.log(`  Global Sum: ${globalSum} (must be 0n)`);
  console.log(`  Payouts Recorded: ${orchestrator.getAllPayouts().length}`);

  if (globalSum === 0n && finalState.transactions.length === 1) {
    console.log('\n  ✓ THE EAR IS SECURE');
    console.log('  ✓ IDEMPOTENCY VERIFIED');
    console.log('  ✓ LEDGER BALANCED');
  } else {
    console.log('\n  ✗ TESTS FAILED');
  }

  console.log('='.repeat(60));
}

// Run test if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  testPayoutOrchestrator().catch(console.error);
}
