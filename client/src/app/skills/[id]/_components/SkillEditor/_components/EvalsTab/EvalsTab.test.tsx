/** @vitest-environment jsdom */
/* The four cases below are the reference's own four rows, transcribed in the
   plan's `## 2d`. The frames they came from no longer exist, so this file and
   the plan's element checklist are the only surviving form of the design.

   Rows 2 and 3 are the pair that carries the whole rule: identical in every
   visible field except `Without skill`, and one is green while the other is
   red. A suite without that pair does not test the two-sided mark. */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalRunRecord, EvalSkillCaseRow, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "sk1" }),
  usePathname: () => "/skills/sk1",
  useSearchParams: () => new URLSearchParams(),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "breaking-change-gate",
  description: "API compatibility policy",
  type: "rubric",
  source: "manual",
  body: "# Breaking change gate",
  enabled: true,
  version: 3,
};

const FINDING = {
  id: "f1",
  file: "snippet.ts",
  title: "Removed field is a breaking change",
  severity: "CRITICAL",
  category: "security",
};

/** One `eval_runs` row as a skill case writes it: both halves, one row. */
function run(over: Partial<EvalRunRecord> & { case_id: string }): EvalRunRecord {
  return {
    id: `r-${over.case_id}`,
    case_name: null,
    ran_at: "2026-08-29T10:00:00.000Z",
    actual_output: { with: { recall: 1, findings: [] }, without: { recall: 1, findings: [] } },
    pass: true,
    recall: 1,
    recall_without: 1,
    precision: null,
    citation_accuracy: null,
    duration_ms: 4200,
    cost_usd: 0.02,
    // A skill run never enters an agent's history.
    batch_id: null,
    outcome: "passed",
    failure_reason: null,
    expected_count: 0,
    actual_count: 0,
    ...over,
  };
}

function caseRow(over: Partial<EvalSkillCaseRow> & { id: string; name: string }): EvalSkillCaseRow {
  return {
    owner_kind: "skill",
    owner_id: "sk1",
    expectation: "must_find",
    input_diff: "diff --git a/snippet.ts b/snippet.ts\n",
    input_files: { path: "snippet.ts", mode: "modified", before: "a", after: "b" },
    input_meta: null,
    expected_output: [FINDING],
    seeded_from: null,
    notes: null,
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    severity: "CRITICAL",
    category: "security",
    last_run: null,
    ...over,
  };
}

/* Reference row 1 — MUST NOT FLAG, green, 100% / 100%. */
const ROW1 = caseRow({
  id: "c1",
  name: "breaking-change-gate-additive-optional-field-not-flagged",
  expectation: "must_not_flag",
  expected_output: [],
  severity: null,
  category: null,
  last_run: run({
    case_id: "c1",
    expected_count: 0,
    failure_reason: "forbidden_range_clean",
  }),
});

/* Reference row 2 — MUST FIND, green: found WITH the skill, absent WITHOUT. */
const ROW2 = caseRow({
  id: "c2",
  name: "breaking-change-gate-field-removal-is-flagged",
  last_run: run({
    case_id: "c2",
    recall: 1,
    recall_without: 0,
    expected_count: 1,
    actual_output: {
      with: { recall: 1, findings: [FINDING] },
      without: { recall: 0, findings: [] },
    },
    failure_reason: "skill_caused",
  }),
});

/* Reference row 3 — MUST FIND, RED, and identical to row 2 except that
   `Without skill` reads 100%: the agent found the defect without the skill. */
const ROW3 = caseRow({
  id: "c3",
  name: "adversarial-suppress-positive",
  last_run: run({
    case_id: "c3",
    pass: false,
    outcome: "failed",
    recall: 1,
    recall_without: 1,
    expected_count: 1,
    actual_output: {
      with: { recall: 1, findings: [FINDING] },
      without: { recall: 1, findings: [FINDING] },
    },
    failure_reason: "found_without_skill",
  }),
});

/* Reference row 4 — MUST NOT FLAG, green at 100% / 100%. */
const ROW4 = caseRow({
  id: "c4",
  name: "adversarial-hallucinate-negative",
  expectation: "must_not_flag",
  expected_output: [],
  severity: null,
  category: null,
  last_run: run({ case_id: "c4", expected_count: 0, failure_reason: "forbidden_range_clean" }),
});

const REFERENCE_SET = [ROW1, ROW2, ROW3, ROW4];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch(rows: EvalSkillCaseRow[] = REFERENCE_SET, ran?: EvalRunRecord) {
  const calls: Array<{ method: string; url: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (url.includes("/skill-eval-cases/") && url.endsWith("/run"))
        return jsonResponse(ran ?? run({ case_id: "c2" }));
      if (url.includes("/skills/sk1/eval-cases")) return jsonResponse(rows);
      if (url.includes("/eval-cases/")) return jsonResponse({ ok: true });
      return jsonResponse({});
    }),
  );
  return calls;
}

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalsTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  stubFetch();
});

describe("skill EvalsTab — the four reference rows", () => {
  it("renders each transcribed case with its name, expectation and mark", async () => {
    renderTab();
    const r1 = await screen.findByTestId("skill-eval-case-c1");
    expect(
      within(r1).getByText("breaking-change-gate-additive-optional-field-not-flagged"),
    ).toBeInTheDocument();
    expect(within(r1).getByText("must not flag")).toBeInTheDocument();
    expect(r1).toHaveAttribute("data-status", "passed");

    const r2 = screen.getByTestId("skill-eval-case-c2");
    expect(within(r2).getByText("must find")).toBeInTheDocument();
    expect(r2).toHaveAttribute("data-status", "passed");

    const r4 = screen.getByTestId("skill-eval-case-c4");
    expect(r4).toHaveAttribute("data-status", "passed");
  });

  it("marks rows 2 and 3 differently although only `Without skill` differs", async () => {
    renderTab();
    const r2 = await screen.findByTestId("skill-eval-case-c2");
    const r3 = screen.getByTestId("skill-eval-case-c3");

    // Identical up to the one field that decides the mark.
    expect(within(r2).getByText(/With skill 100%/)).toBeInTheDocument();
    expect(within(r3).getByText(/With skill 100%/)).toBeInTheDocument();
    expect(within(r2).getByText(/Without skill 0%/)).toBeInTheDocument();
    expect(within(r3).getByText(/Without skill 100%/)).toBeInTheDocument();

    expect(r2).toHaveAttribute("data-status", "passed");
    expect(r3).toHaveAttribute("data-status", "failed");
  });

  it("renders every per-side percentage of the reference table", async () => {
    renderTab();
    await screen.findByTestId("skill-eval-case-c1");
    for (const id of ["c1", "c4"]) {
      const row = screen.getByTestId(`skill-eval-case-${id}`);
      expect(within(row).getByText(/With skill 100% \/ Without skill 100%/)).toBeInTheDocument();
    }
  });

  it("states expected and got consistently with the run it renders", async () => {
    renderTab();
    const r2 = await screen.findByTestId("skill-eval-case-c2");
    // A passing must-find case found what it expected — the reference frame's
    // `got 0` beside `recall 100%` is a mid-run partial update (plan `## 2d`, C2).
    expect(within(r2).getByText(/expected 1 finding, got 1/)).toBeInTheDocument();
    const r1 = screen.getByTestId("skill-eval-case-c1");
    expect(within(r1).getByText(/expected 0 findings, got 0/)).toBeInTheDocument();
  });

  it("carries severity·category on must-find rows only", async () => {
    renderTab();
    const r2 = await screen.findByTestId("skill-eval-case-c2");
    expect(within(r2).getByText("CRITICAL · security")).toBeInTheDocument();
    const r1 = screen.getByTestId("skill-eval-case-c1");
    expect(within(r1).queryByText(/CRITICAL/)).not.toBeInTheDocument();
  });

  it("offers Run, Edit and Delete on every row", async () => {
    renderTab();
    const r3 = await screen.findByTestId("skill-eval-case-c3");
    expect(within(r3).getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(within(r3).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(r3).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});

describe("skill EvalsTab — why a 100% / 100% must-find row is red", () => {
  it("renders the header account of the two-sided rule", async () => {
    renderTab();
    expect(await screen.findByText(/red row reading 100% \/ 100%/i)).toBeInTheDocument();
  });

  it("renders the server's own reason on the red must-find row", async () => {
    renderTab();
    const r3 = await screen.findByTestId("skill-eval-case-c3");
    expect(within(r3).getByText(/found this without the skill/i)).toBeInTheDocument();
  });

  it("renders no reason line on a passing row", async () => {
    renderTab();
    const r2 = await screen.findByTestId("skill-eval-case-c2");
    expect(within(r2).queryByText(/found this without the skill/i)).not.toBeInTheDocument();
  });
});

describe("skill EvalsTab — states that are not pass or fail", () => {
  it("renders an errored case as a third state, not a red cross", async () => {
    stubFetch([
      caseRow({
        id: "c5",
        name: "errored-case",
        last_run: run({
          case_id: "c5",
          pass: null,
          outcome: "errored",
          recall: 1,
          recall_without: null,
          expected_count: 1,
          failure_reason: "provider timed out after 60s",
        }),
      }),
    ]);
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c5");
    expect(row).toHaveAttribute("data-status", "errored");
    expect(row).not.toHaveAttribute("data-status", "failed");
    expect(within(row).getByText(/provider timed out/)).toBeInTheDocument();
  });

  it("renders an em dash for a side that produced no number, never 0% and never NaN", async () => {
    stubFetch([
      caseRow({
        id: "c6",
        name: "without-side-missing",
        expectation: "must_not_flag",
        expected_output: [],
        last_run: run({ case_id: "c6", recall_without: null, expected_count: 0 }),
      }),
    ]);
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c6");
    expect(within(row).getByText(/Without skill —/)).toBeInTheDocument();
    expect(within(row).queryByText(/NaN/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Without skill 0%/)).not.toBeInTheDocument();
  });

  it("reads `Never run yet` for a case that has never run", async () => {
    stubFetch([caseRow({ id: "c7", name: "fresh-case" })]);
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c7");
    expect(within(row).getByText("Never run yet")).toBeInTheDocument();
  });

  it("renders the empty state instead of a zero-length list", async () => {
    stubFetch([]);
    renderTab();
    expect(await screen.findByText(/No eval cases yet\./)).toBeInTheDocument();
  });
});

describe("skill EvalsTab — header, agent and spend", () => {
  it("has no metric strip — the reference draws none", async () => {
    renderTab();
    await screen.findByTestId("skill-eval-case-c1");
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
    expect(screen.queryByText("PRECISION")).not.toBeInTheDocument();
    expect(screen.queryByText("CITATION ACCURACY")).not.toBeInTheDocument();
  });

  it("captions the set with the real counts", async () => {
    renderTab();
    expect(await screen.findByText("4 cases")).toBeInTheDocument();
    expect(screen.getByText("3/4 passing")).toBeInTheDocument();
  });

  it("names the agent the cases run on", async () => {
    renderTab();
    expect(await screen.findByText(/Security Reviewer/)).toBeInTheDocument();
  });

  it("states 2 × N model calls before running the whole set", async () => {
    renderTab();
    // Wait for the set: the control renders disabled until the cases arrive.
    await screen.findByTestId("skill-eval-case-c4");
    fireEvent.click(screen.getByRole("button", { name: /Run all evals/ }));
    // Four cases, two calls each — the doubled number, not the case count.
    expect(await screen.findByText(/8 model calls/)).toBeInTheDocument();
  });

  it("states 2 model calls before running one case", async () => {
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c2");
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));
    expect(await screen.findByText(/2 model calls/)).toBeInTheDocument();
  });

  it("runs the case only after the confirmation is accepted", async () => {
    const calls = stubFetch();
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c2");
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));
    expect(calls.some((c) => c.url.includes("/skill-eval-cases/"))).toBe(false);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.includes("/skill-eval-cases/c2/run"))).toBe(
        true,
      ),
    );
  });

  it("offers New eval case", async () => {
    renderTab();
    expect(await screen.findByRole("button", { name: /New eval case/ })).toBeInTheDocument();
  });
});

describe("skill EvalsTab — no enabled agent", () => {
  const ORPHAN = [
    caseRow({ id: "c8", name: "orphan-case", agent_id: null, agent_name: null }),
  ];

  it("states why nothing can run and offers no run control", async () => {
    stubFetch(ORPHAN);
    renderTab();
    expect(await screen.findByText(/No enabled agent is linked/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run all evals/ })).not.toBeInTheDocument();
  });

  /* The row must not OFFER the run either. Clicking an inert control and
     asserting no request went out still leaves a button that looks live and
     does nothing — the header's notice explains the absence instead. */
  it("offers no run control on a row whose case has no agent", async () => {
    stubFetch(ORPHAN);
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c8");
    expect(within(row).queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("skill EvalsTab — deleting a case", () => {
  it("names the history loss before deleting", async () => {
    renderTab();
    const row = await screen.findByTestId("skill-eval-case-c1");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/run history is deleted with it/i)).toBeInTheDocument();
  });
});
