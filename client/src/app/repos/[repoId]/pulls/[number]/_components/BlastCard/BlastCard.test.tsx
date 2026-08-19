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
        description: "Rounded refunds to the nearest cent across the money helpers.",
        shared_files: ["src/lib/tax-table.ts"],
        unresolved_findings: [{ severity: "WARNING", title: "Rounding drifts on refunds" }],
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
  /** The value rendered beside a stat label — scoped, because bare digits also
   *  appear in the prior-PR count badge and the per-symbol caller counts. */
  function statValue(label: string): string {
    const el = screen.getByText(label).previousElementSibling;
    return el?.textContent ?? "";
  }

  it("renders every changed symbol and the stat row", () => {
    renderCard();

    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
    expect(screen.getByText("applyTax()")).toBeInTheDocument();
    expect(statValue("symbols")).toBe("2");
    expect(statValue("callers")).toBe("2");
    expect(statValue("endpoints")).toBe("1");
    expect(statValue("cron/jobs")).toBe("0");
  });

  it("renders all four counters even when they are zero", () => {
    // "Reaches no HTTP surface" and "schedules nothing" are answers a reviewer
    // wants. The row fits them because the page is wide enough (PrDetailView),
    // not because a counter was dropped.
    h.data = makeBlast({
      totals: { symbols: 2, callers: 2, callers_found: 2, endpoints: 0, crons: 0 },
    });
    renderCard();
    expect(statValue("symbols")).toBe("2");
    expect(statValue("callers")).toBe("2");
    expect(statValue("endpoints")).toBe("0");
    expect(statValue("cron/jobs")).toBe("0");
  });

  it("renders endpoints and crons as chips, and non-callable kinds without parens", () => {
    h.data = makeBlast({
      symbols: makeBlast().symbols.map((sym, i) =>
        i === 0
          ? { ...sym, endpoints: ["GET /invoices"], crons: ["nightly-close"] }
          : { ...sym, kind: "interface" },
      ),
    });
    renderCard();

    // Endpoints and crons are the answer the map exists to give — the
    // reference gives them chips, not two more grey list rows.
    expect(screen.getByText("GET /invoices")).toBeInTheDocument();
    expect(screen.getByText("nightly-close")).toBeInTheDocument();
    // An interface is not callable, so no parens are added to its name.
    expect(screen.getByText("applyTax")).toBeInTheDocument();
    expect(screen.getByText("interface")).toBeInTheDocument();
  });

  it("highlights a symbol header only while it is expanded", () => {
    renderCard();
    const openRow = screen.getByRole("button", { expanded: true });
    const closedRow = screen
      .getAllByRole("button", { expanded: false })
      .find((r) => r.textContent?.includes("applyTax"));

    // The band ties the header to the rows under it; a collapsed row has none.
    expect(openRow.style.background).not.toBe("none");
    expect(closedRow?.style.background).toBe("none");
  });

  it("dims an importer row so it reads as weaker evidence than a caller", () => {
    h.data = makeBlast({
      symbols: makeBlast().symbols.map((sym, i) =>
        i === 0
          ? { ...sym, importers: [{ file: "src/only-imports.ts", depth: 1 }] }
          : sym,
      ),
    });
    renderCard();

    const importer = screen.getByRole("link", { name: "src/only-imports.ts" });
    const caller = screen.getByRole("link", { name: "…/api/public/index.ts:23" });
    // Same neutral scale, one step down — not a third colour, which would read
    // as a third category beside the blue endpoints and amber crons.
    expect(importer.style.color).toBe("var(--text-muted)");
    expect(caller.style.color).toBe("var(--text-secondary)");
  });

  it("draws the tree for a symbol that reaches endpoints but has no callers", () => {
    // Regression: the tree was gated on totals.callers > 0, so a symbol whose
    // only impact is an endpoint was hidden behind "no downstream callers
    // found" while the counter above said "2 endpoints" — the card
    // contradicting itself.
    h.data = makeBlast({
      totals: { symbols: 1, callers: 0, callers_found: 0, endpoints: 2, crons: 0 },
      symbols: [
        {
          ...makeBlast().symbols[0]!,
          callers: [],
          callers_total: 0,
          importers: [],
          endpoints: ["GET /invoices", "POST /invoices"],
          crons: [],
        },
      ],
    });
    renderCard();

    expect(screen.getByText("GET /invoices")).toBeInTheDocument();
    expect(screen.queryByText(/no downstream callers found/)).not.toBeInTheDocument();
  });

  it("collapses every symbol but the first", () => {
    renderCard();

    // The first symbol's body is open on arrival so the card shows real
    // content; the second is a closed disclosure row.
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows.some((r) => r.textContent?.includes("applyTax"))).toBe(true);
    expect(screen.getByRole("button", { expanded: true }).textContent).toContain("formatMoney");
  });

  it("deep-links a caller at the INDEXED commit, not the PR head", () => {
    renderCard();

    const link = screen.getByRole("link", { name: "…/api/public/index.ts:23" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/a1b2c3d/src/api/public/index.ts#L23",
    );
    // Shortening is display-only: the href and the tooltip keep the whole path.
    expect(link).toHaveAttribute("title", "src/api/public/index.ts");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders the file path unlinked when there is no indexed commit", () => {
    h.data = makeBlast({
      link: { repo_full_name: "acme/payments-api", indexed_sha: "", head_sha: "deadbee" },
    });
    renderCard();

    expect(
      screen.queryByRole("link", { name: "…/api/public/index.ts:23" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("…/api/public/index.ts:23")).toBeInTheDocument();
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
    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
  });

  it("reports per-symbol caller truncation with both numbers", () => {
    const full = makeBlast();
    h.data = makeBlast({
      symbols: full.symbols.map((sym, i) =>
        i === 0 ? { ...sym, callers_truncated: true, callers_total: 25 } : sym,
      ),
    });
    renderCard();

    // Both numbers are FILE counts: `callers_total` is distinct caller files,
    // and the shown side is the distinct files among the rendered call sites.
    // Mixing units here is what made the old string claim "1 of 2 callers"
    // about a single caller that had simply been called twice.
    expect(screen.getByText("showing callers from 1 of 25 files")).toBeInTheDocument();

    cleanup();
    h.data = makeBlast();
    renderCard();
    expect(screen.queryByText(/showing callers from \d+ of \d+ files/)).not.toBeInTheDocument();
  });

  it("labels the caller list with the number of call sites it actually renders", () => {
    // Regression: the heading used `callers_total` (distinct FILES), so a file
    // calling the symbol from two functions rendered two rows under a "1
    // caller" label — and one calling it twice from one function rendered one
    // row under "2 callers".
    h.data = makeBlast({
      symbols: makeBlast().symbols.map((sym, i) =>
        i === 0 ? { ...sym, callers_total: 1, callers_truncated: false } : sym,
      ),
    });
    renderCard();
    // Both fixture symbols render one call site each, so the label appears
    // twice — the point is that it counts rows, not `callers_total`.
    // A regex, because a symbol that also has an importer reads
    // "1 caller · 1 importer" — the header names everything it lists.
    expect(screen.getAllByText(/^1 caller\b/)).toHaveLength(2);
  });

  it("counts importers in the header too, so the row cannot contradict itself", () => {
    // A symbol with no call sites but an importer read as "0 callers" with a
    // row underneath it. The header now names everything it lists.
    h.data = makeBlast({
      symbols: makeBlast().symbols.map((sym, i) =>
        i === 0
          ? { ...sym, callers: [], importers: [{ file: "src/only-imports.ts", depth: 1 }] }
          : sym,
      ),
    });
    renderCard();
    expect(screen.getByText("1 importer")).toBeInTheDocument();
    expect(screen.queryByText("0 callers")).not.toBeInTheDocument();
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

  it("marks an importer with no resolved call site apart from the callers", () => {
    // No heading and no line number: an importer has no call site to point at.
    // The distinction is the icon and the tooltip, not a section label — the
    // reference has no such label and it duplicated the rows above it.
    renderCard();
    expect(screen.queryByText(/^importers$/i)).not.toBeInTheDocument();
    expect(
      screen.getByTitle("Imports this file; no call site was resolved"),
    ).toBeInTheDocument();
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

  it("folds the generated summary away without losing it", () => {
    // Not a dismiss: the paragraph is never persisted, so discarding it would
    // cost another model call to see again. Collapsing keeps it in reach.
    h.summary = { summary: "This PR reaches `GET /invoices`." };
    renderCard();

    const toggle = screen.getByRole("button", { name: /Summary/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("This PR reaches `GET /invoices`.")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("This PR reaches `GET /invoices`.")).not.toBeInTheDocument();
    // The header stays, so it can be reopened — and Explain does not come back.
    expect(screen.getByRole("button", { name: /Summary/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Explain" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("This PR reaches `GET /invoices`.")).toBeInTheDocument();
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

    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    const graph = screen.getByRole("img", { name: "Blast radius graph" });
    expect(graph).toBeInTheDocument();
    expect(screen.queryByText("formatMoney")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says there is nothing to graph when the map is empty", () => {
    h.data = makeBlast({
      symbols: [],
      totals: { symbols: 0, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });

  it("keeps prior PRs collapsed until the reader opens them", () => {
    renderCard();

    const toggle = screen.getByRole("button", { name: /Prior PRs touching these files/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Rework tax rounding")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Rework tax rounding")).toBeInTheDocument();
    expect(screen.getByText("#41")).toBeInTheDocument();
    expect(screen.getByText("octocat")).toBeInTheDocument();
  });

  it("says which file is shared and what was dismissed on that PR", () => {
    // These two lines are what make the row answer "why should I care": the
    // path in common, and a concern someone chose not to act on there. Both
    // are facts from the DB — never a model's opinion about how the two PRs
    // relate, which is the link the feature refuses to invent.
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    // The shared path renders as a code chip, not plain text.
    const chip = screen.getByText("src/lib/tax-table.ts");
    expect(chip.tagName).toBe("CODE");
    expect(
      screen.getByText(/Rounded refunds to the nearest cent/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("WARNING raised here and dismissed: Rounding drifts on refunds"),
    ).toBeInTheDocument();
  });

  it("shows a status only when the prior PR is not merged", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    // 'merged' is true of almost every prior PR and says nothing.
    expect(screen.queryByText("merged")).not.toBeInTheDocument();

    cleanup();
    h.data = makeBlast({
      prior_pulls: makeBlast().prior_pulls.map((p) => ({ ...p, status: "open" })),
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("open")).toBeInTheDocument();
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
    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
  });
});
