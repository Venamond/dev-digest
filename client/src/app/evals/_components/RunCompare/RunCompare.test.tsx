/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunBatch } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { RunCompare } from "./RunCompare";

afterEach(cleanup);

/** The prompt the agent carries TODAY — a compare must never show it. */
const CURRENT_PROMPT = "Review the deployment manifest carefully";

const batch = (over: Partial<EvalRunBatch>): EvalRunBatch =>
  ({
    id: "b1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    agent_version: 2,
    system_prompt: "Review the code carefully",
    state: "complete",
    progress_index: 8,
    progress_total: 8,
    started_at: "2026-08-20T09:00:00.000Z",
    ran_at: "2026-08-20T09:04:00.000Z",
    recall: 0.8,
    precision: 0.91,
    citation_accuracy: 1,
    traces_passed: 7,
    traces_produced: 8,
    cases_total: 8,
    cost_usd: 0.42,
    duration_ms: 40000,
    ...over,
  }) as EvalRunBatch;

const older = batch({ id: "b-old", agent_version: 2 });
const newer = batch({
  id: "b-new",
  agent_version: 3,
  system_prompt: "Review the diff carefully",
  started_at: "2026-08-29T09:00:00.000Z",
  ran_at: "2026-08-29T09:04:00.000Z",
  recall: 0.87,
  precision: 0.87,
  cost_usd: 0.5,
});

function renderCompare(a: EvalRunBatch, b: EvalRunBatch, casesTotal = 8) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RunCompare a={a} b={b} casesTotal={casesTotal} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

describe("RunCompare", () => {
  it("renders oldest → newest whatever order the runs were selected in", () => {
    renderCompare(newer, older); // newest picked first
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Compare runs · v2 → v3")).toBeInTheDocument();
    expect(within(dialog).getByText("v2 (old)")).toBeInTheDocument();
    expect(within(dialog).getByText("v3 (new)")).toBeInTheDocument();
    // the older run's value sits on the "from" side of the metric, the newer on the "to"
    const recall = within(dialog).getByText("Recall").parentElement!;
    expect(within(recall).getByText("80%")).toBeInTheDocument();
    expect(within(recall).getByText("87%")).toBeInTheDocument();
  });

  it("strikes a removed word through and highlights an added one", () => {
    renderCompare(older, newer);
    const removed = screen.getByText("code");
    const added = screen.getByText("diff");
    expect(removed.style.textDecoration).toContain("line-through");
    expect(removed.style.background).toBe("var(--code-del)");
    expect(added.style.background).toBe("var(--code-add)");
    expect(screen.getByText("Review").style.background).toBe("transparent");
  });

  it("diffs the prompts the runs stored, not the agent's current prompt", () => {
    renderCompare(older, newer);
    expect(screen.queryByText("deployment")).not.toBeInTheDocument();
    expect(screen.queryByText("manifest")).not.toBeInTheDocument();
    expect(CURRENT_PROMPT).not.toBe(newer.system_prompt);
  });

  it("shows each metric's delta, and the cost in dollars rather than points", () => {
    renderCompare(older, newer);
    expect(screen.getByText("▲ 7pt")).toBeInTheDocument(); // recall 80% → 87%
    expect(screen.getByText("▼ 4pt")).toBeInTheDocument(); // precision 91% → 87%
    expect(screen.getByText("▲ $0.080")).toBeInTheDocument(); // cost 0.42 → 0.50
    expect(screen.getByText("$0.420")).toBeInTheDocument();
    expect(screen.getByText("$0.500")).toBeInTheDocument();
    // citation is unchanged, so no delta is drawn at all
    expect(screen.queryByText(/0pt$/)).not.toBeInTheDocument();
  });

  /* A real two-case run costs ~$0.0009. Rendered raw it read
     `0.0009258000000000001 → 0.0008106` with a `0.00` delta; both halves of
     that are useless, and the delta actively claimed nothing changed. Dollars
     cannot state it briefly, so below a cent the card switches to cents. */
  it("shows a sub-cent cost in cents rather than as a raw float", () => {
    renderCompare(
      batch({ id: "c-old", agent_version: 2, cost_usd: 0.0008680000000000001 }),
      batch({ id: "c-new", agent_version: 2, cost_usd: 0.0008106 }),
    );
    expect(screen.queryByText(/0\.000868/)).not.toBeInTheDocument();
    expect(screen.getByText("0.09¢")).toBeInTheDocument();
    expect(screen.getByText("0.08¢")).toBeInTheDocument();
    expect(screen.getByText("▼ 0.01¢")).toBeInTheDocument();
  });

  it("renders an em dash for a metric with no denominator", () => {
    renderCompare(batch({ id: "x", agent_version: 1, recall: null }), newer);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("names the newer version on a Promote control that is disabled with a reason", () => {
    renderCompare(older, newer);
    const promote = screen.getByRole("button", { name: "Promote v3" });
    expect(promote).toBeDisabled();
    expect(promote.getAttribute("title")).toMatch(/no promote-a-version concept/i);
  });

  it("states that the two runs are comparable and that model output varies", () => {
    renderCompare(older, newer);
    expect(screen.getByText(/same case set and the same model/i)).toBeInTheDocument();
    expect(screen.getByText(/varies between identical calls/i)).toBeInTheDocument();
  });

  it("states the real case count, never a hard-coded gold set", () => {
    renderCompare(older, newer, 8);
    expect(screen.getByText(/on the 8-case set/)).toBeInTheDocument();
    expect(screen.queryByText(/20-trace/i)).not.toBeInTheDocument();
  });

  it("closes from the footer", () => {
    const { onClose } = renderCompare(older, newer);
    // the header carries an icon-only Close as well — this is the footer's
    const footerClose = screen
      .getAllByRole("button", { name: "Close" })
      .find((b) => b.textContent === "Close")!;
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
