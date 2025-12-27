-- Proveniq Capital - Database Schema
-- PostgreSQL Financial Ledger
-- 
-- FINANCIAL PHYSICS (IMMUTABLE LAWS):
-- 1. NO FLOATING POINT: All currency stored as BIGINT micros. $1.00 = 1000000
-- 2. ATOMIC BALANCE: Sum of all entries in a transaction_id must equal ZERO
-- 3. IMMUTABILITY: Never UPDATE or DELETE a ledger row. Only INSERT.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- LEDGER TABLES (Immutable Double-Entry Accounting)
-- ============================================

-- Ledger Transactions (groups balanced entry sets)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

-- Ledger Entries (immutable - INSERT only, never UPDATE/DELETE)
-- amount_micros is SIGNED: positive = DEBIT, negative = CREDIT
-- $1.00 = 1,000,000 micros
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
    account VARCHAR(50) NOT NULL CHECK (account IN ('ASSET_TREASURY', 'LIABILITY_RESERVE', 'EXPENSE_CLAIMS', 'REVENUE_PREMIUMS')),
    amount_micros BIGINT NOT NULL,  -- SIGNED: positive=debit, negative=credit
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('USD', 'USDC')),
    reference_id VARCHAR(255) NOT NULL,  -- Claim ID, Payment ID, Policy ID
    reference_type VARCHAR(20) NOT NULL CHECK (reference_type IN ('CLAIM', 'PREMIUM', 'ADJUSTMENT', 'TRANSFER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    memo TEXT  -- Human-readable description
);

-- NOTE: Account balances are COMPUTED from entries, not stored
-- Use: SELECT account, currency, SUM(amount_micros) FROM ledger_entries GROUP BY account, currency

-- ============================================
-- TREASURY TABLES (Liquidity Management)
-- ============================================

-- Liquidity Pools
CREATE TABLE IF NOT EXISTS liquidity_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'LIABILITY_RESERVE',
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('USD', 'USDC')),
    balance BIGINT NOT NULL DEFAULT 0,
    minimum_reserve BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fund Locks (temporary holds during payout processing)
CREATE TABLE IF NOT EXISTS fund_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES liquidity_pools(id),
    claim_id VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'RELEASED', 'EXPIRED'))
);

-- Treasury Alerts
CREATE TABLE IF NOT EXISTS treasury_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('CRITICAL_LOW', 'WARNING_LOW', 'LIQUIDITY_FAILURE')),
    pool_id UUID NOT NULL REFERENCES liquidity_pools(id),
    current_balance BIGINT NOT NULL,
    threshold BIGINT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================
-- PAYOUT TABLES (Settlement)
-- ============================================

-- Payout Transactions
CREATE TABLE IF NOT EXISTS payout_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id VARCHAR(255) NOT NULL,
    policy_id VARCHAR(255) NOT NULL,
    recipient_did VARCHAR(255) NOT NULL,
    recipient_address VARCHAR(500) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('USD', 'USDC')),
    rail VARCHAR(20) NOT NULL CHECK (rail IN ('STRIPE', 'USDC', 'WIRE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LOCKED', 'MANUAL_REVIEW', 'PROCESSING', 'CLEARED', 'FAILED')),
    tx_hash VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    ledger_entry_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    cleared_at TIMESTAMPTZ,
    failure_reason TEXT,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE
);

-- ============================================
-- INDEXES
-- ============================================

-- Ledger indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference ON ledger_entries(reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref_type ON ledger_entries(reference_type);

-- Treasury indexes
CREATE INDEX IF NOT EXISTS idx_fund_locks_pool ON fund_locks(pool_id);
CREATE INDEX IF NOT EXISTS idx_fund_locks_claim ON fund_locks(claim_id);
CREATE INDEX IF NOT EXISTS idx_fund_locks_status ON fund_locks(status);
CREATE INDEX IF NOT EXISTS idx_fund_locks_expires ON fund_locks(expires_at) WHERE status = 'LOCKED';
CREATE INDEX IF NOT EXISTS idx_treasury_alerts_unack ON treasury_alerts(acknowledged) WHERE acknowledged = FALSE;

-- Payout indexes
CREATE INDEX IF NOT EXISTS idx_payout_claim ON payout_transactions(claim_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON payout_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payout_created ON payout_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_payout_idempotency ON payout_transactions(idempotency_key);

-- ============================================
-- VIEWS (Computed from immutable entries)
-- ============================================

-- Account balances view (computed, not stored)
CREATE OR REPLACE VIEW account_balances_view AS
SELECT 
    account,
    currency,
    SUM(amount_micros) as balance_micros,
    MAX(created_at) as last_updated,
    COUNT(*) as entry_count
FROM ledger_entries
GROUP BY account, currency;
