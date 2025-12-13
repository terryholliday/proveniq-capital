/**
 * Proveniq Capital - Admin API Routes
 * Internal administration endpoints
 */

import { Router, Request, Response } from 'express';
import { TreasuryService } from '../../core/treasury';
import { LedgerService } from '../../core/ledger';
import { PayoutService } from '../../modules/payouts';

export function createAdminRoutes(
  treasury: TreasuryService,
  ledger: LedgerService,
  payouts: PayoutService
): Router {
  const router = Router();

  /**
   * GET /admin/health
   * System health check
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const treasuryHealth = await treasury.getHealthSummary();
      const ledgerIntegrity = await ledger.verifyLedgerIntegrity();

      res.json({
        status: treasuryHealth.status === 'HEALTHY' && ledgerIntegrity.valid ? 'OK' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        treasury: {
          status: treasuryHealth.status,
          total_balance: treasuryHealth.total_balance.toString(),
          available_balance: treasuryHealth.available_balance.toString(),
          pools_at_risk: treasuryHealth.pools_at_risk,
          active_alerts: treasuryHealth.active_alerts,
        },
        ledger: {
          valid: ledgerIntegrity.valid,
          transaction_count: ledgerIntegrity.transaction_count,
          balanced: ledgerIntegrity.balanced,
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /admin/treasury/pools
   * List all liquidity pools
   */
  router.get('/treasury/pools', async (_req: Request, res: Response) => {
    try {
      const health = await treasury.getHealthSummary();
      res.json({
        pool_count: health.pool_count,
        total_balance: health.total_balance.toString(),
        total_locked: health.total_locked.toString(),
        available_balance: health.available_balance.toString(),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * POST /admin/treasury/pools
   * Create a new liquidity pool
   */
  router.post('/treasury/pools', async (req: Request, res: Response) => {
    try {
      const { name, currency, minimum_reserve } = req.body;

      if (!name || !currency || !minimum_reserve) {
        res.status(400).json({ error: 'Missing required fields: name, currency, minimum_reserve' });
        return;
      }

      const pool = await treasury.createPool(
        name,
        currency,
        BigInt(minimum_reserve)
      );

      res.status(201).json({
        id: pool.id,
        name: pool.name,
        currency: pool.currency,
        balance: pool.balance.toString(),
        minimum_reserve: pool.minimum_reserve.toString(),
        status: pool.status,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * POST /admin/treasury/pools/:poolId/fund
   * Add funds to a pool
   */
  router.post('/treasury/pools/:poolId/fund', async (req: Request, res: Response) => {
    try {
      const { poolId } = req.params;
      const { amount } = req.body;

      if (!amount) {
        res.status(400).json({ error: 'Missing required field: amount' });
        return;
      }

      await treasury.fundPool(poolId, BigInt(amount));

      res.json({ success: true, pool_id: poolId, amount_added: amount });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /admin/treasury/alerts
   * Get active treasury alerts
   */
  router.get('/treasury/alerts', async (_req: Request, res: Response) => {
    try {
      const alerts = await treasury.getActiveAlerts();
      res.json({
        count: alerts.length,
        alerts: alerts.map(a => ({
          id: a.id,
          type: a.type,
          pool_id: a.pool_id,
          current_balance: a.current_balance.toString(),
          threshold: a.threshold.toString(),
          message: a.message,
          created_at: a.created_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * POST /admin/treasury/alerts/:alertId/acknowledge
   * Acknowledge a treasury alert
   */
  router.post('/treasury/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      await treasury.acknowledgeAlert(alertId);
      res.json({ success: true, alert_id: alertId });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /admin/payouts/pending
   * Get payouts pending manual review
   */
  router.get('/payouts/pending', async (_req: Request, res: Response) => {
    try {
      const pending = await payouts.getPendingManualReview();
      res.json({
        count: pending.length,
        payouts: pending.map(p => ({
          id: p.id,
          claim_id: p.claim_id,
          amount: p.amount.toString(),
          currency: p.currency,
          recipient_did: p.recipient_did,
          created_at: p.created_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * POST /admin/payouts/:payoutId/approve
   * Approve a payout pending manual review
   */
  router.post('/payouts/:payoutId/approve', async (req: Request, res: Response) => {
    try {
      const { payoutId } = req.params;
      const { approved_by } = req.body;

      if (!approved_by) {
        res.status(400).json({ error: 'Missing required field: approved_by' });
        return;
      }

      const result = await payouts.approveManualPayout(payoutId, approved_by);

      res.json({
        success: result.success,
        payout_id: result.payout_id,
        status: result.status,
        tx_hash: result.tx_hash,
        error: result.error,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /admin/payouts/:payoutId
   * Get payout details
   */
  router.get('/payouts/:payoutId', async (req: Request, res: Response) => {
    try {
      const { payoutId } = req.params;
      const payout = await payouts.getPayoutById(payoutId);

      if (!payout) {
        res.status(404).json({ error: 'Payout not found' });
        return;
      }

      res.json({
        id: payout.id,
        claim_id: payout.claim_id,
        policy_id: payout.policy_id,
        recipient_did: payout.recipient_did,
        amount: payout.amount.toString(),
        currency: payout.currency,
        rail: payout.rail,
        status: payout.status,
        tx_hash: payout.tx_hash,
        created_at: payout.created_at,
        cleared_at: payout.cleared_at,
        failure_reason: payout.failure_reason,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /admin/ledger/integrity
   * Verify ledger integrity
   */
  router.get('/ledger/integrity', async (_req: Request, res: Response) => {
    try {
      const report = await ledger.verifyLedgerIntegrity();
      res.json({
        valid: report.valid,
        transaction_count: report.transaction_count,
        global_sum: report.global_sum.toString(),
        balanced: report.balanced,
        account_balances: report.account_balances.map(b => ({
          account: b.account,
          currency: b.currency,
          balance_micros: b.balance_micros.toString(),
        })),
        errors: report.errors,
        verified_at: report.verified_at,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /admin/ledger/entries/:referenceId
   * Get ledger entries for a policy or claim
   */
  router.get('/ledger/entries/:referenceId', async (req: Request, res: Response) => {
    try {
      const { referenceId } = req.params;
      const entries = await ledger.getEntriesByReference(referenceId);

      res.json({
        reference_id: referenceId,
        entry_count: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          account: e.account,
          amount_micros: e.amount_micros.toString(),
          currency: e.currency,
          reference_type: e.reference_type,
          created_at: e.created_at,
          memo: e.memo,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
