/**
 * @file src/agents/orchestrator.ts
 * @description Agent Orchestrator - Coordinates all AI agents in the loan lifecycle
 * 
 * FLOW:
 * 1. Application → Data Architect collects borrower profile
 * 2. Underwriting → Risk Officer validates (periodic adversarial audits)
 * 3. Outcome → Truth Database records for ML training
 */

import { getDataArchitectAgent, BorrowerDataProfile } from './data-architect';
import { getRiskOfficerAgent, VulnerabilityReport } from './risk-officer';
import { getTruthDatabaseAgent, LoanOutcome, LoanOutcomeRecord } from './truth-database';

// ============================================
// TYPES
// ============================================

export interface EnrichedLoanApplication {
  applicationId: string;
  borrowerId: string;
  collateralAssetIds: string[];
  requestedAmountCents: number;
  
  // Data Architect enrichment
  borrowerProfile: BorrowerDataProfile;
  dataCompleteness: number;
  dataFlags: string[];
  
  // Risk assessment
  riskScore: number;
  riskFlags: string[];
  recommendation: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT';
}

export interface AgentOrchestrationResult {
  success: boolean;
  enrichedApplication?: EnrichedLoanApplication;
  processingTimeMs: number;
  agentLogs: string[];
}

// ============================================
// ORCHESTRATOR
// ============================================

export class AgentOrchestrator {
  private dataArchitect = getDataArchitectAgent();
  private riskOfficer = getRiskOfficerAgent();
  private truthDatabase = getTruthDatabaseAgent();
  private logs: string[] = [];

  /**
   * Process a loan application through all agents
   */
  async processApplication(
    applicationId: string,
    borrowerId: string,
    collateralAssetIds: string[],
    requestedAmountCents: number
  ): Promise<AgentOrchestrationResult> {
    const startTime = Date.now();
    this.logs = [];

    try {
      this.log(`[Orchestrator] Processing application ${applicationId}`);

      // Step 1: Data Architect collects borrower profile
      this.log('[Orchestrator] Step 1: Data collection');
      const borrowerProfile = await this.dataArchitect.collectBorrowerProfile(
        borrowerId,
        collateralAssetIds
      );
      this.log(`[Orchestrator] Data completeness: ${borrowerProfile.completeness}%`);
      this.log(`[Orchestrator] Data flags: ${borrowerProfile.flags.join(', ') || 'none'}`);

      // Step 2: Calculate risk score based on collected data
      this.log('[Orchestrator] Step 2: Risk assessment');
      const riskAssessment = this.assessRisk(borrowerProfile, requestedAmountCents);
      this.log(`[Orchestrator] Risk score: ${riskAssessment.score}`);
      this.log(`[Orchestrator] Recommendation: ${riskAssessment.recommendation}`);

      // Build enriched application
      const enrichedApplication: EnrichedLoanApplication = {
        applicationId,
        borrowerId,
        collateralAssetIds,
        requestedAmountCents,
        borrowerProfile,
        dataCompleteness: borrowerProfile.completeness,
        dataFlags: borrowerProfile.flags,
        riskScore: riskAssessment.score,
        riskFlags: riskAssessment.flags,
        recommendation: riskAssessment.recommendation,
      };

      return {
        success: true,
        enrichedApplication,
        processingTimeMs: Date.now() - startTime,
        agentLogs: this.logs,
      };

    } catch (error) {
      this.log(`[Orchestrator] ERROR: ${error}`);
      return {
        success: false,
        processingTimeMs: Date.now() - startTime,
        agentLogs: this.logs,
      };
    }
  }

  /**
   * Record loan outcome (called when loan resolves)
   */
  async recordOutcome(
    loanId: string,
    outcome: LoanOutcome,
    details: {
      daysToResolution?: number;
      amountRecoveredCents?: number;
      collateralLiquidated?: boolean;
      fraudSignals?: string[];
    } = {}
  ): Promise<LoanOutcomeRecord> {
    this.log(`[Orchestrator] Recording outcome: ${loanId} -> ${outcome}`);
    return this.truthDatabase.recordOutcome(loanId, outcome, details);
  }

  /**
   * Run adversarial audit (scheduled job)
   */
  async runSecurityAudit(underwritingEndpoint: string): Promise<VulnerabilityReport> {
    this.log('[Orchestrator] Running adversarial security audit');
    const report = await this.riskOfficer.runAdversarialAudit(underwritingEndpoint);
    this.log(`[Orchestrator] Audit complete: ${report.overallScore}% secure`);
    this.log(`[Orchestrator] Critical vulnerabilities: ${report.criticalVulnerabilities.length}`);
    return report;
  }

  /**
   * Get ML training dataset
   */
  getTrainingDataset(): ReturnType<typeof this.truthDatabase.exportForTraining> {
    return this.truthDatabase.exportForTraining();
  }

  /**
   * Get outcome statistics
   */
  getOutcomeStatistics() {
    return this.truthDatabase.getStatistics();
  }

  /**
   * Assess risk based on collected data
   */
  private assessRisk(
    profile: BorrowerDataProfile,
    requestedAmountCents: number
  ): { score: number; flags: string[]; recommendation: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT' } {
    let score = 30; // Base score
    const flags: string[] = [];

    // Adjust score based on data completeness
    if (profile.completeness >= 70) score -= 10;
    else if (profile.completeness < 30) score += 20;

    // Check for red flags
    if (profile.flags.includes('LEADSONLY_OPEN_CASES')) {
      score += 40;
      flags.push('STOLEN_PROPERTY_ALERT');
    }
    if (profile.flags.includes('PAWN_HISTORY_DETECTED')) {
      score += 15;
      flags.push('PAWN_HISTORY');
    }
    if (profile.flags.includes('LOW_PROVENANCE_SCORE')) {
      score += 10;
      flags.push('WEAK_PROVENANCE');
    }
    if (profile.flags.includes('NO_FINANCIAL_DATA')) {
      score += 15;
      flags.push('UNVERIFIED_INCOME');
    }

    // Plaid data adjustments
    if (profile.sources.plaid) {
      const plaid = profile.sources.plaid;
      if (plaid.accountAge > 24) score -= 5; // Established accounts
      if (plaid.accountsLinked > 2) score -= 5; // Multiple accounts = stability
      
      // Income vs loan amount check
      if (plaid.incomeEstimate > 0) {
        const monthlyPayment = requestedAmountCents / 100 / 12; // Rough estimate
        if (monthlyPayment > plaid.incomeEstimate * 0.3) {
          score += 10;
          flags.push('HIGH_DTI_RATIO');
        }
      }
    }

    // Ledger data adjustments
    if (profile.sources.ledger) {
      const ledger = profile.sources.ledger;
      if (ledger.provenanceScoreAvg > 70) score -= 10;
      if (ledger.custodyEventCount > 5) score -= 5; // Well-documented history
    }

    // eBay seller data
    if (profile.sources.ebay) {
      const ebay = profile.sources.ebay;
      if (ebay.sellerRating && ebay.sellerRating > 95) score -= 5;
      if (ebay.accountAge > 12) score -= 3;
    }

    // Cap score
    score = Math.max(0, Math.min(100, score));

    // Determine recommendation
    let recommendation: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT';
    if (score <= 30) recommendation = 'APPROVE';
    else if (score <= 60) recommendation = 'MANUAL_REVIEW';
    else recommendation = 'REJECT';

    return { score, flags, recommendation };
  }

  private log(message: string): void {
    console.log(message);
    this.logs.push(`${new Date().toISOString()} ${message}`);
  }
}

// Singleton
let orchestrator: AgentOrchestrator | null = null;

export function getAgentOrchestrator(): AgentOrchestrator {
  if (!orchestrator) {
    orchestrator = new AgentOrchestrator();
  }
  return orchestrator;
}
