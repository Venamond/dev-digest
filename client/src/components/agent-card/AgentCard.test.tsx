import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip, skill count and stats footer", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} stats={{ runs: 12, accept: 0.75, cost: 0.06 }} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.queryByText("deepseek/deepseek-v4-flash")).not.toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
    expect(screen.getByText("12 runs")).toBeInTheDocument();
    expect(screen.getByText("75% accept")).toBeInTheDocument();
    expect(screen.getByText("$0.06 avg")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
