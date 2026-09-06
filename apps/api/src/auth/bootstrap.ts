import { randomUUID } from 'node:crypto';
import { transaction } from '@astra/db';
import type { DatabasePool } from '@astra/db';
import { sameSecret } from './session.js';

export class OwnerBootstrap {
  #proof: string;
  constructor(private readonly pool: DatabasePool, token: string) {
    if (token.length < 32 || token.length > 256) throw new Error('INVALID_BOOTSTRAP_TOKEN');
    this.#proof = token;
  }
  #authorize(proof: string) {
    if (typeof proof !== 'string' || proof.length > 256 || !sameSecret(proof, this.#proof)) throw new Error('UNAUTHORIZED');
  }
  async bootstrap(proof: string): Promise<string> {
    this.#authorize(proof);
    return transaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(7420401)');
      const existing = await client.query('SELECT owner_id FROM deployment_owner WHERE singleton=true');
      if (existing.rows[0]) throw new Error('ALREADY_BOOTSTRAPPED');
      const ownerId = randomUUID();
      await client.query('INSERT INTO users(id) VALUES($1)', [ownerId]);
      await client.query('INSERT INTO deployment_owner(singleton,owner_id) VALUES(true,$1)', [ownerId]);
      return ownerId;
    });
  }
  async login(proof: string): Promise<string> {
    this.#authorize(proof);
    const result = await this.pool.query('SELECT owner_id FROM deployment_owner WHERE singleton=true');
    if (!result.rows[0]) throw new Error('BOOTSTRAP_REQUIRED');
    return String(result.rows[0].owner_id);
  }
}
