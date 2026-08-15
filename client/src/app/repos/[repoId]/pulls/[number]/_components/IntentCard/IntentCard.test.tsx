import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const h = vi.hoisted(() => {
  const record: PrIntentRecord = {
    pr_id: "pr1",
    intent: "Add a lightweight Intent Layer",
    in_scope: ["classifier"],
    out_of_scope: ["e2e"],
    risk_areas: [
      {
        title: "SSRF",
        severity: "high",
        explanation: "Classifier must not `fetch()` arbitrary URLs from the PR body.",
        file_ref: "server/src/modules/reviews/intent/gather.ts:209-214",
      },
    ],
    confidence: 0.8,
    sources: ["pr_body"],
    missing_context: [],
    head_sha: "abc",
    model: "deepseek/deepseek-v4-flash",
    classified_at: "2026-08-13T00:00:00.000Z",
    stale: false,
  };
  return { record, data: record as PrIntentRecord | null, mutate: vi.fn() };
});

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: h.data, isLoading: false }),
  useDeriveIntent: () => ({ mutate: h.mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  h.mutate.mockReset();
  h.data = h.record;
  h.record.stale = false;
});

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows Recompute on a classified card and POSTs with force", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(h.mutate).toHaveBeenCalledWith({ force: true });
  });

  it("still shows Recompute when the classification is stale", () => {
    h.record.stale = true;
    renderCard();
    expect(screen.getByRole("button", { name: "Recompute" })).toBeInTheDocument();
    expect(screen.getByText(/older head commit/)).toBeInTheDocument();
  });

  it("shows Recompute when no intent exists, not Derive", () => {
    h.data = null;
    renderCard();
    expect(screen.getByRole("button", { name: "Recompute" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Derive" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recompute" }));
    expect(h.mutate).toHaveBeenCalledWith({ force: true });
  });

  it("opens a risk-area detail on click and closes on a second click", () => {
    renderCard();
    expect(screen.queryByText(/must not/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SSRF" }));
    expect(screen.getByText(/must not/)).toBeInTheDocument();
    expect(
      screen.getByText("server/src/modules/reviews/intent/gather.ts:209-214"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SSRF" }));
    expect(screen.queryByText(/must not/)).not.toBeInTheDocument();
  });
});
