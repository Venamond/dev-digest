import type { EvalRunBatch } from "@devdigest/shared";

/**
 * The one predicate every control that starts an eval run or a trial reads.
 *
 * It mirrors the server's own guard (`assertNoRunInFlight`, which answers 409),
 * rather than a UI state enum: two affordances for the same action that compute
 * "can I act" from two expressions drift apart, and the drift reads as random
 * from outside.
 *
 * Returns the in-flight batch so a caller can name it, or `null` when the agent
 * is idle. A non-array payload — what a test's catch-all `fetch` stub yields for
 * an unmatched URL — is treated as "no runs", never thrown on.
 */
export function evalRunInFlight(runs: EvalRunBatch[] | undefined): EvalRunBatch | null {
  if (!Array.isArray(runs)) return null;
  return runs.find((r) => r?.state === "running") ?? null;
}
