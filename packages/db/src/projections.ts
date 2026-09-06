import type { PoolClient } from 'pg';
import type { CanonicalEvent, WorldState } from '@astra/contracts';

export async function writeProjections(client: PoolClient, state: WorldState, events?: CanonicalEvent[]): Promise<void> {
  const territoryIds = events ? new Set(events.flatMap((event) => event.operations.flatMap((op) => 'territoryId' in op ? [op.territoryId] : []))) : new Set(Object.keys(state.territories));
  const factIds = events ? new Set(events.flatMap((event) => event.operations.flatMap((op) => 'fact' in op ? [op.fact.id] : []))) : new Set(Object.keys(state.facts));
  const pairs = events ? new Set(events.flatMap((event) => event.operations.flatMap((op) => op.kind === 'upsert_relation' ? [JSON.stringify([op.relation.fromActorId, op.relation.toActorId])] : []))) : null;
  for (const id of territoryIds) {
    await client.query('INSERT INTO territory_control(campaign_id,territory_id,data) VALUES($1,$2,$3) ON CONFLICT(campaign_id,territory_id) DO UPDATE SET data=excluded.data', [state.campaignId, id, state.territories[id]]);
  }
  for (const id of factIds) {
    const fact = state.facts[id]!;
    await client.query('INSERT INTO facts(campaign_id,fact_id,subject_id,data) VALUES($1,$2,$3,$4)', [state.campaignId, id, fact.subjectId, fact]);
  }
  for (const relation of state.relations) {
    if (pairs && !pairs.has(JSON.stringify([relation.fromActorId, relation.toActorId]))) continue;
    await client.query('INSERT INTO relations(campaign_id,from_actor_id,to_actor_id,data) VALUES($1,$2,$3,$4) ON CONFLICT(campaign_id,from_actor_id,to_actor_id) DO UPDATE SET data=excluded.data', [state.campaignId, relation.fromActorId, relation.toActorId, relation]);
  }
}
