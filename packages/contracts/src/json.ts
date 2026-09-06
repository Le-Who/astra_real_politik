import { z } from 'zod';

function isBoundedJson(input: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  let stringUnits = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 100_000 || depth > 32) return false;
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'number') { if (!Number.isFinite(value)) return false; continue; }
    if (typeof value === 'string') { stringUnits += value.length; if (stringUnits > 1_000_000) return false; continue; }
    if (typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
    const entries = Object.entries(value);
    if (entries.length + nodes + pending.length > 100_000) return false;
    for (const [key, child] of entries) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return false;
      stringUnits += key.length;
      if (stringUnits > 1_000_000) return false;
      pending.push({ value: child, depth: depth + 1 });
    }
  }
  return true;
}
// Reject cycles/non-JSON and depth bombs before invoking the recursive parser.
export const BoundedJsonSchema = z.unknown().refine(isBoundedJson, 'Invalid or excessive JSON').pipe(z.json());
