import { z } from 'zod';

/**
 * Ring 0 — the eval scorer's own vocabulary. No I/O, no `db/`, no Node
 * builtins: this directory is named in `no-domain-io` and
 * `no-domain-node-builtins` (`server/.dependency-cruiser.cjs`), and
 * `pnpm verify:l06` runs it offline.
 */

/**
 * The part of a finding an eval case asserts about: a file and a line range.
 * A case's `expected_output` column is `jsonb` (`db/schema/eval.ts:29`), so it
 * arrives as `unknown` and is read through `readExpected` — never cast.
 */
export const ExpectedFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type ExpectedFinding = z.infer<typeof ExpectedFinding>;

/**
 * The stored shape is more forgiving than the one the scorer works with: a
 * hand-authored case may omit `end_line` for a single line. Anything that is
 * not a usable location is skipped rather than thrown on — a malformed case
 * must not take the whole batch down.
 */
const StoredExpectedFinding = z
  .object({
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int().nullish(),
  })
  .transform((v) => ({
    file: v.file,
    start_line: v.start_line,
    end_line: v.end_line ?? v.start_line,
  }));

/** Read a case's `expected_output`. `null`, a non-array and junk entries all read as nothing. */
export function readExpected(value: unknown): ExpectedFinding[] {
  if (!Array.isArray(value)) return [];
  const out: ExpectedFinding[] = [];
  for (const item of value) {
    const parsed = StoredExpectedFinding.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** What one executed case contributes to a run's metrics. */
export interface CaseScore {
  passed: boolean;
  tp: number;
  fn: number;
  fp: number;
  /** Findings the engine's grounding gate kept, and dropped — AC-20's inputs. */
  kept: number;
  dropped: number;
  expected_count: number;
  actual_count: number;
}

/** How a case ended. `errored` leaves every metric untouched (AC-49). */
export type CaseOutcome = 'passed' | 'failed' | 'errored';

/**
 * A batch's metrics. Every ratio is `null` when its denominator is zero — never
 * `0`, never `NaN` (AC-47); the client renders an em dash.
 */
export interface RunMetrics {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  /** `null` when no case produced output — a visible non-result, not a zero. */
  traces_passed: number | null;
  /** How many cases produced output. AC-50 reads `<produced> of <cases_total>`. */
  traces_produced: number;
  cases_total: number;
}
