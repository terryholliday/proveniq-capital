/**
 * @file modules/loans/lender-matching.service.ts
 * @description PROVENIQ Capital - Lender Matching Service
 * 
 * Routes loan applications to partner lenders based on:
 * - Loan amount and term
 * - Collateral type and risk profile
 * - Lender appetite and capacity
 * - Geographic restrictions
 */

// ============================================
// TYPES
// ============================================

export interface LenderProfile {
  lenderId: string;
  name: string;
  type: 'bank' | 'credit_union' | 'fintech' | 'private';
  
  // Lending parameters
  minLoanAmount: number;
  maxLoanAmount: number;
  minTermDays: number;
  maxTermDays: number;
  maxLTV: number;
  
  // Risk appetite
  minCreditScore: number;
  acceptedCollateralTypes: string[];
  acceptedPurposes: string[];
  
  // Pricing
  baseAprBps: number;
  riskPremiumBps: number; // Added per risk tier
  
  // Capacity
  monthlyCapacity: number; // Max loan volume per month
  currentMonthVolume: number;
  
  // Status
  active: boolean;
  acceptingApplications: boolean;
}

export interface LenderMatch {
  lenderId: string;
  lenderName: string;
  matchScore: number; // 0-100
  estimatedAprBps: number;
  maxApprovedAmount: number;
  matchReasons: string[];
  exclusionReasons: string[];
  priority: number;
}

export interface MatchingRequest {
  applicationId: string;
  requestedAmountCents: number;
  requestedTermDays: number;
  collateralType: string;
  collateralValueCents: number;
  borrowerRiskScore: number;
  purpose: string;
  ltv: number;
}

export interface MatchingResult {
  applicationId: string;
  matchedLenders: LenderMatch[];
  bestMatch: LenderMatch | null;
  autoRouted: boolean;
  routedToLenderId: string | null;
  matchedAt: string;
}

// ============================================
// MOCK LENDER NETWORK
// ============================================

const LENDER_NETWORK: LenderProfile[] = [
  {
    lenderId: 'LND-001',
    name: 'AssetFin Partners',
    type: 'fintech',
    minLoanAmount: 500,
    maxLoanAmount: 50000,
    minTermDays: 30,
    maxTermDays: 365,
    maxLTV: 70,
    minCreditScore: 600,
    acceptedCollateralTypes: ['electronics', 'jewelry', 'watches', 'vehicles'],
    acceptedPurposes: ['personal', 'business', 'emergency'],
    baseAprBps: 1200, // 12%
    riskPremiumBps: 200,
    monthlyCapacity: 500000,
    currentMonthVolume: 125000,
    active: true,
    acceptingApplications: true,
  },
  {
    lenderId: 'LND-002',
    name: 'Collateral Credit Union',
    type: 'credit_union',
    minLoanAmount: 1000,
    maxLoanAmount: 100000,
    minTermDays: 90,
    maxTermDays: 730,
    maxLTV: 60,
    minCreditScore: 650,
    acceptedCollateralTypes: ['vehicles', 'art', 'musical_instruments', 'jewelry'],
    acceptedPurposes: ['personal', 'home_improvement', 'education'],
    baseAprBps: 800, // 8%
    riskPremiumBps: 150,
    monthlyCapacity: 1000000,
    currentMonthVolume: 450000,
    active: true,
    acceptingApplications: true,
  },
  {
    lenderId: 'LND-003',
    name: 'QuickCash Lenders',
    type: 'private',
    minLoanAmount: 100,
    maxLoanAmount: 25000,
    minTermDays: 14,
    maxTermDays: 180,
    maxLTV: 80,
    minCreditScore: 500,
    acceptedCollateralTypes: ['electronics', 'appliances', 'furniture', 'collectibles'],
    acceptedPurposes: ['personal', 'emergency', 'business'],
    baseAprBps: 2400, // 24%
    riskPremiumBps: 400,
    monthlyCapacity: 200000,
    currentMonthVolume: 180000,
    active: true,
    acceptingApplications: true,
  },
  {
    lenderId: 'LND-004',
    name: 'Premium Asset Bank',
    type: 'bank',
    minLoanAmount: 10000,
    maxLoanAmount: 500000,
    minTermDays: 180,
    maxTermDays: 1095,
    maxLTV: 50,
    minCreditScore: 700,
    acceptedCollateralTypes: ['art', 'jewelry', 'watches', 'vehicles', 'collectibles'],
    acceptedPurposes: ['business', 'investment', 'home_improvement'],
    baseAprBps: 600, // 6%
    riskPremiumBps: 100,
    monthlyCapacity: 5000000,
    currentMonthVolume: 1200000,
    active: true,
    acceptingApplications: true,
  },
];

// ============================================
// LENDER MATCHING SERVICE
// ============================================

class LenderMatchingService {
  /**
   * Find matching lenders for a loan application
   */
  async matchLenders(request: MatchingRequest): Promise<MatchingResult> {
    const matches: LenderMatch[] = [];

    for (const lender of LENDER_NETWORK) {
      const match = this.evaluateLender(lender, request);
      if (match) {
        matches.push(match);
      }
    }

    // Sort by match score (descending)
    matches.sort((a, b) => b.matchScore - a.matchScore);

    // Assign priority
    matches.forEach((m, i) => { m.priority = i + 1; });

    const bestMatch = matches.length > 0 ? matches[0] : null;

    // Auto-route if best match score > 80
    const autoRouted = bestMatch !== null && bestMatch.matchScore >= 80;

    console.log(`[LenderMatching] ${request.applicationId}: ${matches.length} matches, best=${bestMatch?.lenderName || 'none'} (${bestMatch?.matchScore || 0})`);

    return {
      applicationId: request.applicationId,
      matchedLenders: matches,
      bestMatch,
      autoRouted,
      routedToLenderId: autoRouted ? bestMatch!.lenderId : null,
      matchedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluate a single lender against request
   */
  private evaluateLender(lender: LenderProfile, request: MatchingRequest): LenderMatch | null {
    const matchReasons: string[] = [];
    const exclusionReasons: string[] = [];
    let score = 50; // Base score

    const requestedAmount = request.requestedAmountCents / 100;

    // Check hard exclusions first
    if (!lender.active || !lender.acceptingApplications) {
      return null; // Not accepting
    }

    // Amount check
    if (requestedAmount < lender.minLoanAmount) {
      exclusionReasons.push(`Amount below minimum ($${lender.minLoanAmount})`);
      return null;
    }
    if (requestedAmount > lender.maxLoanAmount) {
      exclusionReasons.push(`Amount exceeds maximum ($${lender.maxLoanAmount})`);
      return null;
    }
    matchReasons.push('Amount within range');
    score += 10;

    // Term check
    if (request.requestedTermDays < lender.minTermDays || 
        request.requestedTermDays > lender.maxTermDays) {
      exclusionReasons.push(`Term outside ${lender.minTermDays}-${lender.maxTermDays} days`);
      return null;
    }
    matchReasons.push('Term acceptable');
    score += 5;

    // LTV check
    if (request.ltv > lender.maxLTV) {
      exclusionReasons.push(`LTV ${request.ltv}% exceeds max ${lender.maxLTV}%`);
      return null;
    }
    if (request.ltv <= lender.maxLTV - 20) {
      matchReasons.push('Conservative LTV');
      score += 15;
    } else {
      matchReasons.push('LTV within limits');
      score += 5;
    }

    // Collateral type check
    if (!lender.acceptedCollateralTypes.includes(request.collateralType)) {
      exclusionReasons.push(`Collateral type ${request.collateralType} not accepted`);
      return null;
    }
    matchReasons.push('Collateral type accepted');
    score += 10;

    // Purpose check
    if (!lender.acceptedPurposes.includes(request.purpose)) {
      exclusionReasons.push(`Purpose ${request.purpose} not accepted`);
      // Soft exclusion - reduce score but don't exclude
      score -= 15;
    } else {
      matchReasons.push('Purpose approved');
      score += 5;
    }

    // Risk score check (inverse - lower is better)
    const effectiveCreditScore = 850 - (request.borrowerRiskScore * 3.5); // Convert risk to credit-ish
    if (effectiveCreditScore < lender.minCreditScore) {
      exclusionReasons.push(`Risk profile below threshold`);
      score -= 20;
    } else {
      matchReasons.push('Risk profile acceptable');
      score += 10;
    }

    // Capacity check
    const capacityRemaining = lender.monthlyCapacity - lender.currentMonthVolume;
    if (requestedAmount > capacityRemaining) {
      exclusionReasons.push('Lender at capacity');
      score -= 30;
    } else if (requestedAmount <= capacityRemaining * 0.5) {
      matchReasons.push('Within lender capacity');
      score += 5;
    }

    // Calculate estimated APR
    const riskTier = request.borrowerRiskScore < 30 ? 0 : 
                     request.borrowerRiskScore < 50 ? 1 : 
                     request.borrowerRiskScore < 70 ? 2 : 3;
    const estimatedAprBps = lender.baseAprBps + (lender.riskPremiumBps * riskTier);

    // Prefer lower APR
    if (estimatedAprBps < 1000) {
      matchReasons.push('Competitive rate');
      score += 10;
    } else if (estimatedAprBps > 2000) {
      score -= 5;
    }

    // Calculate max approved amount (based on LTV and lender max)
    const maxByLTV = (request.collateralValueCents / 100) * (lender.maxLTV / 100);
    const maxApprovedAmount = Math.min(maxByLTV, lender.maxLoanAmount);

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    return {
      lenderId: lender.lenderId,
      lenderName: lender.name,
      matchScore: score,
      estimatedAprBps,
      maxApprovedAmount,
      matchReasons,
      exclusionReasons,
      priority: 0, // Set later
    };
  }

  /**
   * Get all active lenders
   */
  async getLenders(): Promise<LenderProfile[]> {
    return LENDER_NETWORK.filter(l => l.active);
  }

  /**
   * Get lender by ID
   */
  async getLender(lenderId: string): Promise<LenderProfile | null> {
    return LENDER_NETWORK.find(l => l.lenderId === lenderId) || null;
  }

  /**
   * Route application to specific lender
   */
  async routeToLender(
    applicationId: string, 
    lenderId: string
  ): Promise<{ success: boolean; message: string }> {
    const lender = await this.getLender(lenderId);
    
    if (!lender) {
      return { success: false, message: 'Lender not found' };
    }

    if (!lender.acceptingApplications) {
      return { success: false, message: 'Lender not accepting applications' };
    }

    console.log(`[LenderMatching] Routed ${applicationId} to ${lender.name}`);

    // In production: Update application record with lender assignment

    return { 
      success: true, 
      message: `Application routed to ${lender.name}` 
    };
  }
}

// Singleton
let service: LenderMatchingService | null = null;

export function getLenderMatchingService(): LenderMatchingService {
  if (!service) {
    service = new LenderMatchingService();
  }
  return service;
}
