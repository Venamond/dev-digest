import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../RunStatus/RunStatus", () => ({
  RunStatus: () => <div>run-status</div>,
}));
vi.mock("../RunHistory/RunHistory", () => ({
  RunHistory: () => <div>run-history</div>,
}));
vi.mock("../ReviewRunAccordion/ReviewRunAccordion", () => ({
  ReviewRunAccordion: () => <div>review-run</div>,
}));
vi.mock("../SeverityCounters/SeverityCounters", () => ({
  SeverityCounters: () => <div>severity-counters</div>,
}));

import { FindingsTab } from "./FindingsTab";

afterEach(cleanup);

function renderTab(props: Partial<React.ComponentProps<typeof FindingsTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsTab
        prId="pr1"
        liveRunIds={[]}
        reviewRunning={false}
        lethalTrifecta={[]}
        allFindings={[]}
        runs={[]}
        prRuns={[]}
        prCommits={[]}
        cancelMutation={{ mutate: vi.fn(), isPending: false } as never}
        onOpenTrace={vi.fn()}
        onDelete={vi.fn()}
        onRunDone={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab (smoke)", () => {
  it("shows the empty state when there are no review runs", () => {
    renderTab();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
    expect(screen.getByText("Review runs")).toBeInTheDocument();
  });

  it("shows the live-review chrome when runs are in flight", () => {
    renderTab({ liveRunIds: ["run-1"] });
    expect(screen.getByText("Live review")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("No findings yet")).not.toBeInTheDocument();
  });
});

const F1: FindingRecord = {
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

describe("FindingsTab — stale finding id", () => {
  it("shows the not-found notice when targetFindingId is missing from allFindings", () => {
    renderTab({ targetFindingId: "ghost", allFindings: [F1] });
    expect(
      screen.getByText("That finding is no longer available — its review run may have been deleted."),
    ).toBeInTheDocument();
  });

  it("does not show the not-found notice when targetFindingId is a real id", () => {
    renderTab({ targetFindingId: "f1", allFindings: [F1] });
    expect(
      screen.queryByText("That finding is no longer available — its review run may have been deleted."),
    ).not.toBeInTheDocument();
  });
});
