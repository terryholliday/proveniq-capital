/**
 * @file src/agents/truth-database.ts
 * @description Truth Database AI Agent
 * 
 * PURPOSE: Save every outcome: repaid? defaulted? fraud? This is ML fuel.
 * 
 * This agent tracks and records all loan outcomes to build a training
 * dataset for improving fraud detection and underwriting models.
 */

// ============================================
// TYPES
// ============================================

export type LoanOutcome = 
  | 'REPAID_FULL'
  | 'REPAID_EARLY'
  | 'REPAID_LATE'
  | 'DEFAULTED'
  | 'DEFAULTED_RECOVERED'
  | 'FRAUD_CONFIRMED'
  | 'FRAUD_SUSPECTED'
  | 'RESTRUCTURED'
  | 'ACTIVE';

export interface LoanOutcomeRecord {
  loanId: string;
  borrowerId: string;
  outcome: LoanOutcome;
  recordedAt: string;
  
  // Loan details at origination
  origination: {
    date: string;
    amountCents: number;
    termDays: number;
    aprBps: number;
    productType: string;
    collateralAssetIds: string[];
    collateralValueCents: number;
    ltv: number;
  };
  
  // Borrower profile at origination
  borrowerProfile: {
    riskScore: number;
    provenanceScoreAvg: number;
    plaidConnected: boolean;
    priorLoans: number;
    priorDefaults: number;
  };
  
  // Outcome details
  outcomeDetails: {
    daysToResolution?: number;
    amountRecoveredCents?: number;
    collateralLiquidated?: boolean;
    liquidationValueCents?: number;
    fraudSignals?: string[];
    latePaymentCount?: number;
  };
  
  // ML features (computed)
  mlFeatures: Record<string, number>;
}

export interface MLDataset {
  version: string;
  generatedAt: string;
  recordCount: number;
  outcomeDistribution: Record<LoanOutcome, number>;
  features: string[];
  records: LoanOutcomeRecord[];
}

export interface ModelPerformance {
  modelVersion: string;
  evaluatedAt: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    auc: number;
  };
  confusionMatrix: number[][];
  featureImportance: Array<{ feature: string; importance: number }>;
}

// ============================================
// TRUTH DATABASE AGENT
// ============================================

export class TruthDatabaseAgent {
  private records: Map<string, LoanOutcomeRecord> = new Map();
  private ledgerUrl: string;

  constructor() {
    this.ledgerUrl = process.env.LEDGER_API_URL || 'http://localhost:8006';
  }

  /**
   * Record a loan outcome
   */
  async recordOutcome(
    loanId: string,
    outcome: LoanOutcome,
    details: Partial<LoanOutcomeRecord['outcomeDetails']> = {}
  ): Promise<LoanOutcomeRecord> {
    // Get existing record or create new one
    let record = this.records.get(loanId);
    
    if (!record) {
      // Fetch loan data from database
      record = await this.initializeRecord(loanId);
    }

    // Update outcome
    record.outcome = outcome;
    record.recordedAt = new Date().toISOString();
    record.outcomeDetails = { ...record.outcomeDetails, ...details };
    
    // Recompute ML features
    record.mlFeatures = this.computeMLFeatures(record);

    // Persist
    this.records.set(loanId, record);

    // Write to Ledger for immutability
    await this.writeToLedger(record);

    console.log(`[TruthDatabase] Recorded outcome: ${loanId} -> ${outcome}`);
    
    return record;
  }

  /**
   * Initialize a record from loan data
   */
  private async initializeRecord(loanId: string): Promise<LoanOutcomeRecord> {
    // TODO: Fetch from actual loan database
    // For now, return a template
    return {
      loanId,
      borrowerId: '',
      outcome: 'ACTIVE',
      recordedAt: new Date().toISOString(),
      origination: {
        date: '',
        amountCents: 0,
        termDays: 0,
        aprBps: 0,
        productType: '',
        collateralAssetIds: [],
        collateralValueCents: 0,
        ltv: 0,
      },
      borrowerProfile: {
        riskScore: 0,
        provenanceScoreAvg: 0,
        plaidConnected: false,
        priorLoans: 0,
        priorDefaults: 0,
      },
      outcomeDetails: {},
      mlFeatures: {},
    };
  }

  /**
   * Compute ML features from a record
   */
  private computeMLFeatures(record: LoanOutcomeRecord): Record<string, number> {
    const features: Record<string, number> = {};

    // Loan features
    features['loan_amount_cents'] = record.origination.amountCents;
    features['loan_term_days'] = record.origination.termDays;
    features['loan_apr_bps'] = record.origination.aprBps;
    features['loan_ltv'] = record.origination.ltv;
    features['collateral_count'] = record.origination.collateralAssetIds.length;
    features['collateral_value_cents'] = record.origination.collateralValueCents;

    // Borrower features
    features['borrower_risk_score'] = record.borrowerProfile.riskScore;
    features['borrower_provenance_avg'] = record.borrowerProfile.provenanceScoreAvg;
    features['borrower_plaid_connected'] = record.borrowerProfile.plaidConnected ? 1 : 0;
    features['borrower_prior_loans'] = record.borrowerProfile.priorLoans;
    features['borrower_prior_defaults'] = record.borrowerProfile.priorDefaults;
    features['borrower_default_rate'] = record.borrowerProfile.priorLoans > 0 
      ? record.borrowerProfile.priorDefaults / record.borrowerProfile.priorLoans 
      : 0;

    // Outcome features (for supervised learning)
    features['outcome_is_default'] = record.outcome.includes('DEFAULT') ? 1 : 0;
    features['outcome_is_fraud'] = record.outcome.includes('FRAUD') ? 1 : 0;
    features['outcome_is_positive'] = record.outcome.includes('REPAID') ? 1 : 0;
    
    if (record.outcomeDetails.daysToResolution) {
      features['days_to_resolution'] = record.outcomeDetails.daysToResolution;
    }
    if (record.outcomeDetails.latePaymentCount !== undefined) {
      features['late_payment_count'] = record.outcomeDetails.latePaymentCount;
    }

    return features;
  }

  /**
   * Write outcome to Ledger for immutability
   */
  private async writeToLedger(record: LoanOutcomeRecord): Promise<void> {
    try {
      await fetch(`${this.ledgerUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'capital',
          event_type: 'CAPITAL_LOAN_OUTCOME_RECORDED',
          correlation_id: record.loanId,
          occurred_at: record.recordedAt,
          schema_version: '1.0.0',
          payload: {
            loan_id: record.loanId,
            borrower_id: record.borrowerId,
            outcome: record.outcome,
            outcome_details: record.outcomeDetails,
          },
        }),
      });
    } catch (error) {
      console.error('[TruthDatabase] Ledger write failed:', error);
    }
  }

  /**
   * Generate ML training dataset
   */
  generateDataset(minRecords: number = 100): MLDataset | null {
    const records = Array.from(this.records.values());
    
    if (records.length < minRecords) {
      console.log(`[TruthDatabase] Insufficient records: ${records.length}/${minRecords}`);
      return null;
    }

    // Calculate outcome distribution
    const outcomeDistribution: Record<LoanOutcome, number> = {
      REPAID_FULL: 0,
      REPAID_EARLY: 0,
      REPAID_LATE: 0,
      DEFAULTED: 0,
      DEFAULTED_RECOVERED: 0,
      FRAUD_CONFIRMED: 0,
      FRAUD_SUSPECTED: 0,
      RESTRUCTURED: 0,
      ACTIVE: 0,
    };

    for (const record of records) {
      outcomeDistribution[record.outcome]++;
    }

    // Get feature names from first record
    const features = records.length > 0 
      ? Object.keys(records[0].mlFeatures) 
      : [];

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      recordCount: records.length,
      outcomeDistribution,
      features,
      records,
    };
  }

  /**
   * Get statistics on recorded outcomes
   */
  getStatistics(): {
    totalRecords: number;
    outcomeBreakdown: Record<string, number>;
    defaultRate: number;
    fraudRate: number;
    avgDaysToResolution: number;
  } {
    const records = Array.from(this.records.values());
    const completed = records.filter(r => r.outcome !== 'ACTIVE');
    
    const outcomeBreakdown: Record<string, number> = {};
    let totalDays = 0;
    let daysCount = 0;

    for (const record of records) {
      outcomeBreakdown[record.outcome] = (outcomeBreakdown[record.outcome] || 0) + 1;
      if (record.outcomeDetails.daysToResolution) {
        totalDays += record.outcomeDetails.daysToResolution;
        daysCount++;
      }
    }

    const defaults = records.filter(r => r.outcome.includes('DEFAULT')).length;
    const frauds = records.filter(r => r.outcome.includes('FRAUD')).length;

    return {
      totalRecords: records.length,
      outcomeBreakdown,
      defaultRate: completed.length > 0 ? defaults / completed.length : 0,
      fraudRate: completed.length > 0 ? frauds / completed.length : 0,
      avgDaysToResolution: daysCount > 0 ? totalDays / daysCount : 0,
    };
  }

  /**
   * Query records by outcome type
   */
  queryByOutcome(outcome: LoanOutcome): LoanOutcomeRecord[] {
    return Array.from(this.records.values()).filter(r => r.outcome === outcome);
  }

  /**
   * Query fraud cases for analysis
   */
  getFraudCases(): LoanOutcomeRecord[] {
    return Array.from(this.records.values()).filter(
      r => r.outcome === 'FRAUD_CONFIRMED' || r.outcome === 'FRAUD_SUSPECTED'
    );
  }

  /**
   * Export dataset for external ML training
   */
  exportForTraining(): {
    features: number[][];
    labels: number[];
    featureNames: string[];
  } {
    const records = Array.from(this.records.values()).filter(r => r.outcome !== 'ACTIVE');
    
    if (records.length === 0) {
      return { features: [], labels: [], featureNames: [] };
    }

    const featureNames = Object.keys(records[0].mlFeatures).filter(
      f => !f.startsWith('outcome_') // Exclude outcome features from input
    );

    const features = records.map(r => 
      featureNames.map(f => r.mlFeatures[f] || 0)
    );

    // Binary label: 1 = bad outcome (default/fraud), 0 = good outcome
    const labels = records.map(r => 
      r.outcome.includes('DEFAULT') || r.outcome.includes('FRAUD') ? 1 : 0
    );

    return { features, labels, featureNames };
  }
}

// Singleton
let agent: TruthDatabaseAgent | null = null;

export function getTruthDatabaseAgent(): TruthDatabaseAgent {
  if (!agent) {
    agent = new TruthDatabaseAgent();
  }
  return agent;
}
