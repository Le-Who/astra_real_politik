import { z } from 'zod';

export const IdSchema = z.string().min(1).max(128)
  .regex(/^(?!__proto__$|prototype$|constructor$)[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const GameDateSchema = z.iso.date().refine((date) => date >= '0001-01-01', 'Year must be positive');
export const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const TextSchema = z.string().min(1).max(20_000);
export const ShortTextSchema = z.string().min(1).max(500);
export const IdListSchema = z.array(IdSchema).max(10_000).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs');
export const VisibilitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({ kind: z.literal('actors'), actorIds: IdListSchema.refine((ids) => ids.length > 0, 'At least one actor required') }),
  z.strictObject({ kind: z.literal('engine') }),
]);
export type Id = z.infer<typeof IdSchema>;
export type GameDate = z.infer<typeof GameDateSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Digest = z.infer<typeof DigestSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;
