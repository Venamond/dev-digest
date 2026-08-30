/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalRunRecord, EvalCaseSeed } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";
import { EvalCaseEditor } from "./EvalCaseEditor";

afterEach(cleanup);

const CASE: EvalCase = {
  id: "c1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  expectation: "must_find",
  input_diff: '--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n+  stripeKey: "sk_live_x"',
  input_files: [{ path: "src/config.ts", content: "export const config = {};" }],
  input_meta: { title: "Add Stripe integration", body: "Wire up payments.", linked_issue: "#311" },
  expected_output: [
    { severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key" },
  ],
  seeded_from: null,
  notes: null,
};

const LAST_RUN: EvalRunRecord = {
  id: "r1",
  case_id: "c1",
  case_name: "stripe-key-leak",
  ran_at: "2026-08-29T10:00:00.000Z",
  actual_output: null,
  pass: true,
  recall: 1,
  recall_without: null,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 1800,
  cost_usd: 0.02,
  batch_id: "b1",
  outcome: "passed",
  failure_reason: null,
  expected_count: 1,
  actual_count: 1,
};

const NEGATIVE_SEED: EvalCaseSeed = {
  owner_id: "ag1",
  name: "no-hardcoded-stripe-secret-key",
  expectation: "must_not_flag",
  assertion: "MUST NOT comment on src/config.ts:11 (Hardcoded Stripe secret key)",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n",
  input_files: null,
  input_meta: null,
  expected_output: [],
  seeded_from: { finding_id: "f1", disposition: "dismissed" },
  existing_case_id: null,
};

const POSITIVE_SEED: EvalCaseSeed = {
  ...NEGATIVE_SEED,
  name: "must-find-hardcoded-stripe-secret-key",
  expectation: "must_find",
  assertion: 'MUST find "Hardcoded Stripe secret key" at src/config.ts:11',
  expected_output: [{ title: "Hardcoded Stripe secret key" }],
  seeded_from: { finding_id: "f1", disposition: "accepted" },
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch() {
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (url.includes("/run")) return jsonResponse({ id: "r9", case_id: "c1", pass: true });
      if (url.includes("/eval-cases")) return jsonResponse({ ...CASE, id: "c9" });
      return jsonResponse({});
    }),
  );
  return calls;
}

beforeEach(stubFetch);

function renderEditor(props: Partial<React.ComponentProps<typeof EvalCaseEditor>> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalCaseEditor agentId="ag1" agentName="Security Reviewer" onClose={() => {}} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalCaseEditor — the authoring surface (AC-9)", () => {
  it("shows the required name, the three input tabs and the validity badge", () => {
    renderEditor({ evalCase: CASE });
    expect(screen.getByDisplayValue("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PR meta" })).toBeInTheDocument();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
  });
});

describe("EvalCaseEditor — an invalid expected output cannot be saved (AC-34)", () => {
  it("shows the invalid badge and disables Save", () => {
    renderEditor({ evalCase: CASE });
    fireEvent.change(screen.getByLabelText("Expected output"), { target: { value: "[{" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });
});

describe("EvalCaseEditor — the stored input is read-only (AC-53)", () => {
  it("offers no editable control on Files or PR meta", () => {
    renderEditor({ evalCase: CASE });
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("src/config.ts")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("Add Stripe integration")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Add Stripe integration")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("#311")).not.toBeInTheDocument();
  });
});

describe("EvalCaseEditor — Finding skeleton appends (AC-55)", () => {
  it("adds one entry and leaves the existing ones untouched", () => {
    renderEditor({ evalCase: CASE });
    const area = screen.getByLabelText("Expected output") as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: /Finding skeleton/ }));
    const parsed = JSON.parse(area.value) as unknown[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual((CASE.expected_output as unknown[])[0]);
  });
});

describe("EvalCaseEditor — Run on save (AC-54, AC-64)", () => {
  it("confirms the spend, then saves, then runs the case as a trial", async () => {
    const calls = stubFetch();
    renderEditor({ evalCase: CASE });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));

    // The confirmation comes BEFORE the save that spends the call (AC-64).
    const dialogs = await screen.findAllByRole("dialog");
    const confirm = dialogs[dialogs.length - 1]!;
    expect(within(confirm).getByText(/1 model call/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    fireEvent.click(within(confirm).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/eval-cases/c1/run"))).toBe(
        true,
      ),
    );
  });
});

describe("EvalCaseEditor — a seeded case states what it asserts (AC-2, AC-3)", () => {
  /* Added on the human's request 2026-08-29 — not on the agent mockup. The
     verdict strip says WHETHER a run passed; this says WHAT it produced, which
     is what a red case needs to be diagnosed. jsdom cannot see a CSS squeeze,
     so this guards the panel's presence and its two states only; that it is
     actually visible in the modal is a human check. */
  /* The reference has `Run case` live on a freshly seeded case. A run needs a
     persisted case, so the control saves first and runs what it gets back —
     gating it behind Save (the earlier behaviour) is what the human reported. */
  it("runs a seeded case that was never saved, creating it first", async () => {
    const calls = stubFetch();
    renderEditor({ seed: POSITIVE_SEED });

    const run = screen.getByRole("button", { name: /Run case/ });
    expect(run).not.toBeDisabled();
    fireEvent.click(run);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && /eval-cases$/.test(c.url))).toBe(true),
    );
    await waitFor(() => expect(calls.some((c) => /\/run$/.test(c.url))).toBe(true));
  });

  /* The regression this guards: `Run case` on a seeded editor creates the case
     first, and before the editor adopted that row every further press created
     ANOTHER one — three identical cases reached the set from one finding. */
  it("creates the case once, however many times Run case is pressed", async () => {
    const calls = stubFetch();
    renderEditor({ seed: POSITIVE_SEED });

    const press = async () => {
      fireEvent.click(screen.getByRole("button", { name: /Run case/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    };
    await press();
    await waitFor(() => expect(calls.some((c) => /\/run$/.test(c.url))).toBe(true));
    await press();
    await waitFor(() => expect(calls.filter((c) => /\/run$/.test(c.url)).length).toBe(2));

    const creates = calls.filter((c) => c.method === "POST" && /eval-cases$/.test(c.url));
    expect(creates.length).toBe(1);
  });

  it("shows Actual output — empty before a run, the run's own output after", () => {
    renderEditor({ evalCase: CASE });
    expect(screen.getByText("Actual output")).toBeInTheDocument();
    expect(screen.getByText("Never run yet")).toBeInTheDocument();

    cleanup();
    renderEditor({
      evalCase: CASE,
      lastRun: {
        ...LAST_RUN,
        actual_output: [{ file: "src/config.ts", start_line: 12, title: "Hardcoded key" }],
      },
    });
    expect(screen.queryByText("Never run yet")).not.toBeInTheDocument();
    expect(screen.getByText(/Hardcoded key/)).toBeInTheDocument();
  });

  it("renders the negative banner and the MUST NOT assertion for a dismissal", () => {
    renderEditor({ seed: NEGATIVE_SEED });
    expect(screen.getByText("Negative case")).toBeInTheDocument();
    expect(screen.getByText(/MUST NOT comment on src\/config\.ts:11/)).toBeInTheDocument();
    expect(screen.getByText("Expected: no finding here")).toBeInTheDocument();
    expect(screen.getByText("assert empty")).toBeInTheDocument();
  });

  it("renders the positive banner and the MUST find assertion otherwise", () => {
    renderEditor({ seed: POSITIVE_SEED });
    expect(screen.getByText("Positive case")).toBeInTheDocument();
    expect(screen.getByText(/MUST find .Hardcoded Stripe secret key./)).toBeInTheDocument();
  });
});

/* The reference recording's set contains a hand-written `MUST NOT FLAG` case
   ("helper"). Before this control the agent editor derived the kind from the
   seed's disposition alone, so a case authored through `New eval case` was
   always `must_find` and that row was unreachable — while the skill editor,
   built from the same design, had the picker. Asserting the control renders
   would pass against the broken version; these assert the two states send
   DIFFERENT payloads. */
describe("EvalCaseEditor — a hand-written case chooses its own expectation", () => {
  function stubCapturingBodies() {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return jsonResponse({ ...CASE, id: "c9" });
      }),
    );
    return bodies;
  }

  it("defaults an unseeded case to must_find", async () => {
    const bodies = stubCapturingBodies();
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), {
      target: { value: "benign-local-rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.expectation).toBe("must_find");
  });

  it("sends must_not_flag once that expectation is picked", async () => {
    const bodies = stubCapturingBodies();
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), {
      target: { value: "benign-local-rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: "must not flag" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.expectation).toBe("must_not_flag");
  });

  it("takes its default from the seed's disposition, and still lets it be changed", () => {
    renderEditor({ seed: NEGATIVE_SEED });
    expect(screen.getByRole("button", { name: "must not flag" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "must find" }));
    expect(screen.getByRole("button", { name: "must find" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

/* AC-7 asks for a case authored with no finding to seed it; AC-53 makes only
   `Files` and `PR meta` read-only. The diff pane had been read-only too, so
   `New eval case` could only ever save an empty input — a case no run can
   score. Reported 2026-08-29 ("не понятно куда вставлять"). The seeded pane
   must stay read-only, so both states are asserted. */
describe("EvalCaseEditor — a hand-authored case can be given a diff (AC-7)", () => {
  const DIFF = [
    "diff --git a/server/src/lib/slug.ts b/server/src/lib/slug.ts",
    "--- a/server/src/lib/slug.ts",
    "+++ b/server/src/lib/slug.ts",
    "@@ -1,4 +1,4 @@",
    " export function slug(input: string): string {",
    "-  const s = input.toLowerCase().trim();",
    "+  const normalised = input.toLowerCase().trim();",
    " }",
  ].join("\n");

  it("sends what was typed into the diff field", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return jsonResponse({ ...CASE, id: "c9" });
      }),
    );
    renderEditor();
    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), {
      target: { value: "benign-local-rename" },
    });
    fireEvent.change(screen.getByLabelText("Diff"), { target: { value: DIFF } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.input_diff).toBe(DIFF);
  });

  it("keeps a seeded case's diff read-only — no field to type into", () => {
    renderEditor({ seed: POSITIVE_SEED });
    expect(screen.queryByLabelText("Diff")).not.toBeInTheDocument();
    expect(screen.getByText(/a\/src\/config\.ts/)).toBeInTheDocument();
  });
});

/* The reference draws the kind banner on an empty `New eval case`, before a
   name is typed. Ours showed it only for a seeded case, so the one screen
   where the kind is now CHOSEN had nothing confirming the choice. Asserting
   the banner renders would pass on a seeded case either way — these assert it
   on an UNSEEDED one, and that it follows the picker. */
describe("EvalCaseEditor — the kind banner", () => {
  it("is shown on a hand-authored case and follows the expectation picker", () => {
    renderEditor();
    expect(screen.getByText("Positive case")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "must not flag" }));
    expect(screen.getByText("Negative case")).toBeInTheDocument();
    expect(screen.queryByText("Positive case")).not.toBeInTheDocument();
  });

  it("still spells out a seeded case's own assertion", () => {
    renderEditor({ seed: NEGATIVE_SEED });
    expect(screen.getByText("Negative case")).toBeInTheDocument();
    expect(screen.getByText(/MUST NOT comment on src\/config\.ts:11/)).toBeInTheDocument();
  });
});

/* "expected 1 finding, got 3" on a negative case reads as "should have found
   one, found three" — the opposite of the truth, which is "one forbidden
   location, three findings produced, one of them landed there". Reported by
   the human on 2026-08-30. The assertion has to compare the TWO wordings; a
   test that only checks the negative string would pass with both cases sharing
   it. */
describe("EvalCaseEditor — a negative case's counts are worded for a negative case", () => {
  const RAN: EvalRunRecord = { ...LAST_RUN, pass: false, outcome: "failed", expected_count: 1, actual_count: 3 };

  it("says forbidden location, not finding, for must_not_flag", () => {
    renderEditor({ evalCase: { ...CASE, expectation: "must_not_flag" }, lastRun: RAN });
    expect(screen.getByText(/1 forbidden location/)).toBeInTheDocument();
    expect(screen.queryByText(/expected 1 finding/)).not.toBeInTheDocument();
  });

  it("keeps the finding wording for must_find", () => {
    renderEditor({ evalCase: CASE, lastRun: RAN });
    expect(screen.getByText(/expected 1 finding, got 3/)).toBeInTheDocument();
    expect(screen.queryByText(/forbidden location/)).not.toBeInTheDocument();
  });
});

/* The reference draws the NEGATIVE CASE banner in orange; ours was neutral
   grey, so the two kinds read as one control with different words in it —
   reported 2026-08-30. Colour is the fastest signal of which assertion is
   being authored, and it is the field that inverts the meaning of everything
   below it. Asserting "the banner is amber" alone would pass on a version that
   painted BOTH kinds amber, so both are checked. */
describe("EvalCaseEditor — the kind banner is colour-coded", () => {
  it("paints the negative kind amber", () => {
    renderEditor({ evalCase: { ...CASE, expectation: "must_not_flag" } });
    expect(screen.getByText("Negative case").style.color).toBe("var(--warn)");
  });

  it("keeps the positive kind on the accent colour", () => {
    renderEditor({ evalCase: CASE });
    expect(screen.getByText("Positive case").style.color).toBe("var(--accent-text)");
  });
});
