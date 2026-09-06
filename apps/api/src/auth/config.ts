export interface DeploymentConfig {
  mode: 'development' | 'private' | 'public'; host: string; port: number;
  origin?: string; databaseUrl?: string; bootstrapToken?: string;
  oidcIssuer?: string; oidcClientId?: string; oidcClientSecret?: string;
}
export function readDeploymentConfig(env: Record<string, string | undefined>): DeploymentConfig {
  const mode = env.DEPLOYMENT_MODE ?? (env.NODE_ENV === 'production' ? 'private' : 'development');
  if (!['development', 'private', 'public'].includes(mode)) throw new Error('INVALID_DEPLOYMENT_MODE');
  const host = env.API_HOST ?? '127.0.0.1';
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_API_PORT');
  if (mode === 'development') {
    if (!['127.0.0.1', '::1', 'localhost'].includes(host) || env.NODE_ENV === 'production') throw new Error('DEVELOPMENT_MUST_BE_LOCAL');
    return { mode, host, port };
  }
  if (!env.APP_ORIGIN || !env.DATABASE_URL) throw new Error('AUTH_CONFIG_REQUIRED');
  const origin = new URL(env.APP_ORIGIN);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_APP_ORIGIN');
  if (origin.protocol !== 'https:' && !(mode === 'private' && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw new Error('HTTPS_REQUIRED');
  if (origin.protocol === 'http:' && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('HTTPS_REQUIRED');
  if (mode === 'private') {
    if (!env.BOOTSTRAP_TOKEN || env.BOOTSTRAP_TOKEN.length < 32 || env.BOOTSTRAP_TOKEN.length > 256) throw new Error('AUTH_CONFIG_REQUIRED');
    return { mode, host, port, origin: origin.origin, databaseUrl: env.DATABASE_URL, bootstrapToken: env.BOOTSTRAP_TOKEN };
  }
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) throw new Error('AUTH_CONFIG_REQUIRED');
  if (new URL(env.OIDC_ISSUER).protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
  return { mode: 'public', host, port, origin: origin.origin, databaseUrl: env.DATABASE_URL,
    oidcIssuer: env.OIDC_ISSUER, oidcClientId: env.OIDC_CLIENT_ID, oidcClientSecret: env.OIDC_CLIENT_SECRET };
}
