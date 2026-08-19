import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastResponse } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({
  data: null as unknown,
  isLoading: false,
  summary: undefined as { summary: string } | undefined,
  derive: vi.fn(),
  deriveError: false,
  derivePending: false,
  resync: vi.fn(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  useBlast: () => ({ data: h.data, isLoading: h.isLoading }),
  useBlastSummary: () => ({ data: h.summary }),
  useDeriveBlastSummary: () => ({
    mutate: h.derive,
    isPending: h.derivePending,
    isError: h.deriveError,
  }),
  // OverviewTab renders IntentCard beside BlastCard, from the same module.
  usePrIntent: () => ({ data: null, isLoading: false }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: h.resync, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "1" }),
}));

// mermaid is a heavy browser-only renderer; the card's own contract is the
// labelled wrapper around it, not the SVG it produces.
vi.mock("@/components/mermaid-diagram/MermaidDiagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre data-testid="chart">{chart}</pre>,
}));

import { BlastCard } from "./BlastCard";
import { OverviewTab } from "../OverviewTab/OverviewTab";

function makeBlast(over: Partial<BlastResponse> = {}): BlastResponse {
  return {
    state: "ok",
    index: { status: "full", last_indexed_sha: "a1b2c3d", updated_at: "2026-08-19T00:00:00.000Z" },
    totals: { symbols: 2, callers: 2, callers_found: 2, endpoints: 1, crons: 0 },
    symbols: [
      {
        file: "src/lib/money.ts",
        name: "formatMoney",
        kind: "function",
        callers: [{ file: "src/api/public/index.ts", symbol: "handler", line: 23, rank: 0.9 }],
        callers_total: 1,
        callers_truncated: false,
        importers: [{ file: "src/api/routes.ts", depth: 1 }],
        endpoints: ["GET /invoices"],
        crons: [],
      },
      {
        file: "src/lib/tax.ts",
        name: "applyTax",
        kind: "function",
        callers: [{ file: "src/api/billing.ts", symbol: "charge", line: 7, rank: 0.5 }],
        callers_total: 1,
        callers_truncated: false,
        importers: [],
        endpoints: [],
        crons: [],
      },
    ],
    downstream_truncated: false,
    prior_pulls: [
      {
        number: 41,
        title: "Rework tax rounding",
        author: "octocat",
        status: "merged",
        updated_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    link: { repo_full_name: "acme/payments-api", indexed_sha: "a1b2c3d", head_sha: "deadbee" },
    ...over,
  };
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast, prReview }}>
      <BlastCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  h.data = makeBlast();
  h.isLoading = false;
  h.summary = undefined;
  h.deriveError = false;
  h.derivePending = false;
});

afterEach(() => {
  cleanup();
  h.derive.mockReset();
  h.resync.mockReset();
});

describe("BlastCard", () => {
  it("renders every changed symbol and the stat row", () => {
    renderCard();

    expect(screen.getByText("formatMoney")).toBeInTheDocument();
    expect(screen.getByText("applyTax")).toBeInTheDocument();
    // symbols 2, callers 2, endpoints 1, crons 0
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("deep-links a caller at the INDEXED commit, not the PR head", () => {
    renderCard();

    const link = screen.getByRole("link", { name: "src/api/public/index.ts:23" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/a1b2c3d/src/api/public/index.ts#L23",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders the file path unlinked when there is no indexed commit", () => {
    h.data = makeBlast({
      link: { repo_full_name: "acme/payments-api", indexed_sha: "", head_sha: "deadbee" },
    });
    renderCard();

    expect(
      screen.queryByRole("link", { name: "src/api/public/index.ts:23" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.getByText(/file paths are shown without a link/)).toBeInTheDocument();
  });

  it("offers a re-index call to action when the index is degraded", () => {
    h.data = makeBlast({ state: "degraded", reason: "no_data", symbols: [] });
    renderCard();

    expect(screen.getByText(/has not been indexed yet/)).toBeInTheDocument();
    expect(screen.queryByText("formatMoney")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Re-index repo" }));
    expect(h.resync).toHaveBeenCalledTimes(1);
  });

  it("explains a stale index with its own wording", () => {
    h.data = makeBlast({ state: "degraded", reason: "index_stale", symbols: [] });
    renderCard();

    expect(screen.getByText(/indexed by an older indexer/)).toBeInTheDocument();
  });

  it("shows the partial banner together with the map", () => {
    h.data = makeBlast({ state: "partial", reason: "index_partial" });
    renderCard();

    expect(screen.getByText(/index for this repo is partial/)).toBeInTheDocument();
    expect(screen.getByText("formatMoney")).toBeInTheDocument();
  });

  it("reports per-symbol caller truncation with both numbers", () => {
    const full = makeBlast();
    h.data = makeBlast({
      symbols: full.symbols.map((sym, i) =>
        i === 0 ? { ...sym, callers_truncated: true, callers_total: 25 } : sym,
      ),
    });
    renderCard();

    expect(screen.getByText("showing 1 of 25 callers")).toBeInTheDocument();

    cleanup();
    h.data = makeBlast();
    renderCard();
    expect(screen.queryByText(/showing \d+ of \d+ callers/)).not.toBeInTheDocument();
  });

  it("reports a headline caller count that was capped as N / M", () => {
    h.data = makeBlast({
      totals: { symbols: 2, callers: 40, callers_found: 50, endpoints: 1, crons: 0 },
    });
    renderCard();

    expect(screen.getByText("40 / 50")).toBeInTheDocument();
  });

  it("warns when the downstream walk was truncated", () => {
    h.data = makeBlast({ downstream_truncated: true });
    renderCard();

    expect(screen.getByText(/dependency walk hit its cap/)).toBeInTheDocument();
  });

  it("treats an empty impact as a result, not an error", () => {
    h.data = makeBlast({
      symbols: [],
      totals: { symbols: 3, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
    });
    renderCard();

    expect(screen.getByText("3 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByText(/Blast radius is unavailable/)).not.toBeInTheDocument();
  });

  it("renders callers and importers as two distinct groups", () => {
    renderCard();

    expect(screen.getByText("importers")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "src/api/routes.ts" })).toBeInTheDocument();
  });

  it("triggers the summary once and then renders the cached paragraph", () => {
    const { rerender } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    expect(h.derive).toHaveBeenCalledTimes(1);

    h.summary = { summary: "This PR reaches `GET /invoices`." };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ blast, prReview }}>
        <BlastCard prId="pr1" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("This PR reaches `GET /invoices`.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explain" })).not.toBeInTheDocument();
  });

  it("says so when the generated summary was discarded, and offers a retry", () => {
    h.deriveError = true;
    renderCard();

    expect(screen.getByText(/named something that is not in this map/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.derive).toHaveBeenCalledTimes(1);
  });

  it("switches between the tree and the graph view", () => {
    renderCard();

    expect(screen.getByText("formatMoney")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    const graph = screen.getByRole("img", { name: "Blast radius graph" });
    expect(graph).toBeInTheDocument();
    expect(screen.queryByText("formatMoney")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByText("formatMoney")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says there is nothing to graph when the map is empty", () => {
    h.data = makeBlast({
      symbols: [],
      totals: { symbols: 0, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });

  it("keeps prior PRs collapsed until the reader opens them", () => {
    renderCard();

    const details = screen.getByText("Prior PRs touching these files").closest("details");
    expect(details).not.toHaveAttribute("open");
    const row = screen.getByText(/#41 · Rework tax rounding · octocat · merged/);
    expect(row).not.toBeVisible();

    details?.setAttribute("open", "");
    expect(row).toBeVisible();
  });

  it("renders no prior-PR section when there are none", () => {
    h.data = makeBlast({ prior_pulls: [] });
    renderCard();

    expect(screen.queryByText("Prior PRs touching these files")).not.toBeInTheDocument();
  });
});

describe("OverviewTab", () => {
  it("renders the blast card even when the PR has no description", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ blast, prReview }}>
        <OverviewTab prBody={null} prId="pr1" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("formatMoney")).toBeInTheDocument();
  });
});
