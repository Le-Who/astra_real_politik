import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, CampaignRepository } from '../../packages/db/src/index.js';
import { CredentialCrypto, CredentialVault } from '../../packages/ai/src/index.js';
import { fixtureWorld } from '../fixtures/world.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/astra_test')) throw new Error('Dedicated TEST_DATABASE_URL required');
const schema = 't04_' + randomUUID().replaceAll('-', '');
const admin = createPool(url);
const pool = createPool(url, { schema });
const master1 = randomBytes(32);
const master2 = randomBytes(32);
const crypto = new CredentialCrypto({ activeKeyId: 'master-1', keys: { 'master-1': master1 } });
const vault = new CredentialVault(pool, crypto);
const opened: CredentialVault[] = [vault];
beforeAll(async () => {
  await admin.query('CREATE SCHEMA "' + schema + '"');
  await migrate(pool);
  await pool.query("INSERT INTO users(id) VALUES('owner-a'),('owner-b')");
});
afterAll(async () => {
  for (const instance of opened) instance.close();
  await pool.end();
  if (!/^t04_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe namespace');
  await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
  await admin.end();
});
describe('envelope encryption', () => {
  it('uses distinct authenticated nonces and binds owner and credential identity', () => {
    const one = crypto.encrypt('owner-a', 'credential-a', 'synthetic-provider-secret');
    const two = crypto.encrypt('owner-a', 'credential-a', 'synthetic-provider-secret');
    expect(one.data.nonce).not.toBe(two.data.nonce);
    expect(one.wrappedKey.nonce).not.toBe(two.wrappedKey.nonce);
    expect(crypto.decrypt('owner-a', 'credential-a', one)).toBe('synthetic-provider-secret');
    expect(() => crypto.decrypt('owner-b', 'credential-a', one)).toThrow('VAULT_DECRYPTION_FAILED');
    expect(() => crypto.decrypt('owner-a', 'credential-b', one)).toThrow('VAULT_DECRYPTION_FAILED');
    expect(JSON.stringify(one)).not.toContain('synthetic-provider-secret');
  });
  it('rejects altered ciphertext and missing master keys without leaking secret material', () => {
    const blob = crypto.encrypt('owner-a', 'credential-a', 'synthetic-provider-secret');
    expect(() => crypto.decrypt('owner-a', 'credential-a', { ...blob, data: { ...blob.data, tag: Buffer.alloc(16).toString('base64') } })).toThrow('VAULT_DECRYPTION_FAILED');
    const other = new CredentialCrypto({ activeKeyId: 'master-2', keys: { 'master-2': master2 } });
    expect(() => other.decrypt('owner-a', 'credential-a', blob)).toThrow('VAULT_DECRYPTION_FAILED');
    expect(() => new CredentialCrypto({ activeKeyId: 'short', keys: { short: Buffer.alloc(8) } })).toThrow('INVALID_MASTER_KEY');
  });
});
describe('PostgreSQL-backed credential vault', () => {
  it('isolates owners and revokes persistent access across vault instances', async () => {
    const ref = await vault.put('owner-a', 'synthetic-test-secret', 'persistent');
    expect(ref.mask).not.toContain('synthetic-test-secret');
    await expect(vault.get('owner-b', ref.id)).rejects.toThrow('NOT_FOUND');
    const second = new CredentialVault(pool, crypto); opened.push(second);
    expect(await second.get('owner-a', ref.id)).toBe('synthetic-test-secret');
    await vault.revoke('owner-a', ref.id);
    await expect(second.get('owner-a', ref.id)).rejects.toThrow('NOT_FOUND');
  });
  it('never persists session plaintext and cannot restore it in another process instance', async () => {
    const ref = await vault.put('owner-a', 'session-secret-not-for-disk', 'session');
    expect(await vault.get('owner-a', ref.id)).toBe('session-secret-not-for-disk');
    const row = (await pool.query('SELECT * FROM credentials WHERE id=$1', [ref.id])).rows[0];
    expect(row.encrypted).toBeNull();
    expect(JSON.stringify(row)).not.toContain('session-secret-not-for-disk');
    expect(JSON.stringify(vault)).not.toContain('session-secret-not-for-disk');
    const restarted = new CredentialVault(pool, crypto); opened.push(restarted);
    await expect(restarted.get('owner-a', ref.id)).rejects.toThrow('NOT_FOUND');
    expect(await vault.get('owner-a', ref.id)).toBe('session-secret-not-for-disk');
  });
  it('expires session credentials after eight hours without use', async () => {
    const ref = await vault.put('owner-a', 'expiring-session-secret', 'session');
    await pool.query("UPDATE credentials SET last_used_at=clock_timestamp()-interval '8 hours 1 second' WHERE id=$1", [ref.id]);
    await expect(vault.get('owner-a', ref.id)).rejects.toThrow('NOT_FOUND');
  });
  it('rotates wrapped data keys and survives restart without the old master key', async () => {
    const ref = await vault.put('owner-a', 'rotate-this-provider-secret', 'persistent');
    const before = (await pool.query('SELECT encrypted FROM credentials WHERE id=$1', [ref.id])).rows[0].encrypted;
    const rotating = new CredentialVault(pool, new CredentialCrypto({ activeKeyId: 'master-2', keys: { 'master-1': master1, 'master-2': master2 } })); opened.push(rotating);
    await rotating.rotate('owner-a', ref.id);
    const after = (await pool.query('SELECT encrypted FROM credentials WHERE id=$1', [ref.id])).rows[0].encrypted;
    expect(after.keyId).toBe('master-2');
    expect(after.wrappedKey.nonce).not.toBe(before.wrappedKey.nonce);
    expect(after.data).toEqual(before.data);
    const restarted = new CredentialVault(pool, new CredentialCrypto({ activeKeyId: 'master-2', keys: { 'master-2': master2 } })); opened.push(restarted);
    expect(await restarted.get('owner-a', ref.id)).toBe('rotate-this-provider-secret');
  });
  it('requires a master key only for opt-in persistent storage', async () => {
    const sessionOnly = new CredentialVault(pool); opened.push(sessionOnly);
    const ref = await sessionOnly.put('owner-a', 'temporary-provider-secret', 'session');
    expect(await sessionOnly.get('owner-a', ref.id)).toBe('temporary-provider-secret');
    await expect(sessionOnly.put('owner-a', 'persistent-provider-secret', 'persistent')).rejects.toThrow('PERSISTENT_STORAGE_UNAVAILABLE');
  });
  it('cancels pending/running jobs and clears ciphertext on credential revocation', async () => {
    const repo = new CampaignRepository(pool);
    const world = fixtureWorld(); world.campaignId = randomUUID();
    await pool.query('INSERT INTO scenario_versions(digest,manifest) VALUES($1,$2)', [world.scenarioDigest, { synthetic: true }]);
    await repo.createCampaign('owner-a', world);
    const ref = await vault.put('owner-a', 'job-provider-secret', 'persistent');
    const command = { commandId: randomUUID(), campaignId: world.campaignId, expectedRevision: 0, idempotencyKey: randomUUID(), type: 'advance_time', payload: { toDate: '1991-12-27', stopAtNextEvent: false } };
    const job = await repo.enqueueCommand('owner-a', command);
    await pool.query('UPDATE jobs SET credential_id=$2 WHERE id=$1', [job.id, ref.id]);
    const lease = await repo.claimJob('owner-a', job.id);
    await vault.revoke('owner-a', ref.id);
    const row = (await pool.query('SELECT status,fence FROM jobs WHERE id=$1', [job.id])).rows[0];
    expect(row.status).toBe('cancelled');
    expect(Number(row.fence)).toBeGreaterThan(lease.fence);
    expect((await pool.query('SELECT encrypted FROM credentials WHERE id=$1', [ref.id])).rows[0].encrypted).toBeNull();
  });
});
