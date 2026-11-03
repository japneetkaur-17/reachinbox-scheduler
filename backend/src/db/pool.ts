import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  // Interpret/serialize JS Dates as UTC so DATETIME columns are always UTC.
  timezone: 'Z',
  dateStrings: false,
});

/** Creates tables if they do not exist. Safe to run on every boot. */
export async function runMigrations(): Promise<void> {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) await conn.query(stmt);
    logger.info(`DB migrations applied (${statements.length} statements)`);
  } finally {
    conn.release();
  }
}
