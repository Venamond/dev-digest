/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "@/components/app-shell/helpers";
import messages from "../../../../../messages/en/eval.json";
import { EvalOverview } from "./EvalOverview";

afterEach(cleanup);

const batch = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  agent_id: "a1",
  agent_name: "Security Reviewer",
  agent_version: 3,
  system_prompt: "old prompt",
  state: "complete",
  progress_index: 8,
  progress_total: 8,
  started_at: "2026-08-29T09:10:00.000Z",
  ran_at: "2026-08-29T09:12:00.000Z",
  recall: 0.87,
  precision: 0.91,
  citation_accuracy: 1,
  traces_passed: 7,
  traces_produced: 8,
  cases_total: 8,
  cost_usd: 0.42,
  duration_ms: 40000,
  ...over,
});

const overview = {
  agents: [
    {
      agent_id: "a1",
      agent_name: "Security Reviewer",
      model: "claude-sonnet-4",
      latest: batch(),
      recall_trend: [0.7, 0.8, 0.87],
    },
    {
      agent_id: "a2",
      agent_name: "Perf Reviewer",
      model: "gpt-5-mini",
      latest: null,
      recall_trend: [],
    },
  ],
  // Deliberately NOT in chronological order — the feed sorts.
  recent_runs: [
    feedRow({ id: "b2", ran_at: "2026-08-28T08:00:00.000Z", agent_version: 2 }),
    feedRow({ id: "b1", ran_at: "2026-08-29T09:12:00.000Z", agent_version: 3 }),
    // A single-case TRIAL: named by its case, and carrying no agent version.
    feedRow({
      id: "r9",
      ran_at: "2026-08-27T07:00:00.000Z",
      agent_id: "a2",
      agent_name: "Perf Reviewer",
      case_label: "stripe-key-leak",
      agent_version: null,
      passed: 1,
      total: 1,
    }),
  ],
};

/** One line of the cross-agent feed — a set run unless `case_label` says otherwise. */
function feedRow(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    case_label: "All (8)",
    ran_at: "2026-08-29T09:12:00.000Z",
    agent_version: 3,
    recall: 0.87,
    precision: 0.91,
    citation_accuracy: 1,
    passed: 7,
    total: 8,
    ...over,
  };
}

let calls: { url: string; method?: string }[] = [];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch(payload: unknown = overview) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method });
      if (url.includes("/eval-runs/all")) return jsonResponse({ runs: [] });
      if (url.includes("/eval-dashboard")) return jsonResponse(payload);
      return jsonResponse({});
    }),
  );
}

beforeEach(() => {
  calls = [];
  stubFetch();
});

function renderOverview() {
  const onOpen = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalOverview onOpen={onOpen} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onOpen };
}

describe("EvalOverview", () => {
  it("renders an agent row with model, last-run identity, sparkline and three metrics", async () => {
    renderOverview();
    const row = await screen.findByRole("button", { name: "Open Security Reviewer" });
    expect(within(row).getByText("claude-sonnet-4")).toBeInTheDocument();
    // version · ran-at · pass count, all on one sub-line
    expect(within(row).getByText(/v3 · 2026-08-29 09:12 · 7\/8 pass/)).toBeInTheDocument();
    expect(screen.getByTestId("sparkline-a1")).toBeInTheDocument();
    expect(within(row).getByText("87%")).toBeInTheDocument();
    expect(within(row).getByText("91%")).toBeInTheDocument();
    expect(within(row).getByText("100%")).toBeInTheDocument();
  });

  it("renders an agent with no runs as three em dashes and no sparkline", async () => {
    renderOverview();
    const row = await screen.findByRole("button", { name: "Open Perf Reviewer" });
    expect(within(row).getByText("No eval runs yet")).toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(row).queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sparkline-a2")).not.toBeInTheDocument();
  });

  it("lists the cross-agent feed newest first with every column", async () => {
    renderOverview();
    await screen.findByRole("button", { name: "Open Security Reviewer" });
    const feed = screen.getByTestId("eval-feed");
    const rows = within(feed).getAllByRole("button");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("2026-08-29 09:12");
    expect(rows[1]!.textContent).toContain("2026-08-28 08:00");
    expect(rows[2]!.textContent).toContain("2026-08-27 07:00");
    // agent, ran-at, version, three metric bars, pass count
    const first = within(rows[0]!);
    expect(first.getByText("Security Reviewer")).toBeInTheDocument();
    expect(first.getByText("v3")).toBeInTheDocument();
    expect(first.getByText("87%")).toBeInTheDocument();
    expect(first.getByText("91%")).toBeInTheDocument();
    expect(first.getByText("100%")).toBeInTheDocument();
    expect(first.getByText("7/8")).toBeInTheDocument();
    // The CASE column tells a set run from a trial — the reason both kinds can
    // share this feed at all.
    expect(first.getByText("All (8)")).toBeInTheDocument();
    const trial = within(rows[2]!);
    expect(trial.getByText("stripe-key-leak")).toBeInTheDocument();
    // A trial snapshots no version, so it must not invent one.
    expect(trial.queryByText(/^v/)).not.toBeInTheDocument();
  });

  it("opens an agent's view from its row", async () => {
    const { onOpen } = renderOverview();
    fireEvent.click(await screen.findByRole("button", { name: "Open Perf Reviewer" }));
    expect(onOpen).toHaveBeenCalledWith("a2");
  });

  it("routes Run all agents through the spend confirmation with the real counts", async () => {
    renderOverview();
    await screen.findByRole("button", { name: "Open Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: /Run all agents/ }));
    const dialog = screen.getByRole("dialog");
    // 8 cases on the one agent that has a case set, across 2 agents.
    expect(within(dialog).getByText(/8 model calls/)).toBeInTheDocument();
    expect(within(dialog).getByText(/2 agents/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/eval-runs/all"))).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("/eval-runs/all") && c.method === "POST")).toBe(true),
    );
  });

  it("states no hard-coded gold-set size", async () => {
    renderOverview();
    await screen.findByRole("button", { name: "Open Security Reviewer" });
    expect(screen.queryByText(/20-trace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gold set/i)).not.toBeInTheDocument();
  });
});

describe("EvalOverview — the spend estimate counts authored cases (AC-64)", () => {
  it("states the calls of an agent whose set was authored but never run", async () => {
    // Neither agent has a batch, so a count read off `latest` would be zero
    // while the click is about to make nine model calls.
    stubFetch({
      agents: [
        {
          agent_id: "a1",
          agent_name: "Security Reviewer",
          model: "claude-sonnet-4",
          latest: null,
          cases_total: 6,
          recall_trend: [],
        },
        {
          agent_id: "a2",
          agent_name: "Perf Reviewer",
          model: "gpt-5-mini",
          latest: null,
          cases_total: 3,
          recall_trend: [],
        },
      ],
      recent_runs: [],
    });
    renderOverview();
    await screen.findByRole("button", { name: "Open Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: /Run all agents/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/9 model calls/)).toBeInTheDocument();
  });
});

describe("the sidebar entry", () => {
  it("links the Eval Dashboard from the Skills Lab group", () => {
    const { container } = render(<Sidebar ctx={{ activeKey: activeKeyFor("/evals"), repoId: "r1" }} />);
    expect(screen.getByText("Eval Dashboard")).toBeInTheDocument();
    expect(container.querySelector('a[href="/evals"]')).not.toBeNull();
  });

  /* The entry's nav key and the key `activeKeyFor` derives from the route have
     to be the same string, or the item renders but never highlights — and the
     `shell.json` lookup for it misses too. Deriving the key here instead of
     hardcoding it is what makes this a real check: the previous version passed
     `"evals"` by hand and stayed green while the app threw MISSING_MESSAGE on
     every render. */
  it("marks itself active on its own route", () => {
    const { container } = render(<Sidebar ctx={{ activeKey: activeKeyFor("/evals"), repoId: "r1" }} />);
    const link = container.querySelector('a[href="/evals"]');
    const row = link?.firstElementChild as HTMLElement | null;
    expect(row?.style.fontWeight).toBe("600");
  });
});
