import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
// `Severity` here must be the UI union (it carries "INFO"), not
// `FindingRecord["severity"]` — SeverityCounters types `active`/`onSelect`
// against the UI union to match its real caller, ReviewRunAccordion.
import type { Severity } from "@devdigest/ui";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SeverityCounters } from "./SeverityCounters";

afterEach(cleanup);

function finding(severity: FindingRecord["severity"], id: string): FindingRecord {
  return {
    id,
    severity,
    category: "bug",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [
  finding("CRITICAL", "f1"),
  finding("CRITICAL", "f2"),
  finding("WARNING", "f3"),
];

function renderCounters(
  findings: FindingRecord[],
  opts: {
    active?: Severity | null;
    onSelect?: (severity: Severity | null) => void;
  } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounters findings={findings} active={opts.active ?? null} onSelect={opts.onSelect} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityCounters", () => {
  it("shows a count per severity as labels, not buttons, when onSelect is omitted", () => {
    renderCounters(FINDINGS);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
    expect(screen.getByText("0 SUGGESTION")).toBeInTheDocument();
  });

  it("toggles the active severity filter on click when onSelect is provided", () => {
    const onSelect = vi.fn();
    renderCounters(FINDINGS, { onSelect });
    fireEvent.click(screen.getByRole("button", { name: "2 CRITICAL" }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("does not fire onSelect for a severity with a zero count", () => {
    const onSelect = vi.fn();
    renderCounters(FINDINGS, { onSelect });
    fireEvent.click(screen.getByRole("button", { name: "0 SUGGESTION" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
