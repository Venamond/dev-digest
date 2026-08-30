/* EvalsTab — the agent's eval metrics and its case set (mockup `EvalsTab`,
   img/mockup-src/screen_agents.jsx:157-179, metric strip at :139-155).

   Two things the mockup does not draw and the spec requires: the run's
   completion count (AC-45, AC-50) and the in-flight state (AC-37…AC-39). Both
   affordances that spend money — `Run all evals` and a row's `Play` — read the
   ONE in-flight predicate (`evalRunInFlight`) and route through the ONE spend
   confirmation (`EvalRunConfirm`, AC-64). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, Icon, Modal, MonoLink, SectionLabel } from "@devdigest/ui";
import type { Agent, EvalCase, EvalCaseWithLastRun, EvalRunRecord } from "@devdigest/shared";
import { queryKeys } from "@/lib/hooks/keys";
import {
  useAgentEvalDashboard,
  useDeleteEvalCase,
  useEvalCases,
  useEvalRun,
  useEvalRuns,
  useRunEvalCase,
  useStartEvalRun,
} from "@/lib/hooks/eval";
import { useRunEvents } from "@/lib/hooks/reviews";
import { evalRunInFlight } from "@/lib/eval-run-state";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { EvalCaseEditor } from "@/components/eval-case-editor/EvalCaseEditor";
import { EvalCaseRow } from "./EvalCaseRow";
import { s } from "./styles";

/** A metric as a whole percent, or an em dash when the denominator was zero. */
function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/** `{index, total}` carried on a progress RunEvent — the batch's own position. */
function eventPosition(data: unknown): { index: number; total: number } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { index?: unknown; total?: unknown };
  return typeof d.index === "number" && typeof d.total === "number"
    ? { index: d.index, total: d.total }
    : null;
}

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval.evalsTab");
  const router = useRouter();
  const qc = useQueryClient();

  const dash = useAgentEvalDashboard(agent.id);
  const runs = useEvalRuns(agent.id);
  const cases = useEvalCases(agent.id);
  const latestBatch = runs.data?.[0];
  const detail = useEvalRun(latestBatch?.id);

  const inFlight = evalRunInFlight(runs.data);
  const { events, running } = useRunEvents(inFlight ? [inFlight.id] : []);

  const startRun = useStartEvalRun();
  const runCase = useRunEvalCase();
  /* Which row is executing. `runCase.isPending` alone cannot say WHICH case,
     so every row would spin at once; the id is what makes the feedback belong
     to the button that was pressed. */
  const [runningCase, setRunningCase] = React.useState<string | null>(null);
  const deleteCase = useDeleteEvalCase();

  const [confirm, setConfirm] = React.useState<{ calls: number; label: string; run: () => void } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCase | null>(null);
  const [editing, setEditing] = React.useState<{ evalCase: EvalCaseWithLastRun | null } | null>(
    null,
  );
  // A trial writes no batch row, so its result reaches the row from the
  // mutation's own answer until the case set is refetched.
  const [trials, setTrials] = React.useState<Record<string, EvalRunRecord>>({});

  // AC-40: the run's own stream is what tells this screen the history changed —
  // no reload, no poll.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (running) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      qc.invalidateQueries({ queryKey: queryKeys.evalRuns(agent.id) });
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agent.id) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agent.id) });
    }
  }, [running, agent.id, qc]);

  const caseList = cases.data ?? [];
  // Precedence, weakest first: the newest batch's per-case rows, then the
  // server's own `last_run` — the execution that touched the case most
  // recently, set run OR trial, and the only one that survives a remount
  // (AC-63) — then a trial fired in this mount, which lands before the case
  // set has been refetched.
  //
  // `trials` is never cleared, so it outlives the mount's later set runs. It
  // therefore wins on RECENCY, not on being last in this list: overwriting
  // unconditionally would let a stale trial replace a newer set-run result for
  // the same case, which is the same defect AC-63 names, mirrored.
  const results = new Map<string, EvalRunRecord>();
  for (const r of detail.data?.results ?? []) results.set(r.case_id, r);
  for (const c of caseList) if (c.last_run) results.set(c.id, c.last_run);
  for (const [caseId, r] of Object.entries(trials)) {
    const held = results.get(caseId);
    if (!held || r.ran_at >= held.ran_at) results.set(caseId, r);
  }

  const ran = caseList.filter((c) => results.has(c.id)).length;
  const passed = caseList.filter((c) => {
    const r = results.get(c.id);
    return r ? (r.outcome ?? (r.pass ? "passed" : "failed")) === "passed" : false;
  }).length;

  const position = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const p = eventPosition(events[i]?.data);
      if (p) return p;
    }
    return inFlight ? { index: inFlight.progress_index, total: inFlight.progress_total } : null;
  })();

  const metrics: Array<{ label: string; value: string; delta: number | null; color: string }> = [
    {
      label: t("metrics.recall"),
      value: pct(dash.data?.current.recall),
      delta: dash.data?.delta.recall ?? null,
      color: "var(--accent)",
    },
    {
      label: t("metrics.precision"),
      value: pct(dash.data?.current.precision),
      delta: dash.data?.delta.precision ?? null,
      color: "var(--ok)",
    },
    {
      label: t("metrics.citationAccuracy"),
      value: pct(dash.data?.current.citation_accuracy),
      delta: dash.data?.delta.citation_accuracy ?? null,
      color: "var(--warn)",
    },
    {
      label: t("metrics.tracesPassed"),
      value:
        latestBatch?.traces_passed == null || latestBatch?.traces_produced == null
          ? "—"
          : `${latestBatch.traces_passed}/${latestBatch.traces_produced}`,
      delta: null,
      color: "var(--text-secondary)",
    },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <SectionLabel icon="Gauge">{t("metricsTitle")}</SectionLabel>
        <div style={s.headerRight}>
          <MonoLink onClick={() => router.push(`/evals?agent=${agent.id}`)}>
            {t("viewDashboard")}
          </MonoLink>
        </div>
      </div>

      <div style={s.strip}>
        {metrics.map((m) => (
          <div key={m.label} style={s.card}>
            <div style={s.cardLabel}>{m.label}</div>
            <div style={s.cardValueRow}>
              <span className="tnum" style={s.cardValue(m.color)}>
                {m.value}
              </span>
              {m.delta != null && (
                <span className="tnum" style={s.cardDelta(m.delta >= 0)}>
                  {`${m.delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(m.delta * 100))}pt`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Metrics come from SET runs; a single-case trial writes no batch
          (AC-62), so a tab where only `Play` has been pressed shows four em
          dashes and no reason. Saying why is the difference between "not
          measured yet" and "broken". */}
      {!latestBatch && (
        <div style={s.note}>
          <Icon.Info size={12} />
          {t("metricsNeedSetRun")}
        </div>
      )}
      <div style={s.note}>
        <Icon.Code size={12} />
        {t("scoringNote")}
      </div>
      {latestBatch && (
        <div style={s.completion}>
          {t(latestBatch.state === "partial" ? "completionPartial" : "completion", {
            ran: latestBatch.traces_produced ?? 0,
            total: latestBatch.cases_total,
          })}
        </div>
      )}

      <div style={s.casesHeader}>
        <h2 style={s.casesTitle}>{t("casesHeading")}</h2>
        {caseList.length > 0 && (
          <Badge
            color={passed === ran ? "var(--ok)" : "var(--warn)"}
            bg={passed === ran ? "var(--ok-bg)" : "var(--warn-bg)"}
          >
            {t("passingBadge", { passed, ran })}
          </Badge>
        )}
        <Badge color="var(--text-muted)">{t("casesBadge", { count: caseList.length })}</Badge>
        <div style={s.casesActions}>
          {inFlight ? (
            <>
              <span className="tnum" style={s.progress}>
                {t("progress", { index: position?.index ?? 0, total: position?.total ?? inFlight.progress_total })}
              </span>
              <Button kind="secondary" size="sm" icon="Play" loading disabled>
                {t("running")}
              </Button>
            </>
          ) : (
            <Button
              kind="secondary"
              size="sm"
              icon="Play"
              disabled={caseList.length === 0}
              onClick={() =>
                setConfirm({
                  calls: caseList.length,
                  label: agent.name,
                  run: () => startRun.mutate({ agentId: agent.id }),
                })
              }
            >
              {t("runAll")}
            </Button>
          )}
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing({ evalCase: null })}>
            {t("newCase")}
          </Button>
        </div>
      </div>

      {caseList.length === 0 ? (
        <EmptyState icon="FlaskConical" title={t("emptyTitle")} body={t("emptyCases")} />
      ) : (
        caseList.map((c, i) => (
          <EvalCaseRow
            key={c.id}
            evalCase={c}
            last={results.get(c.id)}
            disabled={!!inFlight}
            /* Busy when this row's own trial is running, and — during a set
               run — for every case the batch has not reached yet. The runner
               walks the set in list order and publishes its position, so a row
               at or beyond that index is still to come; rows behind it are
               done and show their result instead. Without this the whole list
               sat inert while a set run worked through it. */
            busy={runningCase === c.id || (!!inFlight && i >= (position?.index ?? 0))}
            onRun={() =>
              setConfirm({
                calls: 1,
                label: c.name,
                run: () => {
                  setRunningCase(c.id);
                  runCase.mutate(
                    { id: c.id, agentId: agent.id },
                    {
                      onSuccess: (rec) => setTrials((prev) => ({ ...prev, [c.id]: rec })),
                      // `onSettled`, not `onSuccess`: a failed run must clear
                      // the spinner too, or the row spins for ever.
                      onSettled: () => setRunningCase(null),
                    },
                  );
                },
              })
            }
            onEdit={() => setEditing({ evalCase: c })}
            onDelete={() => setPendingDelete(c)}
          />
        ))
      )}

      {confirm && (
        <EvalRunConfirm
          calls={confirm.calls}
          label={confirm.label}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {pendingDelete && (
        <Modal
          width={460}
          title={t("deleteTitle")}
          onClose={() => setPendingDelete(null)}
          footer={
            <div style={s.confirmFooter}>
              <Button kind="tertiary" onClick={() => setPendingDelete(null)}>
                {t("deleteCancel")}
              </Button>
              <Button
                kind="danger"
                onClick={() => {
                  deleteCase.mutate({ id: pendingDelete.id, agentId: agent.id });
                  setPendingDelete(null);
                }}
              >
                {t("deleteConfirm")}
              </Button>
            </div>
          }
        >
          <div style={s.confirmBody}>
            <div style={s.confirmText}>{t("deleteBody", { name: pendingDelete.name })}</div>
            <div style={s.confirmNote}>{t("deleteHistoryNote")}</div>
          </div>
        </Modal>
      )}

      {editing && (
        <EvalCaseEditor
          agentId={agent.id}
          agentName={agent.name}
          evalCase={editing.evalCase}
          // The same result the case row shows — server-recorded or a trial
          // fired here (AC-63).
          lastRun={editing.evalCase ? (results.get(editing.evalCase.id) ?? null) : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
