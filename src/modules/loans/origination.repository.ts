/**
 * PROVENIQ Capital - Origination Repository
 * 
 * Database access layer for loan applications, loans, and covenants.
 */

import { Pool, PoolClient } from 'pg';
import { LoanApplication, Loan, LoanStatus, LoanProductType, PaymentFrequency } from './loan-types';
import { Covenant, CovenantStatus, CovenantType, CovenantEvent } from './covenants';

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

export class OriginationRepository {
  constructor(private pool: Pool) {}

  // ==========================================================================
  // LOAN APPLICATIONS
  // ==========================================================================

  async createApplication(app: Omit<LoanApplication, 'id'>): Promise<LoanApplication> {
    const query = `
      INSERT INTO loan_applications (
        borrower_id, borrower_type, source_app, product_type,
        requested_amount_cents, requested_term_days, payment_frequency, purpose,
        collateral_asset_ids, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      app.borrowerId,
      app.borrowerType,
      app.sourceApp,
      app.productType,
      app.requestedAmountCents,
      app.requestedTermDays,
      app.paymentFrequency,
      app.purpose,
      app.collateralAssetIds,
      app.status || 'DRAFT',
      new Date(),
    ];

    const result = await this.pool.query(query, values);
    return this.mapApplicationRow(result.rows[0]);
  }

  async getApplicationById(id: string): Promise<LoanApplication | null> {
    const query = 'SELECT * FROM loan_applications WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    return this.mapApplicationRow(result.rows[0]);
  }

  async getApplicationsByBorrower(borrowerId: string): Promise<LoanApplication[]> {
    const query = 'SELECT * FROM loan_applications WHERE borrower_id = $1 ORDER BY created_at DESC';
    const result = await this.pool.query(query, [borrowerId]);
    return result.rows.map(row => this.mapApplicationRow(row));
  }

  async updateApplication(id: string, updates: Partial<LoanApplication>): Promise<LoanApplication | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      status: 'status',
      approvedAmountCents: 'approved_amount_cents',
      approvedTermDays: 'approved_term_days',
      aprBps: 'apr_bps',
      originationFeeCents: 'origination_fee_cents',
      monthlyPaymentCents: 'monthly_payment_cents',
      totalInterestCents: 'total_interest_cents',
      ltvRatio: 'ltv_ratio',
      riskScore: 'risk_score',
      underwritingNotes: 'underwriting_notes',
      submittedAt: 'submitted_at',
      approvedAt: 'approved_at',
      fundedAt: 'funded_at',
      maturityDate: 'maturity_date',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates && updates[key as keyof LoanApplication] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push(updates[key as keyof LoanApplication]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.getApplicationById(id);

    values.push(id);
    const query = `
      UPDATE loan_applications 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapApplicationRow(result.rows[0]);
  }

  // ==========================================================================
  // LOANS
  // ==========================================================================

  async createLoan(loan: Omit<Loan, 'id'>, client?: PoolClient): Promise<Loan> {
    const executor = client || this.pool;
    
    const query = `
      INSERT INTO loans (
        application_id, borrower_id, product_type,
        principal_cents, apr_bps, term_days, payment_frequency, monthly_payment_cents,
        outstanding_principal_cents, accrued_interest_cents, total_paid_cents,
        collateral_asset_ids, total_collateral_value_cents, current_ltv_ratio,
        status, days_delinquent, next_payment_due_date,
        funded_at, maturity_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      loan.applicationId,
      loan.borrowerId,
      loan.productType,
      loan.principalCents,
      loan.aprBps,
      loan.termDays,
      loan.paymentFrequency,
      loan.monthlyPaymentCents,
      loan.outstandingPrincipalCents,
      loan.accruedInterestCents || 0,
      loan.totalPaidCents || 0,
      loan.collateralAssetIds,
      loan.totalCollateralValueCents,
      loan.currentLtvRatio,
      loan.status || 'ACTIVE',
      loan.daysDelinquent || 0,
      loan.nextPaymentDueDate,
      loan.fundedAt || new Date().toISOString(),
      loan.maturityDate,
    ];

    const result = await executor.query(query, values);
    return this.mapLoanRow(result.rows[0]);
  }

  async getLoanById(id: string): Promise<Loan | null> {
    const query = 'SELECT * FROM loans WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) return null;
    return this.mapLoanRow(result.rows[0]);
  }

  async getLoansByBorrower(borrowerId: string): Promise<Loan[]> {
    const query = 'SELECT * FROM loans WHERE borrower_id = $1 ORDER BY funded_at DESC';
    const result = await this.pool.query(query, [borrowerId]);
    return result.rows.map(row => this.mapLoanRow(row));
  }

  async getActiveLoans(): Promise<Loan[]> {
    const query = "SELECT * FROM loans WHERE status = 'ACTIVE' ORDER BY next_payment_due_date ASC";
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapLoanRow(row));
  }

  async getDelinquentLoans(): Promise<Loan[]> {
    const query = "SELECT * FROM loans WHERE status = 'DELINQUENT' ORDER BY days_delinquent DESC";
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapLoanRow(row));
  }

  async updateLoan(id: string, updates: Partial<Loan>): Promise<Loan | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      status: 'status',
      outstandingPrincipalCents: 'outstanding_principal_cents',
      accruedInterestCents: 'accrued_interest_cents',
      totalPaidCents: 'total_paid_cents',
      totalCollateralValueCents: 'total_collateral_value_cents',
      currentLtvRatio: 'current_ltv_ratio',
      daysDelinquent: 'days_delinquent',
      nextPaymentDueDate: 'next_payment_due_date',
      lastPaymentDate: 'last_payment_date',
      paidOffAt: 'paid_off_at',
      defaultedAt: 'defaulted_at',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates && updates[key as keyof Loan] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push(updates[key as keyof Loan]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return this.getLoanById(id);

    values.push(id);
    const query = `
      UPDATE loans 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapLoanRow(result.rows[0]);
  }

  // ==========================================================================
  // COVENANTS
  // ==========================================================================

  async createCovenant(covenant: Omit<Covenant, 'id'>, client?: PoolClient): Promise<Covenant> {
    const executor = client || this.pool;
    
    const query = `
      INSERT INTO loan_covenants (
        loan_id, covenant_type, status,
        threshold_value, threshold_location,
        current_value, last_checked_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      covenant.loanId,
      covenant.type,
      covenant.status || 'ACTIVE',
      covenant.thresholdValue,
      covenant.thresholdLocation,
      covenant.currentValue,
      covenant.lastCheckedAt || new Date().toISOString(),
      covenant.createdAt || new Date().toISOString(),
    ];

    const result = await executor.query(query, values);
    return this.mapCovenantRow(result.rows[0]);
  }

  async getCovenantsByLoan(loanId: string): Promise<Covenant[]> {
    const query = 'SELECT * FROM loan_covenants WHERE loan_id = $1 ORDER BY created_at';
    const result = await this.pool.query(query, [loanId]);
    return result.rows.map(row => this.mapCovenantRow(row));
  }

  async getActiveCovenants(): Promise<Covenant[]> {
    const query = "SELECT * FROM loan_covenants WHERE status = 'ACTIVE'";
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapCovenantRow(row));
  }

  async getBreachedCovenants(): Promise<Covenant[]> {
    const query = "SELECT * FROM loan_covenants WHERE status = 'BREACHED' ORDER BY breached_at DESC";
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapCovenantRow(row));
  }

  async updateCovenant(id: string, updates: Partial<Covenant>): Promise<Covenant | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      status: 'status',
      currentValue: 'current_value',
      lastCheckedAt: 'last_checked_at',
      breachedAt: 'breached_at',
      breachReason: 'breach_reason',
      gracePeriodEndsAt: 'grace_period_ends_at',
      curedAt: 'cured_at',
      waivedAt: 'waived_at',
      waivedBy: 'waived_by',
      waiverReason: 'waiver_reason',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates && updates[key as keyof Covenant] !== undefined) {
        setClauses.push(`${dbField} = $${paramIndex}`);
        values.push(updates[key as keyof Covenant]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE loan_covenants 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapCovenantRow(result.rows[0]);
  }

  async createCovenantEvent(event: Omit<CovenantEvent, 'id'>): Promise<CovenantEvent> {
    const query = `
      INSERT INTO covenant_events (
        covenant_id, loan_id, event_type,
        previous_status, new_status, ledger_event_id, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      event.covenantId,
      event.loanId,
      event.eventType,
      event.previousStatus,
      event.newStatus,
      event.ledgerEventId,
      JSON.stringify(event.details),
    ];

    const result = await this.pool.query(query, values);
    return this.mapCovenantEventRow(result.rows[0]);
  }

  // ==========================================================================
  // TRANSACTIONS
  // ==========================================================================

  async beginTransaction(): Promise<PoolClient> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return client;
  }

  async commitTransaction(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
    client.release();
  }

  async rollbackTransaction(client: PoolClient): Promise<void> {
    await client.query('ROLLBACK');
    client.release();
  }

  // ==========================================================================
  // ROW MAPPERS
  // ==========================================================================

  private mapApplicationRow(row: Record<string, unknown>): LoanApplication {
    return {
      id: row.id as string,
      borrowerId: row.borrower_id as string,
      borrowerType: row.borrower_type as 'CONSUMER' | 'LANDLORD' | 'BUSINESS',
      sourceApp: row.source_app as 'HOME' | 'PROPERTIES' | 'OPS',
      productType: row.product_type as LoanProductType,
      requestedAmountCents: Number(row.requested_amount_cents),
      requestedTermDays: row.requested_term_days as number,
      paymentFrequency: row.payment_frequency as PaymentFrequency,
      purpose: row.purpose as string,
      collateralAssetIds: row.collateral_asset_ids as string[],
      approvedAmountCents: row.approved_amount_cents ? Number(row.approved_amount_cents) : undefined,
      approvedTermDays: row.approved_term_days as number | undefined,
      aprBps: row.apr_bps as number | undefined,
      originationFeeCents: row.origination_fee_cents ? Number(row.origination_fee_cents) : undefined,
      monthlyPaymentCents: row.monthly_payment_cents ? Number(row.monthly_payment_cents) : undefined,
      totalInterestCents: row.total_interest_cents ? Number(row.total_interest_cents) : undefined,
      ltvRatio: row.ltv_ratio ? Number(row.ltv_ratio) : undefined,
      status: row.status as LoanStatus,
      riskScore: row.risk_score as number | undefined,
      underwritingNotes: row.underwriting_notes as string | undefined,
      covenantIds: [],
      createdAt: (row.created_at as Date).toISOString(),
      submittedAt: row.submitted_at ? (row.submitted_at as Date).toISOString() : undefined,
      approvedAt: row.approved_at ? (row.approved_at as Date).toISOString() : undefined,
      fundedAt: row.funded_at ? (row.funded_at as Date).toISOString() : undefined,
      maturityDate: row.maturity_date ? (row.maturity_date as Date).toISOString() : undefined,
    };
  }

  private mapLoanRow(row: Record<string, unknown>): Loan {
    return {
      id: row.id as string,
      applicationId: row.application_id as string,
      borrowerId: row.borrower_id as string,
      productType: row.product_type as LoanProductType,
      principalCents: Number(row.principal_cents),
      aprBps: row.apr_bps as number,
      termDays: row.term_days as number,
      paymentFrequency: row.payment_frequency as PaymentFrequency,
      monthlyPaymentCents: Number(row.monthly_payment_cents),
      outstandingPrincipalCents: Number(row.outstanding_principal_cents),
      accruedInterestCents: Number(row.accrued_interest_cents),
      totalPaidCents: Number(row.total_paid_cents),
      collateralAssetIds: row.collateral_asset_ids as string[],
      totalCollateralValueCents: Number(row.total_collateral_value_cents),
      currentLtvRatio: Number(row.current_ltv_ratio),
      status: row.status as LoanStatus,
      daysDelinquent: row.days_delinquent as number,
      nextPaymentDueDate: (row.next_payment_due_date as Date).toISOString(),
      fundedAt: (row.funded_at as Date).toISOString(),
      maturityDate: (row.maturity_date as Date).toISOString(),
      lastPaymentDate: row.last_payment_date ? (row.last_payment_date as Date).toISOString() : undefined,
      paidOffAt: row.paid_off_at ? (row.paid_off_at as Date).toISOString() : undefined,
      defaultedAt: row.defaulted_at ? (row.defaulted_at as Date).toISOString() : undefined,
      activeCovenants: [],
      breachedCovenants: [],
    };
  }

  private mapCovenantRow(row: Record<string, unknown>): Covenant {
    return {
      id: row.id as string,
      loanId: row.loan_id as string,
      type: row.covenant_type as CovenantType,
      status: row.status as CovenantStatus,
      thresholdValue: row.threshold_value ? Number(row.threshold_value) : undefined,
      thresholdLocation: row.threshold_location as string | undefined,
      currentValue: row.current_value ? Number(row.current_value) : undefined,
      lastCheckedAt: (row.last_checked_at as Date).toISOString(),
      breachedAt: row.breached_at ? (row.breached_at as Date).toISOString() : undefined,
      breachReason: row.breach_reason as string | undefined,
      gracePeriodEndsAt: row.grace_period_ends_at ? (row.grace_period_ends_at as Date).toISOString() : undefined,
      curedAt: row.cured_at ? (row.cured_at as Date).toISOString() : undefined,
      waivedAt: row.waived_at ? (row.waived_at as Date).toISOString() : undefined,
      waivedBy: row.waived_by as string | undefined,
      waiverReason: row.waiver_reason as string | undefined,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }

  private mapCovenantEventRow(row: Record<string, unknown>): CovenantEvent {
    return {
      id: row.id as string,
      covenantId: row.covenant_id as string,
      loanId: row.loan_id as string,
      eventType: row.event_type as CovenantEvent['eventType'],
      previousStatus: row.previous_status as CovenantStatus,
      newStatus: row.new_status as CovenantStatus,
      ledgerEventId: row.ledger_event_id as string | undefined,
      details: row.details as Record<string, unknown>,
      createdAt: (row.created_at as Date).toISOString(),
    };
  }
}
