import { describe, expect, it } from 'vitest';
import * as contracts from '../../packages/contracts/src/index.js';

const manifest = {
  schemaVersion: 1, id: 'synthetic', version: '1.0.0', title: { ru: 'Тест', en: 'Test' },
  startDate: '1991-12-26', kind: 'historical', locales: ['ru', 'en'],
  assets: [{ path: 'actors.json', digest: 'a'.repeat(64), bytes: 20, mediaType: 'application/json', licenseId: 'test-license' }],
  licenseIds: ['test-license'], createdAt: '2026-09-06T00:00:00Z',
};
describe('scenario package boundary', () => {
  it('accepts a versioned manifest without pretending to verify its contents', () => {
    expect(contracts.ScenarioManifestSchema.parse(manifest)).toEqual(manifest);
  });
  it.each(['../escape.json', '/absolute.json', 'C:/secret', 'a\\b.json', '%2e%2e/escape', 'a/../b', 'a//b', 'CON', 'file:stream', 'a./b'])('rejects unsafe asset path %s', (path) => {
    expect(contracts.ScenarioManifestSchema.safeParse({ ...manifest, assets: [{ ...manifest.assets[0], path }] }).success).toBe(false);
  });
  it('rejects duplicate paths, unlisted licenses, missing locale and future versions', () => {
    expect(contracts.ScenarioManifestSchema.safeParse({ ...manifest, assets: [...manifest.assets, ...manifest.assets] }).success).toBe(false);
    expect(contracts.ScenarioManifestSchema.safeParse({ ...manifest, licenseIds: ['different'] }).success).toBe(false);
    expect(contracts.ScenarioManifestSchema.safeParse({ ...manifest, locales: ['ru'] }).success).toBe(false);
    expect(contracts.ScenarioManifestSchema.safeParse({ ...manifest, schemaVersion: 2 }).success).toBe(false);
  });
});
describe('AI wire envelopes', () => {
  it('rejects cyclic, nonfinite and excessively nested parsed JSON before recursion', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(contracts.BoundedJsonSchema.safeParse(cycle).success).toBe(false);
    expect(contracts.BoundedJsonSchema.safeParse({ value: Infinity }).success).toBe(false);
    let deep: unknown = null;
    for (let i = 0; i < 40; i++) deep = { child: deep };
    expect(contracts.BoundedJsonSchema.safeParse(deep).success).toBe(false);
  });
  const request = { attemptId: 'attempt-1', credentialRef: 'credential-1', role: 'delegate', modelId: 'custom-model',
    systemInstruction: 'Respond as the delegate.', input: 'Hello', responseSchema: null, thinking: null, maxOutputTokens: 1000 };
  it('keeps custom model IDs and explicit null capabilities', () => {
    expect(contracts.AiRequestSchema.parse(request)).toEqual(request);
    expect(contracts.AiRequestSchema.safeParse({ ...request, apiKey: 'must-not-be-an-envelope-field' }).success).toBe(false);
    expect(contracts.AiRequestSchema.safeParse({ ...request, maxOutputTokens: -1 }).success).toBe(false);
  });
  it('retains unknown usage as null and rejects partial text as completed', () => {
    const result = { status: 'completed', text: 'Reply', parsed: null, inputTokens: null, outputTokens: null, providerCallId: null };
    expect(contracts.AiResultSchema.parse(result)).toEqual(result);
    expect(contracts.AiResultSchema.safeParse({ status: 'completed', text: 'Partial' }).success).toBe(false);
    expect(contracts.AiResultSchema.safeParse({ ...result, outputTokens: NaN }).success).toBe(false);
  });
  it('requires explicit failure/ambiguity accounting', () => {
    const result = { status: 'ambiguous', code: 'DISPATCH_UNKNOWN', retryable: false, usageKnown: false };
    expect(contracts.AiResultSchema.parse(result)).toEqual(result);
    expect(contracts.AiResultSchema.safeParse({ ...result, text: 'not committed' }).success).toBe(false);
  });
});
