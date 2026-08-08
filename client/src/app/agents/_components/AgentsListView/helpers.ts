import type { Agent } from "@devdigest/shared";
import type { AgentCardStats } from "@/components/agent-card/AgentCard";

/** Case-insensitive filter over an agent's name + description. */
export function filterAgents(agents: Agent[], search: string): Agent[] {
  const q = search.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q));
}

/** Map the list response's 7-day fields onto AgentCard's stats shape. */
export function toCardStats(a: Agent): AgentCardStats {
  return {
    runs: a.runs_7d ?? 0,
    accept: a.accept_rate_7d ?? 0,
    cost: a.avg_cost_usd_7d ?? 0,
  };
}
