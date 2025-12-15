# Proveniq Capital: Loan Collateral Requirements

> **Version**: 1.0  
> **Date**: December 15, 2025  
> **Status**: Technical Specification

---

## Overview

This document defines the collateral identification and verification requirements for all Proveniq Capital loans. Every loan must capture sufficient information to:

1. **Uniquely identify** the collateral asset
2. **Generate Optical Genome** for visual fingerprinting
3. **Enable Ledger flagging** if loan defaults
4. **Support recovery** through ecosystem-wide blocking

---

## Identification Layers

### Layer 1: Unique Identifiers (Exact Match)

Required identifiers vary by asset class. At least ONE primary identifier is required.

| Asset Class | Primary Identifier | Secondary Identifier | Verification Source |
|-------------|-------------------|---------------------|---------------------|
| Electronics (Phone) | IMEI (15-digit) | Serial Number | Apple/Samsung lookup, carrier DB |
| Electronics (Laptop) | Serial Number | Model + Storage | Manufacturer lookup |
| Electronics (Tablet) | IMEI or Serial | Model Number | Manufacturer lookup |
| Watches | Serial Number (caseback) | Reference Number | Brand registry, Chrono24 |
| Jewelry (Certified) | GIA/AGS Cert Number | N/A | GIA Report Check |
| Jewelry (Uncertified) | N/A (Genome only) | Appraisal reference | N/A |
| Vehicles | VIN (17-character) | License Plate | NMVTIS, Carfax |
| Handbags | Date Code / Serial Stamp | Model Name | Brand-specific verification |
| Sneakers | Size Tag Code / SKU | Model + Size | StockX, GOAT |
| Art | N/A (Genome only) | Provenance docs | Genome + documentation |
| Collectibles | Grading cert # (if graded) | Description | PSA, CGC, NGC lookup |

### Layer 2: Optical Genome (Fuzzy Match)

**Required for ALL loans regardless of asset class.**

The Genome captures visual fingerprint features that persist even if identifiers are removed:
- Surface texture patterns
- Wear signatures
- Manufacturing artifacts
- Micro-scratches and patina
- Edge geometry

---

## Photo Requirements

### Minimum Required Photos

| Photo | Purpose | Requirements |
|-------|---------|--------------|
| **Front/Face** | Primary Genome capture | Well-lit, in focus, full item visible |
| **Back/Reverse** | Secondary Genome + serial location | Serial number clearly visible if present |
| **Serial/Identifier** | Exact match verification | Close-up of serial, IMEI, VIN, or cert |
| **Condition Details** | Damage documentation | Any scratches, dents, wear (minimum 2) |
| **Proof of Possession** | Fraud prevention | Item with dated note or app timestamp |

### Photo Quality Standards

```typescript
interface PhotoRequirements {
  minResolution: { width: 1920, height: 1080 };
  format: 'JPEG' | 'PNG' | 'HEIC';
  maxFileSize: '10MB';
  lighting: 'Even, no harsh shadows';
  focus: 'Sharp, no blur on identifier areas';
  background: 'Neutral, contrasting with item';
}
```

---

## Data Schema

### LoanCollateral Interface

```typescript
interface LoanCollateral {
  // Core identification
  collateralId: string;           // Proveniq-generated UUID
  loanId: string;                 // Parent loan reference
  assetClass: AssetClass;
  
  // Photos (URLs to secure storage)
  photos: {
    front: string;
    back: string;
    serialLocation: string;
    conditionDetails: string[];   // Array of detail photo URLs
    proofOfPossession: string;
  };
  
  // Genome
  genome: {
    hash: string;                 // 256-bit hash of feature vector
    vector: number[];             // Full feature vector (512 dimensions)
    generatedAt: string;          // ISO timestamp
    modelVersion: string;         // Genome model version used
  };
  
  // Asset-specific identifiers
  identifiers: AssetIdentifiers;
  
  // Verification status
  verification: {
    identifierVerified: boolean;  // Cross-checked with external DB
    identifierSource: string;     // e.g., "GIA", "Apple", "NMVTIS"
    genomeGenerated: boolean;
    ownershipVerified: boolean;
    verifiedAt: string;
    verifiedBy: 'SYSTEM' | 'MANUAL';
  };
  
  // Valuation
  valuation: {
    estimatedValue: number;       // USD
    valuationSource: string;      // e.g., "Chrono24", "KBB", "Appraisal"
    valuationDate: string;
    ltvRatio: number;             // Loan-to-value ratio applied
    loanAmount: number;           // Approved loan amount
  };
  
  // Lien status
  lienStatus: {
    status: 'ACTIVE' | 'RELEASED' | 'DEFAULT' | 'RECOVERY_PENDING';
    ledgerEventId: string;        // Reference to Ledger custody event
    defaultedAt?: string;
    recoveredAt?: string;
  };
}

type AssetClass = 
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

interface AssetIdentifiers {
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
  gradingService?: 'PSA' | 'CGC' | 'NGC' | 'BGS' | 'OTHER';
  grade?: string;
  
  // General
  brandModel?: string;
  purchaseReceiptUrl?: string;
  originalPurchaseDate?: string;
}
```

---

## Verification Integrations

### Required External APIs

| Asset Class | API/Service | Purpose | Priority |
|-------------|-------------|---------|----------|
| Electronics (Apple) | Apple GSX / IMEI.info | IMEI validation, lock status | P1 |
| Electronics (Samsung) | Samsung Knox | Serial validation | P2 |
| Watches | Chrono24 API | Market value, serial check | P1 |
| Jewelry | GIA Report Check | Cert verification | P1 |
| Vehicles | NMVTIS | Title status, lien check | P1 |
| Vehicles | Carfax/AutoCheck | History report | P2 |
| Sneakers | StockX API | Authentication, pricing | P2 |
| Collectibles | PSA Cert Verification | Grade verification | P2 |

### Verification Flow

```
LOAN APPLICATION SUBMITTED
        ↓
PHOTO UPLOAD + IDENTIFIER ENTRY
        ↓
┌───────────────────────────────────────┐
│ PARALLEL VERIFICATION                  │
├───────────────────────────────────────┤
│ 1. Genome generation from photos      │
│ 2. Identifier lookup (external API)   │
│ 3. Existing lien check (Ledger)       │
│ 4. Genome similarity search (Ledger)  │
└───────────────────────────────────────┘
        ↓
    ALL PASS?
    ├── YES → Proceed to valuation
    └── NO  → Reject with reason
```

---

## Lien Recording

### On Loan Origination

```typescript
// Publish to Ledger
await ledger.recordEvent({
  eventType: 'custody.changed',
  itemId: collateral.collateralId,
  payload: {
    previousCustodian: borrower.walletId,
    newCustodian: 'proveniq_capital_lien',
    reason: 'LOAN_COLLATERAL',
    loanId: loan.loanId,
    lienAmount: loan.principal,
    identifiers: collateral.identifiers,
    genomeHash: collateral.genome.hash
  }
});
```

### On Loan Default

```typescript
// Update Ledger status
await ledger.recordEvent({
  eventType: 'custody.changed',
  itemId: collateral.collateralId,
  payload: {
    previousCustodian: 'proveniq_capital_lien',
    newCustodian: 'proveniq_capital_recovery',
    reason: 'LOAN_DEFAULT',
    loanId: loan.loanId,
    outstandingBalance: loan.currentBalance,
    defaultDate: new Date().toISOString()
  }
});

// Flag in all Proveniq apps
await eventBus.publish('loan.defaulted', {
  itemId: collateral.collateralId,
  genomeHash: collateral.genome.hash,
  identifiers: collateral.identifiers,
  lienHolder: 'Proveniq Capital',
  outstandingBalance: loan.currentBalance
});
```

---

## Recovery Blocking

### HOME App Check

When user attempts to document an item:

```typescript
async function checkLienBeforeDocumentation(
  newItem: ItemSubmission
): Promise<LienCheckResult> {
  // 1. Exact identifier match
  const identifierMatch = await ledger.query({
    type: 'LIEN_ACTIVE_OR_DEFAULT',
    identifiers: newItem.identifiers
  });
  
  if (identifierMatch) {
    return {
      blocked: true,
      reason: 'IDENTIFIER_MATCH_LIEN',
      message: 'This item has an outstanding lien from Proveniq Capital',
      lienDetails: identifierMatch
    };
  }
  
  // 2. Genome similarity match
  const genomeMatches = await genome.searchSimilar({
    hash: newItem.genomeHash,
    threshold: 0.95,
    filter: { lienStatus: ['DEFAULT', 'RECOVERY_PENDING'] }
  });
  
  if (genomeMatches.length > 0) {
    return {
      blocked: true,
      reason: 'GENOME_MATCH_LIEN',
      message: 'This item visually matches an asset with outstanding lien',
      matchConfidence: genomeMatches[0].similarity,
      lienDetails: genomeMatches[0]
    };
  }
  
  return { blocked: false };
}
```

### Bids App Check

When user attempts to list an item for auction:

```typescript
// Same logic as HOME, but HARD BLOCK (cannot proceed)
if (lienCheck.blocked) {
  throw new Error(`LISTING_BLOCKED: ${lienCheck.reason}`);
}
```

---

## LTV Ratios by Asset Class

| Asset Class | Base LTV | With Verification | With Insurance |
|-------------|----------|-------------------|----------------|
| Watches (Luxury) | 40% | 50% | 60% |
| Jewelry (GIA Certified) | 35% | 45% | 55% |
| Jewelry (Uncertified) | 25% | 35% | 45% |
| Electronics (Phone < 2 years) | 30% | 40% | 50% |
| Electronics (Laptop < 2 years) | 25% | 35% | 45% |
| Vehicles (< 5 years) | 35% | 45% | 55% |
| Handbags (Hermès/Chanel) | 40% | 50% | 60% |
| Sneakers (Limited Edition) | 35% | 45% | 55% |
| Collectibles (Graded) | 40% | 50% | 60% |
| Art | 25% | 35% | 45% |

**Verification bonus**: +10% LTV if identifier verified against external DB  
**Insurance bonus**: +10% LTV if borrower purchases gap coverage

---

## Gap Insurance Integration

### Required for Loans > $5,000

```typescript
interface GapInsuranceRequirement {
  threshold: 5000;  // USD
  premiumRate: 0.015;  // 1.5% of loan value
  coverage: 'LOAN_BALANCE_MINUS_LIQUIDATION_VALUE';
  underwriter: 'TBD';  // Partner insurer
  
  // Borrower options
  paymentOptions: [
    'UPFRONT',           // Pay premium at origination
    'ROLLED_INTO_LOAN',  // Add to principal
    'MONTHLY'            // Pay with loan payments
  ];
}
```

---

## Implementation Checklist

- [ ] Define `LoanCollateral` schema in database
- [ ] Build photo upload flow with quality validation
- [ ] Integrate Genome generation service
- [ ] Build identifier verification integrations (Apple, GIA, NMVTIS)
- [ ] Implement Ledger lien recording on origination
- [ ] Implement Ledger flag update on default
- [ ] Build HOME lien check middleware
- [ ] Build Bids lien check middleware
- [ ] Integrate gap insurance partner
- [ ] Build recovery workflow (collections, credit reporting)

---

## Appendix: Genome Matching Explained

The Optical Genome does NOT read serial numbers. It creates a visual fingerprint from physical features:

| Feature Type | Examples |
|--------------|----------|
| Surface texture | Scratches, grain, patina, polish marks |
| Edge geometry | Wear patterns, micro-deformations |
| Color gradients | Fading, discoloration, UV exposure |
| Manufacturing artifacts | Tool marks, casting bubbles, stitching |
| Wear signatures | Finger touch areas, strap wear, button wear |

**Match thresholds**:
- `> 0.98`: Almost certainly same item
- `> 0.95`: Very likely same item (flag for review)
- `> 0.90`: Possibly same item (manual check)
- `< 0.90`: Different items

Even if serial is filed off, the Genome can still match based on accumulated wear patterns unique to that specific item.
