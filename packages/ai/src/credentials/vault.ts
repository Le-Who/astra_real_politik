import { randomUUID } from 'node:crypto';
import { IdSchema } from '@astra/contracts';
import { transaction } from '@astra/db';
import type { DatabasePool } from '@astra/db';
import type { CredentialCrypto } from './crypto.js';

export class CredentialVault {
  #pool: DatabasePool;
  #crypto: CredentialCrypto | undefined;
  #instanceId = randomUUID();
  #secrets = new Map<string, { ownerId: string; value: Buffer; usedAt: number }>();
  #timer: ReturnType<typeof setInterval>;
  #closed = false;

  constructor(pool: DatabasePool, crypto?: CredentialCrypto) {
    this.#pool = pool; this.#crypto = crypto;
    this.#timer = setInterval(() => {
      for (const [id, entry] of this.#secrets) if (Date.now() - entry.usedAt >= 8 * 60 * 60 * 1000) this.#forget(entry.ownerId, id);
    }, 60_000);
    this.#timer.unref();
  }
  #check() { if (this.#closed) throw new Error('VAULT_CLOSED'); }
  #forget(ownerId: string, id: string) {
    const value = this.#secrets.get(id);
    if (value?.ownerId === ownerId) { value.value.fill(0); this.#secrets.delete(id); }
  }
  async put(ownerId: string, key: string, mode: 'session' | 'persistent'): Promise<{ id: string; mask: string }> {
    this.#check(); IdSchema.parse(ownerId);
    if (!['session', 'persistent'].includes(mode) || typeof key !== 'string' || !/^[\x21-\x7e]{8,512}$/.test(key)) throw new Error('INVALID_CREDENTIAL');
    if (mode === 'persistent' && !this.#crypto) throw new Error('PERSISTENT_STORAGE_UNAVAILABLE');
    const id = randomUUID();
    const mask = '••••' + key.slice(-4);
    const encrypted = mode === 'persistent' ? this.#crypto!.encrypt(ownerId, id, key) : null;
    await this.#pool.query('INSERT INTO credentials(id,owner_id,storage,mask,instance_id,encrypted) VALUES($1,$2,$3,$4,$5,$6)', [id, ownerId, mode, mask, mode === 'session' ? this.#instanceId : null, encrypted]);
    if (mode === 'session') this.#secrets.set(id, { ownerId, value: Buffer.from(key), usedAt: Date.now() });
    return { id, mask };
  }
  async get(ownerId: string, id: string): Promise<string> {
    this.#check(); IdSchema.parse(ownerId); IdSchema.parse(id);
    return transaction(this.#pool, async (client) => {
      const rows = await client.query("SELECT *,last_used_at>clock_timestamp()-interval '8 hours' AS fresh FROM credentials WHERE id=$1 AND owner_id=$2 AND revoked_at IS NULL FOR UPDATE", [id, ownerId]);
      const row = rows.rows[0];
      if (!row) { this.#forget(ownerId, id); throw new Error('NOT_FOUND'); }
      let secret: string;
      if (row.storage === 'session') {
        const entry = this.#secrets.get(id);
        if (!row.fresh || row.instance_id !== this.#instanceId || entry?.ownerId !== ownerId) {
          this.#forget(ownerId, id); throw new Error('NOT_FOUND');
        }
        secret = entry.value.toString('utf8');
        entry.usedAt = Date.now();
      } else {
        if (!this.#crypto) throw new Error('PERSISTENT_STORAGE_UNAVAILABLE');
        secret = this.#crypto.decrypt(ownerId, id, row.encrypted);
      }
      await client.query('UPDATE credentials SET last_used_at=clock_timestamp() WHERE id=$1', [id]);
      return secret;
    });
  }
  async list(ownerId: string): Promise<{ id: string; mask: string; storage: 'session' | 'persistent' }[]> {
    this.#check(); IdSchema.parse(ownerId);
    const rows = await this.#pool.query("SELECT id,mask,storage FROM credentials WHERE owner_id=$1 AND revoked_at IS NULL AND (storage='persistent' OR (instance_id=$2 AND last_used_at>clock_timestamp()-interval '8 hours')) ORDER BY created_at,id", [ownerId, this.#instanceId]);
    return rows.rows.map((row) => ({ id: String(row.id), mask: String(row.mask), storage: row.storage as 'session' | 'persistent' }));
  }
  async revoke(ownerId: string, id: string): Promise<void> {
    this.#check(); IdSchema.parse(ownerId); IdSchema.parse(id);
    await transaction(this.#pool, async (client) => {
      const result = await client.query('UPDATE credentials SET revoked_at=clock_timestamp(),encrypted=NULL WHERE id=$1 AND owner_id=$2 AND revoked_at IS NULL RETURNING id', [id, ownerId]);
      if (!result.rowCount) throw new Error('NOT_FOUND');
      await client.query("UPDATE jobs SET status='cancelled',fence=fence+1,lease_expires_at=NULL WHERE owner_id=$1 AND credential_id=$2 AND status IN ('pending','running')", [ownerId, id]);
    });
    this.#forget(ownerId, id);
  }
  async rotate(ownerId: string, id: string): Promise<void> {
    this.#check(); IdSchema.parse(ownerId); IdSchema.parse(id);
    if (!this.#crypto) throw new Error('PERSISTENT_STORAGE_UNAVAILABLE');
    await transaction(this.#pool, async (client) => {
      const result = await client.query("SELECT encrypted FROM credentials WHERE id=$1 AND owner_id=$2 AND storage='persistent' AND revoked_at IS NULL FOR UPDATE", [id, ownerId]);
      if (!result.rows[0]) throw new Error('NOT_FOUND');
      const encrypted = this.#crypto!.rewrap(ownerId, id, result.rows[0].encrypted);
      await client.query('UPDATE credentials SET encrypted=$2 WHERE id=$1', [id, encrypted]);
    });
  }
  close(): void {
    clearInterval(this.#timer);
    for (const [id, entry] of this.#secrets) this.#forget(entry.ownerId, id);
    this.#closed = true;
  }
}
