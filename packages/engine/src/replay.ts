import type { CanonicalEvent, WorldState } from '@astra/contracts';
import { reduce } from './reduce.js';

// Replay has no provider dependency and never regenerates narrative.
export function replay(initial: WorldState, events: CanonicalEvent[]): WorldState {
  return reduce(initial, events);
}
