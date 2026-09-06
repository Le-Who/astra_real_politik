import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { transaction } from './connection.js';

export async function migrate(pool: Pool): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const filenames = (await readdir(directory)).filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name)).sort();
  if (filenames.length === 0) throw new Error('MIGRATIONS_MISSING');
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(7420186)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const filename of filenames) {
      const sql = await readFile(new URL(filename, directory), 'utf8');
      const digest = createHash('sha256').update(sql).digest('hex');
      const version = filename.replace(/\.sql$/, '');
      const previous = await client.query('SELECT digest FROM schema_migrations WHERE version=$1', [version]);
      if (previous.rows.length) {
        if (previous.rows[0].digest !== digest) throw new Error('MIGRATION_CHECKSUM_MISMATCH: ' + version);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version,digest) VALUES($1,$2)', [version, digest]);
    }
  });
}
