"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Card,
  CircularScore,
  Donut,
  EmptyState,
  ErrorState,
  MonoLink,
  SectionLabel,
  Skeleton,
  Sparkline,
} from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentStats } from "../../../../../../../lib/hooks/agents";
import {
  acceptPct,
  categorySegments,
  formatDurationSec,
  formatTokens,
  formatUsd,
  traceHref,
} from "./helpers";
import { s } from "./styles";

const SEV = [
  { key: "CRITICAL" as const, label: "Critical", color: "var(--crit)" },
  { key: "WARNING" as const, label: "Warning", color: "var(--warn)" },
  { key: "SUGGESTION" as const, label: "Suggestion", color: "var(--sugg)" },
];

/** Agent Editor → Stats tab (design StatsTab), backed by GET /agents/:id/stats. */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading, isError, refetch } = useAgentStats(agent.id);

  if (isLoading && !stats) {
    return (
      <div style={s.wrap}>
        <div style={s.kpiRow}>
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
        <Skeleton height={180} />
      </div>
    );
  }

  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  if (stats.runs === 0) {
    return (
      <EmptyState icon="BarChart" title={t("stats.emptyTitle")} body={t("stats.emptyBody")} />
    );
  }

  const pct = acceptPct(stats);
  const spark = stats.trend.map((p) => p.value);
  const sevTotal =
    stats.findings_by_severity.CRITICAL +
    stats.findings_by_severity.WARNING +
    stats.findings_by_severity.SUGGESTION;
  const cats = categorySegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      <div style={s.kpiRow}>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.kpi.runs")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {stats.runs}
            </span>
          </div>
          {spark.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Sparkline data={spark} color="var(--accent)" w={180} h={26} />
            </div>
          )}
        </div>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.kpi.avgCost")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {formatUsd(stats.avg_cost_usd)}
            </span>
          </div>
        </div>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.kpi.avgDuration")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {formatDurationSec(stats.avg_latency_ms)}
              {stats.avg_latency_ms != null && <span style={s.kpiSuffix}>s</span>}
            </span>
          </div>
        </div>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.kpi.acceptRate")}</span>
            {pct != null && <CircularScore score={pct} size={32} stroke={3.5} />}
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {pct == null ? "—" : pct}
              {pct != null && <span style={s.kpiSuffix}>%</span>}
            </span>
          </div>
        </div>
      </div>

      <div style={s.grid2}>
        <Card>
          <SectionLabel icon="Sparkles">{t("stats.mostUsedSkills")}</SectionLabel>
          <p style={s.emptyHint}>{t("stats.skillsLater")}</p>
        </Card>
        <Card>
          <SectionLabel icon="Database">{t("stats.mostPulledMemory")}</SectionLabel>
          <p style={s.emptyHint}>{t("stats.memoryLater")}</p>
        </Card>
      </div>

      <div style={s.grid2}>
        <Card>
          <SectionLabel icon="BarChart">{t("stats.bySeverity")}</SectionLabel>
          <div style={s.sevBars}>
            {SEV.map((sev) => {
              const n = stats.findings_by_severity[sev.key];
              const bar = sevTotal === 0 ? 0 : Math.round((n / sevTotal) * 100);
              return (
                <div key={sev.key} style={s.sevRow}>
                  <span style={{ color: "var(--text-secondary)" }}>{sev.label}</span>
                  <div style={s.sevTrack}>
                    <div style={s.sevFill(sev.color, bar)} />
                  </div>
                  <span className="tnum">{n}</span>
                </div>
              );
            })}
          </div>
          <div style={s.legend}>
            {SEV.map((sev) => (
              <span key={sev.key} style={s.legendItem}>
                <span style={s.swatch(sev.color)} />
                {sev.label}
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <SectionLabel icon="Tag">{t("stats.byCategory")}</SectionLabel>
          <div style={s.donutWrap}>
            {cats.length === 0 ? (
              <p style={s.emptyHint}>{t("stats.noFindings")}</p>
            ) : (
              <Donut segments={cats} size={120} valuePrefix="" />
            )}
          </div>
        </Card>
      </div>

      <SectionLabel icon="History">{t("stats.runHistory")}</SectionLabel>
      <div style={s.table}>
        <div style={s.tableHead}>
          <div>{t("stats.col.timestamp")}</div>
          <div>{t("stats.col.pr")}</div>
          <div>{t("stats.col.tokens")}</div>
          <div>{t("stats.col.cost")}</div>
          <div>{t("stats.col.findings")}</div>
          <div>{t("stats.col.source")}</div>
          <div />
        </div>
        {stats.recent_runs.length === 0 ? (
          <div style={{ ...s.emptyHint, padding: 14 }}>{t("stats.noRuns")}</div>
        ) : (
          stats.recent_runs.map((r, i) => {
            const href = traceHref(r);
            const ts = r.ran_at.replace("T", " ").slice(0, 16);
            return (
              <div key={r.run_id} style={s.tableRow(i === stats.recent_runs.length - 1)}>
                <span className="mono" style={s.muted}>
                  {ts}
                </span>
                <span className="mono" style={s.prLink}>
                  {r.pr_number != null ? `#${r.pr_number}` : "—"}
                </span>
                <span className="mono tnum">{formatTokens(r)}</span>
                <span className="mono tnum">{formatUsd(r.cost_usd)}</span>
                <span className="tnum">{r.findings_count ?? 0}</span>
                <Badge color={r.source === "ci" ? "var(--warn)" : "var(--text-secondary)"}>
                  {r.source === "ci" ? "CI" : "local"}
                </Badge>
                {href ? (
                  <MonoLink href={href}>{t("stats.viewTrace")}</MonoLink>
                ) : (
                  <span style={s.muted}>—</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
