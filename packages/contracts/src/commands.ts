import { z } from 'zod';
import { DigestSchema, GameDateSchema, IdSchema, RevisionSchema, ShortTextSchema, TextSchema } from './ids.js';

const envelope = { commandId: IdSchema, campaignId: IdSchema, expectedRevision: RevisionSchema, idempotencyKey: z.string().min(8).max(128) };
export const CommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('send_message'), payload: z.strictObject({ roomId: IdSchema, text: TextSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('ask_advisor'), payload: z.strictObject({ advisor: z.enum(['diplomatic', 'economic', 'domestic']), text: TextSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('confirm_action'), payload: z.strictObject({ actionId: IdSchema, contentHash: DigestSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('cancel_action'), payload: z.strictObject({ actionId: IdSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('advance_time'), payload: z.strictObject({ toDate: GameDateSchema, stopAtNextEvent: z.boolean() }) }),
  z.strictObject({ ...envelope, type: z.literal('sign_treaty'), payload: z.strictObject({ treatyId: IdSchema, version: z.number().int().positive(), contentHash: DigestSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('cancel_job'), payload: z.strictObject({ jobId: IdSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('branch_campaign'), payload: z.strictObject({ revision: RevisionSchema, name: ShortTextSchema }) }),
  z.strictObject({ ...envelope, type: z.literal('finish_campaign'), payload: z.strictObject({ confirmed: z.literal(true) }) }),
]);
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
