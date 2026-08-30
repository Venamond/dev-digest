/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Agent,
  EvalCase,
  EvalCaseWithLastRun,
  EvalRunBatch,
  EvalRunRecord,
  RunEvent,
} from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "ag1" }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams(),
}));

// The SSE stream is the only source of live progress; jsdom has no EventSource.
const runEvents: { events: RunEvent[]; running: boolean } = { events: [], running: false };
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => runEvents,
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const CASE_FIND: EvalCase = {
  id: "c1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  expectation: "must_find",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n",
  input_files: null,
  input_meta: null,
  expected_output: [{ title: "Hardcoded Stripe secret key", file: "src/config.ts", start_line: 12 }],
  seeded_from: { finding_id: "f1", disposition: "accepted" },
  notes: null,
};

const CASE_NOT_FLAG: EvalCase = {
  ...CASE_FIND,
  id: "c2",
  name: "no-flag-on-test-fixture",
  expectation: "must_not_flag",
  expected_output: [],
  seeded_from: { finding_id: "f2", disposition: "dismissed" },
};

const BATCH: EvalRunBatch = {
  id: "b1",
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  agent_version: 3,
  system_prompt: "You are a security reviewer.",
  state: "partial",
  progress_index: 8,
  progress_total: 8,
  started_at: "2026-08-29T10:00:00.000Z",
  ran_at: "2026-08-29T10:02:00.000Z",
  recall: 0.857,
  // precision has no denominator in this fixture — it must read as an em dash,
  // never 0% and never NaN (AC-47).
  precision: null,
  citation_accuracy: 0.5,
  traces_passed: 6,
  traces_produced: 7,
  cases_total: 8,
  cost_usd: 0.021,
  duration_ms: 12000,
};

const PASSED: EvalRunRecord = {
  id: "r1",
  case_id: "c1",
  case_name: "stripe-key-leak",
  ran_at: "2026-08-29T10:01:00.000Z",
  actual_output: [],
  pass: true,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 1800,
  cost_usd: 0.01,
  batch_id: "b1",
  outcome: "passed",
  failure_reason: null,
  expected_count: 1,
  actual_count: 1,
};

const ERRORED: EvalRunRecord = {
  ...PASSED,
  id: "r2",
  case_id: "c2",
  case_name: "no-flag-on-test-fixture",
  pass: null,
  outcome: "errored",
  failure_reason: "provider timed out after 60s",
  expected_count: 0,
  actual_count: 0,
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch({
  cases = [CASE_FIND, CASE_NOT_FLAG],
  runs = [BATCH],
  results = [PASSED, ERRORED],
}: {
  cases?: EvalCaseWithLastRun[];
  runs?: EvalRunBatch[];
  results?: EvalRunRecord[];
} = {}) {
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (url.includes("/eval-cases") && method === "DELETE") return jsonResponse({ ok: true });
      if (url.includes("/run") && method === "POST") return jsonResponse(PASSED);
      if (url.includes("/eval-cases")) return jsonResponse(cases);
      if (url.includes("/eval-dashboard"))
        return jsonResponse({
          agent_id: "ag1",
          agent_name: "Security Reviewer",
          model: "gpt-4.1",
          cases_total: cases.length,
          current: { recall: 0.857, precision: null, citation_accuracy: 0.5 },
          delta: { recall: 0.12, precision: null, citation_accuracy: null },
          trend: [],
          runs,
          alert: null,
        });
      if (url.includes("/agents/ag1/eval-runs")) {
        if (method === "POST") return jsonResponse({ run_id: "b2", cases_total: cases.length });
        return jsonResponse(runs);
      }
      if (url.includes("/eval-runs/")) return jsonResponse({ batch: runs[0], results });
      return jsonResponse({});
    }),
  );
  return calls;
}

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  runEvents.events = [];
  runEvents.running = false;
  stubFetch();
});

describe("EvalsTab — case set (AC-6, AC-7, AC-59)", () => {
  it("renders a row with its name, expectation badge, last result and three actions", async () => {
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    expect(within(row).getByText("stripe-key-leak")).toBeInTheDocument();
    expect(within(row).getByText("must find")).toBeInTheDocument();
    // The verdict is the status icon; the line states counts and recall, as
    // the reference draws it.
    expect(await within(row).findByText(/expected 1 finding, got 1/)).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("captions the set with the real case count, never a fixed number", async () => {
    renderTab();
    expect(await screen.findByText("2 cases")).toBeInTheDocument();
  });

  it("offers New eval case", async () => {
    renderTab();
    expect(await screen.findByRole("button", { name: /New eval case/ })).toBeInTheDocument();
  });

  it("renders the empty state instead of a zero-length list", async () => {
    stubFetch({ cases: [] });
    renderTab();
    expect(await screen.findByText(/Create one to assert/)).toBeInTheDocument();
    expect(screen.queryByTestId("eval-case-c1")).not.toBeInTheDocument();
  });
});

describe("EvalsTab — metrics (AC-14, AC-45, AC-47, AC-50)", () => {
  it("states that scoring is mechanical and makes no model call", async () => {
    renderTab();
    expect(await screen.findByText(/no model call in the scorer/i)).toBeInTheDocument();
  });

  it("renders an em dash for a metric with no denominator, never 0% and never NaN", async () => {
    renderTab();
    await screen.findByText("86%");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("reports a partial run as 7 of 8 ran", async () => {
    renderTab();
    expect(await screen.findByText(/Partial result — 7 of 8 ran/)).toBeInTheDocument();
  });
});

describe("EvalsTab — a failed case reads differently from one that did not pass (AC-44)", () => {
  it("states the failure reason on the errored case", async () => {
    renderTab();
    const errored = await screen.findByTestId("eval-case-c2");
    expect(await within(errored).findByText(/provider timed out after 60s/)).toBeInTheDocument();
    const passed = screen.getByTestId("eval-case-c1");
    expect(within(passed).queryByText(/provider timed out/)).not.toBeInTheDocument();
  });
});

describe("EvalsTab — a run in flight (AC-37, AC-38, AC-39)", () => {
  const RUNNING: EvalRunBatch = { ...BATCH, state: "running", progress_index: 3 };

  function event(index: number): RunEvent {
    return {
      runId: "b1",
      seq: index,
      kind: "result",
      msg: `case ${index} of 8`,
      t: "00.0" + index,
      data: { index, total: 8 },
    };
  }

  it("shows the run in progress instead of offering a second start, and advances", async () => {
    stubFetch({ runs: [RUNNING] });
    runEvents.running = true;
    runEvents.events = [event(3)];
    renderTab();

    expect(await screen.findByText("3 / 8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run all evals/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Running/ })).toBeDisabled();

    // Re-mount so the mocked stream is read again with the next position.
    runEvents.events = [event(3), event(4)];
    cleanup();
    renderTab();
    expect(await screen.findByText("4 / 8")).toBeInTheDocument();
  });
});

describe("EvalsTab — a set run animates the cases it has not reached", () => {
  /* The runner walks the set in list order and publishes its position, so a
     row at or beyond that index is still to come and must show it. Asserting
     that a spinner exists somewhere would pass with every row spinning; the
     point is WHICH rows do. */
  it("spins the pending rows and leaves the finished ones alone", async () => {
    stubFetch({
      runs: [{ ...BATCH, state: "running", progress_index: 1, progress_total: 2 }],
    });
    renderTab();
    const done = await screen.findByTestId("eval-case-c1");
    const pending = screen.getByTestId("eval-case-c2");
    /* The label stays "Run" while loading — the primitive swaps the ICON for a
       spinning one, so the animation is the only observable difference. */
    const spins = (row: HTMLElement) => {
      const btn = within(row).getByRole("button", { name: "Run" });
      return (btn.querySelector("svg")?.getAttribute("style") ?? "").includes("ddspin");
    };
    // Case 1 is behind the position: done, so no spinner.
    expect(spins(done)).toBe(false);
    // Case 2 is at the position: still to come.
    expect(spins(pending)).toBe(true);
  });
});

describe("EvalsTab — spend is stated before it happens (AC-64) and deletion is confirmed (AC-35)", () => {
  it("routes Run all evals through the confirmation, naming the call count", async () => {
    renderTab();
    // Wait for the case set: the control is disabled until its count is known,
    // and a click on a disabled button is silently ignored.
    await screen.findByText("2 cases");
    fireEvent.click(screen.getByRole("button", { name: /Run all evals/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/2 model calls/)).toBeInTheDocument();
  });

  it("routes a case row's Play through the confirmation with one call", async () => {
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1 model call/)).toBeInTheDocument();
  });

  it("names the run-history loss in the delete confirmation", async () => {
    const calls = stubFetch();
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/run history is deleted with it/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete case" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/eval-cases/c1"))).toBe(true),
    );
  });
});

describe("EvalsTab — the result the server recorded last (AC-63)", () => {
  /* A trial run after the batch: it writes no batch row, so the newest batch
     still holds the older, passing result for the same case. */
  const TRIAL: EvalRunRecord = {
    ...PASSED,
    id: "r9",
    batch_id: null,
    ran_at: "2026-08-29T11:00:00.000Z",
    pass: false,
    outcome: "failed",
    actual_count: 0,
  };

  it("shows the case's last_run on first render, over the older batch row", async () => {
    stubFetch({ cases: [{ ...CASE_FIND, last_run: TRIAL }, CASE_NOT_FLAG] });
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    // The trial reports `got 0`; the older batch row reported `got 1`. The
    // negative half is what makes this a precedence test.
    expect(await within(row).findByText(/got 0/)).toBeInTheDocument();
    expect(within(row).queryByText(/got 1/)).not.toBeInTheDocument();
  });

  /* The mirror of the bug above: `trials` is never cleared, so a trial fired
     earlier in this mount must NOT displace a newer server result for the same
     case. AC-63 says "most recently", not "in this mount". */
  it("keeps a newer server result over a trial fired earlier in the same mount", async () => {
    const NEWER: EvalRunRecord = {
      ...PASSED,
      id: "r10",
      batch_id: null,
      ran_at: "2026-08-29T12:00:00.000Z",
      pass: false,
      outcome: "failed",
      // Distinct from both PASSED and TRIAL, so the assertion below can only
      // pass if THIS record won.
      actual_count: 3,
    };
    // The single-case run POST resolves with PASSED (ran_at 10:01) — older than
    // the `last_run` the server already reports for this case.
    stubFetch({ cases: [{ ...CASE_FIND, last_run: NEWER }, CASE_NOT_FLAG] });
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(within(screen.getByTestId("eval-case-c1")).getByText(/got 3/)).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("eval-case-c1")).queryByText(/got 0/),
    ).not.toBeInTheDocument();
  });

  it("opens the case editor with that same result already in its panel", async () => {
    stubFetch({ cases: [{ ...CASE_FIND, last_run: TRIAL }, CASE_NOT_FLAG] });
    renderTab();
    const row = await screen.findByTestId("eval-case-c1");
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Last run failed/)).toBeInTheDocument();
  });
});
