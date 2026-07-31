import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
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

describe("SeverityCounters", () => {
  it("shows a count per severity, 0 for levels with no findings", () => {
    render(<SeverityCounters findings={FINDINGS} active={null} onSelect={vi.fn()} />);
    expect(screen.getByText("2 CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("1 WARNING")).toBeInTheDocument();
    expect(screen.getByText("0 SUGGESTION")).toBeInTheDocument();
  });

  it("clicking a level selects it; clicking the active level again clears it", () => {
    const onSelect = vi.fn();
    render(<SeverityCounters findings={FINDINGS} active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("2 CRITICAL"));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");

    cleanup();
    render(<SeverityCounters findings={FINDINGS} active="CRITICAL" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("2 CRITICAL"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
