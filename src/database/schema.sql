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
-- ORIGINATION ENGINE TABLES (Lending)
-- ============================================

-- Loan Applications
CREATE TABLE IF NOT EXISTS loan_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    borrower_id VARCHAR(255) NOT NULL,
    borrower_type VARCHAR(20) NOT NULL CHECK (borrower_type IN ('CONSUMER', 'LANDLORD', 'BUSINESS')),
    source_app VARCHAR(20) NOT NULL CHECK (source_app IN ('HOME', 'PROPERTIES', 'OPS')),
    product_type VARCHAR(50) NOT NULL CHECK (product_type IN (
        'ASSET_BACKED_CONSUMER', 'ASSET_BACKED_VEHICLE', 
        'PROPERTY_BRIDGE', 'PROPERTY_RENOVATION',
        'EQUIPMENT_FINANCE', 'INVENTORY_LINE'
    )),
    
    -- Request
    requested_amount_cents BIGINT NOT NULL CHECK (requested_amount_cents > 0),
    requested_term_days INTEGER NOT NULL CHECK (requested_term_days > 0),
    payment_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (payment_frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')),
    purpose TEXT NOT NULL,
    
    -- Collateral (PROVENIQ Asset IDs from Core)
    collateral_asset_ids TEXT[] NOT NULL,
    
    -- Calculated (set during underwriting)
    approved_amount_cents BIGINT,
    approved_term_days INTEGER,
    apr_bps INTEGER,  -- Basis points (500 = 5.00%)
    origination_fee_cents BIGINT,
    monthly_payment_cents BIGINT,
    total_interest_cents BIGINT,
    ltv_ratio DECIMAL(5,4),
    
    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED',
        'ACTIVE', 'DELINQUENT', 'DEFAULT', 'PAID_OFF', 'RECOVERED', 'CANCELLED'
    )),
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
    underwriting_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    funded_at TIMESTAMPTZ,
    maturity_date TIMESTAMPTZ
);

-- Active Loans
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES loan_applications(id),
    borrower_id VARCHAR(255) NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    
    -- Terms
    principal_cents BIGINT NOT NULL CHECK (principal_cents > 0),
    apr_bps INTEGER NOT NULL,
    term_days INTEGER NOT NULL,
    payment_frequency VARCHAR(20) NOT NULL,
    monthly_payment_cents BIGINT NOT NULL,
    
    -- Balances
    outstanding_principal_cents BIGINT NOT NULL,
    accrued_interest_cents BIGINT NOT NULL DEFAULT 0,
    total_paid_cents BIGINT NOT NULL DEFAULT 0,
    
    -- Collateral
    collateral_asset_ids TEXT[] NOT NULL,
    total_collateral_value_cents BIGINT NOT NULL,
    current_ltv_ratio DECIMAL(5,4) NOT NULL,
    
    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
        'ACTIVE', 'DELINQUENT', 'DEFAULT', 'PAID_OFF', 'RECOVERED'
    )),
    days_delinquent INTEGER NOT NULL DEFAULT 0,
    next_payment_due_date TIMESTAMPTZ NOT NULL,
    
    -- Timestamps
    funded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    maturity_date TIMESTAMPTZ NOT NULL,
    last_payment_date TIMESTAMPTZ,
    paid_off_at TIMESTAMPTZ,
    defaulted_at TIMESTAMPTZ
);

-- Loan Payments
CREATE TABLE IF NOT EXISTS loan_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    
    -- Payment details
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    principal_portion_cents BIGINT NOT NULL,
    interest_portion_cents BIGINT NOT NULL,
    
    -- Source
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('ACH', 'CARD', 'WIRE', 'CRYPTO')),
    external_reference VARCHAR(255),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'FAILED', 'REVERSED')),
    
    -- Ledger linkage
    ledger_transaction_id UUID REFERENCES ledger_transactions(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at TIMESTAMPTZ
);

-- Covenants
CREATE TABLE IF NOT EXISTS loan_covenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    covenant_type VARCHAR(30) NOT NULL CHECK (covenant_type IN (
        'LTV_MAX', 'ANCHOR_SEAL_INTACT', 'INSURANCE_ACTIVE',
        'CUSTODY_UNCHANGED', 'SERVICE_CURRENT', 'LOCATION_BOUND', 'CONDITION_MAINTAINED'
    )),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SATISFIED', 'BREACHED', 'WAIVED')),
    
    -- Thresholds
    threshold_value DECIMAL(10,4),
    threshold_location TEXT,
    
    -- Current state
    current_value DECIMAL(10,4),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Breach info
    breached_at TIMESTAMPTZ,
    breach_reason TEXT,
    grace_period_ends_at TIMESTAMPTZ,
    
    -- Resolution
    cured_at TIMESTAMPTZ,
    waived_at TIMESTAMPTZ,
    waived_by VARCHAR(255),
    waiver_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Covenant Events (Audit Trail)
CREATE TABLE IF NOT EXISTS covenant_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    covenant_id UUID NOT NULL REFERENCES loan_covenants(id),
    loan_id UUID NOT NULL REFERENCES loans(id),
    
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CHECK', 'BREACH', 'CURE', 'WAIVE', 'ESCALATE')),
    previous_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    
    ledger_event_id VARCHAR(255),
    details JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Loan Application indexes
CREATE INDEX IF NOT EXISTS idx_loan_app_borrower ON loan_applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loan_app_status ON loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_loan_app_product ON loan_applications(product_type);
CREATE INDEX IF NOT EXISTS idx_loan_app_source ON loan_applications(source_app);
CREATE INDEX IF NOT EXISTS idx_loan_app_created ON loan_applications(created_at);

-- Loan indexes
CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_application ON loans(application_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_maturity ON loans(maturity_date);
CREATE INDEX IF NOT EXISTS idx_loans_next_payment ON loans(next_payment_due_date);
CREATE INDEX IF NOT EXISTS idx_loans_delinquent ON loans(days_delinquent) WHERE days_delinquent > 0;

-- Loan Payment indexes
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_payments_status ON loan_payments(status);
CREATE INDEX IF NOT EXISTS idx_loan_payments_created ON loan_payments(created_at);

-- Covenant indexes
CREATE INDEX IF NOT EXISTS idx_covenants_loan ON loan_covenants(loan_id);
CREATE INDEX IF NOT EXISTS idx_covenants_type ON loan_covenants(covenant_type);
CREATE INDEX IF NOT EXISTS idx_covenants_status ON loan_covenants(status);
CREATE INDEX IF NOT EXISTS idx_covenants_breached ON loan_covenants(breached_at) WHERE status = 'BREACHED';

-- Covenant Event indexes
CREATE INDEX IF NOT EXISTS idx_covenant_events_covenant ON covenant_events(covenant_id);
CREATE INDEX IF NOT EXISTS idx_covenant_events_loan ON covenant_events(loan_id);
CREATE INDEX IF NOT EXISTS idx_covenant_events_type ON covenant_events(event_type);

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
