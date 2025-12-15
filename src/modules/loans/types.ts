/**
 * Proveniq Capital - Loan Collateral Types
 * 
 * Defines the data structures for loan collateral identification,
 * verification, and lien management.
 */

// ============================================================================
// ASSET CLASSES
// ============================================================================

export type AssetClass =
  | 'ELECTRONICS_PHONE'
  | 'ELECTRONICS_LAPTOP'
  | 'ELECTRONICS_TABLET'
  | 'ELECTRONICS_OTHER'
  | 'WATCH'
  | 'JEWELRY_CERTIFIED'
  | 'JEWELRY_UNCERTIFIED'
  | 'VEHICLE'
  | 'HANDBAG'
  | 'SNEAKERS'
  | 'ART'
  | 'COLLECTIBLES_GRADED'
  | 'COLLECTIBLES_UNGRADED';

export type LienStatus = 'ACTIVE' | 'RELEASED' | 'DEFAULT' | 'RECOVERY_PENDING';

export type VerificationSource =
  | 'APPLE_GSX'
  | 'SAMSUNG_KNOX'
  | 'GIA'
  | 'AGS'
  | 'NMVTIS'
  | 'CARFAX'
  | 'CHRONO24'
  | 'STOCKX'
  | 'PSA'
  | 'CGC'
  | 'NGC'
  | 'BGS'
  | 'OTHER'
  | 'MANUAL';

export type GradingService = 'PSA' | 'CGC' | 'NGC' | 'BGS' | 'OTHER';

// ============================================================================
// PHOTO REQUIREMENTS
// ============================================================================

export interface CollateralPhotos {
  /** Front/face view - primary Genome capture */
  front: string;
  /** Back/reverse view - secondary Genome + serial location */
  back: string;
  /** Close-up of serial, IMEI, VIN, or certification */
  serialLocation: string;
  /** Condition detail photos (scratches, dents, wear) */
  conditionDetails: string[];
  /** Item with dated note or app timestamp for fraud prevention */
  proofOfPossession: string;
}

export interface PhotoRequirements {
  minResolution: { width: number; height: number };
  format: ('JPEG' | 'PNG' | 'HEIC')[];
  maxFileSize: string;
  lighting: string;
  focus: string;
  background: string;
}

export const PHOTO_REQUIREMENTS: PhotoRequirements = {
  minResolution: { width: 1920, height: 1080 },
  format: ['JPEG', 'PNG', 'HEIC'],
  maxFileSize: '10MB',
  lighting: 'Even, no harsh shadows',
  focus: 'Sharp, no blur on identifier areas',
  background: 'Neutral, contrasting with item',
};

// ============================================================================
// ASSET IDENTIFIERS
// ============================================================================

export interface AssetIdentifiers {
  // Electronics
  imei?: string;
  serialNumber?: string;
  modelNumber?: string;
  storageCapacity?: string;
  carrier?: string;

  // Watches
  watchSerial?: string;
  watchReference?: string;
  watchBrand?: string;
  watchModel?: string;
  movementSerial?: string;

  // Vehicles
  vin?: string;
  licensePlate?: string;
  titleNumber?: string;
  odometerReading?: number;

  // Jewelry
  giaCertNumber?: string;
  agsCertNumber?: string;
  metalType?: string;
  caratWeight?: number;
  stoneType?: string;

  // Handbags
  dateCode?: string;
  bagModel?: string;
  bagBrand?: string;

  // Sneakers
  sizeTagCode?: string;
  sku?: string;
  size?: string;

  // Collectibles
  gradingCertNumber?: string;
  gradingService?: GradingService;
  grade?: string;

  // General
  brandModel?: string;
  purchaseReceiptUrl?: string;
  originalPurchaseDate?: string;
}

// ============================================================================
// OPTICAL GENOME
// ============================================================================

export interface GenomeData {
  /** 256-bit hash of feature vector for quick comparison */
  hash: string;
  /** Full feature vector (512 dimensions) for similarity matching */
  vector: number[];
  /** ISO timestamp when Genome was generated */
  generatedAt: string;
  /** Version of Genome model used */
  modelVersion: string;
}

export interface GenomeMatchResult {
  /** Similarity score 0.0 to 1.0 */
  similarity: number;
  /** Matched item's collateral ID */
  matchedCollateralId: string;
  /** Lien status of matched item */
  lienStatus: LienStatus;
  /** Lien holder if applicable */
  lienHolder?: string;
  /** Outstanding balance if in default */
  outstandingBalance?: number;
}

// ============================================================================
// VERIFICATION
// ============================================================================

export interface VerificationStatus {
  /** Whether identifier was cross-checked with external DB */
  identifierVerified: boolean;
  /** Source used for verification */
  identifierSource?: VerificationSource;
  /** Whether Genome was successfully generated */
  genomeGenerated: boolean;
  /** Whether ownership was verified (receipt, prior Proveniq record) */
  ownershipVerified: boolean;
  /** ISO timestamp of verification */
  verifiedAt: string;
  /** How verification was performed */
  verifiedBy: 'SYSTEM' | 'MANUAL' | 'PROVENIQ_CORE' | 'LOCAL_FALLBACK';
  /** Any verification errors or warnings */
  notes?: string;
}

// ============================================================================
// VALUATION
// ============================================================================

export interface CollateralValuation {
  /** Estimated market value in USD */
  estimatedValue: number;
  /** Source of valuation */
  valuationSource: string;
  /** ISO date of valuation */
  valuationDate: string;
  /** Loan-to-value ratio applied */
  ltvRatio: number;
  /** Approved loan amount based on LTV */
  loanAmount: number;
}

export interface LtvConfig {
  assetClass: AssetClass;
  baseLtv: number;
  verificationBonus: number;
  insuranceBonus: number;
}

export const LTV_RATIOS: LtvConfig[] = [
  { assetClass: 'WATCH', baseLtv: 0.40, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'JEWELRY_CERTIFIED', baseLtv: 0.35, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'JEWELRY_UNCERTIFIED', baseLtv: 0.25, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'ELECTRONICS_PHONE', baseLtv: 0.30, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'ELECTRONICS_LAPTOP', baseLtv: 0.25, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'ELECTRONICS_TABLET', baseLtv: 0.25, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'ELECTRONICS_OTHER', baseLtv: 0.20, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'VEHICLE', baseLtv: 0.35, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'HANDBAG', baseLtv: 0.40, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'SNEAKERS', baseLtv: 0.35, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'COLLECTIBLES_GRADED', baseLtv: 0.40, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'COLLECTIBLES_UNGRADED', baseLtv: 0.30, verificationBonus: 0.10, insuranceBonus: 0.10 },
  { assetClass: 'ART', baseLtv: 0.25, verificationBonus: 0.10, insuranceBonus: 0.10 },
];

// ============================================================================
// LIEN STATUS
// ============================================================================

export interface LienRecord {
  /** Current lien status */
  status: LienStatus;
  /** Reference to Ledger custody event */
  ledgerEventId: string;
  /** ISO timestamp when loan was originated */
  originatedAt: string;
  /** ISO timestamp when default occurred (if applicable) */
  defaultedAt?: string;
  /** ISO timestamp when asset was recovered (if applicable) */
  recoveredAt?: string;
  /** ISO timestamp when lien was released (if applicable) */
  releasedAt?: string;
}

// ============================================================================
// LOAN COLLATERAL (MAIN INTERFACE)
// ============================================================================

export interface LoanCollateral {
  /** Proveniq-generated UUID for this collateral record */
  collateralId: string;
  /** Parent loan reference */
  loanId: string;
  /** Borrower's wallet/user ID */
  borrowerId: string;
  /** Asset classification */
  assetClass: AssetClass;
  /** Photos of the collateral */
  photos: CollateralPhotos;
  /** Optical Genome data */
  genome: GenomeData;
  /** Asset-specific identifiers */
  identifiers: AssetIdentifiers;
  /** Verification status */
  verification: VerificationStatus;
  /** Valuation details */
  valuation: CollateralValuation;
  /** Lien status and history */
  lienStatus: LienRecord;
  /** ISO timestamp of record creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// ============================================================================
// LIEN CHECK RESULTS
// ============================================================================

export type LienCheckReason =
  | 'IDENTIFIER_MATCH_LIEN'
  | 'GENOME_MATCH_LIEN'
  | 'STOLEN_REPORT'
  | 'FRAUD_FLAG';

export interface LienCheckResult {
  /** Whether the item is blocked */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  reason?: LienCheckReason;
  /** Human-readable message */
  message?: string;
  /** Confidence of Genome match (if applicable) */
  matchConfidence?: number;
  /** Details of the lien */
  lienDetails?: {
    lienHolder: string;
    outstandingBalance: number;
    defaultedAt: string;
    collateralId: string;
  };
}

// ============================================================================
// GAP INSURANCE
// ============================================================================

export interface GapInsuranceConfig {
  /** Loan amount threshold requiring gap insurance */
  threshold: number;
  /** Premium rate as decimal (e.g., 0.015 = 1.5%) */
  premiumRate: number;
  /** Coverage description */
  coverage: string;
  /** Underwriter partner */
  underwriter: string;
  /** Available payment options */
  paymentOptions: ('UPFRONT' | 'ROLLED_INTO_LOAN' | 'MONTHLY')[];
}

export const GAP_INSURANCE_CONFIG: GapInsuranceConfig = {
  threshold: 5000,
  premiumRate: 0.015,
  coverage: 'LOAN_BALANCE_MINUS_LIQUIDATION_VALUE',
  underwriter: 'TBD',
  paymentOptions: ['UPFRONT', 'ROLLED_INTO_LOAN', 'MONTHLY'],
};

export interface GapInsurancePolicy {
  /** Policy ID from underwriter */
  policyId: string;
  /** Associated loan ID */
  loanId: string;
  /** Premium amount paid */
  premiumAmount: number;
  /** How premium was paid */
  paymentMethod: 'UPFRONT' | 'ROLLED_INTO_LOAN' | 'MONTHLY';
  /** Coverage amount (loan balance at origination) */
  coverageAmount: number;
  /** Policy start date */
  effectiveDate: string;
  /** Policy end date (loan maturity) */
  expirationDate: string;
  /** Current policy status */
  status: 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
}

// ============================================================================
// LEDGER EVENTS
// ============================================================================

export interface LienOriginationEvent {
  eventType: 'custody.changed';
  itemId: string;
  payload: {
    previousCustodian: string;
    newCustodian: 'proveniq_capital_lien';
    reason: 'LOAN_COLLATERAL';
    loanId: string;
    lienAmount: number;
    identifiers: AssetIdentifiers;
    genomeHash: string;
  };
}

export interface LienDefaultEvent {
  eventType: 'custody.changed';
  itemId: string;
  payload: {
    previousCustodian: 'proveniq_capital_lien';
    newCustodian: 'proveniq_capital_recovery';
    reason: 'LOAN_DEFAULT';
    loanId: string;
    outstandingBalance: number;
    defaultDate: string;
  };
}

export interface LoanDefaultedBroadcast {
  eventType: 'loan.defaulted';
  itemId: string;
  genomeHash: string;
  identifiers: AssetIdentifiers;
  lienHolder: string;
  outstandingBalance: number;
}
