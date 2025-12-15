/**
 * Proveniq Capital - Collateral Service
 * 
 * Handles collateral registration, verification, lien management,
 * and recovery blocking across the Proveniq ecosystem.
 */

import {
  LoanCollateral,
  AssetClass,
  AssetIdentifiers,
  CollateralPhotos,
  GenomeData,
  VerificationStatus,
  CollateralValuation,
  LienRecord,
  LienCheckResult,
  GenomeMatchResult,
  LTV_RATIOS,
  GAP_INSURANCE_CONFIG,
  LienOriginationEvent,
  LienDefaultEvent,
  LoanDefaultedBroadcast,
} from './types';

// ============================================================================
// COLLATERAL SERVICE
// ============================================================================

export class CollateralService {
  
  // --------------------------------------------------------------------------
  // COLLATERAL REGISTRATION
  // --------------------------------------------------------------------------

  /**
   * Register new collateral for a loan application
   */
  async registerCollateral(params: {
    loanId: string;
    borrowerId: string;
    assetClass: AssetClass;
    photos: CollateralPhotos;
    identifiers: AssetIdentifiers;
  }): Promise<LoanCollateral> {
    // 1. Validate photos meet requirements
    await this.validatePhotos(params.photos);

    // 2. Generate Optical Genome from photos
    const genome = await this.generateGenome(params.photos);

    // 3. Check for existing liens (exact + fuzzy match)
    const lienCheck = await this.checkForLiens({
      identifiers: params.identifiers,
      genomeHash: genome.hash,
    });

    if (lienCheck.blocked) {
      throw new Error(`COLLATERAL_BLOCKED: ${lienCheck.reason} - ${lienCheck.message}`);
    }

    // 4. Verify identifiers against external sources
    const verification = await this.verifyIdentifiers(
      params.assetClass,
      params.identifiers
    );

    // 5. Get valuation
    const valuation = await this.getValuation(
      params.assetClass,
      params.identifiers,
      verification.identifierVerified
    );

    // 6. Create collateral record
    const collateral: LoanCollateral = {
      collateralId: this.generateUUID(),
      loanId: params.loanId,
      borrowerId: params.borrowerId,
      assetClass: params.assetClass,
      photos: params.photos,
      genome,
      identifiers: params.identifiers,
      verification,
      valuation,
      lienStatus: {
        status: 'ACTIVE',
        ledgerEventId: '', // Will be set after Ledger write
        originatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 7. Record lien in Ledger
    const ledgerEventId = await this.recordLienInLedger(collateral);
    collateral.lienStatus.ledgerEventId = ledgerEventId;

    // 8. Save to database
    await this.saveCollateral(collateral);

    return collateral;
  }

  // --------------------------------------------------------------------------
  // GENOME OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Generate Optical Genome from collateral photos
   */
  private async generateGenome(photos: CollateralPhotos): Promise<GenomeData> {
    const CORE_URL = process.env.PROVENIQ_CORE_URL || 'http://localhost:3000';
    
    try {
      const response = await fetch(`${CORE_URL}/api/v1/genome/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: [photos.front, photos.back, ...photos.conditionDetails]
        })
      });

      if (!response.ok) {
        throw new Error(`Core Genome Service Error: ${response.statusText}`);
      }

      const result = await response.json() as { data: { hash: string; vector: number[]; generatedAt: string; modelVersion: string } };
      
      return {
        hash: result.data.hash,
        vector: result.data.vector,
        generatedAt: result.data.generatedAt,
        modelVersion: result.data.modelVersion,
      };
    } catch (error) {
      console.error('[COLLATERAL] Genome Generation Failed:', error);
      // Fallback for dev/demo if Core is offline
      return {
        hash: `mock_hash_${Date.now()}`,
        vector: [],
        generatedAt: new Date().toISOString(),
        modelVersion: 'offline_fallback',
      };
    }
  }

  /**
   * Search for similar Genomes in the Ledger
   */
  private async searchSimilarGenomes(
    genomeHash: string,
    threshold: number = 0.95
  ): Promise<GenomeMatchResult[]> {
    // TODO: Integrate with Ledger Genome search
    // This queries all flagged assets and computes similarity
    
    const matches = await this.callLedgerGenomeSearch({
      hash: genomeHash,
      threshold,
      statusFilter: ['DEFAULT', 'RECOVERY_PENDING', 'STOLEN', 'FRAUD_FLAG'],
    });

    return matches;
  }

  // --------------------------------------------------------------------------
  // LIEN CHECKING
  // --------------------------------------------------------------------------

  /**
   * Check if an item has existing liens (used by HOME, Bids, and Capital)
   */
  async checkForLiens(params: {
    identifiers?: AssetIdentifiers;
    genomeHash?: string;
  }): Promise<LienCheckResult> {
    // 1. Exact identifier match
    if (params.identifiers) {
      const exactMatch = await this.findByIdentifiers(params.identifiers);
      
      if (exactMatch && ['DEFAULT', 'RECOVERY_PENDING'].includes(exactMatch.lienStatus.status)) {
        return {
          blocked: true,
          reason: 'IDENTIFIER_MATCH_LIEN',
          message: 'This item has an outstanding lien from Proveniq Capital',
          lienDetails: {
            lienHolder: 'Proveniq Capital',
            outstandingBalance: exactMatch.valuation.loanAmount, // TODO: Get current balance
            defaultedAt: exactMatch.lienStatus.defaultedAt || '',
            collateralId: exactMatch.collateralId,
          },
        };
      }
    }

    // 2. Genome similarity match
    if (params.genomeHash) {
      const genomeMatches = await this.searchSimilarGenomes(params.genomeHash, 0.95);
      
      if (genomeMatches.length > 0) {
        const topMatch = genomeMatches[0];
        return {
          blocked: true,
          reason: 'GENOME_MATCH_LIEN',
          message: 'This item visually matches an asset with outstanding lien',
          matchConfidence: topMatch.similarity,
          lienDetails: {
            lienHolder: topMatch.lienHolder || 'Proveniq Capital',
            outstandingBalance: topMatch.outstandingBalance || 0,
            defaultedAt: '',
            collateralId: topMatch.matchedCollateralId,
          },
        };
      }
    }

    return { blocked: false };
  }

  // --------------------------------------------------------------------------
  // IDENTIFIER VERIFICATION
  // --------------------------------------------------------------------------

  /**
   * Verify identifiers against external databases via Proveniq Core
   */
  private async verifyIdentifiers(
    assetClass: AssetClass,
    identifiers: AssetIdentifiers
  ): Promise<VerificationStatus> {
    const verification: VerificationStatus = {
      identifierVerified: false,
      genomeGenerated: true,
      ownershipVerified: false,
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'PROVENIQ_CORE',
    };

    const CORE_URL = process.env.PROVENIQ_CORE_URL || 'http://localhost:3000';

    try {
      // Delegate to Proveniq Core Identity Engine
      const response = await fetch(`${CORE_URL}/api/v1/identity/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetClass, identifiers })
      });

      if (response.ok) {
        const result = await response.json() as { data: { verified: boolean; source?: string; issues?: string[] } };
        const { data } = result;
        
        verification.identifierVerified = data.verified;
        verification.identifierSource = data.source as any;
        
        if (data.issues && data.issues.length > 0) {
          verification.notes = data.issues.join('; ');
        }
        
        return verification;
      }
      
      // Fallback to local verification if Core is unavailable
      console.warn('[COLLATERAL] Core Identity API unavailable, falling back to local verification');
    } catch (error) {
      console.error('[COLLATERAL] Core Identity API error:', error);
    }

    // Fallback: Local verification logic
    try {
      switch (assetClass) {
        case 'ELECTRONICS_PHONE':
        case 'ELECTRONICS_TABLET':
          if (identifiers.imei) {
            const result = await this.verifyIMEI(identifiers.imei);
            verification.identifierVerified = result.valid;
            verification.identifierSource = result.source;
            verification.notes = result.notes;
            verification.verifiedBy = 'LOCAL_FALLBACK';
          }
          break;

        case 'WATCH':
          if (identifiers.watchSerial && identifiers.watchBrand) {
            const result = await this.verifyWatchSerial(
              identifiers.watchBrand,
              identifiers.watchSerial
            );
            verification.identifierVerified = result.valid;
            verification.identifierSource = 'CHRONO24';
            verification.verifiedBy = 'LOCAL_FALLBACK';
          }
          break;

        case 'JEWELRY_CERTIFIED':
          if (identifiers.giaCertNumber) {
            const result = await this.verifyGIACert(identifiers.giaCertNumber);
            verification.identifierVerified = result.valid;
            verification.identifierSource = 'GIA';
            verification.verifiedBy = 'LOCAL_FALLBACK';
          }
          break;

        case 'VEHICLE':
          if (identifiers.vin) {
            const result = await this.verifyVIN(identifiers.vin);
            verification.identifierVerified = result.valid;
            verification.identifierSource = 'NMVTIS';
            verification.notes = result.titleStatus;
            verification.verifiedBy = 'LOCAL_FALLBACK';
          }
          break;

        case 'COLLECTIBLES_GRADED':
          if (identifiers.gradingCertNumber && identifiers.gradingService) {
            const result = await this.verifyGradingCert(
              identifiers.gradingService,
              identifiers.gradingCertNumber
            );
            verification.identifierVerified = result.valid;
            verification.identifierSource = identifiers.gradingService;
            verification.verifiedBy = 'LOCAL_FALLBACK';
          }
          break;

        default:
          verification.notes = 'No external verification available for this asset class';
      }
    } catch (error) {
      verification.notes = `Verification failed: ${error}`;
    }

    return verification;
  }

  // --------------------------------------------------------------------------
  // VALUATION
  // --------------------------------------------------------------------------

  /**
   * Get valuation and calculate LTV
   */
  private async getValuation(
    assetClass: AssetClass,
    identifiers: AssetIdentifiers,
    isVerified: boolean
  ): Promise<CollateralValuation> {
    // Get market value from external sources
    const marketValue = await this.getMarketValue(assetClass, identifiers);

    // Get LTV config for asset class
    const ltvConfig = LTV_RATIOS.find(c => c.assetClass === assetClass);
    if (!ltvConfig) {
      throw new Error(`No LTV configuration for asset class: ${assetClass}`);
    }

    // Calculate LTV ratio
    let ltvRatio = ltvConfig.baseLtv;
    if (isVerified) {
      ltvRatio += ltvConfig.verificationBonus;
    }
    // Insurance bonus applied separately at loan approval

    const loanAmount = Math.floor(marketValue * ltvRatio);

    return {
      estimatedValue: marketValue,
      valuationSource: 'MARKET_API', // TODO: Track actual source
      valuationDate: new Date().toISOString().split('T')[0],
      ltvRatio,
      loanAmount,
    };
  }

  // --------------------------------------------------------------------------
  // LIEN MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Record lien in Ledger on loan origination
   */
  private async recordLienInLedger(collateral: LoanCollateral): Promise<string> {
    const event: LienOriginationEvent = {
      eventType: 'custody.changed',
      itemId: collateral.collateralId,
      payload: {
        previousCustodian: collateral.borrowerId,
        newCustodian: 'proveniq_capital_lien',
        reason: 'LOAN_COLLATERAL',
        loanId: collateral.loanId,
        lienAmount: collateral.valuation.loanAmount,
        identifiers: collateral.identifiers,
        genomeHash: collateral.genome.hash,
      },
    };

    const result = await this.publishToLedger(event);
    return result.eventId;
  }

  /**
   * Mark collateral as defaulted
   */
  async markAsDefaulted(collateralId: string, outstandingBalance: number): Promise<void> {
    const collateral = await this.getCollateral(collateralId);
    if (!collateral) {
      throw new Error(`Collateral not found: ${collateralId}`);
    }

    // 1. Update Ledger
    const defaultEvent: LienDefaultEvent = {
      eventType: 'custody.changed',
      itemId: collateral.collateralId,
      payload: {
        previousCustodian: 'proveniq_capital_lien',
        newCustodian: 'proveniq_capital_recovery',
        reason: 'LOAN_DEFAULT',
        loanId: collateral.loanId,
        outstandingBalance,
        defaultDate: new Date().toISOString(),
      },
    };

    await this.publishToLedger(defaultEvent);

    // 2. Broadcast to all Proveniq apps (HOME, Bids, ClaimsIQ)
    const broadcast: LoanDefaultedBroadcast = {
      eventType: 'loan.defaulted',
      itemId: collateral.collateralId,
      genomeHash: collateral.genome.hash,
      identifiers: collateral.identifiers,
      lienHolder: 'Proveniq Capital',
      outstandingBalance,
    };

    await this.publishToEventBus(broadcast);

    // 3. Update local record
    collateral.lienStatus.status = 'DEFAULT';
    collateral.lienStatus.defaultedAt = new Date().toISOString();
    collateral.updatedAt = new Date().toISOString();

    await this.saveCollateral(collateral);
  }

  /**
   * Release lien after loan payoff
   */
  async releaseLien(collateralId: string): Promise<void> {
    const collateral = await this.getCollateral(collateralId);
    if (!collateral) {
      throw new Error(`Collateral not found: ${collateralId}`);
    }

    // Update Ledger
    await this.publishToLedger({
      eventType: 'custody.changed',
      itemId: collateral.collateralId,
      payload: {
        previousCustodian: 'proveniq_capital_lien',
        newCustodian: collateral.borrowerId,
        reason: 'LOAN_PAID_OFF',
        loanId: collateral.loanId,
      },
    });

    // Update local record
    collateral.lienStatus.status = 'RELEASED';
    collateral.lienStatus.releasedAt = new Date().toISOString();
    collateral.updatedAt = new Date().toISOString();

    await this.saveCollateral(collateral);
  }

  // --------------------------------------------------------------------------
  // PROVENANCE-BASED RISK ASSESSMENT
  // --------------------------------------------------------------------------

  /**
   * Get provenance score from Proveniq Core for loan risk assessment
   * Higher provenance = lower risk = better loan terms
   */
  async getProvenanceRiskAssessment(params: {
    photoCount: number;
    receiptCount: number;
    warrantyCount: number;
    genomeVerified: boolean;
    ownershipTransfers: number;
    documentedValue: number;
  }): Promise<{
    provenanceScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    ltvAdjustment: number;
    fraudFlags: string[];
  }> {
    const CORE_URL = process.env.PROVENIQ_CORE_URL || 'http://localhost:3000';

    try {
      const response = await fetch(`${CORE_URL}/api/v1/provenance/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          lastVerifiedAt: new Date().toISOString(),
        })
      });

      if (response.ok) {
        const result = await response.json() as { data: { score: number; fraudFlags?: string[] } };
        const { data } = result;
        
        // Map provenance score to risk level and LTV adjustment
        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        let ltvAdjustment: number;
        
        if (data.score >= 80) {
          riskLevel = 'LOW';
          ltvAdjustment = 0.05; // +5% LTV bonus for excellent provenance
        } else if (data.score >= 60) {
          riskLevel = 'MEDIUM';
          ltvAdjustment = 0;
        } else {
          riskLevel = 'HIGH';
          ltvAdjustment = -0.10; // -10% LTV penalty for poor provenance
        }

        return {
          provenanceScore: data.score,
          riskLevel,
          ltvAdjustment,
          fraudFlags: data.fraudFlags || [],
        };
      }
    } catch (error) {
      console.error('[COLLATERAL] Provenance API error:', error);
    }

    // Fallback: Conservative risk assessment
    return {
      provenanceScore: 50,
      riskLevel: 'MEDIUM',
      ltvAdjustment: 0,
      fraudFlags: ['PROVENANCE_UNAVAILABLE'],
    };
  }

  // --------------------------------------------------------------------------
  // GAP INSURANCE
  // --------------------------------------------------------------------------

  /**
   * Check if gap insurance is required for loan amount
   */
  isGapInsuranceRequired(loanAmount: number): boolean {
    return loanAmount >= GAP_INSURANCE_CONFIG.threshold;
  }

  /**
   * Calculate gap insurance premium
   */
  calculateGapPremium(loanAmount: number): number {
    return Math.ceil(loanAmount * GAP_INSURANCE_CONFIG.premiumRate);
  }

  // --------------------------------------------------------------------------
  // STUB METHODS (TO BE IMPLEMENTED)
  // --------------------------------------------------------------------------

  private generateUUID(): string {
    // TODO: Use proper UUID library
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async validatePhotos(photos: CollateralPhotos): Promise<void> {
    // TODO: Validate photo quality, resolution, format
  }

  private async callGenomeService(params: { photos: string[] }): Promise<{
    hash: string;
    vector: number[];
    modelVersion: string;
  }> {
    // TODO: Call HOME/Genome API
    throw new Error('Genome service integration not implemented');
  }

  private async callLedgerGenomeSearch(params: {
    hash: string;
    threshold: number;
    statusFilter: string[];
  }): Promise<GenomeMatchResult[]> {
    // TODO: Call Ledger API
    return [];
  }

  private async findByIdentifiers(identifiers: AssetIdentifiers): Promise<LoanCollateral | null> {
    // TODO: Query database by identifiers
    return null;
  }

  private async verifyIMEI(imei: string): Promise<{ valid: boolean; source: any; notes?: string }> {
    // TODO: Call IMEI verification API
    return { valid: false, source: 'APPLE_GSX' };
  }

  private async verifyWatchSerial(brand: string, serial: string): Promise<{ valid: boolean }> {
    // TODO: Call Chrono24 or brand API
    return { valid: false };
  }

  private async verifyGIACert(certNumber: string): Promise<{ valid: boolean }> {
    // TODO: Call GIA Report Check API
    return { valid: false };
  }

  private async verifyVIN(vin: string): Promise<{ valid: boolean; titleStatus?: string }> {
    // TODO: Call NMVTIS API
    return { valid: false };
  }

  private async verifyGradingCert(service: string, certNumber: string): Promise<{ valid: boolean }> {
    // TODO: Call PSA/CGC/NGC API
    return { valid: false };
  }

  private async getMarketValue(assetClass: AssetClass, identifiers: AssetIdentifiers): Promise<number> {
    // TODO: Call market value APIs (Chrono24, KBB, StockX, etc.)
    return 0;
  }

  private async publishToLedger(event: any): Promise<{ eventId: string }> {
    // TODO: Call Ledger API
    return { eventId: this.generateUUID() };
  }

  private async publishToEventBus(event: any): Promise<void> {
    // TODO: Publish to Kafka/Pub-Sub
  }

  private async getCollateral(collateralId: string): Promise<LoanCollateral | null> {
    // TODO: Query database
    return null;
  }

  private async saveCollateral(collateral: LoanCollateral): Promise<void> {
    // TODO: Save to database
  }
}

// Export singleton instance
export const collateralService = new CollateralService();
