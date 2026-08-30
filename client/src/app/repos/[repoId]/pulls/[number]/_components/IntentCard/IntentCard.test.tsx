import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BriefRisk, PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => {
  const record: PrIntentRecord = {
    pr_id: "pr1",
    intent: "Add a lightweight Intent Layer",
    in_scope: ["classifier"],
    out_of_scope: ["e2e"],
    risk_areas: [
      {
        title: "SSRF",
        severity: "high",
        explanation: "Classifier must not `fetch()` arbitrary URLs from the PR body.",
        file_ref: "server/src/modules/reviews/intent/gather.ts:209-214",
      },
    ],
    confidence: 0.8,
    sources: ["pr_body"],
    missing_context: [],
    head_sha: "abc",
    model: "deepseek/deepseek-v4-flash",
    classified_at: "2026-08-13T00:00:00.000Z",
    stale: false,
  };
  return { record, data: record as PrIntentRecord | null, mutate: vi.fn() };
});

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: h.data, isLoading: false }),
  useDeriveIntent: () => ({ mutate: h.mutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
}));

import { IntentCard } from "./IntentCard";

const BRIEF_RISK: BriefRisk = {
  title: "Adds Redis round-trip per request",
  severity: "high",
  explanation: "Every call now waits on `INCR` before the handler runs.",
  file_refs: ["src/middleware/ratelimit.ts:12-18"],
};

afterEach(() => {
  cleanup();
  h.mutate.mockReset();
  h.data = h.record;
  h.record.stale = false;
});

function renderCard(briefRisks?: BriefRisk[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId="pr1" briefRisks={briefRisks} />
    </NextIntlClientProvider>,
  );
}

/** Every row's chevron control, in document order. */
function chevrons() {
  return screen
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") !== null);
}

/**
 * A structural signature of an element: every descendant's tag plus the NAMES
 * of its attributes. Text is deliberately excluded — AC-37 allows the two
 * sources' rows to differ in their text and in nothing else, so a badge, a
 * label element or a `data-*` marker on one of them shows up here as a
 * difference while the wording does not.
 */
function signature(el: Element): string[] {
  const out: string[] = [];
  const walk = (node: Element) => {
    const attrs = node
      .getAttributeNames()
      .filter((a) => a !== "style")
      .sort()
      .join(",");
    out.push(`${node.tagName}[${attrs}]`);
    Array.from(node.children).forEach(walk);
  };
  walk(el);
  return out;
}

describe("IntentCard", () => {
  it("shows Recompute on a classified card and POSTs with force", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(h.mutate).toHaveBeenCalledWith({ force: true });
  });

  it("still shows Recompute when the classification is stale", () => {
    h.record.stale = true;
    renderCard();
    expect(screen.getByRole("button", { name: "Recompute" })).toBeInTheDocument();
    expect(screen.getByText(/older head commit/)).toBeInTheDocument();
  });

  it("shows Recompute when no intent exists, not Derive", () => {
    h.data = null;
    renderCard();
    expect(screen.getByRole("button", { name: "Recompute" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Derive" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(h.mutate).toHaveBeenCalledWith({ force: true });
  });

  it("opens a risk-area detail on click and closes on a second click", () => {
    renderCard();
    expect(screen.queryByText(/must not/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SSRF" }));
    expect(screen.getByText(/must not/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SSRF" }));
    expect(screen.queryByText(/must not/)).not.toBeInTheDocument();
  });

  it("shows the title, the file reference and a chevron on a COLLAPSED row (AC-28)", () => {
    renderCard();
    const row = chevrons()[0]!.parentElement!;
    expect(within(row).getByText("SSRF")).toBeInTheDocument();
    // The reference is on the collapsed row, as a link, not only when expanded.
    const link = within(row).getByRole("link");
    expect(link).toHaveAttribute("title", "server/src/modules/reviews/intent/gather.ts:209-214");
    expect(link).toHaveAttribute(
      "href",
      "/repos/r1/pulls/7?tab=diff&file=server%2Fsrc%2Fmodules%2Freviews%2Fintent%2Fgather.ts&line=209",
    );
    expect(chevrons()).toHaveLength(1);
  });

  it("renders the intent's risk areas and the brief's in ONE block (AC-34)", () => {
    h.data = {
      ...h.record,
      risk_areas: [
        h.record.risk_areas[0]!,
        { title: "Auth surface touched", severity: "medium", explanation: "b", file_ref: "src/auth.ts:4" },
      ],
    };
    renderCard([
      BRIEF_RISK,
      { title: "Cache key collides", severity: "low", explanation: "d", file_refs: ["src/cache.ts:9"] },
    ]);
    // One RISK AREAS heading, four rows under it.
    expect(screen.getAllByText("Risk areas")).toHaveLength(1);
    expect(chevrons()).toHaveLength(4);
  });

  it("renders a brief row and an intent row identically (AC-37)", () => {
    // Same severity on both, so even the severity-driven colours match: what is
    // left is the text, and nothing else may differ.
    h.data = {
      ...h.record,
      risk_areas: [
        { title: "From the intent", severity: "high", explanation: "x", file_ref: "src/a.ts:1" },
      ],
    };
    renderCard([
      { title: "From the brief", severity: "high", explanation: "y", file_refs: ["src/b.ts:2"] },
    ]);
    const rows = chevrons().map((c) => c.parentElement!);
    expect(rows).toHaveLength(2);
    expect(signature(rows[0]!)).toEqual(signature(rows[1]!));
    // Its title is the only place the word "brief" may appear on a row.
    expect(within(rows[1]!).getByText("From the brief")).toBeInTheDocument();
    expect(rows[0]!.querySelector("[data-source]")).toBeNull();
    expect(rows[1]!.querySelector("[data-source]")).toBeNull();
  });

  it("opens the description directly under its own row and closes whichever was open (AC-28)", () => {
    h.data = {
      ...h.record,
      risk_areas: [
        h.record.risk_areas[0]!,
        { title: "Auth surface touched", severity: "medium", explanation: "Touches the guard.", file_ref: "src/auth.ts:4" },
      ],
    };
    renderCard([
      BRIEF_RISK,
      { title: "Cache key collides", severity: "low", explanation: "Two tenants share one key.", file_refs: ["src/cache.ts:9"] },
    ]);

    fireEvent.click(chevrons()[1]!);
    expect(screen.getByText(/Touches the guard/)).toBeInTheDocument();

    /* The description sits between the row that was clicked and the next one,
       pushing the rows below it down — asked for on 2026-08-24, replacing the
       mockup's block-under-the-whole-list. So row 3's detail FOLLOWS row 3 and
       PRECEDES row 4; the second half is what the old placement failed. */
    fireEvent.click(chevrons()[2]!);
    const detail = screen.getByText(/waits on/);
    const clickedRow = chevrons()[2]!.parentElement!;
    const nextRow = chevrons()[3]!.parentElement!;
    expect(clickedRow.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nextRow.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // The previously open description is gone — exactly one is ever open.
    expect(screen.queryByText(/Touches the guard/)).not.toBeInTheDocument();
  });

  it("still renders the RISK AREAS block when the PR has no intent (AC-7 x AC-34)", () => {
    h.data = null;
    renderCard([BRIEF_RISK]);
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Adds Redis round-trip per request")).toBeInTheDocument();
    // The card's own no-intent state is unchanged and renders above it.
    expect(screen.getByText("No intent classified yet.")).toBeInTheDocument();
  });

  it("renders no RISK AREAS block with neither an intent nor a brief risk", () => {
    h.data = null;
    renderCard([]);
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(chevrons()).toHaveLength(0);
  });
});
