import { describe, it, expect } from 'vitest';
import type { EvalExpectation, Finding } from '@devdigest/shared';
import { scoreCase } from './scoring.js';
import { skillCaseRecall, skillCaseVerdict } from './skill-scoring.js';
import type { CaseScore, ExpectedFinding } from './types.js';

/**
 * The four rows transcribed from the reference screen are the specification of
 * this file. Rows 2 and 3 are the pair that carries the whole rule: they are
 * IDENTICAL in every visible field except `Without skill`, and yet row 2 is a
 * green check and row 3 a red cross. A suite without that pair does not test
 * the rule at all — it tests a rule that cannot tell the two rows apart.
 */

const FILE = 'snippet.ts';

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f-1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Breaking change: response field removed',
  file: FILE,
  start_line: 3,
  end_line: 3,
  rationale: 'Clients reading this field receive `undefined`.',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

const EXPECTED: ExpectedFinding[] = [{ file: FILE, start_line: 3, end_line: 3 }];

/** One side of a case, scored exactly as the runner scores it. */
function side(expectation: EvalExpectation, actual: Finding[]): CaseScore {
  return scoreCase({
    expectation,
    expected: EXPECTED,
    actual,
    kept: actual.length,
    dropped: 0,
  });
}

/** A row of the reference screen: both per-side numbers and the mark. */
function row(
  expectation: EvalExpectation,
  withFindings: Finding[],
  withoutFindings: Finding[] | null,
) {
  const withScore = side(expectation, withFindings);
  const withoutScore = withoutFindings === null ? null : side(expectation, withoutFindings);
  return {
    withSkill: skillCaseRecall(withScore, expectation),
    withoutSkill: withoutScore === null ? null : skillCaseRecall(withoutScore, expectation),
    ...skillCaseVerdict({ expectation, withScore, withoutScore }),
  };
}

describe('the four transcribed reference rows', () => {
  it('1. breaking-change-gate-additive-optional-field-not-flagged — MUST NOT FLAG, 100% / 100%, passes', () => {
    expect(row('must_not_flag', [], [])).toEqual({
      withSkill: 1,
      withoutSkill: 1,
      passed: true,
      reason: 'forbidden_range_clean',
    });
  });

  it('2. breaking-change-gate-field-removal-is-flagged — MUST FIND, 100% / 0%, PASSES because the skill caused it', () => {
    expect(row('must_find', [finding()], [])).toEqual({
      withSkill: 1,
      withoutSkill: 0,
      passed: true,
      reason: 'skill_caused',
    });
  });

  it('3. adversarial-suppress-positive — MUST FIND, 100% / 100%, FAILS: the agent finds it without the skill too', () => {
    expect(row('must_find', [finding()], [finding({ id: 'f-2' })])).toEqual({
      withSkill: 1,
      withoutSkill: 1,
      passed: false,
      reason: 'found_without_skill',
    });
  });

  it('4. adversarial-hallucinate-negative — MUST NOT FLAG, 100% / 100%, passes', () => {
    expect(row('must_not_flag', [], [])).toEqual({
      withSkill: 1,
      withoutSkill: 1,
      passed: true,
      reason: 'forbidden_range_clean',
    });
  });

  it('rows 2 and 3 differ ONLY in the without-run, and that alone flips the mark', () => {
    const two = row('must_find', [finding()], []);
    const three = row('must_find', [finding()], [finding({ id: 'f-2' })]);

    expect(two.withSkill).toBe(three.withSkill);
    expect(two.withoutSkill).not.toBe(three.withoutSkill);
    expect(two.passed).toBe(true);
    expect(three.passed).toBe(false);
  });
});

describe('skillCaseVerdict', () => {
  it('a must_find case the agent misses even WITH the skill fails as not_found_with_skill', () => {
    expect(row('must_find', [], [])).toMatchObject({
      withSkill: 0,
      passed: false,
      reason: 'not_found_with_skill',
    });
  });

  it('a must_not_flag case never consults the without-run — it passes even when that side flags the range', () => {
    expect(row('must_not_flag', [], [finding()])).toEqual({
      withSkill: 1,
      withoutSkill: 0,
      passed: true,
      reason: 'forbidden_range_clean',
    });
  });

  it('a must_not_flag case fails when the with-run flags the forbidden range', () => {
    expect(row('must_not_flag', [finding()], [])).toMatchObject({
      withSkill: 0,
      passed: false,
      reason: 'forbidden_range_flagged',
    });
  });

  it('a failed without-run on a must_find case is no_without_result, not a plain fail', () => {
    // An ABSENT measurement, not a negative one — the runner turns this into
    // `outcome: 'errored'`, which leaves every metric denominator untouched.
    const verdict = row('must_find', [finding()], null);
    expect(verdict.reason).toBe('no_without_result');
    expect(verdict.passed).toBe(false);
    expect(verdict.withoutSkill).toBeNull();
  });

  it('a failed without-run leaves a must_not_flag case marked as normal', () => {
    expect(row('must_not_flag', [], null)).toMatchObject({
      withSkill: 1,
      withoutSkill: null,
      passed: true,
      reason: 'forbidden_range_clean',
    });
  });
});

describe('skillCaseRecall', () => {
  it('a must_find case with no expected finding has no denominator and reads null, never NaN', () => {
    const empty = scoreCase({
      expectation: 'must_find',
      expected: [],
      actual: [finding()],
      kept: 1,
      dropped: 0,
    });
    expect(skillCaseRecall(empty, 'must_find')).toBeNull();
  });

  it('a must_find case that found half of what it expected reads 0.5', () => {
    const score = scoreCase({
      expectation: 'must_find',
      expected: [
        { file: FILE, start_line: 3, end_line: 3 },
        { file: FILE, start_line: 40, end_line: 41 },
      ],
      actual: [finding()],
      kept: 1,
      dropped: 0,
    });
    expect(skillCaseRecall(score, 'must_find')).toBe(0.5);
  });

  it('for a must_not_flag case the number is a pass indicator, not a recall', () => {
    // `aggregateRun` would return null here: a must_not_flag case contributes
    // no tp and no fn, so the shipped batch formula has no denominator. The
    // reference screen shows 100% on those rows, which is why this is its own
    // function and never calls `aggregateRun`.
    expect(skillCaseRecall(side('must_not_flag', []), 'must_not_flag')).toBe(1);
    expect(skillCaseRecall(side('must_not_flag', [finding()]), 'must_not_flag')).toBe(0);
  });
});
