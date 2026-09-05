import { CanonicalEventSchema, WorldStateSchema } from '@astra/contracts';
import type { CanonicalEvent, WorldState } from '@astra/contracts';

export function reduce(initial: WorldState, input: CanonicalEvent[]): WorldState {
  const state = WorldStateSchema.parse(initial);
  const events = input.map((event) => CanonicalEventSchema.parse(event));
  const suppliedIds = new Set(events.map((event) => event.eventId));
  const seen = new Set<string>();
  let groupRevision = initial.revision;
  let groupJob: string | null = null;
  for (const event of events) {
    if (event.campaignId !== initial.campaignId || seen.has(event.eventId)) throw new Error('INVALID_CANONICAL_IDENTITY');
    if (event.causeEventIds.some((id) => suppliedIds.has(id) && !seen.has(id))) throw new Error('CAUSAL_ORDER');
    seen.add(event.eventId);
    if (event.revision === groupRevision + 1) { groupRevision = event.revision; groupJob = event.jobId; }
    else if (event.revision !== groupRevision || groupJob !== event.jobId) throw new Error('NONCONTIGUOUS_REVISION');
    if (event.occursOn < state.date) throw new Error('TEMPORAL_CONFLICT');
    for (const op of event.operations) {
      switch (op.kind) {
        case 'change_control': {
          const territory = state.territories[op.territoryId];
          if (!territory || !state.actors[op.toActorId]) throw new Error('UNKNOWN_ID');
          if (territory.controllerId !== op.fromActorId || territory.controlStatus === 'mixed') throw new Error('CONTROL_CONFLICT');
          state.territories[op.territoryId] = { ...territory, controllerId: op.toActorId, controlStatus: 'single',
            competingControllerIds: [], controlAsOf: event.occursOn, controlEvidenceIds: [], controlReviewStatus: 'campaign' };
          break;
        }
        case 'set_control_assessment': {
          const territory = state.territories[op.territoryId];
          if (!territory) throw new Error('UNKNOWN_ID');
          state.territories[op.territoryId] = { ...territory, controllerId: op.controllerId, controlStatus: op.controlStatus,
            competingControllerIds: [...op.competingControllerIds], controlAsOf: op.controlAsOf,
            controlEvidenceIds: [...op.controlEvidenceIds], controlReviewStatus: op.controlReviewStatus };
          break;
        }
        case 'set_claimants': {
          const territory = state.territories[op.territoryId];
          if (!territory) throw new Error('UNKNOWN_ID');
          territory.claimantIds = [...op.claimantIds];
          break;
        }
        case 'record_recognition': {
          const territory = state.territories[op.territoryId];
          if (!territory || state.facts[op.fact.id]) throw new Error('INVALID_RECOGNITION');
          state.facts[op.fact.id] = structuredClone(op.fact);
          territory.recognitionFactIds.push(op.fact.id);
          break;
        }
        case 'record_fact':
          if (state.facts[op.fact.id]) throw new Error('FACT_ALREADY_EXISTS');
          state.facts[op.fact.id] = structuredClone(op.fact);
          break;
        case 'upsert_relation': {
          const index = state.relations.findIndex((relation) => relation.fromActorId === op.relation.fromActorId && relation.toActorId === op.relation.toActorId);
          if (index === -1) state.relations.push(structuredClone(op.relation));
          else state.relations[index] = structuredClone(op.relation);
          break;
        }
        case 'create_actor':
          if (state.actors[op.actor.id]) throw new Error('ACTOR_ALREADY_EXISTS');
          state.actors[op.actor.id] = structuredClone(op.actor);
          break;
        case 'end_actor': {
          const actor = state.actors[op.actorId];
          if (!actor) throw new Error('UNKNOWN_ID');
          actor.existsTo = op.date;
          actor.playable = false;
          break;
        }
        case 'transition_treaty':
        case 'transfer_resource':
        case 'upsert_conflict':
        case 'schedule_action':
        case 'resolve_action':
          // T03/T18/T19 must provide coordinated normalized projections.
          // Refuse rather than silently drop an accepted canonical operation.
          throw new Error('EXTERNAL_PROJECTION_REQUIRED: ' + op.kind);
      }
    }
    state.revision = event.revision;
    state.date = event.occursOn;
  }
  return WorldStateSchema.parse(state);
}
