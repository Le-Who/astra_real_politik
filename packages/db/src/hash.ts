import { createHash } from 'node:crypto';

// Canonical JSON: stable key order, JSON primitives only; no locale dependence.
export function hashJson(input: unknown): string {
  const seen = new Set<object>();
  function serialize(value: unknown, depth: number): string {
    if (depth > 64) throw new Error('JSON_DEPTH_LIMIT');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== 'object' || seen.has(value)) throw new Error('INVALID_JSON');
    seen.add(value);
    let result: string;
    if (Array.isArray(value)) result = '[' + Array.from(value, (item) => serialize(item, depth + 1)).join(',') + ']';
    else {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('INVALID_JSON');
      result = '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + serialize((value as Record<string, unknown>)[key], depth + 1)).join(',') + '}';
    }
    seen.delete(value);
    return result;
  }
  return createHash('sha256').update(serialize(input, 0)).digest('hex');
}
