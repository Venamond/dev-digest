import { describe, it, expect } from "vitest";
import type { RunSummary } from "@devdigest/shared";
import { lastReviewTokensIn } from "./helpers";

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security",
    provider: "openrouter",
    model: "x",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 10,
    cost_usd: null,
    findings_count: 1,
    grounding: null,
    ran_at: "2026-08-15T00:00:00.000Z",
    score: 40,
    blockers: 1,
    ...over,
  };
}

describe("lastReviewTokensIn", () => {
  it("returns null when there are no completed runs", () => {
    expect(lastReviewTokensIn([])).toBeNull();
    expect(lastReviewTokensIn([run({ status: "running" })])).toBeNull();
  });

  it("sums tokens_in of completed runs in the newest wave", () => {
    expect(
      lastReviewTokensIn([
        run({ run_id: "a", tokens_in: 100, ran_at: "2026-08-15T00:00:01.000Z" }),
        run({ run_id: "b", tokens_in: 50, ran_at: "2026-08-15T00:00:00.000Z" }),
      ]),
    ).toBe(150);
  });

  it("excludes an older wave outside the gap", () => {
    expect(
      lastReviewTokensIn([
        run({ run_id: "new", tokens_in: 20, ran_at: "2026-08-15T12:00:00.000Z" }),
        run({ run_id: "old", tokens_in: 9999, ran_at: "2026-08-15T10:00:00.000Z" }),
      ]),
    ).toBe(20);
  });

  it("ignores failed runs and treats null tokens_in as 0", () => {
    expect(
      lastReviewTokensIn([
        run({ run_id: "ok", tokens_in: 40, ran_at: "2026-08-15T00:00:00.000Z" }),
        run({ run_id: "fail", status: "failed", tokens_in: 800, ran_at: "2026-08-15T00:00:00.000Z" }),
        run({ run_id: "none", tokens_in: null, ran_at: "2026-08-15T00:00:00.000Z" }),
      ]),
    ).toBe(40);
  });
});