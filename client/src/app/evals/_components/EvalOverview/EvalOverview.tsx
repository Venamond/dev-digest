/* The all-agents landing view of the Eval Dashboard (design AgentEvalOverview):
   every agent's latest eval at a glance plus a cross-agent recent-runs feed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, SectionLabel, Sparkline } from "@devdigest/ui";
import type { EvalFeedRow } from "@devdigest/shared";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { useEvalOverview, useStartAllEvalRuns } from "@/lib/hooks/eval";
import { s } from "./styles";

/** `2026-08-29T09:12:04.000Z` → `2026-08-29 09:12`, stable across time zones. */
export function formatRanAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** A ratio as a whole percentage, or an em dash when the denominator was zero. */
export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/**
 * The mockup's `MiniBar`: a filled track plus its right-aligned percentage.
 *
 * Exported because the per-agent runs table draws the same cell. It is not
 * `BarRow` from `@devdigest/ui`: that primitive fixes a 150px label column, so
 * inside these 7- and 8-column grids it forces the row past the 980px container
 * and leaves an empty label cell the design does not have.
 */
export function MetricBar({ value, color }: { value: number | null | undefined; color: string }) {
  return (
    <div style={s.bar}>
      <div style={s.barTrack}>
        <div
          style={{
            width: `${(value ?? 0) * 100}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
      <span className="mono tnum" style={s.barValue}>
        {pct(value)}
      </span>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div style={s.mini}>
      <div style={s.miniLabel}>{label}</div>
      <div className="tnum" style={{ ...s.miniValue, color }}>
        {pct(value)}
      </div>
    </div>
  );
}

/** Newest first — the feed is read top-down as "what happened last". */
function byNewest(a: EvalFeedRow, b: EvalFeedRow): number {
  return (b.ran_at ?? "").localeCompare(a.ran_at ?? "");
}

export function EvalOverview({ onOpen }: { onOpen: (agentId: string) => void }) {
  const t = useTranslations("eval.overview");
  const { data, isLoading } = useEvalOverview();
  const startAll = useStartAllEvalRuns();
  const [confirming, setConfirming] = React.useState(false);

  const agents = Array.isArray(data?.agents) ? data.agents : [];
  const recent = (Array.isArray(data?.recent_runs) ? [...data.recent_runs] : []).sort(byNewest);
  const agentName = (id: string) => agents.find((a) => a.agent_id === id)?.agent_name ?? id;

  // What `Run all agents` will spend: one model call per case, per agent
  // (AC-64). The row's own `cases_total` is the agent's real case count, so an
  // agent whose set was just authored and never run still states its calls; the
  // latest batch is only the fallback for a payload without the field.
  const calls = agents.reduce((n, a) => n + (a.cases_total ?? a.latest?.cases_total ?? 0), 0);

  return (
    <div style={s.page}>
      {confirming && (
        <EvalRunConfirm
          calls={calls}
          label={t("allAgentsLabel", { count: agents.length })}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            startAll.mutate();
          }}
        />
      )}

      <div style={s.headerRow}>
        <div>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>
        <div style={s.headerActions}>
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={agents.length === 0 || startAll.isPending}
            onClick={() => setConfirming(true)}
          >
            {t("runAll")}
          </Button>
        </div>
      </div>

      <SectionLabel icon="Cpu">{t("agentsSection")}</SectionLabel>
      {isLoading && <div style={s.state}>{t("loading")}</div>}
      {!isLoading && agents.length === 0 && <div style={s.state}>{t("empty")}</div>}
      <div style={s.agentList}>
        {agents.map(({ agent_id, agent_name, model, latest, recall_trend }) => (
          <button
            key={agent_id}
            type="button"
            aria-label={t("openAgent", { name: agent_name })}
            onClick={() => onOpen(agent_id)}
            style={s.agentRow}
          >
            <div style={s.agentIcon}>
              <Icon.Cpu size={17} />
            </div>
            <div style={s.agentText}>
              <div style={s.agentTitleRow}>
                <span style={s.agentName}>{agent_name}</span>
                <span className="mono" style={s.modelChip}>
                  {model}
                </span>
              </div>
              <div style={s.agentSub}>
                {latest
                  ? t("lastRun", {
                      version: latest.agent_version,
                      ranAt: formatRanAt(latest.ran_at ?? latest.started_at),
                      passed: latest.traces_passed ?? 0,
                      produced: latest.traces_produced ?? 0,
                    })
                  : t("noRuns")}
              </div>
            </div>
            {latest && (
              <span data-testid={`sparkline-${agent_id}`}>
                <Sparkline
                  data={Array.isArray(recall_trend) ? recall_trend : []}
                  color="var(--accent)"
                  w={60}
                  h={24}
                />
              </span>
            )}
            <Mini label={t("mini.recall")} value={latest?.recall ?? null} color="var(--accent)" />
            <Mini label={t("mini.precision")} value={latest?.precision ?? null} color="var(--ok)" />
            <Mini
              label={t("mini.citation")}
              value={latest?.citation_accuracy ?? null}
              color="var(--warn)"
            />
            <Icon.ChevronRight size={18} style={s.chevron} />
          </button>
        ))}
      </div>

      <SectionLabel icon="History">{t("recentSection")}</SectionLabel>
      <div style={s.feed} data-testid="eval-feed">
        {recent.map((r, i) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.agent_id)}
            style={{
              ...s.feedRow,
              border: "none",
              borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <span style={s.feedAgent}>{r.agent_name || agentName(r.agent_id)}</span>
            {/* `All (N)` for a set run, the case's own name for a trial — the
                column that tells the two apart. */}
            <span style={s.feedCase} title={r.case_label}>
              {r.case_label}
            </span>
            <span className="mono" style={s.feedRanAt}>
              {formatRanAt(r.ran_at)}
            </span>
            {/* A trial snapshots no agent version, so it has none to show. */}
            <span className="mono" style={s.feedVersion}>
              {r.agent_version == null ? "—" : `v${r.agent_version}`}
            </span>
            <MetricBar value={r.recall} color="var(--accent)" />
            <MetricBar value={r.precision} color="var(--ok)" />
            <MetricBar value={r.citation_accuracy} color="var(--warn)" />
            <span className="tnum" style={s.feedPass}>
              {r.passed == null || r.total == null ? "—" : `${r.passed}/${r.total}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
