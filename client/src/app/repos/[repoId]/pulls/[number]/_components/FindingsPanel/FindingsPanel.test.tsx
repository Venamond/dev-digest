import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const FINDINGS: FindingRecord[] = [
  {
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
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "bug",
    title: "N+1 query",
    file: "src/list.ts",
    start_line: 5,
    end_line: 5,
    rationale: "Loops issue a query per row.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("severityFilter keeps only findings of that severity", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" severityFilter="WARNING" />);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("does not accept/dismiss via a/d until the panel is activated", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("accepts the focused finding with a after a click inside the panel", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.pointerDown(screen.getByTestId("findings-panel"));
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith({
      findingId: "f1",
      action: "accept",
      prId: "pr1",
    });
  });

  it("keeps a targeted CRITICAL finding visible under a WARNING filter and focuses it", () => {
    renderWithIntl(
      <FindingsPanel findings={FINDINGS} prId="pr1" severityFilter="WARNING" targetFindingId="f1" />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("findings-panel"));
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith({
      findingId: "f1",
      action: "accept",
      prId: "pr1",
    });
    expect(mutate).not.toHaveBeenCalledWith(expect.objectContaining({ findingId: "f2" }));
  });
});
