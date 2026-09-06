import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { transaction } from './connection.js';

export interface OutboxDelivery { id: string; campaignId: string; sequence: number; revision: number; type: string; data: unknown; deliveryToken: string }
export async function claimOutbox(pool: Pool, limit = 100): Promise<OutboxDelivery[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('INVALID_BATCH_LIMIT');
  const token = randomUUID();
  return transaction(pool, async (client) => {
    const rows = await client.query("WITH pending AS (SELECT id FROM outbox WHERE published_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp()) ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE outbox SET delivery_token=$2,lease_expires_at=clock_timestamp()+interval '30 seconds' FROM pending WHERE outbox.id=pending.id RETURNING outbox.*", [limit, token]);
    return rows.rows.map((row) => ({ id: String(row.id), campaignId: String(row.campaign_id), sequence: Number(row.sequence), revision: Number(row.revision), type: String(row.type), data: row.data as unknown, deliveryToken: token }));
  });
}
export async function acknowledgeOutbox(pool: Pool, id: string, token: string): Promise<boolean> {
  const result = await pool.query('UPDATE outbox SET published_at=clock_timestamp(),lease_expires_at=NULL WHERE id=$1 AND delivery_token=$2 AND published_at IS NULL AND lease_expires_at>clock_timestamp()', [id, token]);
  return result.rowCount === 1;
}
