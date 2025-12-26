/**
 * @file portal/routes/portal.routes.ts
 * @description Borrower Portal API Routes
 */

import { Router, Request, Response } from 'express';
import { getApplicationService } from '../services/application.service';
import { DocumentType } from '../types';

const router = Router();
const appService = getApplicationService();

// ============================================================================
// LOAN CALCULATOR (Public)
// ============================================================================

/**
 * POST /portal/calculator
 * Calculate loan estimate without creating application
 */
router.post('/calculator', (req: Request, res: Response): void => {
  const { loanAmountCents, termMonths, collateralValueCents } = req.body;

  if (!loanAmountCents || !termMonths || !collateralValueCents) {
    res.status(400).json({ error: 'loanAmountCents, termMonths, and collateralValueCents required' });
    return;
  }

  const result = appService.calculateLoanEstimate({
    loanAmountCents,
    termMonths,
    collateralValueCents,
  });

  res.json(result);
});

// ============================================================================
// APPLICATIONS
// ============================================================================

/**
 * POST /portal/applications
 * Create new loan application (draft)
 */
router.post('/applications', async (req: Request, res: Response): Promise<void> => {
  const { borrowerId, requestedAmountCents, requestedTermDays, purpose, purposeDescription } = req.body;

  if (!borrowerId || !requestedAmountCents || !requestedTermDays || !purpose) {
    res.status(400).json({ error: 'borrowerId, requestedAmountCents, requestedTermDays, and purpose required' });
    return;
  }

  try {
    const application = await appService.createApplication(borrowerId, {
      requestedAmountCents,
      requestedTermDays,
      purpose,
      purposeDescription,
    });

    res.status(201).json({ success: true, application });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /portal/applications
 * Get all applications for authenticated borrower
 */
router.get('/applications', async (req: Request, res: Response): Promise<void> => {
  const borrowerId = req.query.borrowerId as string;

  if (!borrowerId) {
    res.status(400).json({ error: 'borrowerId required' });
    return;
  }

  const applications = await appService.getBorrowerApplications(borrowerId);
  res.json({ applications, count: applications.length });
});

/**
 * GET /portal/applications/:id
 * Get application details
 */
router.get('/applications/:id', async (req: Request, res: Response): Promise<void> => {
  const application = await appService.getApplication(req.params.id);

  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const documents = await appService.getDocuments(req.params.id);
  const offers = await appService.getOffers(req.params.id);

  res.json({ application, documents, offers });
});

// ============================================================================
// COLLATERAL
// ============================================================================

/**
 * POST /portal/applications/:id/collateral
 * Add collateral asset to application
 */
router.post('/applications/:id/collateral', async (req: Request, res: Response): Promise<void> => {
  const { assetId, paid, name, category, description, estimatedValueCents, photoUrls } = req.body;

  if (!assetId || !name || !category || !estimatedValueCents) {
    res.status(400).json({ error: 'assetId, name, category, and estimatedValueCents required' });
    return;
  }

  try {
    const application = await appService.addCollateral(req.params.id, {
      assetId,
      paid,
      name,
      category,
      description,
      estimatedValueCents,
      photoUrls: photoUrls || [],
    });

    res.json({ success: true, application });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /portal/applications/:id/collateral/:assetId
 * Remove collateral from application
 */
router.delete('/applications/:id/collateral/:assetId', async (req: Request, res: Response): Promise<void> => {
  try {
    const application = await appService.removeCollateral(req.params.id, req.params.assetId);
    res.json({ success: true, application });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// DOCUMENTS
// ============================================================================

/**
 * POST /portal/applications/:id/documents
 * Upload document for application
 */
router.post('/applications/:id/documents', async (req: Request, res: Response): Promise<void> => {
  const { type, name, url } = req.body;

  if (!type || !name || !url) {
    res.status(400).json({ error: 'type, name, and url required' });
    return;
  }

  try {
    const document = await appService.uploadDocument(
      req.params.id,
      type as DocumentType,
      name,
      url
    );

    res.status(201).json({ success: true, document });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /portal/applications/:id/documents
 * Get documents for application
 */
router.get('/applications/:id/documents', async (req: Request, res: Response): Promise<void> => {
  const documents = await appService.getDocuments(req.params.id);
  res.json({ documents, count: documents.length });
});

// ============================================================================
// SUBMISSION
// ============================================================================

/**
 * POST /portal/applications/:id/submit
 * Submit application for review
 */
router.post('/applications/:id/submit', async (req: Request, res: Response): Promise<void> => {
  try {
    const application = await appService.submitApplication(req.params.id);
    res.json({ success: true, application, message: 'Application submitted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /portal/applications/:id/withdraw
 * Withdraw application
 */
router.post('/applications/:id/withdraw', async (req: Request, res: Response): Promise<void> => {
  try {
    const application = await appService.withdrawApplication(req.params.id);
    res.json({ success: true, application });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// OFFERS
// ============================================================================

/**
 * GET /portal/applications/:id/offers
 * Get loan offers for application
 */
router.get('/applications/:id/offers', async (req: Request, res: Response): Promise<void> => {
  const offers = await appService.getOffers(req.params.id);
  res.json({ offers, count: offers.length });
});

/**
 * POST /portal/applications/:id/offers/:offerId/accept
 * Accept a loan offer
 */
router.post('/applications/:id/offers/:offerId/accept', async (req: Request, res: Response): Promise<void> => {
  try {
    const offer = await appService.acceptOffer(req.params.id, req.params.offerId);
    res.json({ success: true, offer, message: 'Offer accepted! Funds will be disbursed shortly.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// BORROWER STATS
// ============================================================================

/**
 * GET /portal/stats
 * Get borrower statistics
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const borrowerId = req.query.borrowerId as string;

  if (!borrowerId) {
    res.status(400).json({ error: 'borrowerId required' });
    return;
  }

  const stats = await appService.getBorrowerStats(borrowerId);
  res.json(stats);
});

export default router;
