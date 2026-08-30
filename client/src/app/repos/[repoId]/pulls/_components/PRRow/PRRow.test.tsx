import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "abc123",
    additions: 200,
    deletions: 85,
    files_count: 4,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    score: null,
    findings: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={p} repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows an em-dash when the PR has never been reviewed", () => {
    renderRow(pr({ cost_usd: null }));
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows the formatted cost of the latest run", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });
});

describe("PRRow — findings column", () => {
  it("shows an em-dash when the latest review found nothing", () => {
    renderRow(pr({ findings: { critical: 0, warning: 0, suggestion: 0 } }));
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows a count per non-zero severity, in critical/warning/suggestion order", () => {
    renderRow(pr({ findings: { critical: 2, warning: 0, suggestion: 3 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("wraps a non-empty findings badge in a hover trigger for the findings preview", () => {
    const { container } = renderRow(pr({ findings: { critical: 1, warning: 0, suggestion: 0 } }));
    expect(container.querySelector("[data-findings-preview]")).not.toBeNull();
  });

  it("does not render a findings-preview trigger when there are no findings", () => {
    const { container } = renderRow(pr({ findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(container.querySelector("[data-findings-preview]")).toBeNull();
  });
});
