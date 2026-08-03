import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsPreviewPopover } from "./FindingsPreviewPopover";
import { usePrReviews } from "@/lib/hooks/reviews";

vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: vi.fn() }));

const mockedUsePrReviews = vi.mocked(usePrReviews);

const REVIEW: ReviewRecord = {
  id: "rv-1",
  pr_id: "pr-1",
  agent_id: null,
  run_id: null,
  agent_name: "Security",
  kind: "review",
  verdict: "request_changes",
  summary: "…",
  score: 40,
  model: "gpt-4.1",
  grounding: "1/1 passed",
  created_at: "2026-08-01T00:00:00.000Z",
  findings: [
    {
      id: "f-1",
      review_id: "rv-1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "A live key is committed.",
      suggestion: null,
      confidence: 0.98,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

function renderPopover() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPreviewPopover prId="pr-1" count={1}>
          <span>2</span>
        </FindingsPreviewPopover>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedUsePrReviews.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<
    typeof usePrReviews
  >);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("FindingsPreviewPopover", () => {
  it("does not render a popover before hover, and starts the query disabled", () => {
    renderPopover();
    expect(mockedUsePrReviews).toHaveBeenCalledWith("pr-1", { enabled: false, staleTime: 60_000 });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("opens after the hover delay and renders the fetched findings", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("2").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("does not open if the pointer leaves before the hover delay elapses", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    const trigger = screen.getByText("2").parentElement!;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("closes after the pointer leaves and the close delay elapses", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    const trigger = screen.getByText("2").parentElement!;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("shows an error message after the hover delay when the reviews fetch errors", () => {
    mockedUsePrReviews.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof usePrReviews>);
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("2").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Couldn't load findings")).toBeInTheDocument();
  });
});
