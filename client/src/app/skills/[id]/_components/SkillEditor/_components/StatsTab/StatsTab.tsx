"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CircularScore,
  Donut,
  EmptyState,
  ErrorState,
  Icon,
  MonoLink,
  SectionLabel,
  Skeleton,
} from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { categorySegments, pct } from "./helpers";
import { s } from "./styles";

/** Skill Editor → Stats tab, backed by GET /skills/:id/stats. */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

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

  if (stats.agents.length === 0) {
    return (
      <EmptyState icon="BarChart" title={t("stats.emptyTitle")} body={t("stats.emptyBody")} />
    );
  }

  const pull = pct(stats.pull_rate);
  const accept = pct(stats.accept_rate);
  const cats = categorySegments(stats.findings_by_category);
  const hint = t("stats.attributionHint");

  return (
    <div style={s.wrap}>
      <div style={s.kpiRow}>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.usedBy")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {stats.agent_count}
            </span>
            <span style={s.kpiSuffix}>{t("stats.agentSuffix", { count: stats.agent_count })}</span>
          </div>
        </div>
        <div style={s.kpi}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.pullFrequency")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {pull == null ? "—" : pull}
              {pull != null && <span style={s.kpiSuffix}>%</span>}
            </span>
          </div>
        </div>
        <div style={s.kpi} title={hint}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.acceptRate")}</span>
            {accept != null && <CircularScore score={accept} size={32} stroke={3.5} />}
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {accept == null ? "—" : accept}
              {accept != null && <span style={s.kpiSuffix}>%</span>}
            </span>
          </div>
        </div>
        <div style={s.kpi} title={hint}>
          <div style={s.kpiHead}>
            <span style={s.kpiLabel}>{t("stats.findings30d")}</span>
          </div>
          <div style={s.kpiValueRow}>
            <span className="tnum" style={s.kpiValue}>
              {stats.findings_total}
            </span>
          </div>
        </div>
      </div>

      <div style={s.grid2}>
        <Card>
          <SectionLabel icon="Cpu">{t("stats.agentsUsing")}</SectionLabel>
          <div style={s.agentList}>
            {stats.agents.map((a) => {
              const muted = !a.enabled || !a.link_enabled;
              return (
                <div key={a.id} style={s.agentRow(muted)}>
                  <div style={s.agentIcon}>
                    <Icon.Cpu size={14} />
                  </div>
                  <span style={s.agentName}>{a.name}</span>
                  <MonoLink href={`/agents/${a.id}?tab=skills`}>{t("stats.open")}</MonoLink>
                </div>
              );
            })}
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
    </div>
  );
}
