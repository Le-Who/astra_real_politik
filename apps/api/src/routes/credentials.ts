import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { IdSchema } from '@astra/contracts';
import type { CredentialVault } from '@astra/ai';
import { sameSecret } from '../auth/session.js';
import type { SessionPrincipal, SessionStore } from '../auth/session.js';
import type { OwnerBootstrap } from '../auth/bootstrap.js';

export interface PrivateAuthServices { origin: string; sessions: SessionStore; bootstrap: OwnerBootstrap; vault: Pick<CredentialVault, 'put' | 'list' | 'revoke'> }
export async function privateAuthRoutes(app: FastifyInstance, services: PrivateAuthServices): Promise<void> {
  const origin = new URL(services.origin);
  const secure = origin.protocol === 'https:';
  if (!secure && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw new Error('HTTPS_REQUIRED');
  const cookieName = secure ? '__Host-astra_session' : 'astra_session';
  const principals = new WeakMap<FastifyRequest, SessionPrincipal>();
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute', cache: 10_000 });
  app.setErrorHandler((error, _request, reply) => {
    const err = error instanceof Error ? error : new Error('INTERNAL_ERROR');
    const statuses: Record<string, number> = { UNAUTHORIZED: 401, NOT_FOUND: 404, ALREADY_BOOTSTRAPPED: 409,
      BOOTSTRAP_REQUIRED: 409, INVALID_CREDENTIAL: 400, PERSISTENT_STORAGE_UNAVAILABLE: 503, VAULT_DECRYPTION_FAILED: 503 };
    const isSchema = error instanceof z.ZodError || (typeof error === 'object' && error !== null && 'validation' in error);
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const transport: Record<number, string> = { 400: 'INVALID_REQUEST', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 429: 'RATE_LIMITED' };
    const code = isSchema ? 'INVALID_REQUEST' : transport[status] ?? (statuses[err.message] ? err.message : 'INTERNAL_ERROR');
    reply.code(isSchema ? 400 : transport[status] ? status : statuses[err.message] ?? 500).send({ error: code });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (unsafe && request.headers.origin !== origin.origin) return reply.code(403).send({ error: 'ORIGIN_REJECTED' });
    const path = request.url.split('?')[0];
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/bootstrap') return;
    const principal = await services.sessions.read(request.cookies[cookieName]);
    if (!principal) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const csrf = request.headers['x-csrf-token'];
    if (unsafe && (typeof csrf !== 'string' || csrf.length > 128 || !sameSecret(csrf, principal.csrfToken))) return reply.code(403).send({ error: 'CSRF_REJECTED' });
    principals.set(request, principal);
  });
  const proof = z.strictObject({ token: z.string().min(1).max(256) });
  const sessionCookie = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const, maxAge: 7 * 24 * 60 * 60 };
  for (const action of ['bootstrap', 'login'] as const) {
    app.post('/auth/' + action, { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
      const ownerId = await services.bootstrap[action](proof.parse(request.body).token);
      const session = await services.sessions.create(ownerId);
      reply.setCookie(cookieName, session.token, sessionCookie);
      return { ownerId, csrfToken: session.csrfToken, expiresAt: session.expiresAt, mode: 'private' };
    });
  }
  app.get('/session', async (request) => ({ ...principals.get(request)!, mode: 'private' }));
  app.post('/auth/logout', async (request, reply) => {
    await services.sessions.revoke(request.cookies[cookieName]);
    reply.clearCookie(cookieName, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
    return reply.code(204).send();
  });
  app.get('/credentials', async (request) => ({ credentials: await services.vault.list(principals.get(request)!.ownerId) }));
  const credential = z.strictObject({
    key: z.string().min(8).max(512), mode: z.enum(['session', 'persistent']).default('session'),
    trustServer: z.literal(true), persistentConsent: z.boolean().default(false),
  }).refine((value) => value.mode !== 'persistent' || value.persistentConsent, 'Explicit persistent storage consent required');
  app.post('/credentials', { bodyLimit: 4096 }, async (request, reply) => {
    const value = credential.parse(request.body);
    const ref = await services.vault.put(principals.get(request)!.ownerId, value.key, value.mode);
    return reply.code(201).send(ref);
  });
  app.delete('/credentials/:id', async (request, reply) => {
    const id = z.strictObject({ id: IdSchema }).parse(request.params).id;
    await services.vault.revoke(principals.get(request)!.ownerId, id);
    return reply.code(204).send();
  });
}
