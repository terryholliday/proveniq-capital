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
import { getPool, testConnection, closePool } from './database';

// Core services
import { LedgerService, LedgerRepository } from './core/ledger';
import { TreasuryService, TreasuryRepository } from './core/treasury';

// Modules
import { ClaimsListenerService } from './modules/claims-listener';
import { PayoutService, PayoutRepository, StripeAdapter, USDCAdapter } from './modules/payouts';

// API
import { createAdminRoutes, createWebhookRoutes, adminAuthMiddleware, webhookAuthMiddleware } from './api';

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

  // Get database pool
  const pool = getPool();

  // Initialize repositories
  console.log('[Boot] Initializing repositories...');
  const ledgerRepository = new LedgerRepository(pool);
  const treasuryRepository = new TreasuryRepository(pool);
  const payoutRepository = new PayoutRepository(pool);

  // Initialize core services
  console.log('[Boot] Initializing core services...');
  const ledgerService = new LedgerService(ledgerRepository);
  const treasuryService = new TreasuryService(treasuryRepository, ledgerService);

  // Initialize payment adapters
  console.log('[Boot] Initializing payment adapters...');
  const stripeAdapter = new StripeAdapter();
  const usdcAdapter = new USDCAdapter();

  // Initialize payout service
  const payoutService = new PayoutService(
    payoutRepository,
    ledgerService,
    treasuryService,
    stripeAdapter,
    usdcAdapter
  );

  // Initialize claims listener
  console.log('[Boot] Initializing claims listener...');
  const claimsListener = new ClaimsListenerService(
    ledgerRepository,
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

  // Health check (public)
  app.get('/health', (_req, res) => {
    res.json({ status: 'OK', service: 'proveniq-capital', timestamp: new Date().toISOString() });
  });

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
