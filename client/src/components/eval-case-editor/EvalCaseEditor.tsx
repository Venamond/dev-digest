/* EvalCaseEditor — author or edit one eval case (mockup `EvalCaseEditor`,
   img/mockup-src/screen_ciruns_and_eval_case_editor.jsx:56-104).

   It lives in `src/components/` rather than in a feature folder because two
   routes open it: the agent editor's Evals tab and a finding on the
   pull-request page (`Turn into eval case`). Departures from the mockup, each
   forced by a criterion, are marked inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  FormField,
  Icon,
  Modal,
  Tabs,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type {
  EvalCase,
  EvalCaseInput,
  EvalCaseSeed,
  EvalExpectation,
  EvalRunRecord,
} from "@devdigest/shared";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { formatUsd } from "@/components/cost-badge";
import { s } from "./styles";

export interface EvalCaseEditorProps {
  /** The agent the case belongs to — a case set is per agent. */
  agentId: string;
  agentName?: string;
  /** The stored case being edited, or null/undefined for a new one. */
  evalCase?: EvalCase | null;
  /** An unsaved seed built server-side from a real finding. */
  seed?: EvalCaseSeed | null;
  /** The execution that last touched this case, set run or trial (AC-63). */
  lastRun?: EvalRunRecord | null;
  onClose: () => void;
}

interface MetaShape {
  title?: unknown;
  body?: unknown;
  linked_issue?: unknown;
}

interface FileShape {
  path: string;
  content: string;
}

/** Read `input_files` defensively: it is `unknown` on the contract. */
function readFiles(input: unknown): FileShape[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const r = f as Record<string, unknown>;
    const path = typeof r.path === "string" ? r.path : typeof r.file === "string" ? r.file : null;
    if (!path) return [];
    const content =
      typeof r.content === "string" ? r.content : typeof r.patch === "string" ? r.patch : "";
    return [{ path, content }];
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function diffLineKind(l: string): "add" | "del" | "hunk" | "plain" {
  if (l.startsWith("@@")) return "hunk";
  if (l.startsWith("+") && !l.startsWith("+++")) return "add";
  if (l.startsWith("-") && !l.startsWith("---")) return "del";
  return "plain";
}

/** A paid call's cost never rounds to a bare `$0.000` unless it really is zero. */
function money(cost: number | null | undefined): string | null {
  return cost == null ? null : formatUsd(cost);
}

const EMPTY_FINDING = {
  severity: "WARNING",
  category: "correctness",
  title: "",
  file: "",
  start_line: 0,
};

export function EvalCaseEditor({
  agentId,
  agentName,
  evalCase,
  seed,
  lastRun,
  onClose,
}: EvalCaseEditorProps) {
  const t = useTranslations("eval.caseEditor");

  /* The seed's disposition only DEFAULTS the kind — it does not fix it. A case
     authored through `New eval case` has no disposition at all, so deriving
     the kind meant the agent editor could only ever produce `must_find` and a
     hand-written negative case was unreachable (the reference recording has
     one). The server has always accepted `expectation` on create and update. */
  const [expectation, setExpectation] = React.useState<EvalExpectation>(
    evalCase?.expectation ?? seed?.expectation ?? "must_find",
  );
  const negative = expectation === "must_not_flag";
  const inputDiff = evalCase?.input_diff ?? seed?.input_diff ?? "";
  const inputFiles = readFiles(evalCase?.input_files ?? seed?.input_files);
  const meta = (evalCase?.input_meta ?? seed?.input_meta ?? {}) as MetaShape;

  const [name, setName] = React.useState(evalCase?.name ?? seed?.name ?? "");
  /* A case seeded from a real finding carries the pull request's own diff, and
     editing that would describe a review that never happened — it stays the
     read-only pane the mockup draws. A hand-authored case has no such source,
     so its diff is a field; without one `New eval case` (AC-7) can only ever
     save an empty input, which no run can score. */
  const authored = !seed && !evalCase?.seeded_from;
  const [diff, setDiff] = React.useState(inputDiff);
  const [expected, setExpected] = React.useState(() =>
    JSON.stringify(evalCase?.expected_output ?? seed?.expected_output ?? [], null, 2),
  );
  // OFF by default, unlike the mockup: it spends a paid model call on every
  // save, and AC-64 requires the cost be stated before the action starts.
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState("diff");
  const [activeFile, setActiveFile] = React.useState(0);
  const [confirm, setConfirm] = React.useState<{ calls: number; run: () => void } | null>(null);
  const [trial, setTrial] = React.useState<EvalRunRecord | null>(null);
  /* A seeded editor has no persisted case until something creates one. Once it
     does, the editor must ADOPT that row: otherwise every further press of
     `Run case` creates another case, and three identical rows landed in the set
     from one finding (observed 2026-08-29). `savedCase` is that adoption. */
  const [savedCase, setSavedCase] = React.useState<EvalCase | null>(null);
  const persisted = evalCase ?? savedCase;

  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const runCase = useRunEvalCase();

  const parsed = React.useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(expected) as unknown };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [expected]);
  const assertsEmpty = parsed.ok && Array.isArray(parsed.value) && parsed.value.length === 0;

  const result = trial ?? lastRun ?? null;
  const resultPassed = result ? (result.outcome ?? (result.pass ? "passed" : "failed")) === "passed" : false;

  function payload(): EvalCaseInput {
    return {
      owner_kind: "agent",
      owner_id: agentId,
      name,
      expectation,
      input_diff: authored ? diff : inputDiff,
      input_files: evalCase?.input_files ?? seed?.input_files ?? null,
      input_meta: evalCase?.input_meta ?? seed?.input_meta ?? null,
      expected_output: parsed.value,
      seeded_from: evalCase?.seeded_from ?? seed?.seeded_from ?? null,
      notes: evalCase?.notes ?? null,
    };
  }

  function fireTrial(caseId: string) {
    runCase.mutate(
      { id: caseId, agentId },
      { onSuccess: (rec) => setTrial(rec) },
    );
  }

  /* `Run case` on a case that has not been saved yet. A run needs a persisted
     case (the server runs by id), so this saves first and runs the row it gets
     back — which is what the reference does: the control is live on a freshly
     seeded case, not gated behind Save. `Run on save` is left alone, so the
     create fires exactly one trial either way. */
  function saveThenRun() {
    if (!parsed.ok || name.trim() === "") return;
    create.mutate(
      { agentId, input: payload() },
      {
        onSuccess: (created) => {
          setSavedCase(created);
          fireTrial(created.id);
        },
      },
    );
  }

  function save() {
    if (!parsed.ok || name.trim() === "") return;
    if (persisted) {
      update.mutate(
        { id: persisted.id, agentId, patch: payload() },
        {
          onSuccess: () => {
            if (runOnSave) fireTrial(persisted.id);
            else onClose();
          },
        },
      );
      return;
    }
    create.mutate(
      { agentId, input: payload() },
      {
        onSuccess: (created) => {
          setSavedCase(created);
          if (runOnSave) fireTrial(created.id);
          else onClose();
        },
      },
    );
  }

  /* A save with `Run on save` on spends a model call, so it is confirmed the
     same way a run control is (AC-64, AC-54). */
  function onSaveClick() {
    if (runOnSave) setConfirm({ calls: 1, run: save });
    else save();
  }

  const saving = create.isPending || update.isPending;
  const canSave = parsed.ok && name.trim() !== "" && !saving;

  return (
    <>
      <Modal
        width={920}
        title={t("caseTitle", { name: name || t("newCase") })}
        subtitle={
          seed
            ? t("subtitleSeeded", { disposition: seed.seeded_from.disposition })
            : t("subtitleUnseeded", { agent: agentName ?? "" })
        }
        onClose={onClose}
        bodyScroll={false}
        footer={
          <div style={s.footer}>
            <label style={s.runOnSave}>
              <Toggle on={runOnSave} onChange={setRunOnSave} size={15} />
              {t("runOnSave")}
            </label>
            <Button kind="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              kind="secondary"
              icon="Play"
              /* The primitive swaps the icon for a spinning RefreshCw when
                 `loading` is set (vendor/ui/primitives/Button.tsx:24,82) — the
                 in-flight animation the reference shows. Changing the label to
                 "Running…" alone left the button looking idle. */
              loading={runCase.isPending || create.isPending}
              disabled={!parsed.ok || name.trim() === ""}
              title={!parsed.ok || name.trim() === "" ? t("runCaseNeedsValid") : undefined}
              onClick={() =>
                setConfirm({
                  calls: 1,
                  run: () => (persisted ? fireTrial(persisted.id) : saveThenRun()),
                })
              }
            >
              {runCase.isPending ? t("running") : t("runCase")}
            </Button>
            <Button
              kind="primary"
              icon="Check"
              loading={saving}
              disabled={!canSave}
              title={parsed.ok ? undefined : t("saveNeedsValidJson")}
              onClick={onSaveClick}
            >
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        }
      >
        <div style={s.body}>
          <div style={s.left}>
            {/* Shown for a hand-authored case too, not only a seeded one: the
                reference draws the kind banner on an empty `New eval case`
                before anything is typed, and now that the kind is a control
                rather than a derived value the banner is what confirms which
                one is selected. A seeded case additionally spells out the
                assertion it was built from. */}
            <div style={s.banner(negative)}>
              {negative ? (
                <Icon.XCircle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
              ) : (
                <Icon.Target size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
              )}
              <span style={s.bannerText}>
                <b style={s.bannerKind(negative)}>
                  {negative ? t("negativeCase") : t("positiveCase")}
                </b>
                {seed?.assertion ?? (negative ? t("bannerUnseededNegative") : t("bannerUnseededPositive"))}
              </span>
            </div>
            <div style={s.namePad}>
              <FormField label={t("nameLabel")} required>
                <TextInput value={name} onChange={setName} mono placeholder={t("namePlaceholder")} />
              </FormField>
              <FormField label={t("expectationLabel")}>
                <div style={s.expectationTabs}>
                  {(["must_find", "must_not_flag"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-pressed={expectation === e}
                      style={s.expectationTab(expectation === e)}
                      onClick={() => setExpectation(e)}
                    >
                      {e === "must_find" ? t("mustFind") : t("mustNotFlag")}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>
            <div style={s.inputHeadingPad}>
              <div style={s.inputHeading}>{t("inputLabel")}</div>
            </div>
            <Tabs
              tabs={[
                { key: "diff", label: t("tabs.diff") },
                { key: "files", label: t("tabs.files") },
                { key: "prMeta", label: t("tabs.prMeta") },
              ]}
              value={tab}
              onChange={setTab}
              pad="0 16px"
            />
            <div style={tab === "diff" && authored ? s.tabBodyEditing : s.tabBody}>
              {tab === "diff" &&
                (authored ? (
                  <textarea
                    className="mono"
                    aria-label={t("tabs.diff")}
                    style={s.diffInput}
                    placeholder={t("diffPlaceholder")}
                    value={diff}
                    onChange={(e) => setDiff(e.target.value)}
                  />
                ) : (
                  <pre className="mono" style={s.diff}>
                    {inputDiff.split("\n").map((l, i) => (
                      <div key={i} style={s.diffLine(diffLineKind(l))}>
                        {l || " "}
                      </div>
                    ))}
                  </pre>
                ))}
              {/* Read-only: the stored input is what the case ran against (AC-53). */}
              {tab === "files" &&
                (inputFiles.length === 0 ? (
                  <div style={s.empty}>{t("noFiles")}</div>
                ) : (
                  <div style={s.filesWrap}>
                    <div style={s.fileList}>
                      {inputFiles.map((f, i) => (
                        <div
                          key={f.path}
                          className="mono"
                          style={s.fileItem(i === activeFile)}
                          onClick={() => setActiveFile(i)}
                        >
                          {f.path}
                        </div>
                      ))}
                    </div>
                    <pre className="mono" style={s.filePre}>
                      {inputFiles[activeFile]?.content ?? ""}
                    </pre>
                  </div>
                ))}
              {tab === "prMeta" && (
                <div>
                  <FormField label={t("titleLabel")}>
                    <div style={s.readOnlyValue}>{str(meta.title) || "—"}</div>
                  </FormField>
                  <FormField label={t("bodyLabel")}>
                    <div style={s.readOnlyValue}>{str(meta.body) || "—"}</div>
                  </FormField>
                  <FormField label={t("linkedIssueLabel")}>
                    <div className="mono" style={s.readOnlyValue}>
                      {str(meta.linked_issue) || "—"}
                    </div>
                  </FormField>
                </div>
              )}
            </div>
          </div>

          <div style={s.right}>
            <div style={s.expectedHeader}>
              <span style={s.expectedTitle}>
                {negative ? t("expectedNegative") : t("expectedOutput")}
              </span>
              {parsed.ok ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                  {assertsEmpty ? t("assertEmpty") : t("validJson")}
                </Badge>
              ) : (
                <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
                  {t("invalidJson")}
                </Badge>
              )}
              <div style={s.expectedActions}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="Plus"
                  disabled={!parsed.ok}
                  onClick={() => {
                    // Appends one skeleton and leaves the existing entries
                    // exactly as they were (AC-55).
                    const current = Array.isArray(parsed.value) ? parsed.value : [];
                    setExpected(JSON.stringify([...current, EMPTY_FINDING], null, 2));
                  }}
                >
                  {t("findingSkeleton")}
                </Button>
              </div>
            </div>
            <textarea
              className="mono"
              aria-label={t("expectedOutput")}
              style={s.expectedArea}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
            {/* Not on the agent mockup — the reference video shows it and the
                human asked for it on 2026-08-29. The verdict strip below says
                whether the run passed; this says what it actually produced,
                which is what a failing case needs to be diagnosed. */}
            <div style={s.actualPanel}>
              <div style={s.actualTitle}>{t("actualOutput")}</div>
              <div style={s.actualBox}>
                {result?.actual_output == null ? (
                  <div style={s.actualEmpty}>{t("neverRunYet")}</div>
                ) : (
                  <pre className="mono" style={s.actualJson}>
                    {JSON.stringify(result.actual_output, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            {result && (
              <div style={s.result(resultPassed)}>
                {resultPassed ? (
                  <Icon.CheckCircle size={16} style={{ color: "var(--ok)" }} />
                ) : (
                  <Icon.XCircle size={16} style={{ color: "var(--text-muted)" }} />
                )}
                <span style={s.resultText}>
                  <b style={s.resultStrong}>
                    {resultPassed ? t("lastRunPassed") : t("lastRunFailed")}
                  </b>{" "}
                  {/* A negative case's counts mean the opposite: `expected` is
                      forbidden LOCATIONS, `actual` is everything produced
                      anywhere in the diff. See the same split in
                      `EvalsTab/EvalCaseRow.tsx` — change the two together. */}
                  {t(negative ? "resultDetailNegative" : "resultDetail", {
                    expected: result.expected_count ?? 0,
                    actual: result.actual_count ?? 0,
                    duration: ((result.duration_ms ?? 0) / 1000).toFixed(1),
                    cost: money(result.cost_usd) ?? "—",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {confirm && (
        <EvalRunConfirm
          calls={confirm.calls}
          label={name || (agentName ?? "")}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
