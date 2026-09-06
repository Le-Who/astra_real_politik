import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { CanonicalEvent, WorldState } from '@astra/contracts';

export const users = pgTable('users', { id: text('id').primaryKey(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() });
export const scenarioVersions = pgTable('scenario_versions', { digest: text('digest').primaryKey(), manifest: jsonb('manifest').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() });
export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(() => users.id),
  scenarioDigest: text('scenario_digest').notNull().references(() => scenarioVersions.digest),
  revision: bigint('revision', { mode: 'number' }).notNull().default(0), sseSequence: bigint('sse_sequence', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const worldSnapshots = pgTable('world_snapshots', {
  campaignId: text('campaign_id').notNull().references(() => campaigns.id), revision: bigint('revision', { mode: 'number' }).notNull(),
  schemaVersion: integer('schema_version').notNull(), snapshotVersion: integer('snapshot_version').notNull(),
  state: jsonb('state').$type<WorldState>().notNull(), stateHash: text('state_hash').notNull(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.revision] })]);
export const worldEvents = pgTable('world_events', {
  eventId: text('event_id').primaryKey(), campaignId: text('campaign_id').notNull(), revision: bigint('revision', { mode: 'number' }).notNull(),
  eventIndex: integer('event_index').notNull(), jobId: text('job_id').notNull(), schemaVersion: integer('schema_version').notNull(),
  data: jsonb('data').$type<CanonicalEvent>().notNull(), occursOn: text('occurs_on').notNull(), visibility: jsonb('visibility').notNull(),
});
