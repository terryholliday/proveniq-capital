/**
 * @file portal/services/application.service.ts
 * @description Borrower Portal - Application Service
 * 
 * Handles loan application lifecycle from the borrower's perspective.
 */

import {
  LoanApplication,
  CollateralAsset,
  LoanOffer,
  ApplicationStatus,
  LoanCalculatorInput,
  LoanCalculatorResult,
  Document,
  DocumentType,
} from '../types';

// ============================================
// IN-MEMORY STORE (Production: Database)
// ============================================

const applications: Map<string, LoanApplication> = new Map();
const offers: Map<string, LoanOffer[]> = new Map();
const documents: Map<string, Document[]> = new Map();

// ============================================
// APPLICATION SERVICE
// ============================================

class ApplicationService {
  /**
   * Create a new loan application (draft)
   */
  async createApplication(
    borrowerId: string,
    data: {
      requestedAmountCents: number;
      requestedTermDays: number;
      purpose: LoanApplication['purpose'];
      purposeDescription?: string;
    }
  ): Promise<LoanApplication> {
    const id = `APP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const application: LoanApplication = {
      id,
      borrowerId,
      requestedAmountCents: data.requestedAmountCents,
      requestedTermDays: data.requestedTermDays,
      purpose: data.purpose,
      purposeDescription: data.purposeDescription,
      collateralAssets: [],
      totalCollateralValueCents: 0,
      ltv: 0,
      status: 'draft',
      statusHistory: [
        { status: 'draft', timestamp: now }
      ],
      createdAt: now,
      updatedAt: now,
    };

    applications.set(id, application);
    documents.set(id, []);

    console.log(`[Portal] Application created: ${id}`);

    return application;
  }

  /**
   * Get application by ID
   */
  async getApplication(applicationId: string): Promise<LoanApplication | null> {
    return applications.get(applicationId) || null;
  }

  /**
   * Get all applications for a borrower
   */
  async getBorrowerApplications(borrowerId: string): Promise<LoanApplication[]> {
    return Array.from(applications.values())
      .filter(app => app.borrowerId === borrowerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Add collateral asset to application
   */
  async addCollateral(
    applicationId: string,
    asset: Omit<CollateralAsset, 'ownershipVerified' | 'anchorBound'>
  ): Promise<LoanApplication> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Cannot modify submitted application');

    const collateral: CollateralAsset = {
      ...asset,
      ownershipVerified: false,
      anchorBound: false,
    };

    app.collateralAssets.push(collateral);
    app.totalCollateralValueCents = app.collateralAssets.reduce(
      (sum, a) => sum + (a.coreValuationCents || a.estimatedValueCents),
      0
    );
    app.ltv = app.requestedAmountCents / app.totalCollateralValueCents * 100;
    app.updatedAt = new Date().toISOString();

    console.log(`[Portal] Collateral added: ${asset.name} ($${asset.estimatedValueCents / 100})`);

    return app;
  }

  /**
   * Remove collateral from application
   */
  async removeCollateral(applicationId: string, assetId: string): Promise<LoanApplication> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Cannot modify submitted application');

    app.collateralAssets = app.collateralAssets.filter(a => a.assetId !== assetId);
    app.totalCollateralValueCents = app.collateralAssets.reduce(
      (sum, a) => sum + (a.coreValuationCents || a.estimatedValueCents),
      0
    );
    app.ltv = app.totalCollateralValueCents > 0 
      ? app.requestedAmountCents / app.totalCollateralValueCents * 100 
      : 0;
    app.updatedAt = new Date().toISOString();

    return app;
  }

  /**
   * Upload document for application
   */
  async uploadDocument(
    applicationId: string,
    type: DocumentType,
    name: string,
    url: string
  ): Promise<Document> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');

    const doc: Document = {
      id: `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      applicationId,
      type,
      name,
      url,
      uploadedAt: new Date().toISOString(),
      verified: false,
    };

    const appDocs = documents.get(applicationId) || [];
    appDocs.push(doc);
    documents.set(applicationId, appDocs);

    console.log(`[Portal] Document uploaded: ${type} - ${name}`);

    return doc;
  }

  /**
   * Get documents for application
   */
  async getDocuments(applicationId: string): Promise<Document[]> {
    return documents.get(applicationId) || [];
  }

  /**
   * Submit application for review
   */
  async submitApplication(applicationId: string): Promise<LoanApplication> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');
    if (app.status !== 'draft') throw new Error('Application already submitted');

    // Validation
    if (app.collateralAssets.length === 0) {
      throw new Error('At least one collateral asset is required');
    }
    if (app.ltv > 80) {
      throw new Error('LTV cannot exceed 80%. Add more collateral or reduce loan amount.');
    }

    const now = new Date().toISOString();
    app.status = 'submitted';
    app.submittedAt = now;
    app.updatedAt = now;
    app.statusHistory.push({ status: 'submitted', timestamp: now });

    console.log(`[Portal] Application submitted: ${applicationId}`);

    // Simulate moving to under_review after submission
    setTimeout(() => {
      this.updateStatus(applicationId, 'under_review', 'Application received and queued for review');
    }, 2000);

    return app;
  }

  /**
   * Update application status (internal)
   */
  async updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    reason?: string
  ): Promise<LoanApplication> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');

    const now = new Date().toISOString();
    app.status = status;
    app.updatedAt = now;
    app.statusHistory.push({ status, timestamp: now, reason });

    if (status === 'approved' || status === 'declined') {
      app.decidedAt = now;
    }

    console.log(`[Portal] Status updated: ${applicationId} → ${status}`);

    return app;
  }

  /**
   * Withdraw application
   */
  async withdrawApplication(applicationId: string): Promise<LoanApplication> {
    const app = applications.get(applicationId);
    if (!app) throw new Error('Application not found');
    if (['funded', 'withdrawn'].includes(app.status)) {
      throw new Error('Cannot withdraw application in current status');
    }

    return this.updateStatus(applicationId, 'withdrawn', 'Withdrawn by borrower');
  }

  /**
   * Get offers for application
   */
  async getOffers(applicationId: string): Promise<LoanOffer[]> {
    return offers.get(applicationId) || [];
  }

  /**
   * Accept an offer
   */
  async acceptOffer(applicationId: string, offerId: string): Promise<LoanOffer> {
    const appOffers = offers.get(applicationId) || [];
    const offer = appOffers.find(o => o.offerId === offerId);
    
    if (!offer) throw new Error('Offer not found');
    if (offer.status !== 'pending') throw new Error('Offer is no longer available');
    if (new Date(offer.validUntil) < new Date()) {
      offer.status = 'expired';
      throw new Error('Offer has expired');
    }

    // Decline other offers
    for (const o of appOffers) {
      if (o.offerId !== offerId && o.status === 'pending') {
        o.status = 'declined';
      }
    }

    offer.status = 'accepted';
    
    // Update application status
    await this.updateStatus(applicationId, 'funded', `Offer accepted from ${offer.lenderName}`);

    console.log(`[Portal] Offer accepted: ${offerId} from ${offer.lenderName}`);

    return offer;
  }

  /**
   * Calculate loan estimate (pre-application)
   */
  calculateLoanEstimate(input: LoanCalculatorInput): LoanCalculatorResult {
    const { loanAmountCents, termMonths, collateralValueCents } = input;
    
    const ltv = (loanAmountCents / collateralValueCents) * 100;
    const warnings: string[] = [];

    // Determine risk tier based on LTV
    let riskTier: 'low' | 'medium' | 'high';
    let aprMin: number;
    let aprMax: number;

    if (ltv <= 40) {
      riskTier = 'low';
      aprMin = 8;
      aprMax = 14;
    } else if (ltv <= 60) {
      riskTier = 'medium';
      aprMin = 14;
      aprMax = 24;
    } else {
      riskTier = 'high';
      aprMin = 24;
      aprMax = 36;
      warnings.push('High LTV may result in higher rates or require additional collateral');
    }

    if (ltv > 80) {
      warnings.push('LTV exceeds 80% - application may be declined');
    }

    // Calculate monthly payments
    const calculateMonthly = (principal: number, annualRate: number, months: number): number => {
      const monthlyRate = annualRate / 100 / 12;
      if (monthlyRate === 0) return principal / months;
      return Math.round(
        principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / 
        (Math.pow(1 + monthlyRate, months) - 1)
      );
    };

    const monthlyMin = calculateMonthly(loanAmountCents, aprMin, termMonths);
    const monthlyMax = calculateMonthly(loanAmountCents, aprMax, termMonths);

    const totalInterestMin = (monthlyMin * termMonths) - loanAmountCents;
    const totalInterestMax = (monthlyMax * termMonths) - loanAmountCents;

    return {
      eligible: ltv <= 80,
      ltv: Math.round(ltv * 100) / 100,
      estimatedAprRange: { min: aprMin, max: aprMax },
      estimatedMonthlyPaymentRange: { minCents: monthlyMin, maxCents: monthlyMax },
      estimatedTotalInterestRange: { minCents: totalInterestMin, maxCents: totalInterestMax },
      riskTier,
      warnings,
    };
  }

  /**
   * Get application statistics for borrower
   */
  async getBorrowerStats(borrowerId: string): Promise<{
    totalApplications: number;
    activeLoans: number;
    totalBorrowedCents: number;
    totalCollateralValueCents: number;
  }> {
    const apps = await this.getBorrowerApplications(borrowerId);
    
    return {
      totalApplications: apps.length,
      activeLoans: apps.filter(a => a.status === 'funded').length,
      totalBorrowedCents: apps
        .filter(a => a.status === 'funded')
        .reduce((sum, a) => sum + a.requestedAmountCents, 0),
      totalCollateralValueCents: apps
        .filter(a => a.status === 'funded')
        .reduce((sum, a) => sum + a.totalCollateralValueCents, 0),
    };
  }
}

// Singleton
let service: ApplicationService | null = null;

export function getApplicationService(): ApplicationService {
  if (!service) {
    service = new ApplicationService();
  }
  return service;
}
