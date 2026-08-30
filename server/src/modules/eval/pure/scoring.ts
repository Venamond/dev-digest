import type { EvalExpectation, Finding } from '@devdigest/shared';
import type { CaseScore, ExpectedFinding } from './types.js';

/**
 * Ring 0 — mechanical scoring of one eval case. No model call ever happens
 * here (AC-13): a case is judged by comparing locations, and nothing else.
 */

/** Inclusive overlap, tolerant of a reversed range — mirrors `rangeIntersects` (`reviewer-core/src/grounding.ts:40`). */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

/**
 * True when, and only when, the finding is in the expected file and its line
 * range overlaps the expected one. **No other field takes part** — not title,
 * not severity, not category, not rationale (AC-15). Two agents can word the
 * same defect differently; the location is what a human actually judged.
 */
export function matchesExpected(actual: Finding, expected: ExpectedFinding): boolean {
  if (actual.file !== expected.file) return false;
  return rangesOverlap(
    actual.start_line,
    actual.end_line,
    expected.start_line,
    expected.end_line,
  );
}

export interface ScoreCaseInput {
  expectation: EvalExpectation;
  /** Already read through `readExpected` — a `null` `expected_output` is `[]`. */
  expected: ExpectedFinding[];
  /** The POST-grounding findings (`outcome.review.findings`). */
  actual: Finding[];
  kept: number;
  dropped: number;
}

export function scoreCase(input: ScoreCaseInput): CaseScore {
  const { expectation, expected, actual, kept, dropped } = input;

  if (expectation === 'must_not_flag') {
    // Each actual finding sitting on a forbidden location counts, so the same
    // defect reported twice counts twice (AC-17). A finding anywhere else in
    // the diff is not a violation — the case asserts one absence, not silence
    // (AC-46).
    const fp = actual.filter((a) => expected.some((e) => matchesExpected(a, e))).length;
    return {
      passed: fp === 0,
      tp: 0,
      fn: 0,
      fp,
      kept,
      dropped,
      expected_count: expected.length,
      actual_count: actual.length,
    };
  }

  // must_find: an expected finding matched by at least one actual finding is a
  // single true positive — a duplicate report is absorbed, not rewarded.
  const tp = expected.filter((e) => actual.some((a) => matchesExpected(a, e))).length;
  const fn = expected.length - tp;
  return {
    // An extra finding nobody judged moves neither `tp` nor `fp` (AC-16) and
    // does not fail the case (AC-51).
    passed: fn === 0,
    tp,
    fn,
    fp: 0,
    kept,
    dropped,
    expected_count: expected.length,
    actual_count: actual.length,
  };
}
