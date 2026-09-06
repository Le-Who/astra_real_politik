import { z } from 'zod';
import { IdSchema } from './ids.js';
import { BoundedJsonSchema } from './json.js';

export const AiRoleSchema = z.enum(['intent', 'delegate', 'chair', 'world', 'arbiter', 'advisor', 'historian', 'memory']);
export const ModelIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
export const ModelProfileSchema = z.strictObject({
  id: IdSchema,
  roles: z.record(AiRoleSchema, z.strictObject({ modelId: ModelIdSchema, thinking: z.enum(['low', 'medium', 'high']).nullable() })),
  maxParallelCalls: z.number().int().min(1).max(32),
  maxCallsPerSubstep: z.number().int().min(1).max(1000),
  dailyTokenLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  dailyMoneyLimitMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
});
export type AiRole = z.infer<typeof AiRoleSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export const AiRequestSchema = z.strictObject({
  attemptId: IdSchema, credentialRef: IdSchema, role: AiRoleSchema, modelId: ModelIdSchema,
  systemInstruction: z.string().min(1).max(100_000), input: z.string().min(1).max(1_000_000),
  responseSchema: BoundedJsonSchema.pipe(z.record(z.string().max(200), z.json())).nullable(),
  thinking: z.enum(['low', 'medium', 'high']).nullable(),
  maxOutputTokens: z.number().int().min(1).max(131_072),
});
const UsageSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const AiResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('completed'), text: z.string().max(1_000_000),
    parsed: BoundedJsonSchema, inputTokens: UsageSchema, outputTokens: UsageSchema,
    providerCallId: z.string().min(1).max(500).nullable() }),
  z.strictObject({ status: z.enum(['failed', 'ambiguous', 'cancelled']),
    code: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/), retryable: z.boolean(), usageKnown: z.boolean() }),
]);
export type AiRequest = z.infer<typeof AiRequestSchema>;
export type AiResult = z.infer<typeof AiResultSchema>;
export interface AiGateway { generate(request: AiRequest, signal: AbortSignal): Promise<AiResult> }
