/**
 * Proveniq Capital - Remittance Test Script
 * Tests the POST /api/v1/remittance endpoint logic
 * 
 * RUN: npx ts-node scripts/test_remittance.ts
 */

import { LedgerService } from '../src/core/ledger';
import { RemittanceService } from '../src/modules/remittance';
import { RemittanceRequest, formatMicros, createPoolAccount } from '../src/shared/types';

async function testRemittance(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  PROVENIQ CAPITAL - REMITTANCE TEST');
  console.log('  Testing Pool-Specific Funds Ingress from Bids');
  console.log('='.repeat(60));

  // Create in-memory ledger (no database needed)
  const ledgerService = new LedgerService();
  const remittanceService = new RemittanceService(ledgerService);

  // ----------------------------------------
  // TEST 1: Valid Remittance (Insurance Pool)
  // ----------------------------------------
  console.log('\n[TEST 1] Valid Remittance to Insurance Pool');
  
  const request1: RemittanceRequest = {
    source_module: 'BIDS',
    target_pool_id: 'pool_insurance_A1',
    reference_id: 'auction_001',
    amount_micros: 50_000_000_000n, // $50,000
    currency: 'USD',
    metadata: {
      claim_id: 'CLM-2024-001',
      asset_description: 'Salvaged vehicle - 2022 Toyota Camry',
    },
  };

  console.log(`  Source: ${request1.source_module}`);
  console.log(`  Pool: ${request1.target_pool_id}`);
  console.log(`  Amount: ${formatMicros(request1.amount_micros, 'USD')}`);
  console.log(`  Reference: ${request1.reference_id}`);

  const result1 = await remittanceService.processRemittance(request1);

  if (result1.success) {
    console.log(`  ✓ SUCCESS: Transaction ${result1.transaction_id}`);
  } else {
    console.log(`  ✗ FAILED: ${result1.error}`);
  }

  // ----------------------------------------
  // TEST 2: Valid Remittance (Lending Pool)
  // ----------------------------------------
  console.log('\n[TEST 2] Valid Remittance to Lending Pool');
  
  const request2: RemittanceRequest = {
    source_module: 'BIDS',
    target_pool_id: 'pool_lending_B2',
    reference_id: 'liquidation_002',
    amount_micros: 25_000_000_000n, // $25,000
    currency: 'USD',
    metadata: {
      loan_id: 'LOAN-2024-042',
      asset_description: 'Collateral liquidation - Rolex Submariner',
    },
  };

  console.log(`  Source: ${request2.source_module}`);
  console.log(`  Pool: ${request2.target_pool_id}`);
  console.log(`  Amount: ${formatMicros(request2.amount_micros, 'USD')}`);
  console.log(`  Reference: ${request2.reference_id}`);

  const result2 = await remittanceService.processRemittance(request2);

  if (result2.success) {
    console.log(`  ✓ SUCCESS: Transaction ${result2.transaction_id}`);
  } else {
    console.log(`  ✗ FAILED: ${result2.error}`);
  }

  // ----------------------------------------
  // TEST 3: Duplicate Reference (Idempotency)
  // ----------------------------------------
  console.log('\n[TEST 3] Duplicate Reference (Should Reject)');
  
  const result3 = await remittanceService.processRemittance(request1);

  if (!result3.success && result3.error_code === 'DUPLICATE_REFERENCE') {
    console.log(`  ✓ CORRECTLY REJECTED: ${result3.error}`);
  } else if (result3.success) {
    console.log(`  ✗ FAILED: Should have rejected duplicate`);
  } else {
    console.log(`  ✗ WRONG ERROR: ${result3.error}`);
  }

  // ----------------------------------------
  // TEST 4: Unauthorized Source
  // ----------------------------------------
  console.log('\n[TEST 4] Unauthorized Source (Should Reject)');
  
  const request4: RemittanceRequest = {
    source_module: 'UNKNOWN' as any,
    target_pool_id: 'pool_insurance_A1',
    reference_id: 'hack_attempt_001',
    amount_micros: 1_000_000_000_000n, // $1,000,000
    currency: 'USD',
  };

  const result4 = await remittanceService.processRemittance(request4);

  if (!result4.success && result4.error_code === 'INVALID_SOURCE') {
    console.log(`  ✓ CORRECTLY REJECTED: ${result4.error}`);
  } else if (result4.success) {
    console.log(`  ✗ FAILED: Should have rejected unauthorized source`);
  } else {
    console.log(`  ? OTHER ERROR: ${result4.error}`);
  }

  // ----------------------------------------
  // LEDGER STATE
  // ----------------------------------------
  console.log('\n[LEDGER STATE]');
  console.log('-'.repeat(50));

  const state = ledgerService.getInMemoryState();
  console.log(`  Transactions: ${state.transactions.length}`);
  console.log(`  Entries: ${state.entries.length}`);

  // Show balances
  console.log('\n[ACCOUNT BALANCES]');
  console.log('-'.repeat(50));

  const treasuryBalance = await ledgerService.getAccountBalance('ASSET_TREASURY', 'USD');
  console.log(`  ASSET_TREASURY:           ${formatMicros(treasuryBalance.balance_micros, 'USD')}`);

  const insurancePoolAccount = createPoolAccount('insurance_A1');
  const insuranceBalance = await ledgerService.getAccountBalance(insurancePoolAccount, 'USD');
  console.log(`  LIABILITY_POOL_insurance_A1: ${formatMicros(insuranceBalance.balance_micros, 'USD')}`);

  const lendingPoolAccount = createPoolAccount('lending_B2');
  const lendingBalance = await ledgerService.getAccountBalance(lendingPoolAccount, 'USD');
  console.log(`  LIABILITY_POOL_lending_B2:   ${formatMicros(lendingBalance.balance_micros, 'USD')}`);

  // Verify zero-sum
  const totalSum = treasuryBalance.balance_micros + insuranceBalance.balance_micros + lendingBalance.balance_micros;
  console.log('\n[ZERO-SUM VERIFICATION]');
  console.log('-'.repeat(50));
  console.log(`  Total Sum: ${totalSum} (should be 0n)`);
  console.log(`  Balanced: ${totalSum === 0n ? '✓ YES' : '✗ NO'}`);

  console.log('\n[TEST COMPLETE]');
}

// Execute
testRemittance()
  .then(() => {
    console.log('\nRemittance test complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
