/**
 * PROVENIQ Capital - Origination API Routes
 * 
 * REST endpoints for the Origination Engine.
 */

import { Router, Request, Response } from 'express';
import { getOriginationService, OriginationRequest } from '../modules/loans/origination.service';
import { LOAN_PRODUCTS, LoanProductType } from '../modules/loans/loan-types';

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
router.get('/products/:type', (req: Request, res: Response) => {
  const productType = req.params.type as LoanProductType;
  const product = LOAN_PRODUCTS[productType];

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
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
router.post('/preview', async (req: Request, res: Response) => {
  const {
    productType,
    requestedAmountCents,
    collateralValueCents,
    borrowerRiskScore = 30,
  } = req.body;

  if (!productType || !requestedAmountCents || !collateralValueCents) {
    return res.status(400).json({
      error: 'Missing required fields: productType, requestedAmountCents, collateralValueCents',
    });
  }

  const result = await origination.previewOffer(
    productType,
    requestedAmountCents,
    collateralValueCents,
    borrowerRiskScore,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
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
router.post('/applications', async (req: Request, res: Response) => {
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
    return res.status(400).json({
      error: result.error,
      validationErrors: result.validationErrors,
    });
  }

  res.status(201).json({ application: result.application });
});

/**
 * POST /origination/applications/:id/submit
 * Submit application for underwriting.
 */
router.post('/applications/:id/submit', async (req: Request, res: Response) => {
  const applicationId = req.params.id;
  const {
    collateralValueCents,
    borrowerRiskScore,
    hasInsurance = false,
    hasAnchor = false,
    isVerified = false,
  } = req.body;

  if (!collateralValueCents) {
    return res.status(400).json({ error: 'collateralValueCents is required' });
  }

  const result = await origination.submitForUnderwriting(
    applicationId,
    collateralValueCents,
    borrowerRiskScore || 30,
    hasInsurance,
    hasAnchor,
    isVerified,
  );

  if (!result.approved) {
    return res.status(200).json({
      approved: false,
      application: result.application,
      declineReasons: result.declineReasons,
    });
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
router.post('/applications/:id/fund', async (req: Request, res: Response) => {
  const applicationId = req.params.id;

  const result = await origination.fundLoan(applicationId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
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
router.get('/loans/:id', async (req: Request, res: Response) => {
  // TODO: Implement loan retrieval
  res.status(501).json({ error: 'Not implemented' });
});

/**
 * GET /origination/loans/:id/covenants
 * Get covenant status for a loan.
 */
router.get('/loans/:id/covenants', async (req: Request, res: Response) => {
  // TODO: Implement covenant status retrieval
  res.status(501).json({ error: 'Not implemented' });
});

/**
 * POST /origination/loans/:id/payments
 * Record a payment.
 */
router.post('/loans/:id/payments', async (req: Request, res: Response) => {
  // TODO: Implement payment recording
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
