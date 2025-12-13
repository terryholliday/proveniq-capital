/**
 * Proveniq Capital - Database Connection
 * PostgreSQL connection pool management
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
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
  try {
    const p = getPool();
    const result = await p.query('SELECT NOW()');
    console.log('[Database] Connection test successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[Database] Connection test failed:', error);
    return false;
  }
}
