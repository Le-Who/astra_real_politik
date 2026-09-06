import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabasePool } from '@astra/db';
import { IdSchema } from '@astra/contracts';

export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export interface SessionPrincipal { ownerId: string; csrfToken: string; expiresAt: string }
export class SessionStore {
  constructor(private readonly pool: DatabasePool) {}
  async create(ownerId: string): Promise<SessionPrincipal & { token: string }> {
    IdSchema.parse(ownerId);
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const result = await this.pool.query("INSERT INTO sessions(token_hash,owner_id,csrf_token,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '7 days') RETURNING expires_at", [digest(token), ownerId, csrfToken]);
    return { token, ownerId, csrfToken, expiresAt: (result.rows[0].expires_at as Date).toISOString() };
  }
  async read(token: string | undefined): Promise<SessionPrincipal | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await this.pool.query("UPDATE sessions SET last_seen_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND last_seen_at>clock_timestamp()-interval '8 hours' RETURNING owner_id,csrf_token,expires_at", [digest(token)]);
    const row = result.rows[0];
    return row ? { ownerId: String(row.owner_id), csrfToken: String(row.csrf_token), expiresAt: (row.expires_at as Date).toISOString() } : null;
  }
  async revoke(token: string | undefined): Promise<void> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.pool.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [digest(token)]);
  }
}
