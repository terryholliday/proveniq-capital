/**
 * Proveniq Capital - Database Migration Runner
 * Executes schema.sql against PostgreSQL
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function migrate(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log('[Migrate] Connecting to database...');

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('[Migrate] Executing schema...');

    // Execute schema
    await pool.query(schema);

    console.log('[Migrate] Schema applied successfully');

    // Verify tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('[Migrate] Tables created:');
    for (const row of result.rows) {
      console.log(`  - ${row.table_name}`);
    }

  } catch (error) {
    console.error('[Migrate] Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('[Migrate] Migration complete');
}

migrate();
