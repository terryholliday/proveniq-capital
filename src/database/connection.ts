/**
 * Proveniq Capital - Database Connection
 * PostgreSQL connection pool management
 * 
 * MOCK MODE: If DATABASE_URL is not set, runs in mock mode (in-memory)
 */

import { Pool } from 'pg';

let pool: Pool | null = null;
let mockMode = false;

export function isMockMode(): boolean {
  return mockMode;
}

export function getPool(): Pool | null {
  if (mockMode) {
    return null;
  }

  if (!pool) {
    if (!process.env.DATABASE_URL) {
      console.warn('[Database] DATABASE_URL not set - running in MOCK MODE');
      mockMode = true;
      return null;
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('[Database] Unexpected error on idle client:', err);
    });

    pool.on('connect', () => {
      console.log('[Database] New client connected');
    });
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Database] Connection pool closed');
  }
}

export async function testConnection(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.warn('[Database] DATABASE_URL not set - running in MOCK MODE');
    mockMode = true;
    return true; // Mock mode is "successful"
  }

  try {
    const p = getPool();
    if (!p) {
      return true; // Mock mode
    }
    const result = await p.query('SELECT NOW()');
    console.log('[Database] Connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[Database] Connection test failed:', error);
    return false;
  }
}
