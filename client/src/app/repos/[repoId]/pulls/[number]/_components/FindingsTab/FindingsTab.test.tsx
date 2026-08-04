import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/repos/r1/pulls/1",
  useSearchParams: () => new URLSearchParams(),
}));

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
