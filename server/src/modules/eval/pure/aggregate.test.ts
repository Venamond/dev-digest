import { describe, it, expect } from 'vitest';
import { aggregateRun, type AggregatedCase } from './aggregate.js';
import type { CaseOutcome } from './types.js';

/** Offline arithmetic only — no provider, no container, no DB (AC-13, AC-61). */

function caseScore(over: Partial<AggregatedCase> = {}): AggregatedCase {
  const base: AggregatedCase = {
    outcome: 'passed' as CaseOutcome,
    passed: true,
    tp: 0,
    fn: 0,
    fp: 0,
    kept: 0,
    dropped: 0,
    expected_count: 0,
    actual_count: 0,
  };
  return { ...base, ...over };
}

/** A `must_find` case that found everything it was asked for. */
const mustFindPassed = (tp: number, kept = tp, dropped = 0) =>
  caseScore({ outcome: 'passed', passed: true, tp, fn: 0, kept, dropped, expected_count: tp });

/** A `must_find` case that missed some of them. */
const mustFindMissed = (tp: number, fn: number) =>
  caseScore({ outcome: 'failed', passed: false, tp, fn, kept: tp, expected_count: tp + fn });

/** A violated `must_not_flag` case — the only thing that can produce a false positive. */
const mustNotFlagViolated = (fp: number) =>
  caseScore({ outcome: 'failed', passed: false, fp, kept: fp, actual_count: fp });

const errored = () => caseScore({ outcome: 'errored', passed: false });

describe('aggregateRun', () => {
  it('AC-18: recall is Σtp / (Σtp + Σfn) over the must_find cases that produced output', () => {
    const m = aggregateRun([mustFindPassed(3), mustFindMissed(1, 2)], 2);
    expect(m.recall).toBeCloseTo(4 / 6);
  });

  it('AC-19: a set of only must_find cases reads precision = 1, whatever else the agent reported', () => {
    const m = aggregateRun([mustFindPassed(2), mustFindMissed(1, 1)], 2);
    expect(m.precision).toBe(1);
  });

  it('AC-19 × AC-16: adding one violated must_not_flag case is the only thing that lowers precision', () => {
    const before = aggregateRun([mustFindPassed(3)], 1);
    const after = aggregateRun([mustFindPassed(3), mustNotFlagViolated(1)], 2);
    expect(before.precision).toBe(1);
    expect(after.precision).toBeCloseTo(3 / 4);
  });

  it('AC-16: an extra unmatched finding in a must_find case leaves precision untouched', () => {
    // The extra finding shows up in `actual_count` and nowhere else — it moves
    // neither `tp` nor `fp`, so the run reads exactly as it would without it.
    const withExtra = aggregateRun([mustFindPassed(2)], 1);
    const withoutExtra = aggregateRun([caseScore({ tp: 2, kept: 2, actual_count: 3, expected_count: 2 })], 1);
    expect(withExtra.precision).toBe(withoutExtra.precision);
  });

  it('AC-20: citation_accuracy is Σkept / (Σkept + Σdropped) over the produced cases', () => {
    const m = aggregateRun([mustFindPassed(2, 2, 1), mustFindPassed(1, 1, 3)], 2);
    expect(m.citation_accuracy).toBeCloseTo(3 / 7);
  });

  it('AC-21: traces_passed / traces_produced count passed over PRODUCED, not over the set size', () => {
    const m = aggregateRun([mustFindPassed(1), mustFindMissed(0, 1), errored()], 8);
    expect(m.traces_passed).toBe(1);
    expect(m.traces_produced).toBe(2);
    expect(m.cases_total).toBe(8);
  });

  it('AC-49 × AC-50: a set of 8 with one errored case scores over 7 and completes 7 of 8', () => {
    const cases = [
      ...Array.from({ length: 4 }, () => mustFindPassed(1)),
      ...Array.from({ length: 3 }, () => mustFindMissed(0, 1)),
      errored(),
    ];
    const m = aggregateRun(cases, 8);
    // The errored case contributed to neither numerator nor denominator.
    expect(m.recall).toBeCloseTo(4 / 7);
    expect(m.traces_produced).toBe(7);
    expect(m.cases_total).toBe(8);
    expect(m.traces_passed).toBe(4);
  });

  it('AC-49 × AC-50: all 8 errored is a visible non-result, not a score of zero', () => {
    const m = aggregateRun(Array.from({ length: 8 }, errored), 8);
    expect(m.recall).toBeNull();
    expect(m.precision).toBeNull();
    expect(m.citation_accuracy).toBeNull();
    expect(m.traces_passed).toBeNull();
    expect(m.traces_produced).toBe(0);
    expect(m.cases_total).toBe(8);
  });

  it('AC-47: a set with no must_find case leaves recall null, never 0 and never NaN', () => {
    const m = aggregateRun([caseScore({ passed: true }), mustNotFlagViolated(2)], 2);
    expect(m.recall).toBeNull();
    expect(Number.isNaN(m.recall as number)).toBe(false);
  });

  it('AC-47: a run in which no case produced any finding leaves citation_accuracy null', () => {
    const m = aggregateRun([caseScore({ passed: true }), caseScore({ passed: true })], 2);
    expect(m.citation_accuracy).toBeNull();
    expect(m.precision).toBeNull();
  });

  it('AC-47: an empty batch yields nulls and a zero completion, never NaN', () => {
    const m = aggregateRun([], 0);
    expect([m.recall, m.precision, m.citation_accuracy, m.traces_passed]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(m.traces_produced).toBe(0);
  });
});
