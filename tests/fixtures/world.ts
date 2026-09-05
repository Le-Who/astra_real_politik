import type { WorldState, WorldProposal, EventProposal } from '../../packages/contracts/src/index.js';

// Synthetic values only; never imported by production code or content pipelines.
export function fixtureWorld(): WorldState {
  return {
    campaignId: 'campaign-1', revision: 0, date: '1991-12-26', scenarioDigest: 'a'.repeat(64),
    actors: {
      a: { id: 'a', name: 'Actor A', kind: 'state', existsFrom: '1900-01-01', existsTo: null, playable: true, publicProfileFactIds: [], privateGoalFactIds: [] },
      b: { id: 'b', name: 'Actor B', kind: 'state', existsFrom: '1900-01-01', existsTo: null, playable: true, publicProfileFactIds: [], privateGoalFactIds: [] },
    },
    territories: {
      r1: { id: 'r1', geometryId: 'geometry-1', controllerId: 'a', controlStatus: 'single',
        competingControllerIds: [], controlAsOf: '1991-12-26', controlEvidenceIds: [],
        controlReviewStatus: 'scenario_estimate', claimantIds: ['a'], recognitionFactIds: [] },
    },
    facts: {}, relations: [], activeTreatyIds: [], pendingActionIds: [],
  };
}

export function fixtureEvent(patch: Partial<EventProposal> = {}): EventProposal {
  return {
    proposalId: 'proposal-1', title: 'Negotiated settlement', summary: 'Transfer of region.',
    occursOn: '1991-12-27', causeEventIds: [], evidenceIds: [], actorIds: ['a', 'b'],
    territoryIds: ['r1'], visibility: { kind: 'public' },
    rationaleSummary: 'The parties implement the agreed settlement.',
    operations: [{ kind: 'change_control', territoryId: 'r1', fromActorId: 'a', toActorId: 'b' }],
    ...patch,
  };
}

export function fixtureProposal(events: EventProposal[] = [fixtureEvent()]): WorldProposal {
  return { schemaVersion: 1, baseRevision: 0, fromDate: '1991-12-26', toDate: '1991-12-27', events, needsPlayerDecision: false };
}
