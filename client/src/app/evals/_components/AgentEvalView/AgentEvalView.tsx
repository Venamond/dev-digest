/* One agent's eval view (design ScreenEval, agent view): metric cards with
   deltas, the metric trend, and the run history two of whose rows can be
   compared side by side. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dropdown,
  Icon,
  LineChart,
  MetricCard,
  SectionLabel,
} from "@devdigest/ui";
import type { EvalRunBatch } from "@devdigest/shared";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { evalRunInFlight } from "@/lib/eval-run-state";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEvalDashboard, useEvalRuns, useStartEvalRun } from "@/lib/hooks/eval";
import { queryKeys } from "@/lib/hooks/keys";
import { useRunEvents } from "@/lib/hooks/reviews";
import { formatRanAt, MetricBar, pct } from "../EvalOverview/EvalOverview";
import { RunCompare } from "../RunCompare/RunCompare";
import { s } from "./styles";

const WINDOW_DAYS = 30;

/** A metric card's value: a whole percentage, or an em dash with no denominator. */
function cardValue(v: number | null | undefined): string {
  return pct(v);
}

export function AgentEvalView({
  agentId,
  onBack,
  onPickAgent,
}: {
  agentId: string;
  onBack: () => void;
  onPickAgent: (id: string) => void;
}) {
  const t = useTranslations("eval.agentView");
  const qc = useQueryClient();
  const { data: dash, isLoading } = useAgentEvalDashboard(agentId);
  const { data: runs } = useEvalRuns(agentId);
  const { data: agents } = useAgents();
  const startRun = useStartEvalRun();

  const [confirming, setConfirming] = React.useState(false);
  const [windowed, setWindowed] = React.useState(false);
  const [sel, setSel] = React.useState<string[]>([]);
  const [cmp, setCmp] = React.useState<[EvalRunBatch, EvalRunBatch] | null>(null);
  const [startedId, setStartedId] = React.useState<string | null>(null);

  const runList = Array.isArray(runs) ? runs : [];
  const latest = runList[0];
  const prev = runList[1];
  const inFlight = evalRunInFlight(runList);
  const streamId = startedId ?? inFlight?.id ?? null;
  const { running } = useRunEvents(streamId ? [streamId] : []);

  // A finished stream is the only signal that the batch's row exists; refetch
  // the two queries that render it rather than remounting the view.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      setStartedId(null);
      qc.invalidateQueries({ queryKey: queryKeys.evalRuns(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
    }
  }, [running, qc, agentId]);

  const trend = Array.isArray(dash?.trend) ? dash.trend : [];
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // The window narrows the chart and NOTHING else: an older run stays in the
  // table, and stays selectable for a comparison.
  const points = windowed ? trend.filter((p) => Date.parse(p.ran_at) >= cutoff) : trend;

  // The regression alert reads the two newest runs, not the agent's current
  // prompt: a run's metrics are frozen on its batch.
  const drop =
    latest?.precision != null && prev?.precision != null && latest.precision < prev.precision
      ? Math.abs(Math.round((latest.precision - prev.precision) * 100))
      : null;

  const toggleRun = (id: string) =>
    setSel((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : [cur[1]!, id],
    );

  const openCompare = () => {
    const picked = sel
      .map((id) => runList.find((r) => r.id === id))
      .filter((r): r is EvalRunBatch => !!r);
    if (picked.length === 2) setCmp([picked[0]!, picked[1]!]);
  };

  const busy = !!inFlight || !!startedId || startRun.isPending;
  const casesTotal = dash?.cases_total ?? latest?.cases_total ?? 0;

  return (
    <div style={s.page}>
      {confirming && (
        <EvalRunConfirm
          calls={casesTotal}
          label={dash?.agent_name ?? ""}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            startRun.mutate(
              { agentId },
              { onSuccess: (started) => setStartedId(started.run_id) },
            );
          }}
        />
      )}
      {cmp && (
        <RunCompare a={cmp[0]} b={cmp[1]} casesTotal={casesTotal} onClose={() => setCmp(null)} />
      )}

      <button type="button" onClick={onBack} style={s.back}>
        <Icon.ChevronLeft size={16} />
        {t("back")}
      </button>

      <div style={s.headerRow}>
        <div>
          <h1 style={s.h1}>
            {dash?.agent_name ?? ""}
            <span className="mono" style={s.modelChip}>
              {dash?.model ?? ""}
            </span>
          </h1>
          <p style={s.subtitle}>
            {t("subtitle", { runs: runList.length, cases: casesTotal })}
          </p>
        </div>
        <div style={s.headerActions}>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="secondary" size="sm" icon="Cpu" iconRight="ChevronDown">
                {dash?.agent_name ?? ""}
              </Button>
            }
            items={(Array.isArray(agents) ? agents : []).map((a) => ({
              label: a.name,
              icon: "Cpu" as const,
              onClick: () => {
                setSel([]);
                setCmp(null);
                onPickAgent(a.id);
              },
            }))}
          />
          <Button
            kind={windowed ? "secondary" : "ghost"}
            size="sm"
            icon="Calendar"
            aria-pressed={windowed}
            onClick={() => setWindowed((w) => !w)}
          >
            {t("window")}
          </Button>
          {busy ? (
            <Button kind="primary" size="sm" loading disabled>
              {t("running", {
                index: inFlight?.progress_index ?? 0,
                total: inFlight?.progress_total ?? casesTotal,
              })}
            </Button>
          ) : (
            <Button kind="primary" size="sm" icon="Play" onClick={() => setConfirming(true)}>
              {t("runEval")}
            </Button>
          )}
        </div>
      </div>

      {drop != null && latest && (
        <div style={s.alert}>
          <Icon.AlertTriangle size={16} style={{ color: "var(--warn)" }} />
          <span style={s.alertText}>
            <b style={s.alertStrong}>
              {t("alert", { points: drop, version: latest.agent_version })}
            </b>
            {t("alertTail")}
          </span>
        </div>
      )}

      <div style={s.cards}>
        <MetricCard
          label={t("metrics.recall")}
          value={cardValue(dash?.current.recall)}
          delta={dash?.delta.recall ?? undefined}
          color="var(--accent)"
          trend={points.map((p) => p.recall)}
        />
        <MetricCard
          label={t("metrics.precision")}
          value={cardValue(dash?.current.precision)}
          delta={dash?.delta.precision ?? undefined}
          color="var(--ok)"
          trend={points.map((p) => p.precision)}
        />
        <MetricCard
          label={t("metrics.citation")}
          value={cardValue(dash?.current.citation_accuracy)}
          delta={dash?.delta.citation_accuracy ?? undefined}
          color="var(--warn)"
          trend={points.map((p) => p.citation_accuracy)}
        />
      </div>
      {latest && (
        <div style={s.completion}>
          {/* A run that did not complete every case says so here, in the same
              wording the agent editor's Evals tab uses. */}
          {t(latest.state === "partial" ? "completionPartial" : "completion", {
            produced: latest.traces_produced ?? 0,
            total: latest.cases_total,
          })}
        </div>
      )}

      <div style={s.card}>
        <div style={s.cardHead}>
          <SectionLabel icon="TrendingUp">{t("metricTrend")}</SectionLabel>
          <div style={s.legend}>
            {(
              [
                [t("legend.recall"), "var(--accent)"],
                [t("legend.precision"), "var(--ok)"],
                [t("legend.citation"), "var(--warn)"],
              ] as const
            ).map(([label, color]) => (
              <span key={label} style={s.legendItem}>
                <span style={{ width: 10, height: 2, background: color, borderRadius: 2 }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div data-testid="trend-chart" data-points={points.length}>
          <LineChart
            series={[
              { name: t("legend.recall"), data: points.map((p) => p.recall), color: "var(--accent)" },
              {
                name: t("legend.precision"),
                data: points.map((p) => p.precision),
                color: "var(--ok)",
              },
              {
                name: t("legend.citation"),
                data: points.map((p) => p.citation_accuracy),
                color: "var(--warn)",
              },
            ]}
            w={900}
            h={200}
          />
        </div>
      </div>

      <div style={s.runsHead}>
        <SectionLabel icon="History">{t("recentRuns")}</SectionLabel>
        <span style={s.affordance}>
          {sel.length === 0 ? t("selectTwo") : t("selected", { count: sel.length })}
        </span>
        <div style={s.runsActions}>
          <Button
            kind={sel.length === 2 ? "primary" : "ghost"}
            size="sm"
            icon="GitMerge"
            disabled={sel.length !== 2}
            title={sel.length === 2 ? undefined : t("compareHint")}
            onClick={openCompare}
          >
            {t("compare")}
          </Button>
        </div>
      </div>

      <div style={s.table} data-testid="runs-table">
        <div style={s.thead}>
          {[
            t("table.select"),
            t("table.ranAt"),
            t("table.version"),
            t("table.recall"),
            t("table.precision"),
            t("table.citation"),
            t("table.pass"),
            t("table.cost"),
          ].map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
        {isLoading && <div style={s.state}>{t("loading")}</div>}
        {!isLoading && runList.length === 0 && <div style={s.state}>{t("noRuns")}</div>}
        {runList.map((r, i) => {
          const on = sel.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleRun(r.id)}
              style={{
                ...s.row,
                background: on ? "var(--bg-hover)" : "transparent",
                borderBottom: i < runList.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div
                style={{
                  ...s.checkbox,
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                  background: on ? "var(--accent)" : "transparent",
                }}
              >
                {on && <Icon.Check size={11} style={{ color: "#fff" }} />}
              </div>
              <span className="mono" style={s.ranAt}>
                {formatRanAt(r.ran_at ?? r.started_at)}
              </span>
              <span className="mono" style={s.version}>
                v{r.agent_version}
              </span>
              <MetricBar value={r.recall} color="var(--accent)" />
              <MetricBar value={r.precision} color="var(--ok)" />
              <MetricBar value={r.citation_accuracy} color="var(--warn)" />
              <span className="tnum" style={s.pass}>
                {r.traces_passed ?? 0}/{r.traces_produced ?? 0}
              </span>
              <span className="mono tnum" style={s.cost}>
                {r.cost_usd == null ? "—" : `$${r.cost_usd.toFixed(2)}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
