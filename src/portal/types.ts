/**
 * @file portal/types.ts
 * @description Borrower Portal type definitions
 */

// ============================================
// APPLICATION TYPES
// ============================================

export interface BorrowerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
  };
  createdAt: string;
}

export interface CollateralAsset {
  assetId: string;
  paid?: string; // PROVENIQ Asset ID
  name: string;
  category: string;
  description?: string;
  
  // Valuation
  estimatedValueCents: number;
  coreValuationCents?: number;
  valuationConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Provenance
  provenanceScore?: number;
  provenanceGrade?: string;
  
  // Evidence
  photoUrls: string[];
  receiptUrl?: string;
  serialNumber?: string;
  
  // Status
  ownershipVerified: boolean;
  anchorBound: boolean;
}

export interface LoanApplication {
  id: string;
  borrowerId: string;
  
  // Request
  requestedAmountCents: number;
  requestedTermDays: number;
  purpose: 'personal' | 'business' | 'emergency' | 'consolidation' | 'other';
  purposeDescription?: string;
  
  // Collateral
  collateralAssets: CollateralAsset[];
  totalCollateralValueCents: number;
  
  // Calculated
  ltv: number;
  
  // Status
  status: ApplicationStatus;
  statusHistory: StatusChange[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  decidedAt?: string;
}

export type ApplicationStatus = 
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'documents_required'
  | 'approved'
  | 'declined'
  | 'funded'
  | 'withdrawn';

export interface StatusChange {
  status: ApplicationStatus;
  timestamp: string;
  reason?: string;
  actor?: string;
}

// ============================================
// LOAN OFFER TYPES
// ============================================

export interface LoanOffer {
  offerId: string;
  applicationId: string;
  lenderId: string;
  lenderName: string;
  
  // Terms
  principalCents: number;
  aprPercent: number;
  termDays: number;
  
  // Payments
  monthlyPaymentCents: number;
  totalInterestCents: number;
  totalRepaymentCents: number;
  
  // Fees
  originationFeeCents: number;
  originationFeePercent: number;
  
  // Conditions
  conditions: string[];
  
  // Validity
  validUntil: string;
  
  // Status
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

// ============================================
// DOCUMENT TYPES
// ============================================

export interface Document {
  id: string;
  applicationId: string;
  type: DocumentType;
  name: string;
  url: string;
  uploadedAt: string;
  verified: boolean;
  verifiedAt?: string;
}

export type DocumentType = 
  | 'id_front'
  | 'id_back'
  | 'proof_of_income'
  | 'proof_of_address'
  | 'asset_photo'
  | 'asset_receipt'
  | 'bank_statement'
  | 'other';

// ============================================
// CALCULATOR TYPES
// ============================================

export interface LoanCalculatorInput {
  loanAmountCents: number;
  termMonths: number;
  collateralValueCents: number;
}

export interface LoanCalculatorResult {
  eligible: boolean;
  ltv: number;
  estimatedAprRange: { min: number; max: number };
  estimatedMonthlyPaymentRange: { minCents: number; maxCents: number };
  estimatedTotalInterestRange: { minCents: number; maxCents: number };
  riskTier: 'low' | 'medium' | 'high';
  warnings: string[];
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
