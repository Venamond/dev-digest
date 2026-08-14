import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrDetail, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const h = vi.hoisted(() => {
  const replace = vi.fn();
  const CORE_PATH = "src/service.ts";
  const CORE_FILE = {
    path: CORE_PATH,
    additions: 5,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n+coreLine",
  };
  const FINDING: FindingRecord = {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: CORE_PATH,
    start_line: 1,
    end_line: 1,
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
  const PR: PrDetail = {
    id: "pr1",
    number: 1,
    title: "Add a secret",
    author: "alice",
    branch: "feat",
    base: "main",
    head_sha: "abc",
    additions: 5,
    deletions: 0,
    files_count: 1,
    status: "open",
    files: [CORE_FILE],
    commits: [],
    body: "",
  };
  const REVIEW: ReviewRecord = {
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
  };
  const SMART: SmartDiff = {
    groups: [
      {
        role: "core",
        files: [{ path: CORE_PATH, pseudocode_summary: null, additions: 5, deletions: 0, finding_lines: [] }],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
  };
  return { replace, PR, REVIEW, SMART };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "1" }),
  useSearchParams: () => new URLSearchParams("tab=diff"),
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  usePathname: () => "/repos/r1/pulls/1",
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks")>()),
  usePulls: () => ({ data: [{ id: "pr1", number: 1 }], isLoading: false }),
  usePullDetail: () => ({
    data: h.PR,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/reviews")>()),
  usePrReviews: () => ({ data: [h.REVIEW], refetch: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSmartDiff: () => ({ data: h.SMART }),
}));

import { PrDetailView } from "./PrDetailView";

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  h.replace.mockClear();
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <PrDetailView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PrDetailView — finding navigation", () => {
  it("clicking a Smart-mode marker replaces to the findings tab with that id, not GitHub and not a popup", () => {
    const open = vi.fn();
    window.open = open;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Open finding: Hardcoded secret" }));
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/repos/r1/pulls/1?tab=findings&finding=f1");
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
