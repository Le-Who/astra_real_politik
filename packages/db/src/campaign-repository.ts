import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { CanonicalEventSchema, CommandEnvelopeSchema, IdSchema, WorldSnapshotSchema, WorldStateSchema } from '@astra/contracts';
import type { CanonicalEvent, WorldState } from '@astra/contracts';
import { transaction } from './connection.js';
import { campaigns, worldEvents, worldSnapshots } from './schema.js';
import { hashJson } from './hash.js';
import { writeProjections } from './projections.js';
import { commitWorld } from './commit-world.js';
import type { CommitInput } from './commit-world.js';

export class CampaignRepository {
  constructor(private readonly pool: Pool) {}

  async createCampaign(ownerId: string, input: WorldState): Promise<void> {
    IdSchema.parse(ownerId);
    const state = WorldStateSchema.parse(input);
    if (state.revision !== 0) throw new Error('INITIAL_REVISION_REQUIRED');
    await transaction(this.pool, async (client) => {
      await client.query('INSERT INTO campaigns(id,owner_id,scenario_digest) VALUES($1,$2,$3)', [state.campaignId, ownerId, state.scenarioDigest]);
      await client.query('INSERT INTO world_snapshots(campaign_id,revision,schema_version,snapshot_version,state,state_hash) VALUES($1,0,1,1,$2,$3)', [state.campaignId, state, hashJson(state)]);
      await writeProjections(client, state);
    });
  }

  // Server-internal authoritative read. HTTP routes must create a player projection.
  async loadWorld(ownerId: string, campaignId: string, revision?: number): Promise<WorldState> {
    const db = drizzle(this.pool);
    const rows = await db.select({ state: worldSnapshots.state, hash: worldSnapshots.stateHash, schemaVersion: worldSnapshots.schemaVersion, snapshotVersion: worldSnapshots.snapshotVersion, revision: worldSnapshots.revision, scenarioDigest: campaigns.scenarioDigest })
      .from(worldSnapshots).innerJoin(campaigns, eq(worldSnapshots.campaignId, campaigns.id))
      .where(and(eq(campaigns.ownerId, ownerId), eq(campaigns.id, campaignId),
        revision === undefined ? eq(worldSnapshots.revision, campaigns.revision) : eq(worldSnapshots.revision, revision))).limit(1);
    const row = rows[0];
    if (!row) throw new Error('NOT_FOUND');
    const snapshot = WorldSnapshotSchema.parse({ schemaVersion: row.schemaVersion, snapshotVersion: row.snapshotVersion, state: row.state });
    if (snapshot.state.campaignId !== campaignId || snapshot.state.revision !== row.revision || snapshot.state.scenarioDigest !== row.scenarioDigest) throw new Error('SNAPSHOT_IDENTITY_MISMATCH');
    if (hashJson(snapshot.state) !== row.hash) throw new Error('SNAPSHOT_HASH_MISMATCH');
    return snapshot.state;
  }

  async loadEvents(ownerId: string, campaignId: string): Promise<CanonicalEvent[]> {
    const db = drizzle(this.pool);
    const owners = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerId, ownerId))).limit(1);
    if (!owners[0]) throw new Error('NOT_FOUND');
    const rows = await db.select({ data: worldEvents.data }).from(worldEvents)
      .where(eq(worldEvents.campaignId, campaignId)).orderBy(asc(worldEvents.revision), asc(worldEvents.eventIndex));
    return rows.map((row) => CanonicalEventSchema.parse(row.data));
  }

  async enqueueCommand(ownerId: string, input: unknown): Promise<{ id: string }> {
    const command = CommandEnvelopeSchema.parse(input);
    const inputHash = hashJson(command);
    return transaction(this.pool, async (client) => {
      const campaign = await client.query('SELECT revision FROM campaigns WHERE id=$1 AND owner_id=$2 FOR UPDATE', [command.campaignId, ownerId]);
      if (!campaign.rows[0]) throw new Error('NOT_FOUND');
      const existing = await client.query('SELECT j.id,c.input_hash FROM commands c JOIN jobs j ON j.command_id=c.id WHERE c.owner_id=$1 AND c.idempotency_key=$2', [ownerId, command.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].input_hash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return { id: String(existing.rows[0].id) };
      }
      if (command.type === 'cancel_job') {
        const target = await client.query('SELECT id FROM jobs WHERE id=$1 AND owner_id=$2 AND campaign_id=$3', [command.payload.jobId, ownerId, command.campaignId]);
        if (!target.rows[0]) throw new Error('NOT_FOUND');
      } else if (Number(campaign.rows[0].revision) !== command.expectedRevision) throw new Error('STALE_REVISION');
      await client.query('INSERT INTO commands(id,owner_id,campaign_id,idempotency_key,input_hash,envelope) VALUES($1,$2,$3,$4,$5,$6)', [command.commandId, ownerId, command.campaignId, command.idempotencyKey, inputHash, command]);
      const id = randomUUID();
      await client.query("INSERT INTO jobs(id,owner_id,campaign_id,command_id,status,expected_revision) VALUES($1,$2,$3,$4,'pending',$5)", [id, ownerId, command.campaignId, command.commandId, command.expectedRevision]);
      return { id };
    });
  }

  async claimJob(ownerId: string, jobId: string): Promise<{ id: string; fence: number }> {
    return transaction(this.pool, async (client) => {
      const exists = await client.query('SELECT id FROM jobs WHERE id=$1 AND owner_id=$2', [jobId, ownerId]);
      if (!exists.rows[0]) throw new Error('NOT_FOUND');
      const result = await client.query("UPDATE jobs SET status='running', fence=fence+1, lease_expires_at=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND owner_id=$2 AND (status='pending' OR (status='running' AND lease_expires_at<clock_timestamp())) RETURNING id,fence", [jobId, ownerId]);
      if (!result.rows[0]) throw new Error('JOB_UNAVAILABLE');
      return { id: String(result.rows[0].id), fence: Number(result.rows[0].fence) };
    });
  }

  commitWorld(input: CommitInput) { return commitWorld(this.pool, input); }
}
