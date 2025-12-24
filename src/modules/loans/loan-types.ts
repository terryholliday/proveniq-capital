/**
 * PROVENIQ Capital - Loan Types & Policies
 * 
 * Defines loan products, terms, and pricing policies.
 * This is the core of the Origination Engine.
 */

import { AssetClass, LTV_RATIOS } from './types';

// ============================================================================
// LOAN PRODUCT TYPES
// ============================================================================

export type LoanProductType =
  | 'ASSET_BACKED_CONSUMER'     // Home users - jewelry, electronics, collectibles
  | 'ASSET_BACKED_VEHICLE'      // Home users - vehicle-secured loans
  | 'PROPERTY_BRIDGE'           // Properties users - bridge financing
  | 'PROPERTY_RENOVATION'       // Properties users - renovation loans
  | 'EQUIPMENT_FINANCE'         // Ops users - equipment financing
  | 'INVENTORY_LINE';           // Ops users - inventory working capital

export type LoanStatus =
  | 'DRAFT'                     // Application started, not submitted
  | 'PENDING_VERIFICATION'      // Awaiting collateral verification
  | 'PENDING_APPROVAL'          // Awaiting underwriting decision
  | 'APPROVED'                  // Approved, awaiting borrower acceptance
  | 'ACTIVE'                    // Loan is live and servicing
  | 'DELINQUENT'               // Missed payment(s)
  | 'DEFAULT'                   // Default triggered
  | 'PAID_OFF'                  // Fully repaid
  | 'RECOVERED'                 // Collateral liquidated
  | 'CANCELLED';                // Cancelled before funding

export type PaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

// ============================================================================
// LOAN PRODUCT DEFINITIONS
// ============================================================================

export interface LoanProduct {
  type: LoanProductType;
  name: string;
  description: string;
  sourceApp: 'HOME' | 'PROPERTIES' | 'OPS';
  minAmount: number;           // In cents
  maxAmount: number;           // In cents
  minTermDays: number;
  maxTermDays: number;
  baseAprBps: number;          // Base APR in basis points (500 = 5.00%)
  riskPremiumBps: number;      // Added based on risk score
  originationFeeBps: number;   // Origination fee in basis points
  allowedAssetClasses: AssetClass[];
  requiresInsurance: boolean;
  requiresAnchor: boolean;     // Requires Anchors hardware binding
}

export const LOAN_PRODUCTS: Record<LoanProductType, LoanProduct> = {
  ASSET_BACKED_CONSUMER: {
    type: 'ASSET_BACKED_CONSUMER',
    name: 'Personal Asset Loan',
    description: 'Borrow against verified personal assets',
    sourceApp: 'HOME',
    minAmount: 50000,          // $500
    maxAmount: 5000000,        // $50,000
    minTermDays: 30,
    maxTermDays: 365,
    baseAprBps: 1200,          // 12.00%
    riskPremiumBps: 800,       // Up to 8.00% added
    originationFeeBps: 200,    // 2.00%
    allowedAssetClasses: [
      'WATCH', 'JEWELRY_CERTIFIED', 'JEWELRY_UNCERTIFIED',
      'ELECTRONICS_PHONE', 'ELECTRONICS_LAPTOP', 'ELECTRONICS_TABLET',
      'HANDBAG', 'SNEAKERS', 'COLLECTIBLES_GRADED', 'COLLECTIBLES_UNGRADED', 'ART',
    ],
    requiresInsurance: true,
    requiresAnchor: false,
  },
  ASSET_BACKED_VEHICLE: {
    type: 'ASSET_BACKED_VEHICLE',
    name: 'Vehicle-Secured Loan',
    description: 'Borrow against your verified vehicle',
    sourceApp: 'HOME',
    minAmount: 100000,         // $1,000
    maxAmount: 10000000,       // $100,000
    minTermDays: 90,
    maxTermDays: 730,
    baseAprBps: 900,           // 9.00%
    riskPremiumBps: 600,       // Up to 6.00% added
    originationFeeBps: 150,    // 1.50%
    allowedAssetClasses: ['VEHICLE'],
    requiresInsurance: true,
    requiresAnchor: true,      // GPS tracker required
  },
  PROPERTY_BRIDGE: {
    type: 'PROPERTY_BRIDGE',
    name: 'Property Bridge Loan',
    description: 'Short-term financing for property transactions',
    sourceApp: 'PROPERTIES',
    minAmount: 1000000,        // $10,000
    maxAmount: 50000000,       // $500,000
    minTermDays: 30,
    maxTermDays: 365,
    baseAprBps: 1000,          // 10.00%
    riskPremiumBps: 400,       // Up to 4.00% added
    originationFeeBps: 250,    // 2.50%
    allowedAssetClasses: [],   // Property-backed, not asset-backed
    requiresInsurance: true,
    requiresAnchor: false,
  },
  PROPERTY_RENOVATION: {
    type: 'PROPERTY_RENOVATION',
    name: 'Renovation Financing',
    description: 'Finance property improvements',
    sourceApp: 'PROPERTIES',
    minAmount: 500000,         // $5,000
    maxAmount: 25000000,       // $250,000
    minTermDays: 90,
    maxTermDays: 548,
    baseAprBps: 1100,          // 11.00%
    riskPremiumBps: 500,       // Up to 5.00% added
    originationFeeBps: 200,    // 2.00%
    allowedAssetClasses: [],   // Property-backed
    requiresInsurance: true,
    requiresAnchor: false,
  },
  EQUIPMENT_FINANCE: {
    type: 'EQUIPMENT_FINANCE',
    name: 'Equipment Financing',
    description: 'Finance business equipment purchases',
    sourceApp: 'OPS',
    minAmount: 500000,         // $5,000
    maxAmount: 50000000,       // $500,000
    minTermDays: 180,
    maxTermDays: 1095,         // 3 years
    baseAprBps: 800,           // 8.00%
    riskPremiumBps: 400,       // Up to 4.00% added
    originationFeeBps: 150,    // 1.50%
    allowedAssetClasses: ['ELECTRONICS_OTHER'],
    requiresInsurance: true,
    requiresAnchor: true,      // Equipment tracking required
  },
  INVENTORY_LINE: {
    type: 'INVENTORY_LINE',
    name: 'Inventory Credit Line',
    description: 'Revolving credit against verified inventory',
    sourceApp: 'OPS',
    minAmount: 1000000,        // $10,000
    maxAmount: 100000000,      // $1,000,000
    minTermDays: 30,
    maxTermDays: 365,
    baseAprBps: 1000,          // 10.00%
    riskPremiumBps: 600,       // Up to 6.00% added
    originationFeeBps: 100,    // 1.00%
    allowedAssetClasses: [],   // Inventory-backed
    requiresInsurance: true,
    requiresAnchor: false,
  },
};

// ============================================================================
// LOAN APPLICATION
// ============================================================================

export interface LoanApplication {
  id: string;
  borrowerId: string;
  borrowerType: 'CONSUMER' | 'LANDLORD' | 'BUSINESS';
  sourceApp: 'HOME' | 'PROPERTIES' | 'OPS';
  productType: LoanProductType;
  
  // Request
  requestedAmountCents: number;
  requestedTermDays: number;
  paymentFrequency: PaymentFrequency;
  purpose: string;
  
  // Collateral (PAIDs from Core)
  collateralAssetIds: string[];  // PROVENIQ Asset IDs
  
  // Calculated
  approvedAmountCents?: number;
  approvedTermDays?: number;
  aprBps?: number;
  originationFeeCents?: number;
  monthlyPaymentCents?: number;
  totalInterestCents?: number;
  ltvRatio?: number;
  
  // Status
  status: LoanStatus;
  riskScore?: number;           // 0-100 from Core FraudScorer
  underwritingNotes?: string;
  
  // Timestamps
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  fundedAt?: string;
  maturityDate?: string;
  
  // Covenants
  covenantIds: string[];
}

// ============================================================================
// ACTIVE LOAN
// ============================================================================

export interface Loan {
  id: string;
  applicationId: string;
  borrowerId: string;
  productType: LoanProductType;
  
  // Terms
  principalCents: number;
  aprBps: number;
  termDays: number;
  paymentFrequency: PaymentFrequency;
  monthlyPaymentCents: number;
  
  // Balances
  outstandingPrincipalCents: number;
  accruedInterestCents: number;
  totalPaidCents: number;
  
  // Collateral
  collateralAssetIds: string[];
  totalCollateralValueCents: number;
  currentLtvRatio: number;
  
  // Status
  status: LoanStatus;
  daysDelinquent: number;
  nextPaymentDueDate: string;
  
  // Timestamps
  fundedAt: string;
  maturityDate: string;
  lastPaymentDate?: string;
  paidOffAt?: string;
  defaultedAt?: string;
  
  // Covenants
  activeCovenants: string[];
  breachedCovenants: string[];
}

// ============================================================================
// RISK PRICING
// ============================================================================

export interface RiskPricingInput {
  productType: LoanProductType;
  requestedAmountCents: number;
  collateralValueCents: number;
  borrowerRiskScore: number;     // 0-100 from Core
  hasInsurance: boolean;
  hasAnchor: boolean;
  isVerified: boolean;
}

export interface RiskPricingOutput {
  approvedAmountCents: number;
  ltvRatio: number;
  baseAprBps: number;
  riskAdjustmentBps: number;
  finalAprBps: number;
  originationFeeCents: number;
  monthlyPaymentCents: number;
  totalInterestCents: number;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'DECLINED';
  pricingNotes: string[];
}

/**
 * Calculate risk-adjusted pricing for a loan.
 */
export function calculateRiskPricing(input: RiskPricingInput): RiskPricingOutput {
  const product = LOAN_PRODUCTS[input.productType];
  const notes: string[] = [];
  
  // Calculate LTV
  const rawLtv = input.requestedAmountCents / input.collateralValueCents;
  
  // Get max LTV for this product (use first allowed asset class as default)
  const ltvConfig = LTV_RATIOS.find(r => 
    product.allowedAssetClasses.includes(r.assetClass)
  ) || { baseLtv: 0.30, verificationBonus: 0.10, insuranceBonus: 0.10, assetClass: 'ELECTRONICS_OTHER' as AssetClass };
  
  let maxLtv = ltvConfig.baseLtv;
  if (input.isVerified) {
    maxLtv += ltvConfig.verificationBonus;
    notes.push('Verification bonus applied');
  }
  if (input.hasInsurance) {
    maxLtv += ltvConfig.insuranceBonus;
    notes.push('Insurance bonus applied');
  }
  
  // Cap at max LTV
  const effectiveLtv = Math.min(rawLtv, maxLtv);
  const approvedAmount = Math.min(
    input.requestedAmountCents,
    Math.floor(input.collateralValueCents * maxLtv)
  );
  
  // Risk tier based on borrower score
  let riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'DECLINED';
  let riskAdjustmentBps: number;
  
  if (input.borrowerRiskScore >= 80) {
    riskTier = 'DECLINED';
    riskAdjustmentBps = 0;
    notes.push('Risk score too high - declined');
  } else if (input.borrowerRiskScore >= 60) {
    riskTier = 'HIGH';
    riskAdjustmentBps = product.riskPremiumBps;
    notes.push('High risk tier - full premium applied');
  } else if (input.borrowerRiskScore >= 30) {
    riskTier = 'MEDIUM';
    riskAdjustmentBps = Math.floor(product.riskPremiumBps * 0.5);
    notes.push('Medium risk tier - 50% premium applied');
  } else {
    riskTier = 'LOW';
    riskAdjustmentBps = 0;
    notes.push('Low risk tier - no premium');
  }
  
  // Calculate final APR
  const finalAprBps = product.baseAprBps + riskAdjustmentBps;
  
  // Calculate fees and payments
  const originationFeeCents = Math.floor(approvedAmount * product.originationFeeBps / 10000);
  
  // Simple interest calculation (30/360)
  const dailyRate = finalAprBps / 10000 / 360;
  const termDays = product.maxTermDays;
  const totalInterestCents = Math.floor(approvedAmount * dailyRate * termDays);
  const totalRepayment = approvedAmount + totalInterestCents;
  const monthlyPaymentCents = Math.ceil(totalRepayment / (termDays / 30));
  
  return {
    approvedAmountCents: riskTier === 'DECLINED' ? 0 : approvedAmount,
    ltvRatio: effectiveLtv,
    baseAprBps: product.baseAprBps,
    riskAdjustmentBps,
    finalAprBps,
    originationFeeCents,
    monthlyPaymentCents,
    totalInterestCents,
    riskTier,
    pricingNotes: notes,
  };
}
