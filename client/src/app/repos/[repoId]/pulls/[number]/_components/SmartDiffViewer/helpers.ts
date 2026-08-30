import type { RunSummary } from "@devdigest/shared";
import { REVIEW_WAVE_GAP_MS } from "./constants";

function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Sum tokens_in of the newest cluster of completed runs. Null when there is
 * no completed wave with a recorded prompt-token count — the caption then
 * omits "built on N from last review".
 */
export function lastReviewTokensIn(runs: RunSummary[]): number | null {
  const done = runs.filter((r) => r.status === "done");
  if (done.length === 0) return null;

  const sorted = [...done].sort((a, b) => tsOf(b.ran_at) - tsOf(a.ran_at));
  const newest = tsOf(sorted[0]!.ran_at);
  let sum = 0;
  for (const r of sorted) {
    if (newest - tsOf(r.ran_at) > REVIEW_WAVE_GAP_MS) break;
    sum += r.tokens_in ?? 0;
  }
  return sum > 0 ? sum : null;
}