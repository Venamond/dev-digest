import { describe, it, expect } from "vitest";
import type { Agent } from "@devdigest/shared";
import { filterAgents, toCardStats } from "./helpers";

function agent(partial: Partial<Agent> & Pick<Agent, "id" | "name">): Agent {
  return {
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "x",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...partial,
  };
}

describe("filterAgents", () => {
  const list = [
    agent({ id: "1", name: "Security Reviewer", description: "Flags secrets" }),
    agent({ id: "2", name: "Performance", description: "Hot paths" }),
  ];

  it("returns all agents for empty query", () => {
    expect(filterAgents(list, "")).toHaveLength(2);
    expect(filterAgents(list, "   ")).toHaveLength(2);
  });

  it("matches name or description case-insensitively", () => {
    expect(filterAgents(list, "security").map((a) => a.id)).toEqual(["1"]);
    expect(filterAgents(list, "HOT")).toHaveLength(1);
    expect(filterAgents(list, "missing")).toHaveLength(0);
  });
});

describe("toCardStats", () => {
  it("maps the 7d fields onto AgentCard's stats shape", () => {
    const a = agent({ id: "1", name: "X", runs_7d: 4, accept_rate_7d: 0.5, avg_cost_usd_7d: 0.03 });
    expect(toCardStats(a)).toEqual({ runs: 4, accept: 0.5, cost: 0.03 });
  });

  it("defaults missing/null 7d fields to zero (never run yet)", () => {
    const a = agent({ id: "1", name: "X" });
    expect(toCardStats(a)).toEqual({ runs: 0, accept: 0, cost: 0 });
  });
});
