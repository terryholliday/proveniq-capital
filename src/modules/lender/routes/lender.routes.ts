/**
 * @file modules/lender/routes/lender.routes.ts
 * @description Lender Analytics API Routes
 */

import { Router, Request, Response } from 'express';
import { getLenderAnalyticsService } from '../analytics.service';

const router = Router();
const analyticsService = getLenderAnalyticsService();

// ============================================================================
// LENDER LIST
// ============================================================================

/**
 * GET /lenders
 * Get all lenders with basic stats
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const lenders = await analyticsService.getAllLenders();
  res.json({ lenders, count: lenders.length });
});

// ============================================================================
// PORTFOLIO SUMMARY
// ============================================================================

/**
 * GET /lenders/:id/portfolio
 * Get portfolio summary for a lender
 */
router.get('/:id/portfolio', async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await analyticsService.getPortfolioSummary(req.params.id);
    res.json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// LOANS
// ============================================================================

/**
 * GET /lenders/:id/loans
 * Get all loans for a lender
 */
router.get('/:id/loans', async (req: Request, res: Response): Promise<void> => {
  const { status, minLtv, maxLtv } = req.query;
  
  const loans = await analyticsService.getLenderLoans(req.params.id, {
    status: status as any,
    minLtv: minLtv ? parseFloat(minLtv as string) : undefined,
    maxLtv: maxLtv ? parseFloat(maxLtv as string) : undefined,
  });
  
  res.json({ loans, count: loans.length });
});

// ============================================================================
// RISK ANALYSIS
// ============================================================================

/**
 * GET /lenders/:id/risk
 * Get risk distribution analysis
 */
router.get('/:id/risk', async (req: Request, res: Response): Promise<void> => {
  try {
    const distribution = await analyticsService.getRiskDistribution(req.params.id);
    res.json(distribution);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// COLLATERAL HEALTH
// ============================================================================

/**
 * GET /lenders/:id/collateral-health
 * Get collateral health report
 */
router.get('/:id/collateral-health', async (req: Request, res: Response): Promise<void> => {
  try {
    const report = await analyticsService.getCollateralHealthReport(req.params.id);
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// REVENUE
// ============================================================================

/**
 * GET /lenders/:id/revenue
 * Get revenue report
 */
router.get('/:id/revenue', async (req: Request, res: Response): Promise<void> => {
  const period = (req.query.period as string) || 'monthly';
  
  try {
    const report = await analyticsService.getRevenueReport(
      req.params.id,
      period as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
