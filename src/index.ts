/**
 * Proveniq Capital - Main Entry Point
 * Algorithmic Central Bank for Proveniq Insurance Pools
 * 
 * TREASURY OS: Underwriting & Settlement Engine
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database
import { getPool, testConnection, closePool, isMockMode } from './database';

// Core services
import { LedgerService, LedgerRepository } from './core/ledger';
import { TreasuryService, TreasuryRepository } from './core/treasury';

// Modules
import { ClaimsListenerService } from './modules/claims-listener';
import { PayoutService, PayoutRepository, StripeAdapter, USDCAdapter } from './modules/payouts';
import { StripeIngressService } from './modules/premiums';

// API
import { createAdminRoutes, createWebhookRoutes, createStripeWebhookRoutes, adminAuthMiddleware, webhookAuthMiddleware } from './api';

async function bootstrap(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  PROVENIQ CAPITAL - TREASURY OS');
  console.log('  Algorithmic Central Bank for Insurance Pools');
  console.log('='.repeat(60));

  // Test database connection
  console.log('\n[Boot] Testing database connection...');
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('[Boot] FATAL: Database connection failed');
    process.exit(1);
  }

  // Get database pool (null in mock mode)
  const pool = getPool();
  
  if (isMockMode()) {
    console.warn('[Boot] ⚠️  RUNNING IN MOCK MODE - No database connected');
    console.warn('[Boot] ⚠️  All data is in-memory and will be lost on restart');
  }

  // Initialize repositories (handle null pool for mock mode)
  console.log('[Boot] Initializing repositories...');
  const ledgerRepository = pool ? new LedgerRepository(pool) : null;
  const treasuryRepository = pool ? new TreasuryRepository(pool) : null;
  const payoutRepository = pool ? new PayoutRepository(pool) : null;

  // Initialize core services (pass null repos for mock mode - services handle it)
  console.log('[Boot] Initializing core services...');
  const ledgerService = new LedgerService(ledgerRepository as any);
  const treasuryService = new TreasuryService(treasuryRepository as any, ledgerService);

  // Initialize payment adapters
  console.log('[Boot] Initializing payment adapters...');
  const stripeAdapter = new StripeAdapter();
  const usdcAdapter = new USDCAdapter();

  // Initialize payout service
  const payoutService = new PayoutService(
    payoutRepository as any,
    ledgerService,
    treasuryService,
    stripeAdapter,
    usdcAdapter
  );

  // Initialize Stripe Ingress (Premium Collection)
  console.log('[Boot] Initializing Stripe ingress service...');
  const stripeIngress = new StripeIngressService({
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
  });

  // Initialize claims listener
  console.log('[Boot] Initializing claims listener...');
  const claimsListener = new ClaimsListenerService(
    ledgerRepository as any,
    payoutService,
    {
      claimsIqBaseUrl: process.env.CLAIMSIQ_BASE_URL || 'http://localhost:3000',
      claimsIqApiKey: process.env.CLAIMSIQ_API_KEY || '',
      webhookSecret: process.env.CLAIMSIQ_WEBHOOK_SECRET || '',
    }
  );

  // Create Express app
  console.log('[Boot] Configuring Express server...');
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Root route
  app.get('/', (_req, res) => {
    res.json({ 
      service: 'Proveniq Capital',
      description: 'Settlement and Treasury Engine',
      version: '1.0.0',
      mode: isMockMode() ? 'MOCK' : 'LIVE',
      endpoints: {
        health: '/health',
        admin: '/admin (API key required)',
        webhooks: '/webhooks (signature required)',
      }
    });
  });

  // Health check (public)
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'OK', 
      service: 'proveniq-capital', 
      mode: isMockMode() ? 'MOCK' : 'LIVE',
      database_url_set: !!process.env.DATABASE_URL,
      timestamp: new Date().toISOString() 
    });
  });

  // Stripe webhook route (CRITICAL: Must use raw body for signature verification)
  // Mount BEFORE express.json() middleware or use express.raw() for this route
  app.use(
    '/api/v1/webhooks',
    express.raw({ type: 'application/json' }),
    createStripeWebhookRoutes({ stripeIngress, ledger: ledgerService })
  );

  // Webhook routes (signature-verified)
  app.use('/webhooks', webhookAuthMiddleware, createWebhookRoutes(claimsListener));

  // Admin routes (API key protected)
  app.use('/admin', adminAuthMiddleware, createAdminRoutes(treasuryService, ledgerService, payoutService));

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  // IMPORTANT: Capital runs on 3001 (ClaimsIQ on 3000)
  const port = parseInt(process.env.PORT || '3001', 10);
  const server = app.listen(port, () => {
    console.log(`\n[Boot] Server listening on port ${port}`);
    console.log('[Boot] Endpoints:');
    console.log(`  - Health: http://localhost:${port}/health`);
    console.log(`  - Webhooks: http://localhost:${port}/webhooks/claimsiq`);
    console.log(`  - Stripe Webhook: http://localhost:${port}/api/v1/webhooks/stripe`);
    console.log(`  - Admin: http://localhost:${port}/admin/*`);
  });

  // Start claims polling (optional - can use webhooks instead)
  if (process.env.ENABLE_CLAIMS_POLLING === 'true') {
    const pollInterval = parseInt(process.env.CLAIMS_POLL_INTERVAL_MS || '30000', 10);
    console.log(`[Boot] Starting claims polling (interval: ${pollInterval}ms)`);
    claimsListener.startPolling(pollInterval);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);
    
    // Stop claims polling
    claimsListener.stopPolling();
    
    // Close server
    server.close(() => {
      console.log('[Shutdown] HTTP server closed');
    });

    // Close database
    await closePool();

    console.log('[Shutdown] Complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log('\n[Boot] PROVENIQ CAPITAL ONLINE');
  console.log('[Boot] Ready to process settlements');
}

// Run
bootstrap().catch((error) => {
  console.error('[Boot] Fatal error during startup:', error);
  process.exit(1);
});
