import { z } from 'zod';
import { DigestSchema, GameDateSchema, IdListSchema, IdSchema, ShortTextSchema } from './ids.js';

// Logical paths inside a package, never URLs or OS paths. Extraction still checks
// resolved containment and symlinks before writing files (T27/T28).
export const AssetPathSchema = z.string().min(1).max(240).refine((path) =>
  path.split('/').every((part) =>
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(part) && !part.endsWith('.') &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)),
  'Unsafe package asset path');
export const ScenarioAssetSchema = z.strictObject({
  path: AssetPathSchema, digest: DigestSchema, bytes: z.number().int().nonnegative().max(2_147_483_647),
  mediaType: z.enum(['application/json', 'application/geo+json', 'application/vnd.pmtiles', 'text/plain', 'text/markdown', 'image/png', 'image/webp']),
  licenseId: IdSchema,
});
export const ScenarioManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema,
  version: z.string().max(64).regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/),
  title: z.strictObject({ ru: ShortTextSchema, en: ShortTextSchema }),
  startDate: GameDateSchema, kind: z.enum(['historical', 'contemporary', 'custom']),
  locales: z.array(z.enum(['ru', 'en'])).length(2),
  assets: z.array(ScenarioAssetSchema).min(1).max(10_000),
  licenseIds: IdListSchema.refine((ids) => ids.length > 0),
  createdAt: z.iso.datetime({ offset: true }),
}).superRefine((manifest, ctx) => {
  if (new Set(manifest.locales).size !== 2) ctx.addIssue({ code: 'custom', path: ['locales'], message: 'Both ru and en required' });
  const paths = new Set<string>();
  manifest.assets.forEach((asset, index) => {
    const path = asset.path.toLowerCase();
    if (paths.has(path)) ctx.addIssue({ code: 'custom', path: ['assets', index, 'path'], message: 'Duplicate/case-colliding asset path' });
    paths.add(path);
    if (!manifest.licenseIds.includes(asset.licenseId)) ctx.addIssue({ code: 'custom', path: ['assets', index, 'licenseId'], message: 'Unlisted license' });
  });
});
export type ScenarioManifest = z.infer<typeof ScenarioManifestSchema>;
export type ScenarioAsset = z.infer<typeof ScenarioAssetSchema>;
