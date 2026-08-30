import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, ReviewFocusItem } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import blast from "../../../../../../../../messages/en/blast.json";

const h = vi.hoisted(() => ({
  brief: null as PrBriefRecord | null,
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: h.brief, isLoading: false }),
  useBuildBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

// OverviewTab (the AC-27 case) renders IntentCard, BlastCard and BriefBanner
// beside this card, all from this one module.
vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: null, isLoading: false }),
  useDeriveIntent: () => ({ mutate: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: [] }),
  useBlast: () => ({ data: null, isLoading: false }),
  useBlastSummary: () => ({ data: undefined }),
  useDeriveBlastSummary: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
}));

import { ReviewFocusCard } from "./ReviewFocusCard";
import { OverviewTab } from "../OverviewTab/OverviewTab";

function makeBrief(focus: ReviewFocusItem[]): PrBriefRecord {
  return {
    pr_id: "pr1",
    brief: {
      what: "Adds a rate limiter.",
      why: "One client can starve the rest.",
      risk_level: "medium",
      risks: [],
      review_focus: focus,
    },
    model: "openai/gpt-4.1",
    cost_usd: 0.014,
    tokens_in: 8200,
    tokens_out: 1300,
    built_at: "2026-08-23T10:00:00.000Z",
    state_key: "k1",
    head_sha: "a1b2c3d",
    stale: false,
    inputs_included: ["pr_meta"],
    inputs_cut: [],
    inputs_missing: [],
    inputs_over_budget: null,
    blast_state: "ok",
  };
}

/* Given in an order that alphabetical sorting, path sorting and line sorting
   would each disturb — so a re-sort anywhere in the render is visible. */
const FOCUS: ReviewFocusItem[] = [
  { file_ref: "src/zeta/config.ts:12", reason: "The window is read once at boot." },
  { file_ref: "src/alpha/auth.ts:3", reason: "The limiter runs before the auth check." },
  { file_ref: "src/mid/rate.ts:44", reason: "The Redis round trip is on the hot path." },
];

afterEach(() => {
  cleanup();
  h.brief = null;
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <ReviewFocusCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocusCard", () => {
  it("renders the entries in the server's order and never re-sorts them (AC-11)", () => {
    h.brief = makeBrief(FOCUS);
    renderCard();
    // Read the order off the DOM: a test that only checks the payload can pass
    // while the list on screen never moves (client/INSIGHTS.md:435-458).
    const rendered = screen.getAllByRole("link").map((el) => el.textContent);
    expect(rendered).toEqual([
      "src/zeta/config.ts:12",
      "src/alpha/auth.ts:3",
      "src/mid/rate.ts:44",
    ]);
    // …and it is NOT the order a sort would produce.
    expect(rendered).not.toEqual([...rendered].sort());
  });

  it("carries the header, a count badge holding the count only, and one row per entry", () => {
    h.brief = makeBrief(FOCUS);
    const { container } = renderCard();

    expect(screen.getByText(/review focus/i)).toBeInTheDocument();
    // The badge is the count and nothing else — not "3 items", not a label.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText(/3 items/i)).not.toBeInTheDocument();

    /* `closest("div")`, not `parentElement`: the reference is wrapped in a
       `span` that stops the path breaking mid-token, so the link's immediate
       parent is that span rather than the row. The nearest `div` ancestor is
       the row either way. */
    const rows = screen.getAllByRole("link").map((link) => link.closest("div")!);
    expect(rows).toHaveLength(3);
    // Each row: marker, file reference, separator, reason.
    const first = rows[0]!;
    expect(within(first).getByRole("link")).toHaveAttribute(
      "href",
      "/repos/r1/pulls/7?tab=diff&file=src%2Fzeta%2Fconfig.ts&line=12",
    );
    expect(within(first).getByText(/window is read once at boot/)).toBeInTheDocument();
    /* The whole row is the hover target, not just the link inside it. The fill
       itself lives in `globals.css` (`.dd-focus-row:hover`) because inline
       styles carry no `:hover`, so this asserts the wiring — a headless
       screenshot cannot produce a hover to check the rest. */
    expect(first).toHaveClass("dd-focus-row");
    expect(first.textContent).toContain("▸");
    expect(first.textContent).toContain("—");
    expect(container.querySelectorAll("section")).toHaveLength(1);
  });

  it("derives the badge from the rows it renders (AC-26)", () => {
    h.brief = makeBrief(FOCUS.slice(0, 2));
    renderCard();
    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(2);
    // The badge counts the rendered array, never a separately-supplied total.
    expect(screen.getByText(String(rows.length))).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("renders the block with a 0 badge and no rows when the list is empty", () => {
    h.brief = makeBrief([]);
    renderCard();
    expect(screen.getByText(/review focus/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  /* AC-40: the line is the server's, attached from a finding, and absent is a
     normal value — the row without one keeps exactly today's behaviour. */
  it("renders a row with a server-attached line beside one without, both clickable", () => {
    h.brief = makeBrief([
      { file_ref: "src/config.ts", reason: "The window is read once at boot.", line: 12 },
      { file_ref: "src/auth.ts", reason: "No finding names this file." },
    ]);
    renderCard();

    const withLine = screen.getByRole("link", { name: "src/config.ts:12" });
    expect(withLine).toHaveAttribute(
      "href",
      "/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts&line=12",
    );
    // The whole path stays in the tooltip even when the row is truncated (AC-30).
    expect(withLine).toHaveAttribute("title", "src/config.ts");

    const withoutLine = screen.getByRole("link", { name: "src/auth.ts" });
    expect(withoutLine).toHaveAttribute("href", "/repos/r1/pulls/7?tab=diff&file=src%2Fauth.ts");

    // No badge, no marker, nothing at all distinguishes the two rows but the
    // line itself — the mockup adds no element for it.
    /* `closest("div")`, not `parentElement`: the reference is wrapped in a
       `span` that stops the path breaking mid-token, so the link's immediate
       parent is that span rather than the row. The nearest `div` ancestor is
       the row either way. */
    const rows = screen.getAllByRole("link").map((link) => link.closest("div")!);
    expect(rows[0]!.childElementCount).toBe(rows[1]!.childElementCount);
  });

  it("renders nothing at all when no brief exists", () => {
    h.brief = null;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("sits below the cards grid and above the PR description (AC-27)", () => {
    h.brief = makeBrief(FOCUS);
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview, blast }}>
        <OverviewTab prBody="A body." prId="pr1" />
      </NextIntlClientProvider>,
    );
    const focus = screen.getByText(/review focus/i);
    const description = screen.getByText("Description");
    const intent = screen.getByText("Intent");
    expect(intent.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      focus.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
