import { describe, it, expect } from "vitest";
import { acceptPct, categorySegments, formatDurationSec, formatUsd, traceHref } from "./helpers";
import type { AgentStats } from "@devdigest/shared";

const BASE: AgentStats = {
  agent_id: "a",
  agent_name: "A",
  runs: 0,
  findings_total: 0,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  accept_rate: null,
  dismiss_rate: null,
  avg_findings_per_run: null,
  total_cost_usd: null,
  avg_cost_usd: null,
  avg_latency_ms: null,
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  findings_by_category: {},
  trend: [],
  recent_runs: [],
};

describe("StatsTab helpers", () => {
  it("formats usd and duration", () => {
    expect(formatUsd(0.04)).toBe("$0.040");
    expect(formatUsd(0.0035)).toBe("$0.004");
    expect(formatUsd(1.25)).toBe("$1.25");
    expect(formatUsd(null)).toBe("—");
    expect(formatDurationSec(6200)).toBe("6.2");
  });

  it("maps accept rate to percent", () => {
    expect(acceptPct({ ...BASE, accept_rate: 0.78 })).toBe(78);
    expect(acceptPct(BASE)).toBeNull();
  });

  it("builds category segments sorted by count", () => {
    expect(categorySegments({ style: 2, security: 5 })).toEqual([
      { label: "security", value: 5, color: "var(--crit)" },
      { label: "style", value: 2, color: "var(--accent)" },
    ]);
  });

  it("builds a trace href only when repo + PR are present", () => {
    expect(
      traceHref({
        run_id: "r1",
        ran_at: "2026-08-01T00:00:00.000Z",
        pr_number: 12,
        repo_id: "repo",
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: 0.01,
        findings_count: 0,
        source: "local",
      }),
    ).toBe("/repos/repo/pulls/12?tab=findings&trace=r1");
    expect(
      traceHref({
        run_id: "r1",
        ran_at: "2026-08-01T00:00:00.000Z",
        pr_number: null,
        repo_id: null,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        findings_count: null,
        source: "local",
      }),
    ).toBeNull();
  });
});
