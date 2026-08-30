/* EvalsTab — a skill's eval case set (screen A of the track-F reference,
   transcribed in the plan's `## 2d`; the frames themselves no longer exist, so
   that transcription and this file's element checklist are the design record).

   Two things this screen deliberately does NOT have, both because the
   reference draws neither: a metric strip (no RECALL / PRECISION / CITATION
   cards) and a run history. A skill eval writes no `eval_run_batches` row —
   each execution is one `eval_runs` row with `batch_id NULL` — so there is no
   batch to render and no SSE stream to subscribe to.

   One case is TWO paid model calls, with the skill's body and without it, so
   every control that spends states the doubled number through the shared
   `EvalRunConfirm`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, Icon, Modal } from "@devdigest/ui";
import type { EvalRunRecord, EvalSkillCaseRow, Skill } from "@devdigest/shared";
import { queryKeys } from "@/lib/hooks/keys";
import { useDeleteEvalCase, useRunSkillEvalCase, useSkillEvalCases } from "@/lib/hooks/eval";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { SkillEvalCaseEditor } from "@/components/skill-eval-case-editor/SkillEvalCaseEditor";
import { SkillEvalCaseRow } from "./SkillEvalCaseRow";
import { s } from "./styles";

/** Two model calls per case — the number every spend confirmation states. */
const CALLS_PER_CASE = 2;

export function EvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("eval.skillEvalsTab");
  const qc = useQueryClient();

  const cases = useSkillEvalCases(skill.id);
  const runCase = useRunSkillEvalCase();
  const deleteCase = useDeleteEvalCase();

  const [confirm, setConfirm] = React.useState<{
    calls: number;
    label: string;
    run: () => void;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<EvalSkillCaseRow | null>(null);
  const [editing, setEditing] = React.useState<{ evalCase: EvalSkillCaseRow | null } | null>(null);
  // A run answers with the row it wrote. Holding it here shows the result
  // immediately, before the invalidated case list has come back.
  const [trials, setTrials] = React.useState<Record<string, EvalRunRecord>>({});
  const [runningAll, setRunningAll] = React.useState<{ index: number; total: number } | null>(null);

  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const caseList = cases.data ?? [];

  /* Decision 3: a skill case runs on the first ENABLED agent the skill is
     linked to, resolved server-side and carried on every row. Rendering the
     name is the point — a number whose origin is invisible is not a
     measurement. */
  const agentName = caseList.find((c) => c.agent_name)?.agent_name ?? null;
  const noAgent = caseList.length > 0 && caseList.every((c) => !c.agent_id);

  const results = new Map<string, EvalRunRecord>();
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

  function recordTrial(caseId: string, rec: EvalRunRecord) {
    setTrials((prev) => ({ ...prev, [caseId]: rec }));
  }

  /* There is no set-run route for a skill — the server exposes one case at a
     time — and the resolved agent refuses a second run while one is in flight,
     so the set is run SEQUENTIALLY from here. A case that fails does not stop
     the ones after it. */
  async function runAll() {
    const list = caseList;
    setRunningAll({ index: 0, total: list.length });
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      if (!c || !mounted.current) return;
      setRunningAll({ index: i, total: list.length });
      try {
        const rec = await runCase.mutateAsync({ id: c.id, skillId: skill.id });
        if (mounted.current) recordTrial(c.id, rec);
      } catch {
        // The row keeps its previous result; the next case still runs.
      }
    }
    if (mounted.current) setRunningAll(null);
  }

  return (
    <div style={s.wrap}>
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
          {runningAll ? (
            <>
              <span className="tnum" style={s.progress}>
                {t("progress", { index: runningAll.index + 1, total: runningAll.total })}
              </span>
              <Button kind="secondary" size="sm" icon="Play" loading disabled>
                {t("running")}
              </Button>
            </>
          ) : (
            /* No enabled agent means nothing can run the set: the control is
               not offered at all, and the notice below says why. A dead
               control that fails on press is worse than a stated reason. */
            !noAgent && (
              <Button
                kind="secondary"
                size="sm"
                icon="Play"
                disabled={caseList.length === 0}
                onClick={() =>
                  setConfirm({
                    calls: caseList.length * CALLS_PER_CASE,
                    label: skill.name,
                    run: () => void runAll(),
                  })
                }
              >
                {t("runAll")}
              </Button>
            )
          )}
          <Button
            kind="primary"
            size="sm"
            icon="Plus"
            onClick={() => setEditing({ evalCase: null })}
          >
            {t("newCase")}
          </Button>
        </div>
      </div>

      {agentName && (
        <div style={s.agentLine}>
          <Icon.Cpu size={12} />
          {t("agentLine", { agent: agentName })}
        </div>
      )}

      {noAgent && (
        <div style={s.noAgent}>
          <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span style={s.noAgentText}>
            <b style={s.noAgentTitle}>{t("noAgentTitle")}</b>
            {t("noAgentBody")}
          </span>
        </div>
      )}

      {/* Why a `must find` row can be red at `100% / 100%`. Measured on this
          repository (`server/INSIGHTS.md:210-233`): a linked skill changes a
          finding's CONTENT, not the finding COUNT, so this is the common
          outcome and the screen must account for it. */}
      <div style={s.twoSidedNote}>
        <Icon.Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
        {t("twoSidedNote")}
      </div>

      {caseList.length === 0 ? (
        <EmptyState icon="FlaskConical" title={t("emptyTitle")} body={t("emptyCases")} />
      ) : (
        caseList.map((c) => (
          <SkillEvalCaseRow
            key={c.id}
            row={c}
            last={results.get(c.id) ?? null}
            disabled={!!runningAll || !c.agent_id}
            onRun={() =>
              setConfirm({
                calls: CALLS_PER_CASE,
                label: c.name,
                run: () =>
                  runCase.mutate(
                    { id: c.id, skillId: skill.id },
                    { onSuccess: (rec) => recordTrial(c.id, rec) },
                  ),
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
                  // The route is owner-generic, so the shipped hook is reused;
                  // only the list it feeds is this skill's, so that key is
                  // invalidated here rather than inside the shared hook.
                  deleteCase.mutate(
                    // No `agentId`: a skill case has no agent-scoped list.
                    { id: pendingDelete.id },
                    {
                      onSuccess: () =>
                        qc.invalidateQueries({ queryKey: queryKeys.skillEvalCases(skill.id) }),
                    },
                  );
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
        <SkillEvalCaseEditor
          skillId={skill.id}
          skillName={skill.name}
          evalCase={editing.evalCase}
          agentName={agentName}
          hasAgent={!noAgent && (editing.evalCase ? !!editing.evalCase.agent_id : true)}
          lastRun={editing.evalCase ? (results.get(editing.evalCase.id) ?? null) : null}
          onRan={(rec) => editing.evalCase && recordTrial(editing.evalCase.id, rec)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
