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
