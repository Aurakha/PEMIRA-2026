import { Pool } from 'pg';
import { env } from './env';

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 30, // Max connection per instance menuju PgBouncer
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

dbPool.on('error', (err) => {
  console.error('[DATABASE POOL ERROR]:', err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  const client = await dbPool.connect();
  try {
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[SLOW QUERY ${duration}ms]: ${text.slice(0, 100)}`);
    }
    return res.rows;
  } finally {
    client.release();
  }
}
