/**
 * @file src/core/core-client.ts
 * @description PROVENIQ Core API Client for Capital App
 * 
 * CRITICAL integrations for lending:
 * - LTV Calculator (loan-to-value)
 * - Collateral Health Score
 * - Borrower Risk Scoring
 * - Ownership Verification
 * - Custody Monitoring
 */

const CORE_API_URL = process.env.CORE_API_URL || 'http://localhost:8000';

// ============================================
// TYPES
// ============================================

export interface CollateralValuation {
  paid: string;
  currentValue: number;
  currency: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  valuedAt: string;
}

export interface LTVResult {
  paid: string;
  collateralValue: number;
  loanAmount: number;
  ltv: number; // Percentage (e.g., 70 = 70%)
  maxLoanAmount: number;
  recommendation: 'APPROVE' | 'REDUCE_LOAN' | 'REJECT';
  adjustedLoanAmount?: number;
}

export interface CollateralHealthScore {
  paid: string;
  overallScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    valuationScore: number;
    provenanceScore: number;
    conditionScore: number;
    custodyScore: number;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  eligible: boolean;
  eligibilityReason?: string;
}

export interface BorrowerRiskResult {
  userId: string;
  fraudScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT';
  signals: string[];
}

export interface OwnershipVerification {
  paid: string;
  verified: boolean;
  ownerId: string;
  ownershipConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  ledgerEventCount: number;
  lastVerifiedAt: string;
}

export interface CustodyState {
  paid: string;
  currentState: 'USER' | 'TRANSIT' | 'LOCKER' | 'ESCROW' | 'SOLD';
  currentCustodian: string;
  lastStateChange: string;
  isSecured: boolean;
}

// ============================================
// CORE CLIENT
// ============================================

class CoreClient {
  /**
   * Calculate LTV for a loan request
   */
  async calculateLTV(
    paid: string,
    requestedLoanAmount: number,
    category: string,
    maxLtvPercent: number = 70
  ): Promise<LTVResult | null> {
    try {
      // Get current valuation
      const valuation = await this.getCollateralValuation(paid, category);
      if (!valuation) return null;

      const ltv = (requestedLoanAmount / valuation.currentValue) * 100;
      const maxLoanAmount = Math.floor(valuation.currentValue * (maxLtvPercent / 100));

      let recommendation: LTVResult['recommendation'];
      let adjustedLoanAmount: number | undefined;

      if (ltv <= maxLtvPercent) {
        recommendation = 'APPROVE';
      } else if (ltv <= maxLtvPercent + 15) {
        recommendation = 'REDUCE_LOAN';
        adjustedLoanAmount = maxLoanAmount;
      } else {
        recommendation = 'REJECT';
      }

      return {
        paid,
        collateralValue: valuation.currentValue,
        loanAmount: requestedLoanAmount,
        ltv: Math.round(ltv * 100) / 100,
        maxLoanAmount,
        recommendation,
        adjustedLoanAmount,
      };
    } catch (error) {
      console.error('[Core] LTV calculation error:', error);
      return null;
    }
  }

  /**
   * Get collateral health score (composite)
   */
  async getCollateralHealthScore(
    paid: string,
    category: string
  ): Promise<CollateralHealthScore | null> {
    try {
      // Get valuation
      const valuation = await this.getCollateralValuation(paid, category);
      const valuationScore = valuation ? this.confidenceToScore(valuation.confidence) : 30;

      // Get provenance
      const provenance = await this.getProvenanceScore(paid);
      const provenanceScore = provenance?.score || 30;

      // Get custody
      const custody = await this.getCustodyState(paid);
      const custodyScore = custody?.isSecured ? 90 : 50;

      // Condition score (would come from Core condition assessment)
      const conditionScore = 70; // Default

      // Calculate overall
      const weights = { valuation: 0.30, provenance: 0.30, condition: 0.20, custody: 0.20 };
      const overallScore = Math.round(
        valuationScore * weights.valuation +
        provenanceScore * weights.provenance +
        conditionScore * weights.condition +
        custodyScore * weights.custody
      );

      const grade = this.scoreToGrade(overallScore);
      const riskLevel = this.scoreToRiskLevel(overallScore);

      // Eligibility: Must be B or better, and custody secured
      const eligible = grade !== 'D' && grade !== 'F' && (custody?.isSecured ?? false);
      const eligibilityReason = !eligible
        ? grade === 'D' || grade === 'F'
          ? 'Collateral health score too low'
          : 'Collateral must be in secured custody'
        : undefined;

      return {
        paid,
        overallScore,
        grade,
        components: {
          valuationScore,
          provenanceScore,
          conditionScore,
          custodyScore,
        },
        riskLevel,
        eligible,
        eligibilityReason,
      };
    } catch (error) {
      console.error('[Core] Collateral health error:', error);
      return null;
    }
  }

  /**
   * Get borrower risk score
   */
  async getBorrowerRisk(
    userId: string,
    loanAmount: number,
    previousLoans: number = 0,
    accountAgeDays: number = 365
  ): Promise<BorrowerRiskResult> {
    try {
      const response = await fetch(`${CORE_API_URL}/api/v1/fraud/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source-App': 'proveniq-capital',
        },
        body: JSON.stringify({
          assetId: 'borrower-check',
          userId,
          claimType: 'loan',
          claimedValue: loanAmount,
          category: 'lending',
          hasReceipt: false,
          hasImages: false,
          imageCount: 0,
          previousClaims: previousLoans,
          accountAgeDays,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          userId,
          fraudScore: data.score,
          riskLevel: data.riskLevel,
          recommendation: this.fraudToLoanRecommendation(data.recommendation),
          signals: data.signals?.map((s: any) => s.description) || [],
        };
      }
    } catch (error) {
      console.error('[Core] Borrower risk error:', error);
    }

    // Conservative fallback
    return {
      userId,
      fraudScore: 50,
      riskLevel: 'MEDIUM',
      recommendation: 'MANUAL_REVIEW',
      signals: ['Core unavailable - manual review required'],
    };
  }

  /**
   * Verify ownership of collateral
   */
  async verifyOwnership(paid: string, claimedOwnerId: string): Promise<OwnershipVerification> {
    try {
      const response = await fetch(`${CORE_API_URL}/api/v1/registry/${paid}`, {
        method: 'GET',
        headers: { 'X-Source-App': 'proveniq-capital' },
      });

      if (response.ok) {
        const data = await response.json();
        const verified = data.ownerId === claimedOwnerId;

        return {
          paid,
          verified,
          ownerId: data.ownerId,
          ownershipConfidence: verified ? 'HIGH' : 'LOW',
          ledgerEventCount: data.ledgerEventIds?.length || 0,
          lastVerifiedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error('[Core] Ownership verification error:', error);
    }

    return {
      paid,
      verified: false,
      ownerId: 'unknown',
      ownershipConfidence: 'LOW',
      ledgerEventCount: 0,
      lastVerifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Get current custody state
   */
  async getCustodyState(paid: string): Promise<CustodyState | null> {
    try {
      const response = await fetch(`${CORE_API_URL}/api/v1/registry/${paid}`, {
        method: 'GET',
        headers: { 'X-Source-App': 'proveniq-capital' },
      });

      if (response.ok) {
        const data = await response.json();
        const state = data.custodyState || 'USER';
        
        return {
          paid,
          currentState: state,
          currentCustodian: data.currentCustodian || data.ownerId,
          lastStateChange: data.updatedAt,
          isSecured: state === 'LOCKER' || state === 'ESCROW',
        };
      }
    } catch (error) {
      console.error('[Core] Custody state error:', error);
    }

    return null;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getCollateralValuation(paid: string, category: string): Promise<CollateralValuation | null> {
    try {
      const response = await fetch(`${CORE_API_URL}/api/v1/valuations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source-App': 'proveniq-capital',
        },
        body: JSON.stringify({
          assetId: paid,
          name: 'Collateral Asset',
          category,
          condition: 'good',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          paid,
          currentValue: data.estimatedValue,
          currency: data.currency || 'USD',
          confidence: data.confidence,
          valuedAt: data.valuedAt,
        };
      }
    } catch (error) {
      console.error('[Core] Valuation error:', error);
    }

    return null;
  }

  private async getProvenanceScore(paid: string): Promise<{ score: number } | null> {
    try {
      const response = await fetch(`${CORE_API_URL}/api/v1/provenance/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source-App': 'proveniq-capital',
        },
        body: JSON.stringify({
          assetId: paid,
          sourceApp: 'capital',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { score: data.score };
      }
    } catch (error) {
      console.error('[Core] Provenance error:', error);
    }

    return null;
  }

  private confidenceToScore(confidence: string): number {
    switch (confidence) {
      case 'HIGH': return 90;
      case 'MEDIUM': return 70;
      case 'LOW': return 50;
      default: return 50;
    }
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private scoreToRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    if (score >= 40) return 'HIGH';
    return 'CRITICAL';
  }

  private fraudToLoanRecommendation(fraudRec: string): 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT' {
    switch (fraudRec) {
      case 'AUTO_APPROVE': return 'APPROVE';
      case 'MANUAL_REVIEW':
      case 'ESCALATE': return 'MANUAL_REVIEW';
      case 'AUTO_DENY': return 'REJECT';
      default: return 'MANUAL_REVIEW';
    }
  }
}

// Singleton export
export const coreClient = new CoreClient();
