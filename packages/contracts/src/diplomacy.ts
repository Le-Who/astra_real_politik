import { z } from 'zod';
import { DigestSchema, GameDateSchema, IdListSchema, IdSchema, RevisionSchema, ShortTextSchema, TextSchema, VisibilitySchema } from './ids.js';

export const TreatyStatusSchema = z.enum(['draft', 'proposed', 'negotiating', 'agreed', 'signed', 'ratified', 'active', 'fulfilled', 'expired', 'suspended', 'breached', 'terminated']);
export const RoomMemberSchema = z.strictObject({
  actorId: IdSchema, role: z.enum(['chair', 'delegate', 'observer']),
  joinedAtSequence: RevisionSchema, disclosedMessageIds: IdListSchema,
});
export const RoomSchema = z.strictObject({
  id: IdSchema, campaignId: IdSchema, kind: z.enum(['bilateral', 'conference', 'organization', 'public', 'side_channel']),
  title: ShortTextSchema, members: z.array(RoomMemberSchema).min(1).max(500),
  agenda: z.array(ShortTextSchema).max(100), parentRoomId: IdSchema.nullable(),
}).refine((room) => new Set(room.members.map((member) => member.actorId)).size === room.members.length, 'Duplicate room member');
export const MessageSchema = z.strictObject({
  id: IdSchema, roomId: IdSchema, sequence: RevisionSchema, speakerActorId: IdSchema, text: TextSchema,
  date: GameDateSchema, visibility: VisibilitySchema,
  status: z.enum(['draft', 'generating', 'committed', 'failed']), citedEventIds: IdListSchema, proposalIds: IdListSchema,
});
export const TreatyClauseSchema = z.strictObject({
  id: IdSchema, kind: z.enum(['ceasefire', 'trade', 'sanctions', 'aid', 'access', 'guarantee', 'recognition', 'territory', 'statement']),
  obligorIds: IdListSchema, beneficiaryIds: IdListSchema, terms: TextSchema,
  dueDate: GameDateSchema.nullable(), visibility: VisibilitySchema, conditionFactIds: IdListSchema, verificationRuleId: IdSchema,
});
export const TreatySchema = z.strictObject({
  id: IdSchema, version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contentHash: DigestSchema, partyIds: IdListSchema.refine((ids) => ids.length >= 2),
  clauses: z.array(TreatyClauseSchema).min(1).max(100), status: TreatyStatusSchema, requiresRatification: z.boolean(),
  signatures: z.array(z.strictObject({ actorId: IdSchema, contentHash: DigestSchema, signedOn: GameDateSchema })).max(500),
});
export type TreatyStatus = z.infer<typeof TreatyStatusSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type RoomMember = z.infer<typeof RoomMemberSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type TreatyClause = z.infer<typeof TreatyClauseSchema>;
export type Treaty = z.infer<typeof TreatySchema>;
