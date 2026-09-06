import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { CanonicalEventSchema, EvidenceSchema, IdSchema, RevisionSchema, WorldProposalSchema, WorldSnapshotSchema } from '@astra/contracts';
import type { CanonicalEvent, WorldProposal, WorldState } from '@astra/contracts';
import { canonicalize, reduce } from '@astra/engine';
import { transaction } from './connection.js';
import { hashJson } from './hash.js';
import { writeProjections } from './projections.js';

export interface CommitInput { ownerId: string; expectedRevision: number; jobId: string; fence: number; proposal: WorldProposal }
export async function commitWorld(pool: Pool, input: CommitInput): Promise<{ state: WorldState; events: CanonicalEvent[] }> {
  IdSchema.parse(input.ownerId); IdSchema.parse(input.jobId);
  RevisionSchema.parse(input.expectedRevision); RevisionSchema.parse(input.fence);
  const proposal = WorldProposalSchema.parse(input.proposal);
  const inputHash = hashJson({ expectedRevision: input.expectedRevision, proposal });
  return transaction(pool, async (client) => {
    const identity = await client.query('SELECT campaign_id FROM jobs WHERE id=$1 AND owner_id=$2', [input.jobId, input.ownerId]);
    if (!identity.rows[0]) throw new Error('NOT_FOUND');
    const campaignId = String(identity.rows[0].campaign_id);
    // Lock order is campaign -> job, shared with all modifying repository paths.
    const campaigns = await client.query('SELECT revision,scenario_digest FROM campaigns WHERE id=$1 AND owner_id=$2 FOR UPDATE', [campaignId, input.ownerId]);
    if (!campaigns.rows[0]) throw new Error('NOT_FOUND');
    const jobs = await client.query('SELECT *,lease_expires_at>clock_timestamp() AS lease_valid FROM jobs WHERE id=$1 AND owner_id=$2 FOR UPDATE', [input.jobId, input.ownerId]);
    const job = jobs.rows[0];
    if (!job) throw new Error('NOT_FOUND');
    if (job.status === 'committed') {
      if (job.input_hash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
      const snapshots = await client.query('SELECT state,state_hash,schema_version,snapshot_version FROM world_snapshots WHERE campaign_id=$1 AND revision=$2', [campaignId, job.committed_revision]);
      const saved = snapshots.rows[0];
      if (!saved) throw new Error('SNAPSHOT_MISSING');
      const state = WorldSnapshotSchema.parse({ schemaVersion: saved.schema_version, snapshotVersion: saved.snapshot_version, state: saved.state }).state;
      if (state.campaignId !== campaignId || state.revision !== Number(job.committed_revision) || state.scenarioDigest !== campaigns.rows[0].scenario_digest) throw new Error('SNAPSHOT_IDENTITY_MISMATCH');
      if (hashJson(state) !== saved.state_hash) throw new Error('SNAPSHOT_HASH_MISMATCH');
      const rows = await client.query('SELECT data FROM world_events WHERE job_id=$1 ORDER BY event_index', [input.jobId]);
      return { state, events: rows.rows.map((row) => CanonicalEventSchema.parse(row.data)) };
    }
    if (job.status !== 'running' || Number(job.fence) !== input.fence || !job.lease_valid) throw new Error('LEASE_LOST');
    if (Number(campaigns.rows[0].revision) !== input.expectedRevision || Number(job.expected_revision) !== input.expectedRevision || proposal.baseRevision !== input.expectedRevision) throw new Error('STALE_REVISION');
    const snapshots = await client.query('SELECT * FROM world_snapshots WHERE campaign_id=$1 AND revision=$2', [campaignId, input.expectedRevision]);
    const saved = snapshots.rows[0];
    if (!saved) throw new Error('SNAPSHOT_MISSING');
    const original = WorldSnapshotSchema.parse({ schemaVersion: saved.schema_version, snapshotVersion: saved.snapshot_version, state: saved.state }).state;
    if (original.campaignId !== campaignId || original.revision !== input.expectedRevision || original.scenarioDigest !== campaigns.rows[0].scenario_digest) throw new Error('SNAPSHOT_IDENTITY_MISMATCH');
    if (hashJson(original) !== saved.state_hash) throw new Error('SNAPSHOT_HASH_MISMATCH');
    const prior = await client.query('SELECT event_id, data->>\'occursOn\' AS occurs_on FROM world_events WHERE campaign_id=$1', [campaignId]);
    const sources = await client.query('SELECT id,data FROM source_records WHERE scenario_digest=$1', [original.scenarioDigest]);
    const events = canonicalize(original, proposal, { jobId: input.jobId, createdAt: new Date().toISOString(), modelCallIds: [] }, {
      priorEvents: Object.fromEntries(prior.rows.map((row) => [String(row.event_id), { occursOn: String(row.occurs_on) }])),
      evidence: Object.fromEntries(sources.rows.map((row) => [String(row.id), EvidenceSchema.parse(row.data)])),
    });
    const state = reduce(original, events);
    const updated = await client.query('UPDATE campaigns SET revision=revision+1,sse_sequence=sse_sequence+1 WHERE id=$1 AND owner_id=$2 AND revision=$3 RETURNING sse_sequence', [campaignId, input.ownerId, input.expectedRevision]);
    if (updated.rowCount !== 1) throw new Error('STALE_REVISION');
    for (const [index, event] of events.entries()) {
      await client.query('INSERT INTO world_events(event_id,campaign_id,revision,event_index,job_id,schema_version,data,occurs_on,visibility) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8)', [event.eventId, campaignId, state.revision, index, input.jobId, event, event.occursOn, event.visibility]);
    }
    await writeProjections(client, state, events);
    await client.query('INSERT INTO world_snapshots(campaign_id,revision,schema_version,snapshot_version,state,state_hash) VALUES($1,$2,1,1,$3,$4)', [campaignId, state.revision, state, hashJson(state)]);
    // Fencing/expiry is checked again after all writes, immediately before commit.
    const finished = await client.query("UPDATE jobs SET status='committed',input_hash=$3,committed_revision=$4,checkpoint=$5,lease_expires_at=NULL WHERE id=$1 AND fence=$2 AND status='running' AND lease_expires_at>clock_timestamp()", [input.jobId, input.fence, inputHash, state.revision, { stage: 'committed', revision: state.revision }]);
    if (finished.rowCount !== 1) throw new Error('LEASE_LOST');
    await client.query("INSERT INTO outbox(id,campaign_id,sequence,revision,type,data) VALUES($1,$2,$3,$4,'world.committed',$5)", [randomUUID(), campaignId, updated.rows[0].sse_sequence, state.revision, { jobId: input.jobId, eventIds: events.map((event) => event.eventId) }]);
    return { state, events };
  });
}
