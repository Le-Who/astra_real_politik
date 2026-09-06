import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate } from '../../packages/db/src/index.js';
import { CredentialVault } from '../../packages/ai/src/index.js';
import { SessionStore } from '../../apps/api/src/auth/session.js';
import { OwnerBootstrap } from '../../apps/api/src/auth/bootstrap.js';
import { readDeploymentConfig } from '../../apps/api/src/auth/config.js';
import { buildServer } from '../../apps/api/src/server.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/astra_test')) throw new Error('Dedicated TEST_DATABASE_URL required');
const schema = 't04_auth_' + randomUUID().replaceAll('-', '');
const admin = createPool(url);
const pool = createPool(url, { schema });
const token = 'synthetic-bootstrap-token-for-tests-only';
const sessions = new SessionStore(pool);
const bootstrap = new OwnerBootstrap(pool, token);
const vault = new CredentialVault(pool);
const app = buildServer({ auth: { origin: 'https://game.example', sessions, bootstrap, vault } });
let ownerId: string;
beforeAll(async () => {
  await admin.query('CREATE SCHEMA "' + schema + '"');
  await migrate(pool);
  ownerId = await bootstrap.bootstrap(token);
});
afterAll(async () => {
  await app.close(); vault.close(); await pool.end();
  if (!/^t04_auth_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe namespace');
  await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); await admin.end();
});

describe('server sessions', () => {
  it('keeps bearer tokens out of the database and revokes them', async () => {
    const session = await sessions.create(ownerId);
    expect((await sessions.read(session.token))?.ownerId).toBe(ownerId);
    const rows = await pool.query('SELECT * FROM sessions');
    expect(JSON.stringify(rows.rows)).not.toContain(session.token);
    await sessions.revoke(session.token);
    expect(await sessions.read(session.token)).toBeNull();
  });
  it('expires inactive sessions and rejects malformed tokens', async () => {
    const session = await sessions.create(ownerId);
    await pool.query("UPDATE sessions SET last_seen_at=clock_timestamp()-interval '9 hours'");
    expect(await sessions.read(session.token)).toBeNull();
    expect(await sessions.read('invalid')).toBeNull();
  });
  it('allows one bootstrap and authenticates returning owner without disclosing proof', async () => {
    await expect(bootstrap.bootstrap(token)).rejects.toThrow('ALREADY_BOOTSTRAPPED');
    expect(await bootstrap.login(token)).toBe(ownerId);
    await expect(bootstrap.login('wrong-bootstrap-token')).rejects.toThrow('UNAUTHORIZED');
  });
});
describe('authenticated API boundary', () => {
  it('classifies unsupported media types without reflecting request input', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login',
      headers: { origin: 'https://game.example', 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'token=synthetic-form-secret' });
    expect(response.statusCode).toBe(415);
    expect(response.body).not.toContain('synthetic-form-secret');
  });
  it('sets secure HttpOnly cookies and omits bearer token from JSON', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://game.example' }, payload: { token } });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Lax');
    expect(login.json()).not.toHaveProperty('token');
    const session = await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie: cookie.split(';')[0]! } });
    expect(session.json()).toMatchObject({ ownerId, mode: 'private', csrfToken: expect.any(String) });
  });
  it('requires same origin, session and CSRF to store a key, defaults to session storage', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://game.example' }, payload: { token } });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const csrf = login.json().csrfToken;
    const payload = { key: 'synthetic-http-provider-key', trustServer: true };
    expect((await app.inject({ method: 'POST', url: '/api/v1/credentials', headers: { origin: 'https://evil.example', cookie, 'x-csrf-token': csrf }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/credentials', headers: { origin: 'https://game.example', cookie }, payload })).statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/v1/credentials', headers: { origin: 'https://game.example', cookie, 'x-csrf-token': csrf }, payload });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(payload.key);
    const list = await app.inject({ method: 'GET', url: '/api/v1/credentials', headers: { cookie } });
    expect(list.json().credentials).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.json().id, storage: 'session' })]));
    expect(list.body).not.toContain(payload.key);
    const persistent = await app.inject({ method: 'POST', url: '/api/v1/credentials', headers: { origin: 'https://game.example', cookie, 'x-csrf-token': csrf }, payload: { ...payload, mode: 'persistent' } });
    expect(persistent.statusCode).toBe(400);
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: 'https://game.example', cookie, 'x-csrf-token': csrf } });
    expect(logout.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } })).statusCode).toBe(401);
  });
  it('fails closed on public/development deployment misconfiguration', () => {
    expect(() => readDeploymentConfig({ DEPLOYMENT_MODE: 'public' })).toThrow('AUTH_CONFIG_REQUIRED');
    expect(() => readDeploymentConfig({ DEPLOYMENT_MODE: 'development', API_HOST: '0.0.0.0' })).toThrow('DEVELOPMENT_MUST_BE_LOCAL');
    expect(() => readDeploymentConfig({ DEPLOYMENT_MODE: 'private', API_HOST: '0.0.0.0', APP_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: url, BOOTSTRAP_TOKEN: token })).toThrow('HTTPS_REQUIRED');
  });
});
