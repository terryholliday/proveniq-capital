/**
 * PROVENIQ Capital - Origination API Routes
 * 
 * REST endpoints for the Origination Engine.
 */

import { Router, Request, Response } from 'express';
import { getOriginationService, OriginationRequest } from '../modules/loans/origination.service';
import { LOAN_PRODUCTS, LoanProductType } from '../modules/loans/loan-types';
import { coreClient } from '../core/core-client';
import { getAgentOrchestrator } from '../agents/orchestrator';

const router = Router();
const origination = getOriginationService();

// ============================================================================
// PRODUCT CATALOG
// ============================================================================

/**
 * GET /origination/products
 * List all available loan products.
 */
router.get('/products', (_req: Request, res: Response) => {
  const products = Object.values(LOAN_PRODUCTS).map(p => ({
    type: p.type,
    name: p.name,
    description: p.description,
    sourceApp: p.sourceApp,
    minAmount: p.minAmount,
    maxAmount: p.maxAmount,
    minTermDays: p.minTermDays,
    maxTermDays: p.maxTermDays,
    baseAprBps: p.baseAprBps,
    requiresInsurance: p.requiresInsurance,
    requiresAnchor: p.requiresAnchor,
  }));

  res.json({ products });
});

/**
 * GET /origination/products/:type
 * Get details for a specific loan product.
 */
router.get('/products/:type', (req: Request, res: Response): void => {
  const productType = req.params.type as LoanProductType;
  const product = LOAN_PRODUCTS[productType];

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  res.json({ product });
});

// ============================================================================
// OFFER PREVIEW
// ============================================================================

/**
 * POST /origination/preview
 * Get a loan offer preview without creating an application.
 */
router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  const {
    productType,
    requestedAmountCents,
    collateralValueCents,
    borrowerRiskScore = 30,
  } = req.body;

  if (!productType || !requestedAmountCents || !collateralValueCents) {
    res.status(400).json({
      error: 'Missing required fields: productType, requestedAmountCents, collateralValueCents',
    });
    return;
  }

  const result = await origination.previewOffer(
    productType,
    requestedAmountCents,
    collateralValueCents,
    borrowerRiskScore,
  );

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    offer: result.pricing,
    disclaimer: 'This is a preliminary offer. Final terms subject to underwriting.',
  });
});

// ============================================================================
// APPLICATION LIFECYCLE
// ============================================================================

/**
 * POST /origination/applications
 * Create a new loan application.
 */
router.post('/applications', async (req: Request, res: Response): Promise<void> => {
  const request: OriginationRequest = {
    borrowerId: req.body.borrowerId,
    borrowerType: req.body.borrowerType,
    sourceApp: req.body.sourceApp,
    productType: req.body.productType,
    requestedAmountCents: req.body.requestedAmountCents,
    requestedTermDays: req.body.requestedTermDays,
    paymentFrequency: req.body.paymentFrequency || 'MONTHLY',
    purpose: req.body.purpose,
    collateralAssetIds: req.body.collateralAssetIds,
  };

  const result = await origination.createApplication(request);

  if (!result.success) {
    res.status(400).json({
      error: result.error,
      validationErrors: result.validationErrors,
    });
    return;
  }

  res.status(201).json({ application: result.application });
});

/**
 * POST /origination/applications/:id/submit
 * Submit application for underwriting.
 */
router.post('/applications/:id/submit', async (req: Request, res: Response): Promise<void> => {
  const applicationId = req.params.id;
  const {
    collateralValueCents,
    borrowerRiskScore,
    hasInsurance = false,
    hasAnchor = false,
    isVerified = false,
    collateralAssetIds = [],
    borrowerId,
  } = req.body;

  if (!collateralValueCents) {
    res.status(400).json({ error: 'collateralValueCents is required' });
    return;
  }

  // P0: Get Core LTV and collateral health scores
  let coreLtvResult = null;
  let coreCollateralHealth = null;
  let coreBorrowerRisk = null;
  
  try {
    // Calculate LTV via Core (use first collateral asset)
    if (collateralAssetIds.length > 0) {
      const primaryAssetId = collateralAssetIds[0];
      coreLtvResult = await coreClient.calculateLTV(
        primaryAssetId,
        collateralValueCents / 100,
        'collateral' // category
      );
      if (coreLtvResult) {
        console.log(`[Core] LTV: ${coreLtvResult.ltv}%, Max loan: $${coreLtvResult.maxLoanAmount}`);
      }

      // Get collateral health score
      coreCollateralHealth = await coreClient.getCollateralHealthScore(
        primaryAssetId,
        'collateral'
      );
      if (coreCollateralHealth) {
        console.log(`[Core] Collateral health: ${coreCollateralHealth.grade} (${coreCollateralHealth.overallScore})`);
      }
    }

    // Get borrower risk from Core
    if (borrowerId) {
      coreBorrowerRisk = await coreClient.getBorrowerRisk(borrowerId, collateralValueCents / 100);
      if (coreBorrowerRisk) {
        console.log(`[Core] Borrower risk: ${coreBorrowerRisk.riskLevel} (${coreBorrowerRisk.fraudScore})`);
      }
    }
  } catch (e) {
    console.warn('[Core] LTV/collateral scoring unavailable');
  }

  // Use Core risk score if available, otherwise use provided score
  const effectiveRiskScore = coreBorrowerRisk?.fraudScore ?? borrowerRiskScore ?? 30;

  const result = await origination.submitForUnderwriting(
    applicationId,
    collateralValueCents,
    effectiveRiskScore,
    hasInsurance,
    hasAnchor,
    isVerified,
  );

  if (!result.approved) {
    res.status(200).json({
      approved: false,
      application: result.application,
      declineReasons: result.declineReasons,
    });
    return;
  }

  res.json({
    approved: true,
    application: result.application,
    covenants: result.covenants,
    message: 'Application approved. Borrower must accept terms to proceed.',
  });
});

/**
 * POST /origination/applications/:id/fund
 * Fund an approved loan (after borrower accepts).
 */
router.post('/applications/:id/fund', async (req: Request, res: Response): Promise<void> => {
  const applicationId = req.params.id;

  const result = await origination.fundLoan(applicationId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(201).json({
    loan: result.loan,
    ledgerTransactionId: result.ledgerTransactionId,
    message: 'Loan funded successfully. Disbursement in progress.',
  });
});

// ============================================================================
// LOAN SERVICING (placeholder)
// ============================================================================

/**
 * GET /origination/loans/:id
 * Get loan details.
 */
router.get('/loans/:id', async (_req: Request, res: Response): Promise<void> => {
  // TODO: Implement loan retrieval
  res.status(501).json({ error: 'Not implemented' });
});

/**
 * GET /origination/loans/:id/covenants
 * Get covenant status for a loan.
 */
router.get('/loans/:id/covenants', async (_req: Request, res: Response): Promise<void> => {
  // TODO: Implement covenant status retrieval
  res.status(501).json({ error: 'Not implemented' });
});

/**
 * POST /origination/loans/:id/payments
 * Record a payment.
 */
router.post('/loans/:id/payments', async (_req: Request, res: Response): Promise<void> => {
  // TODO: Implement payment recording
  res.status(501).json({ error: 'Not implemented' });
});

// ============================================================================
// AI AGENTS
// ============================================================================

const agentOrchestrator = getAgentOrchestrator();

/**
 * POST /origination/agents/enrich
 * Run Data Architect to enrich a loan application with external data.
 */
router.post('/agents/enrich', async (req: Request, res: Response): Promise<void> => {
  const { applicationId, borrowerId, collateralAssetIds, requestedAmountCents } = req.body;

  if (!applicationId || !borrowerId || !collateralAssetIds) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const result = await agentOrchestrator.processApplication(
    applicationId,
    borrowerId,
    collateralAssetIds,
    requestedAmountCents || 0
  );

  if (!result.success) {
    res.status(500).json({ error: 'Agent processing failed', logs: result.agentLogs });
    return;
  }

  res.json({
    enrichedApplication: result.enrichedApplication,
    processingTimeMs: result.processingTimeMs,
    logs: result.agentLogs,
  });
});

/**
 * POST /origination/agents/outcome
 * Record loan outcome for ML training (Truth Database).
 */
router.post('/agents/outcome', async (req: Request, res: Response): Promise<void> => {
  const { loanId, outcome, details } = req.body;

  if (!loanId || !outcome) {
    res.status(400).json({ error: 'loanId and outcome required' });
    return;
  }

  const validOutcomes = [
    'REPAID_FULL', 'REPAID_EARLY', 'REPAID_LATE',
    'DEFAULTED', 'DEFAULTED_RECOVERED',
    'FRAUD_CONFIRMED', 'FRAUD_SUSPECTED',
    'RESTRUCTURED', 'ACTIVE'
  ];

  if (!validOutcomes.includes(outcome)) {
    res.status(400).json({ error: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}` });
    return;
  }

  const record = await agentOrchestrator.recordOutcome(loanId, outcome, details || {});
  res.json({ record });
});

/**
 * GET /origination/agents/statistics
 * Get outcome statistics from Truth Database.
 */
router.get('/agents/statistics', async (_req: Request, res: Response): Promise<void> => {
  const stats = agentOrchestrator.getOutcomeStatistics();
  res.json(stats);
});

/**
 * GET /origination/agents/training-data
 * Export ML training dataset.
 */
router.get('/agents/training-data', async (_req: Request, res: Response): Promise<void> => {
  const dataset = agentOrchestrator.getTrainingDataset();
  res.json(dataset);
});

/**
 * POST /origination/agents/security-audit
 * Run Risk Officer adversarial audit (admin only).
 */
router.post('/agents/security-audit', async (req: Request, res: Response): Promise<void> => {
  const { underwritingEndpoint } = req.body;
  
  const endpoint = underwritingEndpoint || `http://localhost:${process.env.PORT || 3001}/origination`;
  
  const report = await agentOrchestrator.runSecurityAudit(endpoint);
  res.json(report);
});

export default router;
