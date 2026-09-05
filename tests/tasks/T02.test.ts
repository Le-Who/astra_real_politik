import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GameDateSchema, WorldProposalSchema, WorldStateSchema, WorldOperationSchema, FactSchema, toProviderSchema } from '../../packages/contracts/src/index.js';
import { validateProposal, canonicalize, reduce, replay } from '../../packages/engine/src/index.js';
import { fixtureEvent, fixtureProposal, fixtureWorld } from '../fixtures/world.js';

describe('strict versioned contracts', () => {
  it.each(['1991-02-29', '2026-04-31', '2026-13-01', '26-01-01', '0000-01-01'])('rejects invalid calendar date %s', (date) => {
    expect(GameDateSchema.safeParse(date).success).toBe(false);
  });
  it('accepts leap days and rejects unknown structural fields', () => {
    expect(GameDateSchema.parse('2000-02-29')).toBe('2000-02-29');
    expect(WorldProposalSchema.safeParse({ ...fixtureProposal(), ownerId: 'attacker' }).success).toBe(false);
    expect(WorldProposalSchema.safeParse({ ...fixtureProposal(), schemaVersion: 2 }).success).toBe(false);
    expect(WorldOperationSchema.safeParse({ kind: 'set', path: 'territories.r1.controllerId', value: 'b' }).success).toBe(false);
  });
  it('rejects inconsistent control even inside a snapshot', () => {
    const world = fixtureWorld();
    world.territories.r1!.controlStatus = 'mixed';
    expect(WorldStateSchema.safeParse(world).success).toBe(false);
  });
  it('rejects nonfinite facts, prototype keys and excessive model output', () => {
    expect(FactSchema.safeParse({ id: 'f', subjectId: 'a', predicate: 'population', value: Infinity, unit: 'persons',
      validFrom: '1991-12-26', validTo: null, availableFrom: '1991-12-26', evidenceIds: [], visibility: { kind: 'public' }, origin: 'campaign' }).success).toBe(false);
    const world = fixtureWorld();
    Object.defineProperty(world.actors, '__proto__', { value: world.actors.a, enumerable: true });
    expect(WorldStateSchema.safeParse(world).success).toBe(false);
    expect(WorldProposalSchema.safeParse(fixtureProposal([fixtureEvent({ summary: 'x'.repeat(20_001) })])).success).toBe(false);
  });
  it('derives a bounded JSON schema without an unrestricted object escape hatch', () => {
    const schema = toProviderSchema(WorldProposalSchema);
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('schemaVersion');
    expect(JSON.stringify(schema)).toContain('"maxItems"');
  });
});

describe('proposal invariants', () => {
  it('accepts a valid settlement and rejects unknown territory IDs', () => {
    expect(validateProposal(fixtureWorld(), fixtureProposal())).toEqual({ ok: true });
    const proposal = fixtureProposal([fixtureEvent({ operations: [{ kind: 'change_control', territoryId: 'missing', fromActorId: 'a', toActorId: 'b' }] })]);
    expect(validateProposal(fixtureWorld(), proposal)).toMatchObject({ ok: false, issues: [{ code: 'UNKNOWN_ID' }] });
  });
  it('rejects stale revision, backward time and events outside the interval', () => {
    expect(validateProposal(fixtureWorld(), { ...fixtureProposal(), baseRevision: 8 })).toMatchObject({ ok: false, issues: [{ code: 'STALE_REVISION' }] });
    expect(validateProposal(fixtureWorld(), { ...fixtureProposal(), toDate: '1990-01-01' })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'TEMPORAL_CONFLICT' })]) });
    expect(validateProposal(fixtureWorld(), fixtureProposal([fixtureEvent({ occursOn: '1992-01-01' })]))).toMatchObject({ ok: false, issues: [{ code: 'TEMPORAL_CONFLICT' }] });
  });
  it('rejects double control writes and a false previous controller', () => {
    const event = fixtureEvent();
    event.operations.push({ kind: 'change_control', territoryId: 'r1', fromActorId: 'b', toActorId: 'a' });
    expect(validateProposal(fixtureWorld(), fixtureProposal([event]))).toMatchObject({ ok: false, issues: expect.arrayContaining([{ code: 'CONTRADICTORY_EFFECTS', path: expect.any(String), message: expect.any(String) }]) });
    expect(validateProposal(fixtureWorld(), fixtureProposal([fixtureEvent({ operations: [{ kind: 'change_control', territoryId: 'r1', fromActorId: 'b', toActorId: 'a' }] })]))).toMatchObject({ ok: false, issues: [{ code: 'CONTRADICTORY_EFFECTS' }] });
  });
  it('rejects forward references and cyclic causes', () => {
    const events = [
      fixtureEvent({ proposalId: 'p1', causeEventIds: ['p2'], operations: [] }),
      fixtureEvent({ proposalId: 'p2', causeEventIds: ['p1'], operations: [] }),
    ];
    expect(validateProposal(fixtureWorld(), fixtureProposal(events))).toMatchObject({ ok: false, issues: [{ code: 'TEMPORAL_CONFLICT' }] });
  });
  it('does not let generic facts rewrite control or treaty state', () => {
    const fact = { id: 'f', subjectId: 'r1', predicate: 'controllerId', value: 'b', unit: null, validFrom: '1991-12-27',
      validTo: null, availableFrom: '1991-12-27', evidenceIds: [], visibility: { kind: 'public' as const }, origin: 'campaign' as const };
    expect(validateProposal(fixtureWorld(), fixtureProposal([fixtureEvent({ operations: [{ kind: 'record_fact', fact }] })]))).toMatchObject({ ok: false, issues: [{ code: 'SCHEMA_INVALID' }] });
  });
  it('requires external evidence and authority to be supplied by the server', () => {
    expect(validateProposal(fixtureWorld(), fixtureProposal([fixtureEvent({ evidenceIds: ['invented-source'], operations: [] })]))).toMatchObject({ ok: false, issues: [{ code: 'INVALID_EVIDENCE' }] });
    expect(validateProposal(fixtureWorld(), fixtureProposal([fixtureEvent({ operations: [{ kind: 'transition_treaty', treatyId: 't', from: 'draft', to: 'active' }] })]))).toMatchObject({ ok: false, issues: [{ code: 'MISSING_CONSENT' }] });
  });
});

describe('canonical projection and replay', () => {
  it('rejects self-referential and forward causal links in imported canonical events', () => {
    const world = fixtureWorld();
    const events = canonicalize(world, fixtureProposal(), { jobId: 'job-1', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
    expect(() => replay(world, [{ ...events[0]!, causeEventIds: [events[0]!.eventId] }])).toThrow('CAUSAL_ORDER');
    const pair = canonicalize(world, fixtureProposal([
      fixtureEvent({ proposalId: 'p1', operations: [] }),
      fixtureEvent({ proposalId: 'p2', operations: [] }),
    ]), { jobId: 'job-pair', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
    expect(() => replay(world, [{ ...pair[0]!, causeEventIds: [pair[1]!.eventId] }, pair[1]!])).toThrow('CAUSAL_ORDER');
  });
  it('preserves elapsed time when a period has no narrative events', () => {
    const world = fixtureWorld();
    const events = canonicalize(world, fixtureProposal([]), { jobId: 'job-clock', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
    expect(replay(world, events)).toMatchObject({ revision: 1, date: '1991-12-27' });
    expect(events[0]!.operations).toEqual([]);
  });
  it('maps local causes to canonical IDs and applies control without altering claims', () => {
    const world = fixtureWorld();
    const original = structuredClone(world);
    const proposal = fixtureProposal([
      fixtureEvent({ proposalId: 'p1', operations: [] }),
      fixtureEvent({ proposalId: 'p2', causeEventIds: ['p1'] }),
    ]);
    const events = canonicalize(world, proposal, { jobId: 'job-1', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
    expect(events[1]!.causeEventIds).toEqual([events[0]!.eventId]);
    const state = reduce(world, events);
    expect(state.territories.r1).toMatchObject({ controllerId: 'b', controlStatus: 'single', claimantIds: ['a'], controlAsOf: '1991-12-27', controlReviewStatus: 'campaign' });
    expect(state.revision).toBe(1);
    expect(state.date).toBe('1991-12-27');
    expect(world).toEqual(original);
    expect(replay(world, events)).toEqual(state);
    expect(replay(world, [])).toEqual(world);
  });
  it('rejects duplicate, foreign-campaign and out-of-order canonical events', () => {
    const world = fixtureWorld();
    const events = canonicalize(world, fixtureProposal(), { jobId: 'job-1', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
    expect(() => replay(world, [...events, ...events])).toThrow();
    expect(() => replay(world, [{ ...events[0]!, campaignId: 'another' }])).toThrow();
    expect(() => replay(world, [{ ...events[0]!, revision: 3 }])).toThrow();
  });
  it('keeps replay deterministic and inputs immutable across generated relation updates', () => {
    fc.assert(fc.property(fc.integer({ min: -100, max: 100 }), (trust) => {
      const world = fixtureWorld();
      const events = canonicalize(world, fixtureProposal([fixtureEvent({ operations: [{ kind: 'upsert_relation', relation: {
        fromActorId: 'a', toActorId: 'b', trust, threat: 10, respect: 30, ideologicalAffinity: 0,
        economicDependence: 20, domesticAcceptability: 0, commitmentReliability: 60, reasonEventIds: [],
      } }] })]), { jobId: 'job-1', createdAt: '2026-09-05T12:00:00Z', modelCallIds: [] });
      expect(replay(world, events).relations[0]!.trust).toBe(trust);
      expect(world.relations).toEqual([]);
    }), { numRuns: 40, seed: 20260905 });
  });
});
