import { z } from 'zod';
import { GameDateSchema, IdListSchema, IdSchema, RevisionSchema, ShortTextSchema, TextSchema, VisibilitySchema } from './ids.js';
import { ActorSchema, ConflictStateSchema, ControlShape, FactSchema, RelationSchema, ResourceTransferSchema, consistentControl } from './world.js';
import { TreatyStatusSchema } from './diplomacy.js';

export const WorldOperationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('change_control'), territoryId: IdSchema, fromActorId: IdSchema.nullable(), toActorId: IdSchema }),
  z.strictObject({ kind: z.literal('set_control_assessment'), territoryId: IdSchema, ...ControlShape }).refine(consistentControl, 'Inconsistent control assessment'),
  z.strictObject({ kind: z.literal('set_claimants'), territoryId: IdSchema, claimantIds: IdListSchema }),
  z.strictObject({ kind: z.literal('record_recognition'), territoryId: IdSchema, fact: FactSchema }),
  z.strictObject({ kind: z.literal('transfer_resource'), transfer: ResourceTransferSchema, reservationId: IdSchema }),
  z.strictObject({ kind: z.literal('upsert_conflict'), conflict: ConflictStateSchema }),
  z.strictObject({ kind: z.literal('upsert_relation'), relation: RelationSchema }),
  z.strictObject({ kind: z.literal('record_fact'), fact: FactSchema }),
  z.strictObject({ kind: z.literal('transition_treaty'), treatyId: IdSchema, from: TreatyStatusSchema, to: TreatyStatusSchema }),
  z.strictObject({ kind: z.literal('schedule_action'), actionId: IdSchema, dueDate: GameDateSchema }),
  z.strictObject({ kind: z.literal('resolve_action'), actionId: IdSchema, outcome: z.enum(['success', 'partial', 'failed', 'cancelled']) }),
  z.strictObject({ kind: z.literal('create_actor'), actor: ActorSchema }),
  z.strictObject({ kind: z.literal('end_actor'), actorId: IdSchema, successorIds: IdListSchema, date: GameDateSchema }),
]);
export const EventProposalSchema = z.strictObject({
  proposalId: IdSchema, title: ShortTextSchema, summary: TextSchema, occursOn: GameDateSchema,
  causeEventIds: IdListSchema, evidenceIds: IdListSchema, actorIds: IdListSchema, territoryIds: IdListSchema,
  visibility: VisibilitySchema, rationaleSummary: TextSchema, operations: z.array(WorldOperationSchema).max(1000),
});
export const WorldProposalSchema = z.strictObject({
  schemaVersion: z.literal(1), baseRevision: RevisionSchema,
  fromDate: GameDateSchema, toDate: GameDateSchema, events: z.array(EventProposalSchema).max(500),
  needsPlayerDecision: z.boolean(),
});
export const CanonicalEventSchema = EventProposalSchema.extend({
  eventId: IdSchema, campaignId: IdSchema, revision: RevisionSchema,
  jobId: IdSchema, createdAt: z.iso.datetime({ offset: true }), modelCallIds: IdListSchema,
});
export const ValidationIssueSchema = z.strictObject({
  code: z.enum(['UNKNOWN_ID', 'STALE_REVISION', 'UNAUTHORIZED', 'TEMPORAL_CONFLICT', 'RESOURCE_CONFLICT', 'MISSING_CONSENT', 'CONTRADICTORY_EFFECTS', 'INVALID_EVIDENCE', 'SCHEMA_INVALID']),
  path: z.string().max(1000), message: TextSchema,
});
export type WorldOperation = z.infer<typeof WorldOperationSchema>;
export type EventProposal = z.infer<typeof EventProposalSchema>;
export type WorldProposal = z.infer<typeof WorldProposalSchema>;
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };
