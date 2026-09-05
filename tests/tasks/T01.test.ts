import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';

const servers: ReturnType<typeof buildServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((app) => app.close())); });

describe('process health', () => {
  it('answers without a database or AI credential', async () => {
    const app = buildServer();
    servers.push(app);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('does not treat unknown endpoints as a healthy response', async () => {
    const app = buildServer();
    servers.push(app);
    expect((await app.inject({ method: 'GET', url: '/not-a-route' })).statusCode).toBe(404);
  });
});
