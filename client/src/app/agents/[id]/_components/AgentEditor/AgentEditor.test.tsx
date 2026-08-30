import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "../../../../../lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "ag1" }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

const { agentsHooksMock } = vi.hoisted(() => {
  // Stable references — SkillsTab's useEffect depends on `data` identity.
  const skillsData = [
    {
      skill: {
        id: "s1",
        name: "happy-path-coverage-gap",
        description: "Flag happy-path-only tests",
        type: "rubric" as const,
        source: "manual" as const,
        body: "## skill",
        enabled: true,
        version: 1,
      },
      linked: true,
      enabled: true,
      order: 0,
    },
  ];
  const modelsData = [{ id: "gpt-4.1", provider: "openai" as const }];
  const skillsQuery = {
    data: skillsData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  return {
    agentsHooksMock: {
      useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
      useProviderModels: () => ({ data: modelsData }),
      useAgentSkills: () => skillsQuery,
      useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
      useAgentStats: () => ({
        data: {
          agent_id: "ag1",
          agent_name: "Security Reviewer",
          runs: 0,
          findings_total: 0,
          accepted: 0,
          dismissed: 0,
          pending: 0,
          accept_rate: null,
          dismiss_rate: null,
          avg_findings_per_run: null,
          total_cost_usd: null,
          avg_cost_usd: null,
          avg_latency_ms: null,
          findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
          findings_by_category: {},
          trend: [],
          recent_runs: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }),
    },
  };
});

vi.mock("../../../../../lib/hooks/agents", () => agentsHooksMock);

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

/* The Evals tab adds query hooks to a component this test already mounts, so
   the URL chain has to answer them here — an unmatched URL yields `{}`, which a
   nullish coalesce would pass straight into `.map`. */
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/eval-cases") || url.includes("/eval-runs") ? [] : {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages }}>
        <ToastProvider>{ui}</ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders the Skills tab with N of M and skill rows", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    expect(screen.getByText("1 of 1 enabled")).toBeInTheDocument();
    expect(screen.getByText("happy-path-coverage-gap")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
  });

  it("renders the Stats tab empty state when the agent has no runs", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="stats" onTab={() => {}} />);
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });
});

describe("A2 Agent Editor — the six-tab bar (AC-58, AC-60)", () => {
  it("renders six tabs in the mockup's order", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const labels = within(screen.getByTestId("agent-editor-tabs"))
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["Config", "Skills", "Context", "Evals", "Stats", "CI"]);
  });

  it("draws CI disabled with a stated reason and does not switch the panel", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    const ci = screen.getByRole("button", { name: "CI" });
    expect(ci).toBeDisabled();
    expect(ci.getAttribute("title")).toBeTruthy();
    fireEvent.click(ci);
    expect(onTab).not.toHaveBeenCalled();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("selects the Evals tab and renders it", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledWith("evals");

    cleanup();
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={onTab} />);
    expect(screen.getByText("Eval cases")).toBeInTheDocument();
  });
});
