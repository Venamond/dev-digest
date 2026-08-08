import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

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
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
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
