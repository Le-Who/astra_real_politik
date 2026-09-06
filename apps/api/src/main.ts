import { buildServer } from './server.js';
import { createPool, migrate } from '@astra/db';
import type { DatabasePool } from '@astra/db';
import { CredentialCrypto, CredentialVault } from '@astra/ai';
import { readDeploymentConfig } from './auth/config.js';
import { SessionStore } from './auth/session.js';
import { OwnerBootstrap } from './auth/bootstrap.js';
import type { PrivateAuthServices } from './routes/credentials.js';

let pool: DatabasePool | undefined;
let vault: CredentialVault | undefined;
try {
  const config = readDeploymentConfig(process.env);
  // Public mode must never silently fall back to local-owner or unauthenticated access.
  if (config.mode === 'public') throw new Error('PUBLIC_OIDC_INTEGRATION_PENDING');
  let auth: PrivateAuthServices | undefined;
  if (config.mode === 'private') {
    pool = createPool(config.databaseUrl!);
    await migrate(pool);
    let encryption: CredentialCrypto | undefined;
    if (process.env.VAULT_MASTER_KEY) {
      const key = Buffer.from(process.env.VAULT_MASTER_KEY, 'base64');
      if (key.length !== 32 || key.toString('base64') !== process.env.VAULT_MASTER_KEY) throw new Error('INVALID_MASTER_KEY');
      const keyId = process.env.VAULT_MASTER_KEY_ID ?? 'master-1';
      encryption = new CredentialCrypto({ activeKeyId: keyId, keys: { [keyId]: key } });
      key.fill(0);
    }
    vault = new CredentialVault(pool, encryption);
    auth = { origin: config.origin!, sessions: new SessionStore(pool), bootstrap: new OwnerBootstrap(pool, config.bootstrapToken!), vault };
  }
  const app = buildServer({ logger: true, ...(auth ? { auth } : {}) });
  app.addHook('onClose', async () => {
    vault?.close();
    await pool?.end();
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  }
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  vault?.close();
  await pool?.end();
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'STARTUP_FAILED';
  process.stderr.write(code + '\n');
  process.exitCode = 1;
}
