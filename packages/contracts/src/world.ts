import { z } from 'zod';
import { DigestSchema, GameDateSchema, IdListSchema, IdSchema, RevisionSchema, ShortTextSchema, TextSchema, VisibilitySchema } from './ids.js';

export const EvidenceSchema = z.strictObject({
  id: IdSchema, url: z.url().max(2048).refine((url) => ['https:', 'http:'].includes(new URL(url).protocol), 'HTTP(S) source required'),
  title: ShortTextSchema, publisher: ShortTextSchema,
  sourcePublishedAt: z.iso.datetime({ offset: true }).nullable(),
  retrievedAt: z.iso.datetime({ offset: true }), observedAt: GameDateSchema.nullable(),
  availableFrom: GameDateSchema, validFrom: GameDateSchema, validTo: GameDateSchema.nullable(),
  digest: DigestSchema, licenseId: IdSchema, confidence: z.enum(['verified', 'contested', 'estimated']),
}).refine((e) => e.validTo === null || e.validTo >= e.validFrom, 'Invalid validity interval');

export const FactSchema = z.strictObject({
  id: IdSchema, subjectId: IdSchema, predicate: z.string().min(1).max(100),
  value: z.union([TextSchema, z.number().min(-1e15).max(1e15), z.boolean(), z.null()]),
  unit: z.string().min(1).max(64).nullable(), validFrom: GameDateSchema,
  validTo: GameDateSchema.nullable(), availableFrom: GameDateSchema,
  evidenceIds: IdListSchema, visibility: VisibilitySchema,
  origin: z.enum(['historical', 'scenario_estimate', 'campaign', 'actor_belief']),
}).refine((f) => f.validTo === null || f.validTo >= f.validFrom, 'Invalid validity interval');

export const ActorSchema = z.strictObject({
  id: IdSchema, name: ShortTextSchema, kind: z.enum(['state', 'dependency', 'organization', 'nonstate']),
  existsFrom: GameDateSchema, existsTo: GameDateSchema.nullable(), playable: z.boolean(),
  publicProfileFactIds: IdListSchema, privateGoalFactIds: IdListSchema,
}).refine((a) => a.existsTo === null || a.existsTo >= a.existsFrom, 'Invalid existence interval');

export const ControlShape = {
  controllerId: IdSchema.nullable(), controlStatus: z.enum(['single', 'mixed', 'unknown', 'not_applicable']),
  competingControllerIds: IdListSchema, controlAsOf: GameDateSchema, controlEvidenceIds: IdListSchema,
  controlReviewStatus: z.enum(['unreviewed', 'verified', 'contested', 'scenario_estimate', 'campaign']),
} as const;

export function consistentControl(value: { controllerId: string | null; controlStatus: string; competingControllerIds: string[] }): boolean {
  if (value.controlStatus === 'single') return value.controllerId !== null && value.competingControllerIds.length === 0;
  if (value.controlStatus === 'mixed') return value.controllerId === null && value.competingControllerIds.length >= 2;
  return value.controllerId === null && value.competingControllerIds.length === 0;
}

export const TerritorySchema = z.strictObject({
  id: IdSchema, geometryId: IdSchema, ...ControlShape, claimantIds: IdListSchema, recognitionFactIds: IdListSchema,
}).refine(consistentControl, 'Inconsistent territorial control');

export const RelationSchema = z.strictObject({
  fromActorId: IdSchema, toActorId: IdSchema,
  trust: z.number().min(-100).max(100), threat: z.number().min(0).max(100),
  respect: z.number().min(0).max(100), ideologicalAffinity: z.number().min(-100).max(100),
  economicDependence: z.number().min(0).max(100), domesticAcceptability: z.number().min(-100).max(100),
  commitmentReliability: z.number().min(0).max(100), reasonEventIds: IdListSchema,
}).refine((r) => r.fromActorId !== r.toActorId, 'Self relation not permitted');

export const ResourceTransferSchema = z.strictObject({
  fromAccountId: IdSchema, toAccountId: IdSchema, amount: z.number().positive().max(1e15),
  unit: z.string().min(1).max(64), causeEventId: IdSchema,
}).refine((t) => t.fromAccountId !== t.toAccountId, 'Distinct accounts required');

export const ConflictStateSchema = z.strictObject({
  id: IdSchema, participantIds: IdListSchema.refine((ids) => ids.length >= 2),
  theaterTerritoryIds: IdListSchema, objectiveFactIds: IdListSchema,
  status: z.enum(['crisis', 'active', 'ceasefire', 'settled']), escalation: z.number().min(0).max(100),
});

function boundedRecord<T extends z.ZodType>(schema: T, maximum: number) {
  // Inspect input before Zod's record parser sanitizes prototype-related keys.
  return z.unknown().refine((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= maximum && keys.every((key) => IdSchema.safeParse(key).success);
  }, 'Invalid or oversized entity record').pipe(z.record(IdSchema, schema));
}

export const WorldStateSchema = z.strictObject({
  campaignId: IdSchema, revision: RevisionSchema, date: GameDateSchema, scenarioDigest: DigestSchema,
  actors: boundedRecord(ActorSchema, 10_000), territories: boundedRecord(TerritorySchema, 300_000),
  facts: boundedRecord(FactSchema, 1_000_000), relations: z.array(RelationSchema).max(100_000),
  activeTreatyIds: IdListSchema, pendingActionIds: IdListSchema,
}).superRefine((world, ctx) => {
  for (const field of ['actors', 'territories', 'facts'] as const) {
    for (const [key, value] of Object.entries(world[field])) {
      if (key !== value.id) ctx.addIssue({ code: 'custom', path: [field, key, 'id'], message: 'Record key must match entity ID' });
    }
  }
  const pairs = world.relations.map((r) => JSON.stringify([r.fromActorId, r.toActorId]));
  if (new Set(pairs).size !== pairs.length) ctx.addIssue({ code: 'custom', path: ['relations'], message: 'Duplicate directed relation' });
});
export const WorldSnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), snapshotVersion: z.literal(1), state: WorldStateSchema });
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Territory = z.infer<typeof TerritorySchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type ResourceTransfer = z.infer<typeof ResourceTransferSchema>;
export type ConflictState = z.infer<typeof ConflictStateSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
