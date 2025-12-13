/**
 * ============================================
 * PROVENIQ CAPITAL - API SERVER
 * ============================================
 * 
 * Autonomous Capital Decisions
 * Port: 3001
 * 
 * CORE DIRECTIVES:
 * - DETERMINISTIC LOGIC ONLY
 * - NO IN-MEMORY STATE
 * - FAIL LOUDLY
 * - NO UI / NO CHAT
 * - ONE PURPOSE: Autonomous Capital Decisions
 * 
 * API SURFACE (ONLY):
 * - GET /health
 * - POST /v1/transactions/golden-spike
 */

import express, { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// ============================================
// TYPES
// ============================================

interface GoldenSpikeRequest {
  claim_id: string;
  asset_id: string;
  applicant_id: string;
  ledger_owner_id: string;
  amount_cents: number;
  currency: string;
  correlation_id: string;
}

interface GoldenSpikeResponse {
  tx_id: string;
  decision: 'APPROVED' | 'DENIED';
  reason: string;
  correlation_id: string;
  timestamp: string;
}

// ============================================
// DETERMINISTIC LOGIC
// ============================================

/**
 * Generate deterministic transaction ID
 * SHA-256 hash of deterministic fields
 * Same input ALWAYS produces same tx_id
 */
function generateTxId(request: GoldenSpikeRequest): string {
  const deterministicPayload = [
    request.claim_id,
    request.asset_id,
    request.applicant_id,
    request.ledger_owner_id,
    request.amount_cents.toString(),
    request.currency,
    request.correlation_id,
  ].join('|');

  return createHash('sha256').update(deterministicPayload).digest('hex');
}

/**
 * Golden Spike Decision Logic
 * RULE: APPROVE only if ledger_owner_id === applicant_id
 * Otherwise DENY
 * 
 * No randomness. No inference.
 */
function executeGoldenSpike(request: GoldenSpikeRequest): GoldenSpikeResponse {
  const tx_id = generateTxId(request);
  const timestamp = new Date().toISOString();

  // DETERMINISTIC RULE: Owner must match applicant
  if (request.ledger_owner_id === request.applicant_id) {
    return {
      tx_id,
      decision: 'APPROVED',
      reason: 'Ledger owner matches applicant. Capital authorized.',
      correlation_id: request.correlation_id,
      timestamp,
    };
  }

  return {
    tx_id,
    decision: 'DENIED',
    reason: `Ledger owner mismatch. Expected: ${request.applicant_id}, Found: ${request.ledger_owner_id}`,
    correlation_id: request.correlation_id,
    timestamp,
  };
}

/**
 * Validate Golden Spike request
 * FAIL LOUDLY if invalid
 */
function validateRequest(body: unknown): GoldenSpikeRequest {
  const req = body as Record<string, unknown>;

  const requiredFields = [
    'claim_id',
    'asset_id',
    'applicant_id',
    'ledger_owner_id',
    'amount_cents',
    'currency',
    'correlation_id',
  ];

  const missing = requiredFields.filter(field => req[field] === undefined || req[field] === null);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (typeof req.amount_cents !== 'number' || req.amount_cents < 0) {
    throw new Error('amount_cents must be a non-negative number');
  }

  // UUID validation for correlation_id
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.correlation_id as string)) {
    throw new Error('correlation_id must be a valid UUID');
  }

  return {
    claim_id: String(req.claim_id),
    asset_id: String(req.asset_id),
    applicant_id: String(req.applicant_id),
    ledger_owner_id: String(req.ledger_owner_id),
    amount_cents: req.amount_cents as number,
    currency: String(req.currency),
    correlation_id: String(req.correlation_id),
  };
}

// ============================================
// SERVER
// ============================================

const app = express();
app.use(express.json());

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

/**
 * POST /v1/transactions/golden-spike
 * Deterministic capital decision
 */
app.post('/v1/transactions/golden-spike', (req: Request, res: Response) => {
  try {
    // Validate request - FAIL LOUDLY
    const validatedRequest = validateRequest(req.body);

    // Execute deterministic decision
    const response = executeGoldenSpike(validatedRequest);

    // Log decision
    console.log(`[GOLDEN SPIKE] ${response.decision} | tx_id=${response.tx_id} | correlation_id=${response.correlation_id}`);

    res.status(200).json(response);
  } catch (error) {
    const err = error as Error;
    console.error(`[GOLDEN SPIKE ERROR] ${err.message}`);
    res.status(400).json({
      error: 'Invalid request',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Error handler - FAIL LOUDLY
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[CAPITAL ERROR]', err.message);
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  PROVENIQ CAPITAL - THE BANK');
  console.log('  Autonomous Capital Decisions');
  console.log('='.repeat(60));
  console.log(`\n[Boot] Server listening on port ${PORT}`);
  console.log('[Boot] Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /v1/transactions/golden-spike`);
  console.log('\n[Boot] PROVENIQ CAPITAL ONLINE');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Shutdown] Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Shutdown] Received SIGINT');
  process.exit(0);
});
