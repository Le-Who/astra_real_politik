import { z } from 'zod';

// Wire constraints only: semantic/date/authority refinements ALWAYS run locally.
// The gateway supplies the actual probed model's supported keyword set in T10.
const wireKeywords = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items',
  'enum', 'const', 'anyOf', 'oneOf', 'allOf', 'description', 'title',
  'format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'multipleOf',
]);
export function toProviderSchema(schema: z.ZodType, supportedKeywords: ReadonlySet<string> = wireKeywords): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: 'draft-07', reused: 'inline', cycles: 'throw', unrepresentable: 'throw' });
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(visit);
    if (node === null || typeof node !== 'object') return node;
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') continue;
      if (!supportedKeywords.has(key)) throw new Error('UNSUPPORTED_SCHEMA_KEYWORD: ' + key);
      if (key === 'properties') {
        output[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, visit(child)]));
      } else output[key] = visit(value);
    }
    return output;
  }
  return visit(raw) as Record<string, unknown>;
}
