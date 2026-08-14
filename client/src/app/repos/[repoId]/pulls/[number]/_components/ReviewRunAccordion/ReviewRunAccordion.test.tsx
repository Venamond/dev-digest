import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

Element.prototype.scrollIntoView = vi.fn();

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security",
    kind: "review",
    verdict: "request_changes",
    summary: "Needs work.",
    score: 40,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [FINDING],
    ...over,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion — target finding", () => {
  it("opens, expands the card, and scrolls when targetFindingId matches", () => {
    renderWithIntl(
      <ReviewRunAccordion review={review()} prId="pr1" defaultOpen={false} targetFindingId="f1" />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("stays closed when targetFindingId is absent", () => {
    renderWithIntl(<ReviewRunAccordion review={review()} prId="pr1" defaultOpen={false} />);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("stays closed when targetFindingId belongs to a different run", () => {
    renderWithIntl(
      <ReviewRunAccordion review={review()} prId="pr1" defaultOpen={false} targetFindingId="f-other" />,
    );
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — per-run severity filter", () => {
  it("hides other severities in this run when a chip is clicked", () => {
    const warning: FindingRecord = {
      ...FINDING,
      id: "f2",
      severity: "WARNING",
      title: "N+1 query",
      rationale: "Loops issue a query per row.",
    };
    renderWithIntl(
      <ReviewRunAccordion
        review={review({ findings: [FINDING, warning] })}
        prId="pr1"
        defaultOpen
      />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 CRITICAL" }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
  });
});
