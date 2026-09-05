import { z } from 'zod';
import { IdSchema } from './ids.js';

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
export interface AiRequest {
  attemptId: string; credentialRef: string; role: AiRole; modelId: string;
  systemInstruction: string; input: string; responseSchema: Record<string, unknown> | null;
  thinking: 'low' | 'medium' | 'high' | null; maxOutputTokens: number;
}
export type AiResult =
  | { status: 'completed'; text: string; parsed: unknown; inputTokens: number | null; outputTokens: number | null; providerCallId: string | null }
  | { status: 'failed' | 'ambiguous' | 'cancelled'; code: string; retryable: boolean; usageKnown: boolean };
export interface AiGateway { generate(request: AiRequest, signal: AbortSignal): Promise<AiResult> }
