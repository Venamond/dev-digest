/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../messages/en/eval.json";
import { AgentEvalView } from "./AgentEvalView";

afterEach(cleanup);

const day = 24 * 60 * 60 * 1000;
const iso = (agoDays: number) => new Date(Date.now() - agoDays * day).toISOString();

const batch = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  agent_id: "a1",
  agent_name: "Security Reviewer",
  agent_version: 3,
  system_prompt: "new prompt",
  state: "complete",
  progress_index: 8,
  progress_total: 8,
  started_at: iso(1),
  ran_at: iso(1),
  recall: 0.87,
  precision: 0.87,
  citation_accuracy: 1,
  traces_passed: 7,
  traces_produced: 7,
  cases_total: 8,
  cost_usd: 0.42,
  duration_ms: 40000,
  ...over,
});

/** Newest first, as the API answers. The oldest run is outside the 30-day window. */
const runs = [
  batch({ id: "b3", agent_version: 3, ran_at: iso(1), started_at: iso(1), precision: 0.87 }),
  batch({ id: "b2", agent_version: 2, ran_at: iso(4), started_at: iso(4), precision: 0.91 }),
  batch({ id: "b1", agent_version: 1, ran_at: iso(60), started_at: iso(60), precision: 0.8 }),
];

const point = (agoDays: number, precision: number) => ({
  ran_at: iso(agoDays),
  recall: 0.87,
  precision,
  citation_accuracy: 1,
  pass_rate: 0.875,
  cost_usd: 0.42,
});

const dashboard = {
  agent_id: "a1",
  agent_name: "Security Reviewer",
  model: "claude-sonnet-4",
  cases_total: 8,
  current: { recall: 0.87, precision: 0.87, citation_accuracy: 1 },
  delta: { recall: 0.02, precision: -0.04, citation_accuracy: 0 },
  // chronological, oldest first — one point predates the 30-day window
  trend: [point(60, 0.8), point(4, 0.91), point(1, 0.87)],
  runs,
  alert: null,
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

let runsPayload: unknown[] = runs;
let dashboardPayload: unknown = dashboard;
let calls: { url: string; method?: string }[] = [];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

beforeEach(() => {
  calls = [];
  runsPayload = runs;
  dashboardPayload = dashboard;
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method });
      if (url.includes("/eval-dashboard")) return jsonResponse(dashboardPayload);
      if (url.includes("/eval-runs")) {
        if (init?.method === "POST") return jsonResponse({ run_id: "b-new", cases_total: 8 });
        return jsonResponse(runsPayload);
      }
      if (url.endsWith("/agents")) {
        return jsonResponse([{ id: "a1", name: "Security Reviewer" }]);
      }
      return jsonResponse({});
    }),
  );
});

function renderView() {
  const onBack = vi.fn();
  const onPickAgent = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <AgentEvalView agentId="a1" onBack={onBack} onPickAgent={onPickAgent} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onBack, onPickAgent };
}

const rowsOf = () => within(screen.getByTestId("runs-table")).getAllByRole("button");

describe("AgentEvalView", () => {
  it("renders the header, metric cards, trend and the eight run columns", async () => {
    renderView();
    expect(await screen.findByRole("heading", { name: /Security Reviewer/ })).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4")).toBeInTheDocument();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    // deltas come off the dashboard, rendered by MetricCard
    expect(screen.getByText("0.04")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
    const head = within(screen.getByTestId("runs-table"));
    for (const col of ["Ran at", "Version", "Recall", "Precision", "Citation", "Pass", "Cost"]) {
      expect(head.getByText(col)).toBeInTheDocument();
    }
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    const first = within(rowsOf()[0]!);
    expect(first.getByText("v3")).toBeInTheDocument();
    expect(first.getByText("7/7")).toBeInTheDocument();
    expect(first.getByText("$0.42")).toBeInTheDocument();
  });

  it("states the real run and case counts, never a hard-coded gold set", async () => {
    renderView();
    expect(await screen.findByText(/3 runs on the 8-case set/)).toBeInTheDocument();
    expect(screen.queryByText(/20-trace/i)).not.toBeInTheDocument();
    expect(screen.getByText("7 of 8 ran")).toBeInTheDocument();
  });

  it("names a run that did not complete every case as partial (S14, AC-45)", async () => {
    runsPayload = [batch({ id: "b3", state: "partial", traces_produced: 7 }), ...runs.slice(1)];
    dashboardPayload = { ...dashboard, runs: runsPayload };
    renderView();
    expect(await screen.findByText(/Partial result — 7 of 8 ran/)).toBeInTheDocument();
  });

  it("warns when precision dipped against the previous run", async () => {
    renderView();
    expect(await screen.findByText(/Precision dipped 4pts on v3/)).toBeInTheDocument();
  });

  it("shows no regression alert when precision held", async () => {
    runsPayload = [runs[1]!, runs[2]!]; // 0.91 after 0.80 — up, not down
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(2));
    expect(screen.queryByText(/Precision dipped/)).not.toBeInTheDocument();
  });

  it("keeps Compare disabled below two selected runs and says why", async () => {
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();

    fireEvent.click(rowsOf()[0]!);
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(rowsOf()[1]!);
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("drops the earliest selection when a third run is picked", async () => {
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    fireEvent.click(rowsOf()[0]!);
    fireEvent.click(rowsOf()[1]!);
    fireEvent.click(rowsOf()[2]!);
    const pressed = rowsOf().map((r) => r.getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "true", "true"]);
  });

  it("windows only the trend chart — the table and the selection are untouched", async () => {
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    fireEvent.click(rowsOf()[2]!); // the run that predates the window
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-points", "3");

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-points", "2");
    // the old run is still in the table, and still selected
    expect(rowsOf()).toHaveLength(3);
    expect(rowsOf()[2]!).toHaveAttribute("aria-pressed", "true");
  });

  it("routes Run eval through the spend confirmation, then shows it in progress", async () => {
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: /Run eval/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/8 model calls/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Security Reviewer/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Run eval/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Running/ })).toBeDisabled();
  });

  it("picks up the new run when the event stream closes, without remounting", async () => {
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(3));
    const heading = screen.getByRole("heading", { name: /Security Reviewer/ });

    fireEvent.click(screen.getByRole("button", { name: /Run eval/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    runsPayload = [batch({ id: "b-new", agent_version: 4, ran_at: iso(0) }), ...runs];
    await act(async () => {
      FakeEventSource.instances[0]!.onerror?.(new Event("error"));
    });

    await waitFor(() => expect(rowsOf()).toHaveLength(4));
    expect(within(rowsOf()[0]!).getByText("v4")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Security Reviewer/ })).toBe(heading);
  });

  it("renders an agent with no runs, and one with a single run, without a crash", async () => {
    runsPayload = [];
    dashboardPayload = {
      ...dashboard,
      current: { recall: null, precision: null, citation_accuracy: null },
      delta: { recall: null, precision: null, citation_accuracy: null },
      trend: [],
      runs: [],
    };
    const { unmount } = { unmount: () => cleanup() };
    renderView();
    expect(await screen.findByText(/No eval runs yet/)).toBeInTheDocument();
    // a zero denominator reads as an em dash, never 0% and never NaN
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
    unmount();

    runsPayload = [runs[0]!];
    dashboardPayload = { ...dashboard, runs: [runs[0]!] };
    renderView();
    await waitFor(() => expect(rowsOf()).toHaveLength(1));
    fireEvent.click(rowsOf()[0]!);
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
  });
});
