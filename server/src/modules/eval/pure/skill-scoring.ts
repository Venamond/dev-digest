import type { EvalExpectation } from '@devdigest/shared';
import type { CaseScore } from './types.js';

/**
 * Ring 0 — the two numbers and the one mark a SKILL eval case produces.
 *
 * A skill case runs the same diff twice against the same agent, once with the
 * skill's body in the prompt and once without, and the mark is the difference
 * between the two runs. That makes this file deliberately separate from
 * `aggregate.ts`: `aggregateRun` computes a BATCH's `recall` over the
 * `must_find` cases that produced output, and returns `null` for a set made
 * only of `must_not_flag` cases. The per-side number a skill case shows as
 * `With skill` / `Without skill` is a different quantity with the same name,
 * and the two must never drift into each other.
 */

/**
 * The per-side number screen A renders as `With skill A% / Without skill B%`.
 *
 * For a `must_find` case it is plain recall, `tp / (tp + fn)`, and `null` when
 * the case names no expected finding at all — a row with no denominator renders
 * an em dash, never `NaN`. For a `must_not_flag` case there is no recall to
 * compute: the number is a pass indicator, 1 when the forbidden range stayed
 * clean on that side and 0 when it did not. The label on screen stays the
 * reference's word `recall` because that is the reference's naming.
 */
export function skillCaseRecall(score: CaseScore, expectation: EvalExpectation): number | null {
  if (expectation === 'must_not_flag') return score.passed ? 1 : 0;
  const denominator = score.tp + score.fn;
  return denominator === 0 ? null : score.tp / denominator;
}

/** Why a case reached the mark it did — rendered on screen, not re-derived there. */
export type SkillCaseReason =
  /** `must_find`: found with the skill, absent without it. The skill caused it. */
  | 'skill_caused'
  /** `must_find`: found with the skill AND without it — the case proves nothing. */
  | 'found_without_skill'
  /** `must_find`: the expected finding never appeared, even with the skill. */
  | 'not_found_with_skill'
  /** `must_not_flag`: the forbidden range stayed unflagged on the with-run. */
  | 'forbidden_range_clean'
  /** `must_not_flag`: something flagged the forbidden range on the with-run. */
  | 'forbidden_range_flagged'
  /** `must_find`: the without-run produced no result, so there is nothing to compare. */
  | 'no_without_result';

export interface SkillCaseVerdictInput {
  expectation: EvalExpectation;
  withScore: CaseScore;
  /** `null` when the without-run failed — an ABSENT measurement, not a negative one. */
  withoutScore: CaseScore | null;
}

export interface SkillCaseVerdict {
  passed: boolean;
  reason: SkillCaseReason;
}

/**
 * The mark, and the reason it was reached.
 *
 * A `MUST FIND` case passes when the expected finding is present in the run
 * WITH the skill and absent in the run WITHOUT it — the case asserts that the
 * skill *caused* the finding, so an agent that finds it anyway has demonstrated
 * nothing about the skill and the case fails. A `MUST NOT FLAG` case is marked
 * on the with-run alone; its without-side is reported beside it and never
 * consulted.
 *
 * `withoutScore: null` on a `must_find` case is `no_without_result` rather than
 * a plain fail, and the runner turns that into `outcome: 'errored'` — the
 * outcome this repository already defines as leaving every metric denominator
 * untouched.
 */
export function skillCaseVerdict(input: SkillCaseVerdictInput): SkillCaseVerdict {
  const { expectation, withScore, withoutScore } = input;

  if (expectation === 'must_not_flag') {
    return withScore.passed
      ? { passed: true, reason: 'forbidden_range_clean' }
      : { passed: false, reason: 'forbidden_range_flagged' };
  }

  // Checked BEFORE the with-side: with no without-result the case has no mark
  // at all, and reporting a fail would state a negative result nobody measured.
  if (withoutScore === null) return { passed: false, reason: 'no_without_result' };
  if (!withScore.passed) return { passed: false, reason: 'not_found_with_skill' };
  return withoutScore.passed
    ? { passed: false, reason: 'found_without_skill' }
    : { passed: true, reason: 'skill_caused' };
}
