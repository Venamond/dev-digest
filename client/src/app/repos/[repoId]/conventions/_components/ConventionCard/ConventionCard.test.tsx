/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    rule: "Always await async calls",
    category: "async",
    evidence_path: "src/a.ts",
    evidence_snippet: "await doThing();",
    evidence_line_start: 10,
    evidence_line_end: 12,
    evidence_url: "https://github.com/acme/repo/blob/sha/src/a.ts#L10-L12",
    confidence: 0.82,
    status: "pending",
    ...over,
  };
}

type Handlers = {
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
};

function renderCard(over: Partial<ConventionCandidate> = {}, props: Partial<Handlers> = {}) {
  const handlers = {
    onAccept: props.onAccept ?? vi.fn(),
    onReject: props.onReject ?? vi.fn(),
    onSaveRule: props.onSaveRule ?? vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={candidate(over)} busy={props.busy} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

function openEditor() {
  fireEvent.doubleClick(screen.getByText("Always await async calls"));
  return screen.getByRole("textbox", { name: /edit rule/i });
}

describe("ConventionCard", () => {
  it("renders the rule, evidence and confidence", () => {
    renderCard();
    expect(screen.getByText("Always await async calls")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:10-12")).toBeInTheDocument();
    expect(screen.getByText("await doThing();")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("links evidence to the pinned blob URL when one exists", () => {
    renderCard();
    expect(screen.getByRole("link", { name: /src\/a\.ts/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/repo/blob/sha/src/a.ts#L10-L12",
    );
  });

  it("renders evidence as plain text when there is no URL", () => {
    renderCard({ evidence_url: null });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/a.ts:10-12")).toBeInTheDocument();
  });

  it("accept and reject call their handlers", () => {
    const { onAccept, onReject } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("disables the action that already happened", () => {
    renderCard({ status: "accepted" });
    expect(screen.getByRole("button", { name: /accepted/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeEnabled();
  });

  it("double-click opens the rule editor and saves the edited text", () => {
    const { onSaveRule } = renderCard();
    fireEvent.change(openEditor(), { target: { value: "Never use .then chains" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSaveRule).toHaveBeenCalledWith("Never use .then chains");
  });

  // An empty input would otherwise persist a blank rule and gut the card.
  it("falls back to the original rule when the edit is cleared", () => {
    const { onSaveRule } = renderCard();
    fireEvent.change(openEditor(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSaveRule).toHaveBeenCalledWith("Always await async calls");
  });

  it("cancel discards the edit without saving", () => {
    const { onSaveRule } = renderCard();
    fireEvent.change(openEditor(), { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText("Always await async calls")).toBeInTheDocument();
  });

  it("busy disables both actions", () => {
    renderCard({}, { busy: true });
    expect(screen.getByRole("button", { name: /accept/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reject/i })).toBeDisabled();
  });
});
