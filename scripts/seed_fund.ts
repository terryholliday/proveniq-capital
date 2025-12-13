/**
 * Proveniq Capital - Seed Funding Script
 * THE LOADER: Inject Initial Liquidity into the Vault
 * 
 * PURPOSE: Manually fund the Treasury so we can test payouts
 * without waiting for real Stripe payments.
 * 
 * ACCOUNTING:
 * DEBIT: ASSET_TREASURY +$1,000,000 (Cash goes UP)
 * CREDIT: EQUITY_CAPITAL -$1,000,000 (Founder capital injection)
 * 
 * RUN: npx ts-node scripts/seed_fund.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { LedgerService, LedgerRepository } from '../src/core/ledger';
import { dollarsToMicros, formatMicros } from '../src/shared/types';

const SEED_AMOUNT_DOLLARS = 1_000_000; // $1,000,000.00
const SEED_REFERENCE_ID = 'SEED_FUND_001';

async function seedFund(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  PROVENIQ CAPITAL - SEED FUNDING SCRIPT');
  console.log('  THE LOADER: Injecting Initial Liquidity');
  console.log('='.repeat(60));

  // Connect to database
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('\n[Seed] No DATABASE_URL found. Running in-memory mode.');
    console.log('[Seed] This will demonstrate the ledger logic without persistence.\n');
    
    // Run in-memory demonstration
    await runInMemoryDemo();
    return;
  }

  console.log('\n[Seed] Connecting to database...');
  
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('[Seed] Database connected.');

    // Initialize services
    const ledgerRepository = new LedgerRepository(pool);
    const ledgerService = new LedgerService(ledgerRepository);

    // Check if seed funding already exists (idempotency)
    const existingEntries = await ledgerService.getEntriesByReference(SEED_REFERENCE_ID);
    if (existingEntries.length > 0) {
      console.log('\n[Seed] WARNING: Seed funding already exists!');
      console.log('[Seed] Skipping to prevent duplicate injection.');
      
      // Show current balances
      await showBalances(ledgerService);
      return;
    }

    // Execute seed funding
    const amountMicros = dollarsToMicros(SEED_AMOUNT_DOLLARS);
    
    console.log('\n[Seed] Executing seed funding transaction...');
    console.log(`[Seed] Amount: ${formatMicros(amountMicros, 'USD')}`);

    const transaction = await ledgerService.recordTransaction(
      [
        { account: 'ASSET_TREASURY', amount_micros: amountMicros },    // DEBIT: Cash UP
        { account: 'EQUITY_CAPITAL', amount_micros: -amountMicros },   // CREDIT: Equity UP
      ],
      'USD',
      SEED_REFERENCE_ID,
      'TRANSFER',
      `Seed Funding Injection: ${formatMicros(amountMicros, 'USD')} founder capital`,
      'SEED_SCRIPT'
    );

    console.log('\n[Seed] ✓ SEED FUNDING COMMITTED');
    console.log(`[Seed] Transaction ID: ${transaction.id}`);
    console.log(`[Seed] Entries:`);
    for (const entry of transaction.entries) {
      const sign = entry.amount_micros >= 0n ? '+' : '';
      console.log(`  - ${entry.account}: ${sign}${formatMicros(entry.amount_micros, entry.currency)}`);
    }

    // Show updated balances
    await showBalances(ledgerService);

  } catch (error) {
    console.error('\n[Seed] ERROR:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n[Seed] Database connection closed.');
  }
}

async function showBalances(ledgerService: LedgerService): Promise<void> {
  console.log('\n[Seed] Current Account Balances:');
  console.log('-'.repeat(40));

  const accounts = [
    'ASSET_TREASURY',
    'LIABILITY_RESERVE', 
    'EXPENSE_CLAIMS',
    'REVENUE_PREMIUMS',
    'EQUITY_CAPITAL',
  ] as const;

  for (const account of accounts) {
    try {
      const balance = await ledgerService.getAccountBalance(account, 'USD');
      const formatted = formatMicros(balance.balance_micros, 'USD');
      console.log(`  ${account.padEnd(20)} ${formatted}`);
    } catch {
      console.log(`  ${account.padEnd(20)} $0.00`);
    }
  }
  console.log('-'.repeat(40));
}

async function runInMemoryDemo(): Promise<void> {
  console.log('[Seed] Running in-memory demonstration...\n');

  // Create ledger service without repository (in-memory mode)
  const ledgerService = new LedgerService();

  const amountMicros = dollarsToMicros(SEED_AMOUNT_DOLLARS);

  console.log('[Seed] Creating seed funding transaction...');
  console.log(`[Seed] Amount: ${formatMicros(amountMicros, 'USD')}`);
  console.log('[Seed] DEBIT: ASSET_TREASURY (Cash UP)');
  console.log('[Seed] CREDIT: EQUITY_CAPITAL (Founder injection)');

  // Use recordTransaction for proper EQUITY_CAPITAL accounting
  const transaction = await ledgerService.recordTransaction(
    [
      { account: 'ASSET_TREASURY', amount_micros: amountMicros },    // DEBIT: Cash UP
      { account: 'EQUITY_CAPITAL', amount_micros: -amountMicros },   // CREDIT: Equity UP
    ],
    'USD',
    SEED_REFERENCE_ID,
    'TRANSFER',
    `Seed Funding Injection: ${formatMicros(amountMicros, 'USD')} founder capital`,
    'SEED_SCRIPT'
  );

  console.log('\n[Seed] ✓ IN-MEMORY TRANSACTION CREATED');
  console.log(`[Seed] Transaction ID: ${transaction.id}`);
  
  const state = ledgerService.getInMemoryState();
  console.log(`\n[Seed] Ledger State:`);
  console.log(`  Transactions: ${state.transactions.length}`);
  console.log(`  Entries: ${state.entries.length}`);
  
  console.log(`\n[Seed] Entries:`);
  for (const entry of state.entries) {
    const sign = entry.amount_micros >= 0n ? '+' : '';
    console.log(`  - ${entry.account}: ${sign}${formatMicros(entry.amount_micros, entry.currency)}`);
  }

  // Show balances
  console.log('\n[Seed] Account Balances:');
  const treasuryBalance = await ledgerService.getAccountBalance('ASSET_TREASURY', 'USD');
  const equityBalance = await ledgerService.getAccountBalance('EQUITY_CAPITAL', 'USD');
  console.log(`  ASSET_TREASURY:  ${formatMicros(treasuryBalance.balance_micros, 'USD')}`);
  console.log(`  EQUITY_CAPITAL:  ${formatMicros(equityBalance.balance_micros, 'USD')}`);

  console.log('\n[Seed] NOTE: This was an in-memory demo.');
  console.log('[Seed] Set DATABASE_URL in .env to persist to PostgreSQL.');
}

// Execute
seedFund()
  .then(() => {
    console.log('\n[Seed] Script complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Seed] Fatal error:', error);
    process.exit(1);
  });
