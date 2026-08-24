import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => ({
  brief: null as PrBriefRecord | null,
  reviews: [] as ReviewRecord[],
  isLoading: false,
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: h.brief, isLoading: h.isLoading }),
  useBuildBrief: () => ({ mutate: h.mutate, isPending: h.isPending, isError: h.isError }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: h.reviews }),
}));

import { BriefBanner } from "./BriefBanner";

function makeBrief(over: Partial<PrBriefRecord> = {}): PrBriefRecord {
  return {
    pr_id: "pr1",
    brief: {
      what: "Adds a Redis-backed rate limiter to the public API.",
      why: "One client can starve the rest today.",
      risk_level: "high",
      risks: [],
      review_focus: [],
    },
    model: "openai/gpt-4.1",
    cost_usd: 0.014,
    tokens_in: 8200,
    tokens_out: 1300,
    built_at: "2026-08-23T10:00:00.000Z",
    state_key: "head:a1|intent:i1|blast:b1|run:r1",
    head_sha: "a1b2c3d",
    stale: false,
    inputs_included: ["pr_meta", "blast_map", "changed_files"],
    inputs_cut: [{ input: "documents", detail: "3rd fragment of docs/rate-limits.md" }],
    inputs_missing: ["intent"],
    inputs_over_budget: null,
    blast_state: "ok",
    ...over,
  };
}

function makeReview(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Two blockers.",
    score: 62,
    model: "openai/gpt-4.1",
    created_at: "2026-08-23T09:00:00.000Z",
    findings: [],
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  h.mutate.mockReset();
  h.brief = null;
  h.reviews = [];
  h.isLoading = false;
  h.isPending = false;
  h.isError = false;
});

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <BriefBanner prId="pr1" />
    </NextIntlClientProvider>,
  );
}

/** The banner box — the single element below the PR BRIEF label that holds the
 *  three columns. Reading it off the DOM keeps the column assertions honest. */
function bannerBox(): HTMLElement {
  const section = screen.getByText("PR Brief").closest("section")!;
  return section.lastElementChild as HTMLElement;
}

/** Opens the `ⓘ` the only way it opens: by hovering. There is no click and no
 *  keyboard path — declined by the human on 2026-08-23. The 200ms debounce is
 *  driven with fake timers, as HoverPreviewAnchor's own test does. */
function hoverInfo() {
  const glyph = screen.getByRole("img", { name: "Brief inputs" });
  fireEvent.mouseEnter(glyph.parentElement!);
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe("BriefBanner", () => {
  it("renders all twelve banner elements with no score, no findings and no summary (AC-24)", () => {
    // The trap case: VerdictBanner gates the blockers text, the paragraph and
    // the whole PR SCORE column on data presence, and AC-24 forbids exactly
    // that. Nothing below may be conditional on the run's data.
    h.brief = makeBrief();
    h.reviews = [];
    renderBanner();

    // 1 — the section label above the box, on its own line.
    expect(screen.getByText("PR Brief")).toBeInTheDocument();

    // 2 — one box, three columns.
    const box = bannerBox();
    expect(box.children).toHaveLength(3);
    const [col1, col2, col3] = Array.from(box.children) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];

    // 3 — the status tile, column 1.
    expect(col1.querySelector("svg")).not.toBeNull();

    // 4 — the verdict label, column 2, line 1.
    expect(within(col2).getByText("Not reviewed")).toBeInTheDocument();

    // 5 — the risk chip, immediately beside it.
    expect(within(col2).getByText("High")).toBeInTheDocument();

    // 6 — the findings badge.
    expect(within(col2).getByText("No review run")).toBeInTheDocument();

    // 7 — the `ⓘ`.
    expect(within(col2).getByRole("img", { name: "Brief inputs" })).toBeInTheDocument();

    // 8 — the paragraph: `what` then `why`.
    expect(within(col2).getByText(/Redis-backed rate limiter/)).toBeInTheDocument();
    expect(within(col2).getByText(/starve the rest/)).toBeInTheDocument();

    // 9 — the regenerate control, column 3, icon only.
    const regenerate = within(col3).getByRole("button", { name: "Regenerate brief" });
    expect(regenerate.textContent).toBe("");

    // 10 + 11 — the ring and its caption.
    expect(within(col3).getByText("—")).toBeInTheDocument();
    expect(within(col3).getByText("PR SCORE")).toBeInTheDocument();

    // 12 — the cost line.
    expect(within(col3).getByText("$0.014")).toBeInTheDocument();
    expect(within(col3).getByText("8.2K→1.3K")).toBeInTheDocument();
  });

  it("reads as 'no review yet' rather than as zeros when no run has finished (AC-38)", () => {
    h.brief = makeBrief();
    h.reviews = [];
    renderBanner();

    expect(screen.getByText("Not reviewed")).toBeInTheDocument();
    expect(screen.getByText("No review run")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    // The caption is unchanged in the no-run case.
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    // None of the three may read as a count of zero.
    expect(screen.queryByText(/0 findings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 blockers/)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("reports the last finished run's verdict, findings and score", () => {
    h.brief = makeBrief();
    h.reviews = [
      makeReview({
        score: 62,
        findings: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "No throttle",
            file: "src/api.ts",
            start_line: 1,
            end_line: 2,
            rationale: "",
            confidence: 0.9,
            review_id: "rev1",
            accepted_at: null,
            dismissed_at: null,
          },
          {
            id: "f2",
            severity: "WARNING",
            category: "perf",
            title: "Extra round trip",
            file: "src/api.ts",
            start_line: 3,
            end_line: 4,
            rationale: "",
            confidence: 0.7,
            review_id: "rev1",
            accepted_at: null,
            dismissed_at: null,
          },
        ],
      }),
    ];
    renderBanner();

    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("2 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument();
  });

  it("renders the cost and the token counts in the product's shared formats (AC-25)", () => {
    // Exact strings on purpose: this line exists to display those two formats,
    // `$0.014` (CostBadge) and `8.2K→1.3K` (lib/format-tokens). Editing either
    // format means editing this assertion with it, deliberately.
    h.brief = makeBrief({ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 });
    renderBanner();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText("8.2K→1.3K")).toBeInTheDocument();
  });

  it("reveals the inputs that went in, what was cut and what was missing on hover (AC-36, AC-16, AC-7)", () => {
    vi.useFakeTimers();
    h.brief = makeBrief();
    renderBanner();

    // Nothing before the hover.
    expect(screen.queryByText(/3rd fragment/)).not.toBeInTheDocument();
    hoverInfo();

    const panel = screen.getByText("Brief inputs").parentElement as HTMLElement;
    // AC-1's inputs that reached the call.
    expect(within(panel).getByText("Blast map")).toBeInTheDocument();
    // AC-16 — what was cut, from inputs_cut[].detail.
    expect(within(panel).getByText(/3rd fragment of docs\/rate-limits\.md/)).toBeInTheDocument();
    // AC-7 — the card states that it was built without the intent.
    expect(within(panel).getByText("Built without")).toBeInTheDocument();
    expect(within(panel).getByText("Intent")).toBeInTheDocument();
  });

  /* The silence this replaces: until `inputs_over_budget` existed, a build
     whose five cuts were not enough looked exactly like one that fitted —
     measured live on 2026-08-24 at 35 299 tokens against 16 000, with every
     changed file cut and nothing said anywhere. */
  it("says the input still exceeded the budget after everything was cut", () => {
    vi.useFakeTimers();
    h.brief = makeBrief({ inputs_over_budget: { measured: 35299, budget: 16000 } });
    renderBanner();
    hoverInfo();

    const panel = screen.getByText("Brief inputs").parentElement as HTMLElement;
    const note = within(panel).getByText(/still did not fit/);
    // The two numbers that say HOW far over it went. The locale groups them,
    // so match the digits and not the separator.
    expect(note.textContent).toMatch(/35.?299/);
    expect(note.textContent).toMatch(/16.?000/);
  });

  it("says nothing about the budget when the request fitted", () => {
    vi.useFakeTimers();
    h.brief = makeBrief();
    renderBanner();
    hoverInfo();
    expect(screen.queryByText(/still did not fit/)).not.toBeInTheDocument();
  });

  it("states the blast limitation when the index is degraded (AC-32)", () => {
    vi.useFakeTimers();
    h.brief = makeBrief({ blast_state: "degraded" });
    renderBanner();
    hoverInfo();
    expect(screen.getByText(/blast index is degraded/)).toBeInTheDocument();
  });

  it("says so when the pull request has moved past the state the brief was built for (AC-22)", () => {
    h.brief = makeBrief({ stale: true });
    renderBanner();
    expect(screen.getByText(/earlier state of the pull request/)).toBeInTheDocument();
  });

  it("rebuilds with force from the regenerate control (AC-21)", () => {
    h.brief = makeBrief();
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(h.mutate).toHaveBeenCalledWith({ force: true });
  });

  it("distinguishes the empty, in-progress and error states on sight (AC-31)", () => {
    h.brief = null;
    renderBanner();
    expect(screen.getByText(/No brief has been built/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build brief" })).toBeInTheDocument();
    expect(screen.queryByText(/Building the brief/)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be built/)).not.toBeInTheDocument();
    cleanup();

    h.isPending = true;
    renderBanner();
    expect(screen.getByText(/Building the brief/)).toBeInTheDocument();
    expect(screen.queryByText(/No brief has been built/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Build brief" })).not.toBeInTheDocument();
    cleanup();

    h.isPending = false;
    h.isError = true;
    renderBanner();
    expect(screen.getByText(/could not be built/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/Building the brief/)).not.toBeInTheDocument();
  });

  it("replaces the brief with the error state after a failed rebuild (AC-39)", () => {
    h.brief = makeBrief();
    h.isError = true;
    renderBanner();
    expect(screen.getByText(/could not be built/)).toBeInTheDocument();
    // The negative is the criterion: the brief must not sit beside the error.
    expect(screen.queryByText(/Redis-backed rate limiter/)).not.toBeInTheDocument();
  });
});
