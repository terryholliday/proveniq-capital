/**
 * PROVENIQ Capital - Origination Engine Service
 * 
 * The PRIMARY subsystem of Capital.
 * Handles loan application, pricing, approval, and funding.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LoanApplication,
  Loan,
  LoanProductType,
  LoanStatus,
  PaymentFrequency,
  LOAN_PRODUCTS,
  RiskPricingInput,
  calculateRiskPricing,
} from './loan-types';
import { Covenant, createDefaultCovenants } from './covenants';

// ============================================================================
// ORIGINATION SERVICE
// ============================================================================

export interface OriginationRequest {
  borrowerId: string;
  borrowerType: 'CONSUMER' | 'LANDLORD' | 'BUSINESS';
  sourceApp: 'HOME' | 'PROPERTIES' | 'OPS';
  productType: LoanProductType;
  requestedAmountCents: number;
  requestedTermDays: number;
  paymentFrequency: PaymentFrequency;
  purpose: string;
  collateralAssetIds: string[];
}

export interface OriginationResult {
  success: boolean;
  application?: LoanApplication;
  pricing?: {
    approvedAmountCents: number;
    aprBps: number;
    monthlyPaymentCents: number;
    originationFeeCents: number;
    totalInterestCents: number;
    ltvRatio: number;
    riskTier: string;
  };
  error?: string;
  validationErrors?: string[];
}

export interface UnderwritingResult {
  approved: boolean;
  application: LoanApplication;
  covenants?: Omit<Covenant, 'id'>[];
  declineReasons?: string[];
}

export interface FundingResult {
  success: boolean;
  loan?: Loan;
  ledgerTransactionId?: string;
  error?: string;
}

export class OriginationService {
  /**
   * Step 1: Create a loan application with preliminary pricing.
   */
  async createApplication(request: OriginationRequest): Promise<OriginationResult> {
    const validationErrors = this.validateRequest(request);
    if (validationErrors.length > 0) {
      return { success: false, validationErrors };
    }

    const product = LOAN_PRODUCTS[request.productType];
    
    // Validate product matches source app
    if (product.sourceApp !== request.sourceApp) {
      return {
        success: false,
        error: `Product ${request.productType} is not available for ${request.sourceApp}`,
      };
    }

    // Validate amount range
    if (request.requestedAmountCents < product.minAmount) {
      return {
        success: false,
        error: `Minimum loan amount is $${(product.minAmount / 100).toFixed(2)}`,
      };
    }
    if (request.requestedAmountCents > product.maxAmount) {
      return {
        success: false,
        error: `Maximum loan amount is $${(product.maxAmount / 100).toFixed(2)}`,
      };
    }

    // Create application
    const now = new Date().toISOString();
    const application: LoanApplication = {
      id: uuidv4(),
      borrowerId: request.borrowerId,
      borrowerType: request.borrowerType,
      sourceApp: request.sourceApp,
      productType: request.productType,
      requestedAmountCents: request.requestedAmountCents,
      requestedTermDays: request.requestedTermDays,
      paymentFrequency: request.paymentFrequency,
      purpose: request.purpose,
      collateralAssetIds: request.collateralAssetIds,
      status: 'DRAFT',
      covenantIds: [],
      createdAt: now,
    };

    // TODO: Persist application to database

    return {
      success: true,
      application,
    };
  }

  /**
   * Step 2: Submit application for underwriting.
   * Fetches collateral values from Core and calculates pricing.
   */
  async submitForUnderwriting(
    applicationId: string,
    collateralValueCents: number,
    borrowerRiskScore: number,
    hasInsurance: boolean,
    hasAnchor: boolean,
    isVerified: boolean,
  ): Promise<UnderwritingResult> {
    // TODO: Fetch application from database
    const application: LoanApplication = {
      id: applicationId,
      borrowerId: 'mock-borrower',
      borrowerType: 'CONSUMER',
      sourceApp: 'HOME',
      productType: 'ASSET_BACKED_CONSUMER',
      requestedAmountCents: 500000,
      requestedTermDays: 180,
      paymentFrequency: 'MONTHLY',
      purpose: 'Personal expenses',
      collateralAssetIds: ['paid-123'],
      status: 'DRAFT',
      covenantIds: [],
      createdAt: new Date().toISOString(),
    };

    // Calculate risk-adjusted pricing
    const pricingInput: RiskPricingInput = {
      productType: application.productType,
      requestedAmountCents: application.requestedAmountCents,
      collateralValueCents,
      borrowerRiskScore,
      hasInsurance,
      hasAnchor,
      isVerified,
    };

    const pricing = calculateRiskPricing(pricingInput);

    // Check if declined
    if (pricing.riskTier === 'DECLINED') {
      application.status = 'CANCELLED';
      application.underwritingNotes = 'Declined due to high risk score';
      
      return {
        approved: false,
        application,
        declineReasons: ['Risk score exceeds acceptable threshold'],
      };
    }

    // Update application with pricing
    const now = new Date().toISOString();
    application.status = 'APPROVED';
    application.submittedAt = now;
    application.approvedAt = now;
    application.approvedAmountCents = pricing.approvedAmountCents;
    application.aprBps = pricing.finalAprBps;
    application.originationFeeCents = pricing.originationFeeCents;
    application.monthlyPaymentCents = pricing.monthlyPaymentCents;
    application.totalInterestCents = pricing.totalInterestCents;
    application.ltvRatio = pricing.ltvRatio;
    application.riskScore = borrowerRiskScore;
    application.underwritingNotes = pricing.pricingNotes.join('; ');

    // Calculate maturity date
    const maturity = new Date();
    maturity.setDate(maturity.getDate() + application.requestedTermDays);
    application.maturityDate = maturity.toISOString();

    // Create default covenants
    const covenants = createDefaultCovenants(
      application.id,
      pricing.ltvRatio,
      hasAnchor,
      hasInsurance,
    );

    return {
      approved: true,
      application,
      covenants,
    };
  }

  /**
   * Step 3: Fund the loan (after borrower accepts terms).
   */
  async fundLoan(applicationId: string): Promise<FundingResult> {
    // TODO: Fetch approved application from database
    // TODO: Create ledger entries for disbursement
    // TODO: Record lien on collateral in Ledger

    const now = new Date().toISOString();
    const maturity = new Date();
    maturity.setDate(maturity.getDate() + 180);

    const loan: Loan = {
      id: uuidv4(),
      applicationId,
      borrowerId: 'mock-borrower',
      productType: 'ASSET_BACKED_CONSUMER',
      principalCents: 500000,
      aprBps: 1200,
      termDays: 180,
      paymentFrequency: 'MONTHLY',
      monthlyPaymentCents: 90000,
      outstandingPrincipalCents: 500000,
      accruedInterestCents: 0,
      totalPaidCents: 0,
      collateralAssetIds: ['paid-123'],
      totalCollateralValueCents: 1200000,
      currentLtvRatio: 0.42,
      status: 'ACTIVE',
      daysDelinquent: 0,
      nextPaymentDueDate: this.calculateNextPaymentDate('MONTHLY'),
      fundedAt: now,
      maturityDate: maturity.toISOString(),
      activeCovenants: [],
      breachedCovenants: [],
    };

    // TODO: Persist loan to database
    // TODO: Create ledger entries

    return {
      success: true,
      loan,
      ledgerTransactionId: uuidv4(),
    };
  }

  /**
   * Get loan offer preview without creating application.
   */
  async previewOffer(
    productType: LoanProductType,
    requestedAmountCents: number,
    collateralValueCents: number,
    borrowerRiskScore: number = 30,
  ): Promise<OriginationResult> {
    const pricing = calculateRiskPricing({
      productType,
      requestedAmountCents,
      collateralValueCents,
      borrowerRiskScore,
      hasInsurance: true,
      hasAnchor: false,
      isVerified: true,
    });

    if (pricing.riskTier === 'DECLINED') {
      return {
        success: false,
        error: 'Unable to provide offer at this time',
      };
    }

    return {
      success: true,
      pricing: {
        approvedAmountCents: pricing.approvedAmountCents,
        aprBps: pricing.finalAprBps,
        monthlyPaymentCents: pricing.monthlyPaymentCents,
        originationFeeCents: pricing.originationFeeCents,
        totalInterestCents: pricing.totalInterestCents,
        ltvRatio: pricing.ltvRatio,
        riskTier: pricing.riskTier,
      },
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private validateRequest(request: OriginationRequest): string[] {
    const errors: string[] = [];

    if (!request.borrowerId) {
      errors.push('Borrower ID is required');
    }
    if (!request.productType || !LOAN_PRODUCTS[request.productType]) {
      errors.push('Invalid product type');
    }
    if (!request.requestedAmountCents || request.requestedAmountCents <= 0) {
      errors.push('Requested amount must be positive');
    }
    if (!request.collateralAssetIds || request.collateralAssetIds.length === 0) {
      errors.push('At least one collateral asset is required');
    }

    return errors;
  }

  private calculateNextPaymentDate(frequency: PaymentFrequency): string {
    const date = new Date();
    switch (frequency) {
      case 'WEEKLY':
        date.setDate(date.getDate() + 7);
        break;
      case 'BIWEEKLY':
        date.setDate(date.getDate() + 14);
        break;
      case 'MONTHLY':
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date.toISOString();
  }
}

// Singleton instance
let originationService: OriginationService | null = null;

export function getOriginationService(): OriginationService {
  if (!originationService) {
    originationService = new OriginationService();
  }
  return originationService;
}
