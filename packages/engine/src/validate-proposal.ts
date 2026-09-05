import { WorldProposalSchema, WorldStateSchema } from '@astra/contracts';
import type { EventProposal, Evidence, Fact, ValidationIssue, ValidationResult, WorldOperation, WorldState } from '@astra/contracts';

export interface ValidationContext {
  evidence?: Readonly<Record<string, Evidence>>;
  priorEvents?: Readonly<Record<string, { occursOn: string }>>;
  // Trusted server hook for normalized treaty/action/resource/conflict domains.
  // Never sourced from model output. Absence fails closed.
  validateExternalOperation?: (operation: WorldOperation, event: EventProposal) => ValidationIssue[];
  factPredicates?: ReadonlySet<string>;
}
const factualPredicates = new Set(['population', 'gdp', 'leadership', 'policy_statement', 'diplomatic_position', 'observation', 'scenario_note']);
const reservedPredicates = /control|claim|recognition|treaty|signature|resource|balance|conflict|reservation|action|owner|revision/i;

export function validateProposal(state: WorldState, input: unknown, context: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const issue = (code: ValidationIssue['code'], path: string, message: string) => { issues.push({ code, path, message }); };
  const parsedState = WorldStateSchema.safeParse(state);
  const parsed = WorldProposalSchema.safeParse(input);
  if (!parsedState.success || !parsed.success) return { ok: false, issues: [{ code: 'SCHEMA_INVALID', path: '', message: 'Invalid world or proposal schema' }] };
  const proposal = parsed.data;
  if (proposal.baseRevision !== state.revision) issue('STALE_REVISION', 'baseRevision', 'The world revision changed');
  if (proposal.fromDate !== state.date || proposal.toDate < proposal.fromDate) issue('TEMPORAL_CONFLICT', 'fromDate', 'Invalid world interval');
  const knownActors = { ...state.actors };
  const causes = new Map(Object.entries(context.priorEvents ?? {}).map(([id, event]) => [id, event.occursOn]));
  const proposedIds = new Set(proposal.events.map((event) => event.proposalId));
  const seenProposals = new Set<string>();
  const writes = new Set<string>();
  const knownFactIds = new Set(Object.keys(state.facts));
  let previousDate = proposal.fromDate;

  const actor = (id: string, date: string, path: string) => {
    const a = knownActors[id];
    if (!a) issue('UNKNOWN_ID', path, 'Unknown actor: ' + id);
    else if (a.existsFrom > date || (a.existsTo !== null && a.existsTo < date)) issue('TEMPORAL_CONFLICT', path, 'Actor does not exist on the event date');
  };
  const territory = (id: string, path: string) => { if (!state.territories[id]) issue('UNKNOWN_ID', path, 'Unknown territory: ' + id); };
  const evidence = (ids: string[], path: string) => {
    for (const id of ids) if (!context.evidence?.[id]) issue('INVALID_EVIDENCE', path, 'Unknown evidence: ' + id);
  };
  const causalReferences = (ids: string[], date: string, path: string) => {
    for (const id of ids) {
      const occurred = causes.get(id);
      if (occurred === undefined) issue(proposedIds.has(id) ? 'TEMPORAL_CONFLICT' : 'UNKNOWN_ID', path, 'Cause must precede its effect: ' + id);
      else if (occurred > date) issue('TEMPORAL_CONFLICT', path, 'Cause occurs after its effect');
    }
  };
  const write = (key: string, path: string) => {
    if (writes.has(key)) issue('CONTRADICTORY_EFFECTS', path, 'Multiple writes to ' + key);
    writes.add(key);
  };
  const validateFact = (fact: Fact, event: EventProposal, path: string) => {
    if (!knownActors[fact.subjectId] && !state.territories[fact.subjectId] && !knownFactIds.has(fact.subjectId)) issue('UNKNOWN_ID', path, 'Unknown fact subject');
    if (fact.origin !== 'campaign' && fact.origin !== 'actor_belief') issue('UNAUTHORIZED', path, 'Model output cannot rewrite historical/scenario facts');
    if (fact.validFrom > event.occursOn || fact.availableFrom > event.occursOn) issue('TEMPORAL_CONFLICT', path, 'Future facts require a planned action, not a committed fact');
    evidence(fact.evidenceIds, path);
    if (fact.visibility.kind === 'actors') for (const id of fact.visibility.actorIds) actor(id, event.occursOn, path);
    if (event.visibility.kind !== 'public' && fact.visibility.kind === 'public') issue('UNAUTHORIZED', path, 'A private event cannot implicitly publish a fact');
    if (event.visibility.kind === 'engine' && fact.visibility.kind !== 'engine') issue('UNAUTHORIZED', path, 'An engine-only event cannot implicitly disclose a fact');
    if (event.visibility.kind === 'actors' && fact.visibility.kind === 'actors') {
      const audience = event.visibility.actorIds;
      if (fact.visibility.actorIds.some((id) => !audience.includes(id))) issue('UNAUTHORIZED', path, 'Fact audience exceeds event audience');
    }
    write('fact:' + fact.id, path);
    if (state.facts[fact.id]) issue('CONTRADICTORY_EFFECTS', path, 'Existing facts are immutable; append a new dated fact');
    knownFactIds.add(fact.id);
  };

  for (const [eventIndex, event] of proposal.events.entries()) {
    const path = 'events.' + eventIndex;
    if (seenProposals.has(event.proposalId) || causes.has(event.proposalId)) issue('CONTRADICTORY_EFFECTS', path, 'Duplicate event identity');
    seenProposals.add(event.proposalId);
    if (event.occursOn < previousDate || event.occursOn > proposal.toDate) issue('TEMPORAL_CONFLICT', path, 'Events must be chronological and inside the interval');
    previousDate = event.occursOn;
    causalReferences(event.causeEventIds, event.occursOn, path + '.causeEventIds');
    evidence(event.evidenceIds, path + '.evidenceIds');
    const createdHere = event.operations.filter((op) => op.kind === 'create_actor').map((op) => op.actor.id);
    for (const id of event.actorIds) if (!createdHere.includes(id)) actor(id, event.occursOn, path + '.actorIds');
    for (const id of event.territoryIds) territory(id, path + '.territoryIds');
    if (event.visibility.kind === 'actors') for (const id of event.visibility.actorIds) actor(id, event.occursOn, path + '.visibility');

    for (const [operationIndex, op] of event.operations.entries()) {
      const opPath = path + '.operations.' + operationIndex;
      switch (op.kind) {
        case 'change_control': {
          territory(op.territoryId, opPath);
          actor(op.toActorId, event.occursOn, opPath);
          if (op.fromActorId !== null) actor(op.fromActorId, event.occursOn, opPath);
          write('control:' + op.territoryId, opPath);
          const previous = state.territories[op.territoryId];
          if (previous && (previous.controllerId !== op.fromActorId || previous.controlStatus === 'mixed')) issue('CONTRADICTORY_EFFECTS', opPath, 'Previous control does not match; mixed control requires an assessment');
          break;
        }
        case 'set_control_assessment':
          territory(op.territoryId, opPath);
          if (op.controllerId !== null) actor(op.controllerId, event.occursOn, opPath);
          for (const id of op.competingControllerIds) actor(id, event.occursOn, opPath);
          if (op.controlReviewStatus !== 'campaign' || op.controlAsOf !== event.occursOn) issue('SCHEMA_INVALID', opPath, 'Canonical control must be a dated campaign assessment');
          evidence(op.controlEvidenceIds, opPath);
          write('control:' + op.territoryId, opPath);
          break;
        case 'set_claimants':
          territory(op.territoryId, opPath);
          for (const id of op.claimantIds) actor(id, event.occursOn, opPath);
          write('claims:' + op.territoryId, opPath);
          break;
        case 'record_recognition':
          territory(op.territoryId, opPath);
          if (op.fact.subjectId !== op.territoryId || op.fact.predicate !== 'recognition') issue('SCHEMA_INVALID', opPath, 'Recognition must explicitly refer to its territory');
          validateFact(op.fact, event, opPath);
          break;
        case 'record_fact':
          if (reservedPredicates.test(op.fact.predicate) || !(context.factPredicates ?? factualPredicates).has(op.fact.predicate)) issue('SCHEMA_INVALID', opPath, 'Predicate requires a typed operation or a scenario allowlist');
          validateFact(op.fact, event, opPath);
          break;
        case 'upsert_relation':
          actor(op.relation.fromActorId, event.occursOn, opPath);
          actor(op.relation.toActorId, event.occursOn, opPath);
          causalReferences(op.relation.reasonEventIds, event.occursOn, opPath);
          write('relation:' + JSON.stringify([op.relation.fromActorId, op.relation.toActorId]), opPath);
          break;
        case 'create_actor':
          if (knownActors[op.actor.id]) issue('CONTRADICTORY_EFFECTS', opPath, 'Actor already exists');
          if (op.actor.existsFrom !== event.occursOn || op.actor.existsTo !== null) issue('TEMPORAL_CONFLICT', opPath, 'New actor must begin on the event date');
          for (const id of [...op.actor.publicProfileFactIds, ...op.actor.privateGoalFactIds]) if (!knownFactIds.has(id)) issue('UNKNOWN_ID', opPath, 'Unknown actor profile fact');
          knownActors[op.actor.id] = op.actor;
          write('actor:' + op.actor.id, opPath);
          break;
        case 'end_actor':
          actor(op.actorId, event.occursOn, opPath);
          for (const id of op.successorIds) actor(id, event.occursOn, opPath);
          if (op.successorIds.includes(op.actorId)) issue('CONTRADICTORY_EFFECTS', opPath, 'Actor cannot succeed itself');
          if (op.date !== event.occursOn) issue('TEMPORAL_CONFLICT', opPath, 'Actor ends on the event date');
          write('actor:' + op.actorId, opPath);
          if (knownActors[op.actorId]) knownActors[op.actorId] = { ...knownActors[op.actorId]!, existsTo: op.date, playable: false };
          break;
        case 'transition_treaty':
        case 'transfer_resource':
        case 'upsert_conflict':
        case 'schedule_action':
        case 'resolve_action':
          if (context.validateExternalOperation) issues.push(...context.validateExternalOperation(op, event));
          else issue(op.kind === 'transfer_resource' ? 'RESOURCE_CONFLICT' : 'MISSING_CONSENT', opPath, 'Trusted normalized domain validation is required');
          break;
      }
    }
    causes.set(event.proposalId, event.occursOn);
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
