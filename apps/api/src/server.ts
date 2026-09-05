import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export function buildServer(options: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ? {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
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

  return app;
}
