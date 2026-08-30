import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    data: undefined,
  }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkills: () => ({ data: [] }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersionDiff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSkillStats: () => ({
    data: {
      skill_id: "sk1",
      skill_name: "corner-case-checklist",
      findings_window_days: 30,
      agent_count: 2,
      agents: [
        { id: "a1", name: "PR Quality", enabled: true, link_enabled: true },
        { id: "a2", name: "Security", enabled: true, link_enabled: true },
      ],
      runs_total: 10,
      runs_pulled: 5,
      pull_rate: 0.5,
      findings_total: 12,
      accepted: 6,
      dismissed: 2,
      pending: 4,
      accept_rate: 0.75,
      findings_by_category: { security: 5, bug: 3, style: 4 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "corner-case-checklist",
  description: "Boundary coverage",
  type: "rubric",
  source: "manual",
  body: "# Check boundaries\n\nRequire empty-input coverage.",
  enabled: true,
  version: 1,
};

/* The Evals tab reaches the API through a hook, so this file now stubs
   `fetch`. Extending the chain in the same change is the rule of
   `client/INSIGHTS.md:388`: an unmatched URL answers `{}`, which a
   `?? []` would pass straight into `.map`. */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("/eval-cases") ? [] : {};
      return { ok: true, status: 200, json: async () => data };
    }),
  );
});

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages, eval: evalMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillEditor", () => {
  it("renders six tabs in order with Evals last, and the header version chip", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    // Read the bar itself rather than the page: `Evals` is appended to the
    // five shipped tabs without reordering them.
    const bar = screen.getByText("Config").closest("div");
    expect(Array.from(bar?.children ?? []).map((c) => c.textContent)).toEqual([
      "Config",
      "Preview",
      "Context",
      "Stats",
      "Versions",
      "Evals",
    ]);
    expect(screen.getAllByText("v1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("mounts the Evals tab when it is the active one", async () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="evals" onTab={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Eval cases" })).toBeInTheDocument();
    // The skill Evals tab has no metric strip — the reference draws none.
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
  });

  it("renders Preview markdown body", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText(/Rendered as the reviewing agent/i)).toBeInTheDocument();
    expect(screen.getByText("Check boundaries")).toBeInTheDocument();
  });

  it("renders Stats KPI values from useSkillStats", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="stats" onTab={() => {}} />);
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText("PULL FREQUENCY")).toBeInTheDocument();
    expect(screen.getByText("ACCEPT RATE")).toBeInTheDocument();
    expect(screen.getByText("FINDINGS (30D)")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getAllByText("75").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("PR Quality")).toBeInTheDocument();
  });
});
