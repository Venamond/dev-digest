import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostBadge } from "./CostBadge";

afterEach(cleanup);

describe("CostBadge", () => {
  it("renders an em-dash for null cost", () => {
    render(<CostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders 3 decimals for sub-dollar cost", () => {
    render(<CostBadge usd={0.0134} />);
    expect(screen.getByText("$0.013")).toBeInTheDocument();
  });

  it("renders 2 decimals for cost at or above $1", () => {
    render(<CostBadge usd={8.7} />);
    expect(screen.getByText("$8.70")).toBeInTheDocument();
  });
});

/* Reported 2026-08-24: a PR brief costing $0.000145 rendered as `$0.000`,
   which reads as free. It surfaced only after the blast map was deduplicated —
   the optimisation pushed real costs under the badge's own precision. */
describe("costs below the third decimal", () => {
  it("says less-than rather than claiming zero", () => {
    render(<CostBadge usd={0.000145} />);
    expect(screen.getByText("< $0.001")).toBeInTheDocument();
  });

  it("still prints an exact zero as zero — nothing was spent", () => {
    render(<CostBadge usd={0} />);
    expect(screen.getByText("$0.000")).toBeInTheDocument();
  });

  it("leaves a cost at or above the third decimal alone", () => {
    render(<CostBadge usd={0.001} />);
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });
});
