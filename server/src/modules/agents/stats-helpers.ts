import type { AgentStats, AgentStatsRun, StatPoint } from '@devdigest/shared';

/** Raw run row used to build AgentStats (no DB types — unit-testable). */
export interface StatsRunInput {
  id: string;
  ranAt: Date;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  findingsCount: number | null;
  source: 'local' | 'ci';
  prNumber: number | null;
  repoId: string | null;
}

/** Raw finding row used for accept/severity/category aggregates. */
export interface StatsFindingInput {
  severity: string;
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function rate(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return part / whole;
}

/** Build daily run-count sparkline (oldest→newest), last `days` calendar days. */
export function buildTrend(runs: StatsRunInput[], days = 14, now = new Date()): StatPoint[] {
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    counts.set(dayKey(d), 0);
  }
  for (const r of runs) {
    const k = dayKey(r.ranAt);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}

/** Pure aggregation for GET /agents/:id/stats. */
export function buildAgentStats(
  agentId: string,
  agentName: string,
  runs: StatsRunInput[],
  findings: StatsFindingInput[],
  recentLimit = 20,
): AgentStats {
  const costs = runs.map((r) => r.costUsd).filter((c): c is number => c != null);
  const latencies = runs.map((r) => r.durationMs).filter((d): d is number => d != null);

  let accepted = 0;
  let dismissed = 0;
  let pending = 0;
  const bySev = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  const byCat: Record<string, number> = {};

  for (const f of findings) {
    if (f.acceptedAt) accepted += 1;
    else if (f.dismissedAt) dismissed += 1;
    else pending += 1;

    const sev = f.severity.toUpperCase();
    if (sev === 'CRITICAL' || sev === 'WARNING' || sev === 'SUGGESTION') {
      bySev[sev] += 1;
    }
    const cat = f.category || 'other';
    byCat[cat] = (byCat[cat] ?? 0) + 1;
  }

  const acted = accepted + dismissed;
  const sortedNewest = [...runs].sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
  const recent_runs: AgentStatsRun[] = sortedNewest.slice(0, recentLimit).map((r) => ({
    run_id: r.id,
    ran_at: r.ranAt.toISOString(),
    pr_number: r.prNumber,
    repo_id: r.repoId,
    tokens_in: r.tokensIn,
    tokens_out: r.tokensOut,
    cost_usd: r.costUsd,
    findings_count: r.findingsCount,
    source: r.source,
  }));

  return {
    agent_id: agentId,
    agent_name: agentName,
    runs: runs.length,
    findings_total: findings.length,
    accepted,
    dismissed,
    pending,
    accept_rate: rate(accepted, acted),
    dismiss_rate: rate(dismissed, acted),
    avg_findings_per_run: runs.length === 0 ? null : findings.length / runs.length,
    total_cost_usd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    avg_cost_usd: avg(costs),
    avg_latency_ms: avg(latencies),
    findings_by_severity: bySev,
    findings_by_category: byCat,
    trend: buildTrend(runs),
    recent_runs,
  };
}

/** Raw run row for the agents-list card footer aggregate (windowed, all agents at once). */
export interface CardStatsRunInput {
  agentId: string | null;
  costUsd: number | null;
}

/** Raw finding row for the agents-list card footer aggregate. */
export interface CardStatsFindingInput {
  agentId: string | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface CardStats {
  runs: number;
  /** 0-1 accept rate; 0 when no finding has been accepted or dismissed yet. */
  accept: number;
  /** Average cost in USD; 0 when no run in the window has a known cost. */
  cost: number;
}

/**
 * Per-agent card-footer stats (runs / accept rate / avg cost) for a whole
 * workspace's agent list in one pass — `AgentsRepository.cardStats` windows
 * both inputs to the same period (e.g. last 7 days) before calling this.
 * Rows with a null `agentId` (agent_runs.agent_id is nullable — set null on
 * agent delete) are excluded.
 */
export function buildCardStats(
  runs: CardStatsRunInput[],
  findings: CardStatsFindingInput[],
): Map<string, CardStats> {
  const byAgent = new Map<string, { runs: number; costs: number[]; accepted: number; acted: number }>();
  const entry = (agentId: string) => {
    let e = byAgent.get(agentId);
    if (!e) {
      e = { runs: 0, costs: [], accepted: 0, acted: 0 };
      byAgent.set(agentId, e);
    }
    return e;
  };

  for (const r of runs) {
    if (!r.agentId) continue;
    const e = entry(r.agentId);
    e.runs += 1;
    if (r.costUsd != null) e.costs.push(r.costUsd);
  }
  for (const f of findings) {
    if (!f.agentId) continue;
    const e = entry(f.agentId);
    if (f.acceptedAt) {
      e.accepted += 1;
      e.acted += 1;
    } else if (f.dismissedAt) {
      e.acted += 1;
    }
  }

  const result = new Map<string, CardStats>();
  for (const [agentId, e] of byAgent) {
    result.set(agentId, {
      runs: e.runs,
      accept: e.acted === 0 ? 0 : e.accepted / e.acted,
      cost: e.costs.length === 0 ? 0 : e.costs.reduce((a, b) => a + b, 0) / e.costs.length,
    });
  }
  return result;
}

export { SEVERITIES };
