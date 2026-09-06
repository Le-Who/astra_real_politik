import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { privateAuthRoutes } from './routes/credentials.js';
import type { PrivateAuthServices } from './routes/credentials.js';

export function buildServer(options: { logger?: boolean; auth?: PrivateAuthServices } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ? {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.body.key', 'req.body.token'],
      serializers: { req: (request) => ({ method: request.method, url: String(request.url).split('?')[0] ?? '/', remoteAddress: request.ip }) },
    } : false,
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
  });

  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  }, async () => ({ status: 'ok' as const }));

  if (options.auth) void app.register(privateAuthRoutes, { ...options.auth, prefix: '/api/v1' });
  return app;
}
