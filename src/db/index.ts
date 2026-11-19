import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  // eslint-disable-next-line no-var
  var __tiebreakerPgPool: Pool | undefined;
}

export function isSqlConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME,
  );
}

function getOrCreatePool(): Pool {
  if (!globalThis.__tiebreakerPgPool) {
    const pool = new Pool({
      host: process.env.SQL_HOST,
      port: Number(process.env.SQL_PORT || 5432),
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected idle PostgreSQL client error:', err);
    });

    globalThis.__tiebreakerPgPool = pool;
  }

  return globalThis.__tiebreakerPgPool;
}

export const pool = getOrCreatePool();
export const db = drizzle(pool, { schema });
