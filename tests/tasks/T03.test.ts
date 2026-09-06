import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createPool, migrate, CampaignRepository, hashJson, claimOutbox, acknowledgeOutbox } from '../../packages/db/src/index.js';
import { replay } from '../../packages/engine/src/index.js';
import { fixtureEvent, fixtureProposal, fixtureWorld } from '../fixtures/world.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith('/astra_test')) throw new Error('A dedicated TEST_DATABASE_URL with database name astra_test* is required');
const schema = 't03_' + randomUUID().replaceAll('-', '');
const admin = createPool(url);
const pool = createPool(url, { schema });
const repo = new CampaignRepository(pool);
beforeAll(async () => {
  await admin.query('CREATE SCHEMA "' + schema + '"');
  await migrate(pool);
  await pool.query("INSERT INTO users (id) VALUES ('owner-a'), ('owner-b')");
  await pool.query("INSERT INTO scenario_versions (digest, manifest) VALUES ($1, $2)", ['a'.repeat(64), { synthetic: true }]);
});
afterAll(async () => {
  await pool.end();
  // Only this test-created, regex-validated namespace; never public/user data.
  if (!/^t03_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test namespace');
  await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
  await admin.end();
});

async function campaign() {
  const world = fixtureWorld();
  world.campaignId = randomUUID();
  await repo.createCampaign('owner-a', world);
  return world;
}
async function job(campaignId: string, key = randomUUID()) {
  const row = await repo.enqueueCommand('owner-a', {
    commandId: randomUUID(), campaignId, expectedRevision: 0, idempotencyKey: key,
    type: 'advance_time', payload: { toDate: '1991-12-27', stopAtNextEvent: false },
  });
  return repo.claimJob('owner-a', row.id);
}
describe('PostgreSQL atomic campaign history', () => {
  it('applies migrations once and records their checksum', async () => {
    await migrate(pool);
    const result = await pool.query('SELECT version, digest FROM schema_migrations');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ version: '0001_core', digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it('allows only one concurrent commit at an expected revision', async () => {
    const world = await campaign();
    const [a, b] = await Promise.all([job(world.campaignId), job(world.campaignId)]);
    const results = await Promise.allSettled([a, b].map((lease) => repo.commitWorld({
      ownerId: 'owner-a', expectedRevision: 0, jobId: lease.id, fence: lease.fence, proposal: fixtureProposal(),
    })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await repo.loadWorld('owner-a', world.campaignId)).revision).toBe(1);
    expect(await repo.loadEvents('owner-a', world.campaignId)).toHaveLength(1);
    const projections = await pool.query('SELECT data FROM territory_control WHERE campaign_id=$1', [world.campaignId]);
    expect(projections.rows[0]?.data.controllerId).toBe('b');
    expect((await pool.query('SELECT * FROM outbox WHERE campaign_id=$1', [world.campaignId])).rows).toHaveLength(1);
  });
  it('reuses identical commands and commits but rejects changed payloads', async () => {
    const world = await campaign();
    const command = { commandId: randomUUID(), campaignId: world.campaignId, expectedRevision: 0, idempotencyKey: randomUUID(),
      type: 'advance_time' as const, payload: { toDate: '1991-12-27', stopAtNextEvent: false } };
    const first = await repo.enqueueCommand('owner-a', command);
    expect((await repo.enqueueCommand('owner-a', command)).id).toBe(first.id);
    await expect(repo.enqueueCommand('owner-a', { ...command, payload: { ...command.payload, toDate: '1992-01-01' } })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    const lease = await repo.claimJob('owner-a', first.id);
    const input = { ownerId: 'owner-a', expectedRevision: 0, jobId: lease.id, fence: lease.fence, proposal: fixtureProposal() };
    const committed = await repo.commitWorld(input);
    expect(await repo.commitWorld(input)).toEqual(committed);
    await expect(repo.commitWorld({ ...input, proposal: fixtureProposal([]) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await repo.loadEvents('owner-a', world.campaignId)).toHaveLength(1);
  });
  it('isolates owners on reads, enqueue, claims and commit', async () => {
    const world = await campaign();
    const lease = await job(world.campaignId);
    await expect(repo.loadWorld('owner-b', world.campaignId)).rejects.toThrow('NOT_FOUND');
    await expect(repo.loadEvents('owner-b', world.campaignId)).rejects.toThrow('NOT_FOUND');
    await expect(repo.claimJob('owner-b', lease.id)).rejects.toThrow('NOT_FOUND');
    await expect(repo.commitWorld({ ownerId: 'owner-b', expectedRevision: 0, jobId: lease.id, fence: lease.fence, proposal: fixtureProposal() })).rejects.toThrow('NOT_FOUND');
    await expect(repo.enqueueCommand('owner-b', { commandId: randomUUID(), campaignId: world.campaignId, expectedRevision: 0,
      idempotencyKey: randomUUID(), type: 'advance_time', payload: { toDate: '1991-12-27', stopAtNextEvent: false } })).rejects.toThrow('NOT_FOUND');
  });
  it('allows cancellation requests with stale revision only for owned campaign jobs', async () => {
    const world = await campaign();
    const first = await job(world.campaignId);
    const pending = await job(world.campaignId);
    await repo.commitWorld({ ownerId: 'owner-a', expectedRevision: 0, jobId: first.id, fence: first.fence, proposal: fixtureProposal() });
    const cancel = { commandId: randomUUID(), campaignId: world.campaignId, expectedRevision: 0, idempotencyKey: randomUUID(),
      type: 'cancel_job' as const, payload: { jobId: pending.id } };
    await expect(repo.enqueueCommand('owner-a', cancel)).resolves.toHaveProperty('id');
    await expect(repo.enqueueCommand('owner-a', { ...cancel, commandId: randomUUID(), idempotencyKey: randomUUID(), payload: { jobId: 'missing' } })).rejects.toThrow('NOT_FOUND');
  });
  it('rejects a snapshot whose stored identity disagrees with its row', async () => {
    const world = await campaign();
    const corrupted = { ...world, campaignId: 'wrong-campaign' };
    await pool.query('UPDATE world_snapshots SET state=$2,state_hash=$3 WHERE campaign_id=$1', [world.campaignId, corrupted, hashJson(corrupted)]);
    await expect(repo.loadWorld('owner-a', world.campaignId)).rejects.toThrow('SNAPSHOT_IDENTITY_MISMATCH');
  });
  it('rejects stale fencing tokens after an expired lease is reclaimed', async () => {
    const world = await campaign();
    const old = await job(world.campaignId);
    await pool.query("UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [old.id]);
    const current = await repo.claimJob('owner-a', old.id);
    expect(current.fence).toBe(old.fence + 1);
    await expect(repo.commitWorld({ ownerId: 'owner-a', expectedRevision: 0, jobId: old.id, fence: old.fence, proposal: fixtureProposal() })).rejects.toThrow('LEASE_LOST');
    await repo.commitWorld({ ownerId: 'owner-a', expectedRevision: 0, jobId: current.id, fence: current.fence, proposal: fixtureProposal() });
  });
  it('rolls back events, snapshot, job and outbox when projection fails', async () => {
    const world = await campaign();
    const lease = await job(world.campaignId);
    await pool.query("CREATE FUNCTION fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected projection failure'; END $$");
    await pool.query('CREATE TRIGGER fail_projection BEFORE UPDATE ON territory_control FOR EACH ROW EXECUTE FUNCTION fail_projection()');
    try {
      await expect(repo.commitWorld({ ownerId: 'owner-a', expectedRevision: 0, jobId: lease.id, fence: lease.fence, proposal: fixtureProposal() })).rejects.toThrow('injected projection failure');
      expect((await repo.loadWorld('owner-a', world.campaignId)).revision).toBe(0);
      expect(await repo.loadEvents('owner-a', world.campaignId)).toHaveLength(0);
      expect((await pool.query('SELECT * FROM outbox WHERE campaign_id=$1', [world.campaignId])).rows).toHaveLength(0);
      expect((await pool.query('SELECT status FROM jobs WHERE id=$1', [lease.id])).rows[0]?.status).toBe('running');
    } finally { await pool.query('DROP TRIGGER fail_projection ON territory_control'); await pool.query('DROP FUNCTION fail_projection()'); }
  });
  it('replays 100 committed revisions to the same canonical hash', async () => {
    const initial = await campaign();
    let world = initial;
    for (let i = 0; i < 100; i++) {
      const command = { commandId: randomUUID(), campaignId: world.campaignId, expectedRevision: world.revision, idempotencyKey: randomUUID(),
        type: 'advance_time' as const, payload: { toDate: world.date, stopAtNextEvent: false } };
      const queued = await repo.enqueueCommand('owner-a', command);
      const lease = await repo.claimJob('owner-a', queued.id);
      const proposal = { ...fixtureProposal([fixtureEvent({ occursOn: world.date, operations: [{ kind: 'upsert_relation', relation: {
        fromActorId: 'a', toActorId: 'b', trust: i, threat: 10, respect: 20, ideologicalAffinity: 0,
        economicDependence: 30, domesticAcceptability: 0, commitmentReliability: 40, reasonEventIds: [],
      } }] })]), baseRevision: world.revision, fromDate: world.date, toDate: world.date };
      world = (await repo.commitWorld({ ownerId: 'owner-a', expectedRevision: world.revision, jobId: lease.id, fence: lease.fence, proposal })).state;
    }
    const events = await repo.loadEvents('owner-a', world.campaignId);
    expect(events).toHaveLength(100);
    expect(world.relations[0]?.trust).toBe(99);
    expect(hashJson(replay(initial, events))).toBe(hashJson(await repo.loadWorld('owner-a', world.campaignId)));
  }, 30_000);
  it('leases outbox records and fences acknowledgments', async () => {
    const world = await campaign();
    const lease = await job(world.campaignId);
    await repo.commitWorld({ ownerId: 'owner-a', expectedRevision: 0, jobId: lease.id, fence: lease.fence, proposal: fixtureProposal() });
    const batch = await claimOutbox(pool, 200);
    const item = batch.find((row) => row.campaignId === world.campaignId)!;
    expect(item).toBeDefined();
    expect(await acknowledgeOutbox(pool, item.id, 'wrong-token')).toBe(false);
    expect(await acknowledgeOutbox(pool, item.id, item.deliveryToken)).toBe(true);
    expect((await claimOutbox(pool, 200)).some((row) => row.id === item.id)).toBe(false);
  });
});
