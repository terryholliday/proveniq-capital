/**
 * @file modules/lender/analytics.service.ts
 * @description PROVENIQ Capital - Lender Analytics Service
 * 
 * Provides portfolio analytics for lender partners:
 * - Portfolio performance metrics
 * - Default/delinquency tracking
 * - Collateral health aggregation
 * - Risk distribution analysis
 * - Revenue/yield calculations
 */

// ============================================
// TYPES
// ============================================

export interface PortfolioSummary {
  lenderId: string;
  lenderName: string;
  
  // Volume
  totalLoansCount: number;
  activeLoansCount: number;
  totalPrincipalCents: number;
  outstandingPrincipalCents: number;
  
  // Performance
  totalInterestEarnedCents: number;
  averageApr: number;
  weightedAverageApr: number;
  
  // Risk
  averageLtv: number;
  averageCollateralHealthScore: number;
  
  // Delinquency
  currentLoansCount: number;
  delinquent30Count: number;
  delinquent60Count: number;
  delinquent90Count: number;
  defaultedCount: number;
  
  // Rates
  delinquencyRate: number;
  defaultRate: number;
  
  // Period
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
}

export interface LoanPerformance {
  loanId: string;
  borrowerId: string;
  
  // Original terms
  principalCents: number;
  apr: number;
  termDays: number;
  originatedAt: string;
  
  // Current state
  outstandingPrincipalCents: number;
  interestPaidCents: number;
  totalPaidCents: number;
  paymentsRemaining: number;
  
  // Collateral
  collateralValueCents: number;
  currentLtv: number;
  collateralHealthScore: number;
  
  // Status
  status: 'current' | 'delinquent_30' | 'delinquent_60' | 'delinquent_90' | 'default' | 'paid_off';
  daysPastDue: number;
  lastPaymentAt?: string;
  nextPaymentDueAt?: string;
}

export interface RiskDistribution {
  lenderId: string;
  
  // By LTV bucket
  ltvBuckets: {
    bucket: string; // e.g., "0-40%", "40-60%", "60-80%"
    count: number;
    principalCents: number;
    percentOfPortfolio: number;
  }[];
  
  // By collateral category
  categoryDistribution: {
    category: string;
    count: number;
    principalCents: number;
    percentOfPortfolio: number;
  }[];
  
  // By risk tier
  riskTierDistribution: {
    tier: 'low' | 'medium' | 'high';
    count: number;
    principalCents: number;
    percentOfPortfolio: number;
  }[];
  
  generatedAt: string;
}

export interface CollateralHealthReport {
  lenderId: string;
  
  // Aggregate health
  averageHealthScore: number;
  lowestHealthScore: number;
  highestHealthScore: number;
  
  // Distribution
  healthBuckets: {
    bucket: string; // e.g., "90-100", "80-90", etc.
    count: number;
    principalCents: number;
  }[];
  
  // Alerts
  activeBreachAlerts: number;
  unresolvedAlerts: number;
  
  // At-risk loans
  atRiskLoans: {
    loanId: string;
    healthScore: number;
    ltv: number;
    issue: string;
  }[];
  
  generatedAt: string;
}

export interface RevenueReport {
  lenderId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  
  // Revenue
  interestRevenueCents: number;
  feeRevenueCents: number;
  totalRevenueCents: number;
  
  // Losses
  writeOffsCents: number;
  provisionsCents: number;
  netRevenueCents: number;
  
  // Yield
  annualizedYield: number;
  netYield: number;
  
  // Comparison
  previousPeriodRevenueCents?: number;
  revenueChangePercent?: number;
  
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
}

// ============================================
// MOCK DATA GENERATORS
// ============================================

function generateMockLoans(lenderId: string, count: number): LoanPerformance[] {
  const loans: LoanPerformance[] = [];
  const statuses: LoanPerformance['status'][] = ['current', 'current', 'current', 'current', 'delinquent_30', 'delinquent_60', 'paid_off'];
  const categories = ['electronics', 'jewelry', 'vehicles', 'collectibles', 'art'];
  
  for (let i = 0; i < count; i++) {
    const principal = Math.floor(Math.random() * 900000) + 100000; // $1K - $10K
    const apr = Math.floor(Math.random() * 20) + 10; // 10-30%
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const paidPercent = status === 'paid_off' ? 1 : Math.random() * 0.8;
    
    loans.push({
      loanId: `LOAN-${lenderId}-${i}`,
      borrowerId: `BOR-${Math.random().toString(36).substr(2, 8)}`,
      principalCents: principal,
      apr,
      termDays: [90, 180, 365][Math.floor(Math.random() * 3)],
      originatedAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
      outstandingPrincipalCents: Math.round(principal * (1 - paidPercent)),
      interestPaidCents: Math.round(principal * paidPercent * (apr / 100)),
      totalPaidCents: Math.round(principal * paidPercent * (1 + apr / 100)),
      paymentsRemaining: Math.floor((1 - paidPercent) * 12),
      collateralValueCents: Math.round(principal / (0.3 + Math.random() * 0.4)),
      currentLtv: 30 + Math.random() * 40,
      collateralHealthScore: 60 + Math.random() * 40,
      status,
      daysPastDue: status.includes('delinquent') ? parseInt(status.split('_')[1]) + Math.floor(Math.random() * 25) : 0,
      lastPaymentAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString(),
      nextPaymentDueAt: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  
  return loans;
}

// ============================================
// LENDER ANALYTICS SERVICE
// ============================================

class LenderAnalyticsService {
  private loanCache: Map<string, LoanPerformance[]> = new Map();

  constructor() {
    // Initialize with mock data for demo lenders
    this.loanCache.set('LENDER-001', generateMockLoans('001', 50));
    this.loanCache.set('LENDER-002', generateMockLoans('002', 30));
    this.loanCache.set('LENDER-003', generateMockLoans('003', 75));
  }

  /**
   * Get portfolio summary for a lender
   */
  async getPortfolioSummary(lenderId: string): Promise<PortfolioSummary> {
    const loans = this.loanCache.get(lenderId) || [];
    const activeLoans = loans.filter(l => l.status !== 'paid_off');
    
    const totalPrincipal = loans.reduce((sum, l) => sum + l.principalCents, 0);
    const outstandingPrincipal = activeLoans.reduce((sum, l) => sum + l.outstandingPrincipalCents, 0);
    const totalInterest = loans.reduce((sum, l) => sum + l.interestPaidCents, 0);
    
    const delinquent30 = loans.filter(l => l.status === 'delinquent_30').length;
    const delinquent60 = loans.filter(l => l.status === 'delinquent_60').length;
    const delinquent90 = loans.filter(l => l.status === 'delinquent_90').length;
    const defaulted = loans.filter(l => l.status === 'default').length;
    
    const avgApr = loans.length > 0 
      ? loans.reduce((sum, l) => sum + l.apr, 0) / loans.length 
      : 0;
    
    const weightedApr = totalPrincipal > 0
      ? loans.reduce((sum, l) => sum + (l.apr * l.principalCents), 0) / totalPrincipal
      : 0;
    
    const avgLtv = activeLoans.length > 0
      ? activeLoans.reduce((sum, l) => sum + l.currentLtv, 0) / activeLoans.length
      : 0;
    
    const avgHealth = activeLoans.length > 0
      ? activeLoans.reduce((sum, l) => sum + l.collateralHealthScore, 0) / activeLoans.length
      : 0;

    return {
      lenderId,
      lenderName: `Lender ${lenderId.split('-')[1]}`,
      totalLoansCount: loans.length,
      activeLoansCount: activeLoans.length,
      totalPrincipalCents: totalPrincipal,
      outstandingPrincipalCents: outstandingPrincipal,
      totalInterestEarnedCents: totalInterest,
      averageApr: Math.round(avgApr * 100) / 100,
      weightedAverageApr: Math.round(weightedApr * 100) / 100,
      averageLtv: Math.round(avgLtv * 100) / 100,
      averageCollateralHealthScore: Math.round(avgHealth * 100) / 100,
      currentLoansCount: loans.filter(l => l.status === 'current').length,
      delinquent30Count: delinquent30,
      delinquent60Count: delinquent60,
      delinquent90Count: delinquent90,
      defaultedCount: defaulted,
      delinquencyRate: activeLoans.length > 0 
        ? Math.round(((delinquent30 + delinquent60 + delinquent90) / activeLoans.length) * 10000) / 100
        : 0,
      defaultRate: loans.length > 0
        ? Math.round((defaulted / loans.length) * 10000) / 100
        : 0,
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get all loans for a lender
   */
  async getLenderLoans(
    lenderId: string,
    filters?: {
      status?: LoanPerformance['status'];
      minLtv?: number;
      maxLtv?: number;
    }
  ): Promise<LoanPerformance[]> {
    let loans = this.loanCache.get(lenderId) || [];
    
    if (filters) {
      if (filters.status) {
        loans = loans.filter(l => l.status === filters.status);
      }
      if (filters.minLtv !== undefined) {
        loans = loans.filter(l => l.currentLtv >= filters.minLtv!);
      }
      if (filters.maxLtv !== undefined) {
        loans = loans.filter(l => l.currentLtv <= filters.maxLtv!);
      }
    }
    
    return loans;
  }

  /**
   * Get risk distribution analysis
   */
  async getRiskDistribution(lenderId: string): Promise<RiskDistribution> {
    const loans = this.loanCache.get(lenderId) || [];
    const activeLoans = loans.filter(l => l.status !== 'paid_off');
    const totalPrincipal = activeLoans.reduce((sum, l) => sum + l.principalCents, 0);

    // LTV buckets
    const ltvBuckets = [
      { bucket: '0-40%', min: 0, max: 40 },
      { bucket: '40-60%', min: 40, max: 60 },
      { bucket: '60-80%', min: 60, max: 80 },
      { bucket: '80%+', min: 80, max: 999 },
    ].map(({ bucket, min, max }) => {
      const bucketLoans = activeLoans.filter(l => l.currentLtv >= min && l.currentLtv < max);
      const bucketPrincipal = bucketLoans.reduce((sum, l) => sum + l.principalCents, 0);
      return {
        bucket,
        count: bucketLoans.length,
        principalCents: bucketPrincipal,
        percentOfPortfolio: totalPrincipal > 0 ? Math.round((bucketPrincipal / totalPrincipal) * 10000) / 100 : 0,
      };
    });

    // Category distribution (mock)
    const categories = ['electronics', 'jewelry', 'vehicles', 'collectibles', 'art'];
    const categoryDistribution = categories.map(category => {
      const count = Math.floor(Math.random() * (activeLoans.length / 3));
      const principal = Math.floor(Math.random() * (totalPrincipal / 3));
      return {
        category,
        count,
        principalCents: principal,
        percentOfPortfolio: totalPrincipal > 0 ? Math.round((principal / totalPrincipal) * 10000) / 100 : 0,
      };
    });

    // Risk tier distribution
    const riskTierDistribution: RiskDistribution['riskTierDistribution'] = [
      { tier: 'low', count: 0, principalCents: 0, percentOfPortfolio: 0 },
      { tier: 'medium', count: 0, principalCents: 0, percentOfPortfolio: 0 },
      { tier: 'high', count: 0, principalCents: 0, percentOfPortfolio: 0 },
    ];

    for (const loan of activeLoans) {
      const tier = loan.currentLtv < 40 ? 'low' : loan.currentLtv < 60 ? 'medium' : 'high';
      const bucket = riskTierDistribution.find(r => r.tier === tier)!;
      bucket.count++;
      bucket.principalCents += loan.principalCents;
    }

    for (const bucket of riskTierDistribution) {
      bucket.percentOfPortfolio = totalPrincipal > 0 
        ? Math.round((bucket.principalCents / totalPrincipal) * 10000) / 100 
        : 0;
    }

    return {
      lenderId,
      ltvBuckets,
      categoryDistribution,
      riskTierDistribution,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get collateral health report
   */
  async getCollateralHealthReport(lenderId: string): Promise<CollateralHealthReport> {
    const loans = this.loanCache.get(lenderId) || [];
    const activeLoans = loans.filter(l => l.status !== 'paid_off');

    const healthScores = activeLoans.map(l => l.collateralHealthScore);
    const avgHealth = healthScores.length > 0 
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length 
      : 0;

    const healthBuckets = [
      { bucket: '90-100', min: 90, max: 100 },
      { bucket: '80-90', min: 80, max: 90 },
      { bucket: '70-80', min: 70, max: 80 },
      { bucket: '60-70', min: 60, max: 70 },
      { bucket: '<60', min: 0, max: 60 },
    ].map(({ bucket, min, max }) => {
      const bucketLoans = activeLoans.filter(l => l.collateralHealthScore >= min && l.collateralHealthScore < max);
      return {
        bucket,
        count: bucketLoans.length,
        principalCents: bucketLoans.reduce((sum, l) => sum + l.principalCents, 0),
      };
    });

    const atRiskLoans = activeLoans
      .filter(l => l.collateralHealthScore < 70 || l.currentLtv > 70)
      .slice(0, 10)
      .map(l => ({
        loanId: l.loanId,
        healthScore: Math.round(l.collateralHealthScore),
        ltv: Math.round(l.currentLtv),
        issue: l.collateralHealthScore < 70 ? 'Low health score' : 'High LTV',
      }));

    return {
      lenderId,
      averageHealthScore: Math.round(avgHealth * 100) / 100,
      lowestHealthScore: Math.round(Math.min(...healthScores, 100)),
      highestHealthScore: Math.round(Math.max(...healthScores, 0)),
      healthBuckets,
      activeBreachAlerts: Math.floor(Math.random() * 5),
      unresolvedAlerts: Math.floor(Math.random() * 3),
      atRiskLoans,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get revenue report
   */
  async getRevenueReport(
    lenderId: string,
    period: RevenueReport['period'] = 'monthly'
  ): Promise<RevenueReport> {
    const loans = this.loanCache.get(lenderId) || [];
    
    const periodDays = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      quarterly: 90,
      yearly: 365,
    }[period];

    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    const interestRevenue = loans.reduce((sum, l) => sum + l.interestPaidCents, 0);
    const feeRevenue = Math.round(interestRevenue * 0.1); // 10% platform fee
    const totalRevenue = interestRevenue + feeRevenue;
    
    const writeOffs = loans
      .filter(l => l.status === 'default')
      .reduce((sum, l) => sum + l.outstandingPrincipalCents, 0);
    
    const provisions = Math.round(writeOffs * 0.1); // 10% provision
    const netRevenue = totalRevenue - writeOffs - provisions;

    const totalPrincipal = loans.reduce((sum, l) => sum + l.principalCents, 0);
    const annualizedYield = totalPrincipal > 0 
      ? (interestRevenue / totalPrincipal) * (365 / periodDays) * 100 
      : 0;
    const netYield = totalPrincipal > 0 
      ? (netRevenue / totalPrincipal) * (365 / periodDays) * 100 
      : 0;

    return {
      lenderId,
      period,
      interestRevenueCents: interestRevenue,
      feeRevenueCents: feeRevenue,
      totalRevenueCents: totalRevenue,
      writeOffsCents: writeOffs,
      provisionsCents: provisions,
      netRevenueCents: netRevenue,
      annualizedYield: Math.round(annualizedYield * 100) / 100,
      netYield: Math.round(netYield * 100) / 100,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get list of all lenders with basic stats
   */
  async getAllLenders(): Promise<Array<{ lenderId: string; loansCount: number; principalCents: number }>> {
    const lenders: Array<{ lenderId: string; loansCount: number; principalCents: number }> = [];
    
    for (const [lenderId, loans] of this.loanCache.entries()) {
      lenders.push({
        lenderId,
        loansCount: loans.length,
        principalCents: loans.reduce((sum, l) => sum + l.principalCents, 0),
      });
    }
    
    return lenders;
  }
}

// Singleton
let service: LenderAnalyticsService | null = null;

export function getLenderAnalyticsService(): LenderAnalyticsService {
  if (!service) {
    service = new LenderAnalyticsService();
  }
  return service;
}
