/**
 * @file modules/underwriting/engine.ts
 * @description PROVENIQ Capital - Underwriting Engine
 * 
 * Core underwriting logic for loan decisioning:
 * - Risk scoring (borrower + collateral)
 * - LTV calculation
 * - Rate determination
 * - Approval/denial logic
 * - Covenant generation
 */

// ============================================
// TYPES
// ============================================

export interface UnderwritingInput {
  borrowerId: string;
  
  // Loan request
  requestedAmountCents: number;
  requestedTermDays: number;
  purpose: string;
  
  // Collateral
  collateral: CollateralInput[];
  
  // Borrower data (from Data Architect)
  borrowerData?: {
    creditScore?: number;
    monthlyIncomeCents?: number;
    existingDebtCents?: number;
    accountAgeDays?: number;
    previousLoansCount?: number;
    previousDefaultsCount?: number;
  };
}

export interface CollateralInput {
  assetId: string;
  paid?: string;
  category: string;
  
  // Valuation
  estimatedValueCents: number;
  coreValuationCents?: number;
  valuationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Provenance
  provenanceScore?: number;
  ownershipVerified: boolean;
  
  // Condition
  condition?: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  
  // Anchor status
  anchorBound?: boolean;
  anchorType?: 'smarttag' | 'smartbag' | 'locker';
}

export interface UnderwritingResult {
  applicationId: string;
  
  // Decision
  decision: 'APPROVED' | 'CONDITIONALLY_APPROVED' | 'DECLINED' | 'MANUAL_REVIEW';
  decisionReason: string;
  
  // Scores
  borrowerRiskScore: number;
  collateralRiskScore: number;
  combinedRiskScore: number;
  riskTier: 'low' | 'medium' | 'high';
  
  // Terms (if approved)
  approvedAmountCents?: number;
  approvedTermDays?: number;
  aprPercent?: number;
  monthlyPaymentCents?: number;
  
  // Collateral analysis
  totalCollateralValueCents: number;
  ltv: number;
  ltvCategory: 'conservative' | 'moderate' | 'aggressive';
  
  // Covenants (if approved)
  covenants?: Covenant[];
  
  // Conditions (if conditionally approved)
  conditions?: string[];
  
  // Decline reasons (if declined)
  declineReasons?: string[];
  
  // Metadata
  underwrittenAt: string;
  expiresAt: string;
}

export interface Covenant {
  type: 'ltv_max' | 'custody_required' | 'insurance_required' | 'anchor_required' | 'no_transfer' | 'maintenance_required';
  description: string;
  threshold?: number;
  breachAction: 'warning' | 'freeze' | 'default';
}

// ============================================
// RISK SCORING WEIGHTS
// ============================================

const BORROWER_WEIGHTS = {
  creditScore: 0.30,
  dti: 0.20,
  accountAge: 0.15,
  loanHistory: 0.20,
  defaultHistory: 0.15,
};

const COLLATERAL_WEIGHTS = {
  valuation: 0.25,
  provenance: 0.25,
  condition: 0.20,
  anchor: 0.15,
  category: 0.15,
};

// Category risk multipliers (lower = safer)
const CATEGORY_RISK: Record<string, number> = {
  'jewelry': 0.7,      // Stable value, easy to verify
  'vehicles': 0.8,     // Depreciates but trackable
  'art': 0.9,          // Subjective valuation
  'electronics': 1.0,  // Fast depreciation
  'collectibles': 1.1, // Variable market
  'furniture': 1.2,    // Low resale
  'other': 1.3,
};

// ============================================
// UNDERWRITING ENGINE
// ============================================

class UnderwritingEngine {
  /**
   * Run full underwriting analysis
   */
  async underwrite(input: UnderwritingInput): Promise<UnderwritingResult> {
    const applicationId = `UW-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date();
    
    // Calculate scores
    const borrowerRiskScore = this.calculateBorrowerRisk(input);
    const collateralRiskScore = this.calculateCollateralRisk(input.collateral);
    const combinedRiskScore = (borrowerRiskScore * 0.4) + (collateralRiskScore * 0.6);
    
    // Calculate LTV
    const totalCollateralValue = this.calculateCollateralValue(input.collateral);
    const ltv = (input.requestedAmountCents / totalCollateralValue) * 100;
    
    // Determine risk tier
    const riskTier = this.determineRiskTier(combinedRiskScore, ltv);
    
    // Make decision
    const { decision, decisionReason, conditions, declineReasons } = 
      this.makeDecision(combinedRiskScore, ltv, input);
    
    // Calculate terms if approved
    let approvedAmountCents: number | undefined;
    let approvedTermDays: number | undefined;
    let aprPercent: number | undefined;
    let monthlyPaymentCents: number | undefined;
    let covenants: Covenant[] | undefined;
    
    if (decision === 'APPROVED' || decision === 'CONDITIONALLY_APPROVED') {
      approvedAmountCents = this.calculateApprovedAmount(input.requestedAmountCents, totalCollateralValue, ltv);
      approvedTermDays = input.requestedTermDays;
      aprPercent = this.calculateApr(combinedRiskScore, ltv, input.requestedTermDays);
      monthlyPaymentCents = this.calculateMonthlyPayment(approvedAmountCents, aprPercent, approvedTermDays);
      covenants = this.generateCovenants(ltv, input.collateral);
    }
    
    return {
      applicationId,
      decision,
      decisionReason,
      borrowerRiskScore: Math.round(borrowerRiskScore),
      collateralRiskScore: Math.round(collateralRiskScore),
      combinedRiskScore: Math.round(combinedRiskScore),
      riskTier,
      approvedAmountCents,
      approvedTermDays,
      aprPercent,
      monthlyPaymentCents,
      totalCollateralValueCents: totalCollateralValue,
      ltv: Math.round(ltv * 100) / 100,
      ltvCategory: ltv <= 40 ? 'conservative' : ltv <= 60 ? 'moderate' : 'aggressive',
      covenants,
      conditions,
      declineReasons,
      underwrittenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
  }

  /**
   * Calculate borrower risk score (0-100, lower = better)
   */
  private calculateBorrowerRisk(input: UnderwritingInput): number {
    const data = input.borrowerData;
    let score = 50; // Default to medium risk if no data
    
    if (!data) return score;
    
    // Credit score component (300-850 → 0-100 inverted)
    if (data.creditScore) {
      const creditComponent = Math.max(0, Math.min(100, ((850 - data.creditScore) / 550) * 100));
      score = score * (1 - BORROWER_WEIGHTS.creditScore) + creditComponent * BORROWER_WEIGHTS.creditScore;
    }
    
    // DTI component
    if (data.monthlyIncomeCents && data.existingDebtCents) {
      const dti = (data.existingDebtCents / data.monthlyIncomeCents) * 100;
      const dtiComponent = Math.min(100, dti * 2); // 50% DTI = 100 risk
      score = score * (1 - BORROWER_WEIGHTS.dti) + dtiComponent * BORROWER_WEIGHTS.dti;
    }
    
    // Account age component (newer = riskier)
    if (data.accountAgeDays !== undefined) {
      const ageComponent = Math.max(0, 100 - (data.accountAgeDays / 365) * 20); // 5+ years = 0 risk
      score = score * (1 - BORROWER_WEIGHTS.accountAge) + ageComponent * BORROWER_WEIGHTS.accountAge;
    }
    
    // Loan history component
    if (data.previousLoansCount !== undefined) {
      const historyComponent = data.previousLoansCount > 0 
        ? Math.max(0, 50 - data.previousLoansCount * 10) // More loans = lower risk (experienced)
        : 60; // No history = medium-high risk
      score = score * (1 - BORROWER_WEIGHTS.loanHistory) + historyComponent * BORROWER_WEIGHTS.loanHistory;
    }
    
    // Default history component
    if (data.previousDefaultsCount !== undefined) {
      const defaultComponent = Math.min(100, data.previousDefaultsCount * 50); // Each default = +50
      score = score * (1 - BORROWER_WEIGHTS.defaultHistory) + defaultComponent * BORROWER_WEIGHTS.defaultHistory;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate collateral risk score (0-100, lower = better)
   */
  private calculateCollateralRisk(collateral: CollateralInput[]): number {
    if (collateral.length === 0) return 100; // No collateral = max risk
    
    let totalWeightedRisk = 0;
    let totalValue = 0;
    
    for (const asset of collateral) {
      const value = asset.coreValuationCents || asset.estimatedValueCents;
      let assetRisk = 50; // Base risk
      
      // Valuation confidence
      const confidenceRisk = asset.valuationConfidence === 'HIGH' ? 0 
        : asset.valuationConfidence === 'MEDIUM' ? 25 : 50;
      assetRisk = assetRisk * (1 - COLLATERAL_WEIGHTS.valuation) + confidenceRisk * COLLATERAL_WEIGHTS.valuation;
      
      // Provenance score (0-100 → inverted)
      if (asset.provenanceScore !== undefined) {
        const provenanceRisk = 100 - asset.provenanceScore;
        assetRisk = assetRisk * (1 - COLLATERAL_WEIGHTS.provenance) + provenanceRisk * COLLATERAL_WEIGHTS.provenance;
      }
      
      // Condition
      const conditionRisk = {
        'new': 0,
        'excellent': 10,
        'good': 25,
        'fair': 50,
        'poor': 80,
      }[asset.condition || 'good'] || 25;
      assetRisk = assetRisk * (1 - COLLATERAL_WEIGHTS.condition) + conditionRisk * COLLATERAL_WEIGHTS.condition;
      
      // Anchor status
      const anchorRisk = asset.anchorBound ? 0 : 40;
      assetRisk = assetRisk * (1 - COLLATERAL_WEIGHTS.anchor) + anchorRisk * COLLATERAL_WEIGHTS.anchor;
      
      // Category risk
      const categoryMultiplier = CATEGORY_RISK[asset.category] || CATEGORY_RISK['other'];
      assetRisk = assetRisk * categoryMultiplier;
      
      // Ownership verification
      if (!asset.ownershipVerified) {
        assetRisk = Math.min(100, assetRisk + 20);
      }
      
      totalWeightedRisk += assetRisk * value;
      totalValue += value;
    }
    
    return totalValue > 0 ? totalWeightedRisk / totalValue : 100;
  }

  /**
   * Calculate total collateral value (using Core valuation when available)
   */
  private calculateCollateralValue(collateral: CollateralInput[]): number {
    return collateral.reduce((sum, asset) => {
      return sum + (asset.coreValuationCents || asset.estimatedValueCents);
    }, 0);
  }

  /**
   * Determine risk tier based on combined score and LTV
   */
  private determineRiskTier(combinedScore: number, ltv: number): 'low' | 'medium' | 'high' {
    if (combinedScore <= 30 && ltv <= 50) return 'low';
    if (combinedScore <= 50 && ltv <= 70) return 'medium';
    return 'high';
  }

  /**
   * Make underwriting decision
   */
  private makeDecision(
    combinedScore: number,
    ltv: number,
    input: UnderwritingInput
  ): {
    decision: UnderwritingResult['decision'];
    decisionReason: string;
    conditions?: string[];
    declineReasons?: string[];
  } {
    const declineReasons: string[] = [];
    const conditions: string[] = [];
    
    // Hard declines
    if (ltv > 85) {
      declineReasons.push('LTV exceeds maximum of 85%');
    }
    
    if (combinedScore > 80) {
      declineReasons.push('Combined risk score exceeds acceptable threshold');
    }
    
    if (input.collateral.length === 0) {
      declineReasons.push('No collateral provided');
    }
    
    const hasVerifiedCollateral = input.collateral.some(c => c.ownershipVerified);
    if (!hasVerifiedCollateral) {
      declineReasons.push('No verified collateral ownership');
    }
    
    if (declineReasons.length > 0) {
      return {
        decision: 'DECLINED',
        decisionReason: declineReasons.join('; '),
        declineReasons,
      };
    }
    
    // Conditional approvals
    if (ltv > 70) {
      conditions.push('Anchor device required on all collateral');
    }
    
    if (combinedScore > 60) {
      conditions.push('Additional documentation required');
    }
    
    const hasAnchor = input.collateral.every(c => c.anchorBound);
    if (!hasAnchor && input.requestedAmountCents > 500000) { // $5K+
      conditions.push('Anchor device required for loans over $5,000');
    }
    
    // Manual review triggers
    if (combinedScore > 50 && ltv > 60) {
      return {
        decision: 'MANUAL_REVIEW',
        decisionReason: 'Combined risk metrics require manual review',
        conditions,
      };
    }
    
    if (conditions.length > 0) {
      return {
        decision: 'CONDITIONALLY_APPROVED',
        decisionReason: 'Approved pending completion of conditions',
        conditions,
      };
    }
    
    return {
      decision: 'APPROVED',
      decisionReason: 'All underwriting criteria met',
    };
  }

  /**
   * Calculate approved loan amount (may be less than requested)
   */
  private calculateApprovedAmount(
    requestedCents: number,
    collateralValueCents: number,
    ltv: number
  ): number {
    // Cap at 80% LTV
    const maxAmount = Math.floor(collateralValueCents * 0.8);
    return Math.min(requestedCents, maxAmount);
  }

  /**
   * Calculate APR based on risk
   */
  private calculateApr(combinedScore: number, ltv: number, termDays: number): number {
    // Base rate
    let apr = 12;
    
    // Risk premium
    apr += (combinedScore / 100) * 15; // 0-15% based on risk
    
    // LTV premium
    if (ltv > 50) apr += (ltv - 50) * 0.1;
    if (ltv > 70) apr += (ltv - 70) * 0.2;
    
    // Term premium
    if (termDays > 180) apr += 2;
    if (termDays > 365) apr += 3;
    
    // Cap at 36%
    return Math.min(36, Math.round(apr * 100) / 100);
  }

  /**
   * Calculate monthly payment
   */
  private calculateMonthlyPayment(
    principalCents: number,
    aprPercent: number,
    termDays: number
  ): number {
    const months = Math.ceil(termDays / 30);
    const monthlyRate = aprPercent / 100 / 12;
    
    if (monthlyRate === 0) return Math.round(principalCents / months);
    
    return Math.round(
      principalCents * (monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)
    );
  }

  /**
   * Generate loan covenants
   */
  private generateCovenants(ltv: number, collateral: CollateralInput[]): Covenant[] {
    const covenants: Covenant[] = [];
    
    // Always require LTV covenant
    covenants.push({
      type: 'ltv_max',
      description: 'LTV must not exceed 85%',
      threshold: 85,
      breachAction: 'warning',
    });
    
    // No transfer without consent
    covenants.push({
      type: 'no_transfer',
      description: 'Collateral may not be transferred or sold without lender consent',
      breachAction: 'default',
    });
    
    // Custody requirement for high LTV
    if (ltv > 60) {
      covenants.push({
        type: 'custody_required',
        description: 'Borrower must maintain physical custody of collateral',
        breachAction: 'freeze',
      });
    }
    
    // Anchor requirement for high-value or high-risk
    const totalValue = collateral.reduce((sum, c) => sum + (c.coreValuationCents || c.estimatedValueCents), 0);
    if (totalValue > 1000000 || ltv > 70) { // $10K+
      covenants.push({
        type: 'anchor_required',
        description: 'Collateral must be bound to PROVENIQ Anchor device',
        breachAction: 'warning',
      });
    }
    
    return covenants;
  }
}

// Singleton
let engine: UnderwritingEngine | null = null;

export function getUnderwritingEngine(): UnderwritingEngine {
  if (!engine) {
    engine = new UnderwritingEngine();
  }
  return engine;
}
