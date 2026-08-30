import type { CaseOutcome, CaseScore, RunMetrics } from './types.js';

/**
 * Ring 0 — roll a batch's case scores up into the four numbers every eval
 * screen renders. Pure arithmetic; no model call (AC-13).
 */

export type AggregatedCase = CaseScore & { outcome: CaseOutcome };

/** `null` rather than `0` or `NaN` whenever the denominator is empty (AC-47). */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function sum(cases: AggregatedCase[], pick: (c: AggregatedCase) => number): number {
  return cases.reduce((acc, c) => acc + pick(c), 0);
}

/**
 * `casesInSet` is the size of the case set, carried through untouched so the
 * UI can say `<produced> of <set>` (AC-50) rather than implying every case ran.
 */
export function aggregateRun(cases: AggregatedCase[], casesInSet: number): RunMetrics {
  // A case that errored never reached a verdict, so it is dropped from BOTH the
  // numerator and the denominator of every metric, before anything is summed
  // (AC-49). Counting it as a failure would report a model regression for what
  // is an infrastructure fault.
  const produced = cases.filter((c) => c.outcome !== 'errored');

  const tp = sum(produced, (c) => c.tp);
  const fn = sum(produced, (c) => c.fn);
  const fp = sum(produced, (c) => c.fp);
  const kept = sum(produced, (c) => c.kept);
  const dropped = sum(produced, (c) => c.dropped);

  return {
    // Only `must_find` cases carry tp/fn — a `must_not_flag` case scores 0/0 and
    // therefore cannot move recall (AC-18).
    recall: ratio(tp, tp + fn),
    // Every produced case counts: fp comes only from a violated `must_not_flag`
    // case, which is the single thing that can pull precision below 1 (AC-19).
    precision: ratio(tp, tp + fp),
    citation_accuracy: ratio(kept, kept + dropped),
    // Passed over PRODUCED, not over the set size (AC-21).
    traces_passed: produced.length === 0 ? null : produced.filter((c) => c.passed).length,
    traces_produced: produced.length,
    cases_total: casesInSet,
  };
}
