import { createHash } from 'node:crypto';
import { CanonicalEventSchema, WorldProposalSchema } from '@astra/contracts';
import type { CanonicalEvent, EventProposal, WorldState } from '@astra/contracts';
import { validateProposal } from './validate-proposal.js';
import type { ValidationContext } from './validate-proposal.js';

export interface CommitMetadata { jobId: string; createdAt: string; modelCallIds: string[] }
export function canonicalize(state: WorldState, input: unknown, metadata: CommitMetadata, context: ValidationContext = {}): CanonicalEvent[] {
  const valid = validateProposal(state, input, context);
  if (!valid.ok) throw new Error('INVALID_PROPOSAL: ' + valid.issues.map((issue) => issue.code).join(','));
  const proposal = WorldProposalSchema.parse(input);
  const proposals = structuredClone(proposal.events);
  // Empty periods still need a journal record, otherwise replay loses elapsed time.
  if (proposals.length === 0 || proposals[proposals.length - 1]!.occursOn < proposal.toDate) {
    let clockId = 'clock:' + metadata.jobId;
    while (proposals.some((event) => event.proposalId === clockId)) clockId += ':clock';
    const clock: EventProposal = {
      proposalId: clockId, title: 'Game clock advanced', summary: 'Committed game date: ' + proposal.toDate,
      occursOn: proposal.toDate, causeEventIds: [],
      evidenceIds: [], actorIds: [], territoryIds: [], visibility: { kind: 'public' },
      rationaleSummary: 'The requested simulation interval finished.', operations: [],
    };
    proposals.push(clock);
  }
  const ids = new Map(proposals.map((event, index) => [
    event.proposalId, 'event:' + createHash('sha256').update(JSON.stringify([state.campaignId, state.revision + 1, metadata.jobId, index, event.proposalId])).digest('hex'),
  ]));
  const resolve = (id: string) => ids.get(id) ?? id;
  return proposals.map((event) => CanonicalEventSchema.parse({
    ...event, eventId: ids.get(event.proposalId), campaignId: state.campaignId,
    revision: state.revision + 1, ...metadata,
    causeEventIds: event.causeEventIds.map(resolve),
    operations: event.operations.map((op) => {
      if (op.kind === 'upsert_relation') return { ...op, relation: { ...op.relation, reasonEventIds: op.relation.reasonEventIds.map(resolve) } };
      if (op.kind === 'transfer_resource') return { ...op, transfer: { ...op.transfer, causeEventId: resolve(op.transfer.causeEventId) } };
      return op;
    }),
  }));
}
