/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "…",
    score: 38,
    model: "deepseek/deepseek-v4-flash",
    grounding: "1/1 passed",
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

function renderRuns(runs: RunSummary[], reviews?: ReviewRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} reviews={reviews} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows the run's cost next to its timestamp", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0013 })]);
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });
});

describe("RunHistory — findings preview", () => {
  it("shows per-severity badges (not plain finding-count text) when the run's review is in `reviews`", () => {
    renderRuns(
      [run({ status: "done", findings_count: 2, blockers: 1, score: 38 })],
      [
        review({
          findings: [
            {
              id: "f-1",
              review_id: "rv-1",
              severity: "CRITICAL",
              category: "security",
              title: "Hardcoded secret",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              rationale: "A live key is committed.",
              suggestion: null,
              confidence: 0.98,
              kind: "finding",
              trifecta_components: null,
              evidence: null,
              accepted_at: null,
              dismissed_at: null,
            },
            {
              id: "f-2",
              review_id: "rv-1",
              severity: "WARNING",
              category: "bug",
              title: "N+1 query",
              file: "src/api/users.ts",
              start_line: 45,
              end_line: 52,
              rationale: "Calls findMany once per user.",
              suggestion: null,
              confidence: 0.86,
              kind: "finding",
              trifecta_components: null,
              evidence: null,
              accepted_at: null,
              dismissed_at: null,
            },
          ],
        }),
      ],
    );
    // per-severity counts (1 critical, 1 warning), not the old "2 finding(s)" text
    expect(screen.queryByText("2 finding(s)")).not.toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
  });

  it("falls back to plain finding-count text when the run has no matching review", () => {
    renderRuns([run({ status: "done", findings_count: 2, blockers: 0 })], []);
    expect(screen.getByText("2 finding(s)")).toBeInTheDocument();
  });

  it("hovering the severity badges shows that run's findings in a preview popover", () => {
    vi.useFakeTimers();
    renderRuns(
      [run({ status: "done", findings_count: 1, blockers: 0, score: 88 })],
      [
        review({
          findings: [
            {
              id: "f-1",
              review_id: "rv-1",
              severity: "WARNING",
              category: "perf",
              title: "N+1 query in user list endpoint",
              file: "src/api/users.ts",
              start_line: 45,
              end_line: 52,
              rationale: "Calls findMany once per user.",
              suggestion: null,
              confidence: 0.86,
              kind: "finding",
              trifecta_components: null,
              evidence: null,
              accepted_at: null,
              dismissed_at: null,
            },
          ],
        }),
      ],
    );
    fireEvent.mouseEnter(screen.getByText("1").parentElement!.parentElement!.parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
  });
});
