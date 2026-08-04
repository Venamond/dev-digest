import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
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
  active: FindingRecord["severity"] | null,
  onSelect = vi.fn(),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounters findings={findings} active={active} onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
}

describe("SeverityCounters", () => {
  it("shows a count per severity, 0 for levels with no findings", () => {
    renderCounters(FINDINGS, null);
    expect(screen.getByRole("button", { name: "2 CRITICAL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 WARNING" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 SUGGESTION" })).toBeInTheDocument();
  });

  it("toggles the active severity filter on click", () => {
    const onSelect = vi.fn();
    renderCounters(FINDINGS, null, onSelect);
    fireEvent.click(screen.getByRole("button", { name: "2 CRITICAL" }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });
});
