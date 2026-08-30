/** @vitest-environment jsdom */
/* Screen B of the track-F reference (plan `## 2d`). Its frames no longer
   exist, so this file and the plan's element checklist are the design record. */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";

import { SkillEvalCaseEditor } from "./SkillEvalCaseEditor";

afterEach(cleanup);

const CASE: EvalCase = {
  id: "c2",
  owner_kind: "skill",
  owner_id: "sk1",
  name: "breaking-change-gate-field-removal-is-flagged",
  expectation: "must_find",
  input_diff: "diff --git a/snippet.ts b/snippet.ts\n",
  input_files: {
    path: "snippet.ts",
    mode: "modified",
    before: "type UserResponse = { id: string; email: string };",
    after: "type UserResponse = { id: string };",
  },
  input_meta: { title: "Trim the user payload", body: "Drop an unused field." },
  expected_output: [
    { title: "Removed field is a breaking change", file: "snippet.ts", start_line: 1 },
  ],
  seeded_from: null,
  notes: null,
};

const BOTH_SIDES: EvalRunRecord = {
  id: "r1",
  case_id: "c2",
  case_name: CASE.name,
  ran_at: "2026-08-29T10:00:00.000Z",
  actual_output: {
    with: {
      recall: 1,
      findings: [{ id: "f1", file: "snippet.ts", title: "Removed field is a breaking change" }],
      cost_usd: 0.01,
      error: null,
    },
    without: { recall: 0, findings: [], cost_usd: 0.01, error: null },
  },
  pass: true,
  recall: 1,
  recall_without: 0,
  precision: null,
  citation_accuracy: null,
  duration_ms: 4200,
  cost_usd: 0.02,
  batch_id: null,
  outcome: "passed",
  failure_reason: null,
  expected_count: 1,
  actual_count: 0,
};

const ONE_SIDE_FAILED: EvalRunRecord = {
  ...BOTH_SIDES,
  actual_output: {
    with: {
      recall: 1,
      findings: [{ id: "f1", file: "snippet.ts", title: "Removed field is a breaking change" }],
      cost_usd: 0.01,
      error: null,
    },
    without: { recall: null, findings: [], cost_usd: null, error: "provider exploded mid-call" },
  },
  pass: null,
  recall_without: null,
  outcome: "errored",
  failure_reason: "provider exploded mid-call",
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch() {
  const calls: Array<{ method: string; url: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("/eval-cases/preview-diff"))
        return jsonResponse({
          diff: "diff --git a/snippet.ts b/snippet.ts\n@@ -1 +1 @@\n-old\n+new\n",
        });
      if (url.includes("/skill-eval-cases/")) return jsonResponse(BOTH_SIDES);
      if (url.includes("/eval-cases/")) return jsonResponse(CASE);
      if (url.includes("/skills/sk1/eval-cases")) return jsonResponse({ ...CASE, id: "new1" });
      return jsonResponse({});
    }),
  );
  return calls;
}

function renderEditor(props: Partial<React.ComponentProps<typeof SkillEvalCaseEditor>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <SkillEvalCaseEditor
          skillId="sk1"
          skillName="breaking-change-gate"
          evalCase={CASE}
          onClose={() => {}}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stubFetch();
});

describe("SkillEvalCaseEditor — where the dialog is mounted", () => {
  /* Containment, not presence: `toBeInTheDocument` passes in BOTH layouts and
     proves nothing. `Modal` is `position: fixed` and does not portal itself,
     so an ancestor with `opacity`/`transform` would dim it and capture its
     positioning (`client/INSIGHTS.md:64`). */
  it("portals out of its mounting ancestor", () => {
    const host = document.createElement("div");
    host.style.opacity = "0.6";
    document.body.appendChild(host);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
          <SkillEvalCaseEditor skillId="sk1" evalCase={CASE} onClose={() => {}} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
      { container: host },
    );
    expect(host.contains(screen.getByRole("dialog"))).toBe(false);
  });
});

describe("SkillEvalCaseEditor — the input pane", () => {
  it("titles the dialog with the case name", () => {
    renderEditor();
    expect(screen.getByText(`Eval case · ${CASE.name}`)).toBeInTheDocument();
  });

  it("offers two input tabs — Code and PR meta, not the agent editor's three", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Diff" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Files" })).not.toBeInTheDocument();
  });

  it("offers the two Code sub-tabs", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "New file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modified file" })).toBeInTheDocument();
  });

  it("holds the file contents in labelled, editable Before and After areas", () => {
    renderEditor();
    const before = screen.getByLabelText("Before");
    const after = screen.getByLabelText("After");
    expect(before).toHaveValue(
      "type UserResponse = { id: string; email: string };",
    );
    fireEvent.change(after, { target: { value: "type UserResponse = { id: string; role: string };" } });
    expect(screen.getByLabelText("After")).toHaveValue(
      "type UserResponse = { id: string; role: string };",
    );
  });

  it("drops the Before area on a new file — it has no before-image", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.queryByLabelText("Before")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Contents")).toBeInTheDocument();
  });

  it("switches to the PR meta tab", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Trim the user payload");
  });
});

describe("SkillEvalCaseEditor — the generated diff preview", () => {
  it("is collapsed on arrival", () => {
    renderEditor();
    const toggle = screen.getByRole("button", { name: /Preview generated diff/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/@@ -1 \+1 @@/)).not.toBeInTheDocument();
  });

  it("expands to the diff the SERVER built, so preview and stored bytes match", async () => {
    const calls = stubFetch();
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Preview generated diff/ }));
    await waitFor(() => expect(screen.getByText(/@@ -1 \+1 @@/)).toBeInTheDocument());
    expect(
      calls.some((c) => c.method === "POST" && c.url.includes("/eval-cases/preview-diff")),
    ).toBe(true);
  });
});

describe("SkillEvalCaseEditor — the expected output pane", () => {
  it("badges valid JSON", () => {
    renderEditor();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
  });

  it("badges invalid JSON and disables Save", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Expected output"), { target: { value: "{ nope" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("appends one finding skeleton and leaves the existing entries alone", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Finding skeleton/ }));
    const value = (screen.getByLabelText("Expected output") as HTMLTextAreaElement).value;
    const parsed = JSON.parse(value) as unknown[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ title: "Removed field is a breaking change" });
  });
});

describe("SkillEvalCaseEditor — the actual output panel", () => {
  it("reads `Never run yet` before the case has run", () => {
    renderEditor({ lastRun: null });
    const panel = screen.getByText("Actual output").parentElement as HTMLElement;
    expect(within(panel).getByText("Never run yet")).toBeInTheDocument();
  });

  it("renders both halves of the one run afterwards", () => {
    renderEditor({ lastRun: BOTH_SIDES });
    const panel = screen.getByText("Actual output").parentElement as HTMLElement;
    // Both sides are drawn, as the reference draws them: `{ with, without }`.
    expect(within(panel).getByText(/"with"/)).toBeInTheDocument();
    expect(within(panel).getByText(/"without"/)).toBeInTheDocument();
    expect(within(panel).getByText(/Removed field is a breaking change/)).toBeInTheDocument();
  });

  it("keeps the succeeded side when the other one failed", () => {
    renderEditor({ lastRun: ONE_SIDE_FAILED });
    const panel = screen.getByText("Actual output").parentElement as HTMLElement;
    expect(within(panel).getByText(/provider exploded mid-call/)).toBeInTheDocument();
    expect(within(panel).getByText(/Removed field is a breaking change/)).toBeInTheDocument();
  });
});

describe("SkillEvalCaseEditor — the footer and its spend", () => {
  it("carries the run-on-save toggle, Cancel, Run case and Save", () => {
    renderEditor();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run case" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("states 2 model calls before running the case, and runs only on confirm", async () => {
    const calls = stubFetch();
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    expect(await screen.findByText(/2 model calls/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/skill-eval-cases/"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.includes("/skill-eval-cases/c2/run"))).toBe(true),
    );
  });

  it("states 2 model calls before a save with `Run on save` on", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/2 model calls/)).toBeInTheDocument();
  });

  it("saves without a confirmation when the toggle is off", async () => {
    const calls = stubFetch();
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.url.includes("/eval-cases/c2"))).toBe(true),
    );
    expect(screen.queryByText(/model calls/)).not.toBeInTheDocument();
  });

  it("refuses to save an unnamed case or one with no change", () => {
    renderEditor({ evalCase: null });
    // A new case starts empty: no name, no path and Before === After.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
  });
});
