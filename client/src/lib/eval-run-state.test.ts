import { describe, it, expect } from "vitest";
import type { EvalRunBatch } from "@devdigest/shared";
import { evalRunInFlight } from "./eval-run-state";

function batch(over: Partial<EvalRunBatch>): EvalRunBatch {
  return {
    id: "b1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    agent_version: 1,
    system_prompt: "review this",
    state: "complete",
    progress_index: 8,
    progress_total: 8,
    started_at: "2026-08-29T10:00:00Z",
    ran_at: "2026-08-29T10:02:00Z",
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    traces_passed: 8,
    traces_produced: 8,
    cases_total: 8,
    cost_usd: 0.02,
    duration_ms: 120000,
    ...over,
  };
}

describe("evalRunInFlight", () => {
  it("returns the running batch so a control can name it", () => {
    const running = batch({ id: "b2", state: "running", progress_index: 3, ran_at: null });
    expect(evalRunInFlight([batch({}), running])?.id).toBe("b2");
  });

  it("returns null when every batch has finished", () => {
    expect(evalRunInFlight([batch({}), batch({ id: "b3", state: "partial" })])).toBeNull();
  });

  it("returns null while the runs query is still loading", () => {
    expect(evalRunInFlight(undefined)).toBeNull();
  });

  /* A component test's `fetch` stub answers an unmatched URL with `{}`, which a
     `?? []` guard passes straight through into `.find`. The predicate must
     absorb that rather than throw a TypeError that surfaces as a blank render. */
  it("returns null for a non-array payload instead of throwing", () => {
    expect(evalRunInFlight({} as unknown as EvalRunBatch[])).toBeNull();
    expect(evalRunInFlight(null as unknown as EvalRunBatch[])).toBeNull();
  });
});
