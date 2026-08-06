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

export { SEVERITIES };
