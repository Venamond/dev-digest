import type { AgentStats, AgentStatsRun } from "@devdigest/shared";
import type { DonutSegment } from "@devdigest/ui";

/** Format USD for KPI / table cells — same rule as CostBadge (<$1 → 3 decimals). */
export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/** Format avg latency (ms → seconds with one decimal). */
export function formatDurationSec(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return (ms / 1000).toFixed(1);
}

/** Compact token total for the history table. */
export function formatTokens(run: AgentStatsRun): string {
  const total = (run.tokens_in ?? 0) + (run.tokens_out ?? 0);
  if (total <= 0) return "—";
  if (total >= 1000) return `${Math.round(total / 1000)}k`;
  return String(total);
}

/** Accept rate as 0–100 for CircularScore / display. */
export function acceptPct(stats: AgentStats): number | null {
  if (stats.accept_rate == null) return null;
  return Math.round(stats.accept_rate * 100);
}

const CAT_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#8b5cf6",
  style: "var(--accent)",
  test: "var(--ok)",
  other: "var(--text-muted)",
};

/** Donut segments from findings_by_category (largest first). */
export function categorySegments(byCat: Record<string, number>): DonutSegment[] {
  return Object.entries(byCat)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([label, value]) => ({
      label,
      value,
      color: CAT_COLORS[label] ?? "var(--text-muted)",
    }));
}

/** Trace deep-link when we know the PR. */
export function traceHref(run: AgentStatsRun): string | null {
  if (!run.repo_id || run.pr_number == null) return null;
  return `/repos/${run.repo_id}/pulls/${run.pr_number}?tab=findings&trace=${run.run_id}`;
}
