/**
 * Which batch the metric strip reports.
 *
 * A batch is inserted in state `running` with every metric null, so "the newest
 * row" blanks the whole strip the moment a run starts — the numbers vanish
 * exactly when the author is watching them. The strip reports the last batch
 * that actually produced numbers; the in-flight one is represented by the
 * progress state instead.
 */
export interface ScoredCandidate {
  state: string;
}

/** The newest batch that is no longer running, from a newest-first list. */
export function latestScored<T extends ScoredCandidate>(batches: T[]): T | undefined {
  return batches.find((b) => b.state !== 'running');
}

/** The one before that — what a delta is measured against. */
export function previousScored<T extends ScoredCandidate>(batches: T[]): T | undefined {
  return batches.filter((b) => b.state !== 'running')[1];
}
