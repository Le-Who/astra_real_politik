import { Pool } from 'pg';
import type { PoolClient } from 'pg';

export function createPool(connectionString: string, options: { schema?: string } = {}): Pool {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_URL');
  if (options.schema && !/^[a-z][a-z0-9_]{0,62}$/.test(options.schema)) throw new Error('INVALID_SCHEMA');
  return new Pool({
    connectionString, max: 12, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000, statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 20_000,
    application_name: 'astra-realpolitik',
    ...(options.schema ? { options: '-c search_path=' + options.schema } : {}),
  });
}
export async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure; release destroys unusable connections. */ }
    throw error;
  } finally { client.release(); }
}
