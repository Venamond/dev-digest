/* SkillEvalCaseEditor — author or edit one SKILL eval case (screen B of the
   track-F reference, transcribed in the plan's `## 2d`).

   A separate component from `src/components/eval-case-editor/`, which is
   shipped for AGENT cases and is not touched: the two disagree on their whole
   left pane. An agent case stores a diff taken from a real pull request and
   shows it read-only; a skill case is AUTHORED as `Before`/`After` file
   contents and its diff is GENERATED — by the server, so the previewed bytes
   and the stored bytes are the same builder's output.

   It lives in `src/components/` because the skill editor's Evals tab opens it
   and it is not owned by that route alone.

   The dialog is rendered through a portal: `Modal` is `position: fixed` and
   does NOT portal itself, so any ancestor setting `opacity`, `filter`,
   `transform` or `contain` would both dim it and make `fixed` resolve against
   that ancestor (`client/INSIGHTS.md:64`). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
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
  EvalExpectation,
  EvalRunRecord,
  EvalSkillCaseFiles,
} from "@devdigest/shared";
import {
  useCreateSkillEvalCase,
  usePreviewEvalDiff,
  useRunSkillEvalCase,
  useUpdateSkillEvalCase,
} from "@/lib/hooks/eval";
import { EvalRunConfirm } from "@/components/eval-run-confirm/EvalRunConfirm";
import { s } from "./styles";

/** One case is two paid model calls — with the skill's body, and without it. */
const CALLS_PER_CASE = 2;

export interface SkillEvalCaseEditorProps {
  /** The skill the case belongs to — a skill case set is per skill. */
  skillId: string;
  skillName?: string;
  /** The stored case being edited, or null for a new one. */
  evalCase?: EvalCase | null;
  /** The agent the run will execute on, resolved server-side. Displayed by
      the case list rather than here — the reference's screen B does not
      carry it — and accepted so the caller can pass one shape. */
  agentName?: string | null;
  /** False when the skill is linked to no enabled agent — nothing can run. */
  hasAgent?: boolean;
  /** The execution that last touched this case. */
  lastRun?: EvalRunRecord | null;
  /** Reports a run fired here, so the case list can show it without a refetch. */
  onRan?: (record: EvalRunRecord) => void;
  onClose: () => void;
}

interface MetaShape {
  title?: unknown;
  body?: unknown;
}

/** Read `input_files` defensively: it is `unknown` on the contract. */
function readFiles(input: unknown): EvalSkillCaseFiles {
  const empty: EvalSkillCaseFiles = { path: "", mode: "modified", before: "", after: "" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return empty;
  const r = input as Record<string, unknown>;
  return {
    path: typeof r.path === "string" ? r.path : "",
    mode: r.mode === "new" ? "new" : "modified",
    before: typeof r.before === "string" ? r.before : "",
    after: typeof r.after === "string" ? r.after : "",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const EMPTY_FINDING = {
  severity: "CRITICAL",
  category: "security",
  title: "",
  file: "",
  start_line: 0,
};

export function SkillEvalCaseEditor({
  skillId,
  skillName,
  evalCase,
  hasAgent = true,
  lastRun,
  onRan,
  onClose,
}: SkillEvalCaseEditorProps) {
  const t = useTranslations("eval.skillCaseEditor");

  const storedFiles = readFiles(evalCase?.input_files);
  const meta = (evalCase?.input_meta ?? {}) as MetaShape;

  const [name, setName] = React.useState(evalCase?.name ?? "");
  const [expectation, setExpectation] = React.useState<EvalExpectation>(
    evalCase?.expectation ?? "must_find",
  );
  const [mode, setMode] = React.useState<"new" | "modified">(storedFiles.mode);
  const [path, setPath] = React.useState(storedFiles.path);
  const [before, setBefore] = React.useState(storedFiles.before);
  const [after, setAfter] = React.useState(storedFiles.after);
  const [prTitle, setPrTitle] = React.useState(str(meta.title));
  const [prBody, setPrBody] = React.useState(str(meta.body));
  const [expected, setExpected] = React.useState(() =>
    JSON.stringify(evalCase?.expected_output ?? [], null, 2),
  );
  // OFF by default: it spends two paid model calls on a save, and the cost is
  // stated before the action starts, never after.
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [tab, setTab] = React.useState("code");
  // Collapsed on arrival, as the reference draws it.
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ calls: number; run: () => void } | null>(null);
  const [trial, setTrial] = React.useState<EvalRunRecord | null>(null);

  const create = useCreateSkillEvalCase();
  const update = useUpdateSkillEvalCase();
  const runCase = useRunSkillEvalCase();
  const preview = usePreviewEvalDiff();

  const parsed = React.useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(expected) as unknown };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [expected]);

  // `new` has no before-image by construction — the file did not exist.
  const files: EvalSkillCaseFiles = {
    path,
    mode,
    before: mode === "new" ? "" : before,
    after,
  };
  const identical = files.before === files.after;

  function openPreview() {
    setPreviewOpen(true);
    if (!identical && path.trim() !== "") preview.mutate(files);
  }

  function payload(): EvalCaseInput {
    return {
      owner_kind: "skill",
      owner_id: skillId,
      name,
      expectation,
      // The server builds `input_diff` from `input_files` — one builder, so the
      // preview and the stored bytes cannot diverge.
      input_diff: "",
      input_files: files,
      input_meta: { title: prTitle, body: prBody },
      expected_output: parsed.value,
      seeded_from: null,
      notes: evalCase?.notes ?? null,
    };
  }

  function fireRun(caseId: string) {
    runCase.mutate(
      { id: caseId, skillId },
      {
        onSuccess: (rec) => {
          setTrial(rec);
          onRan?.(rec);
        },
      },
    );
  }

  function save() {
    if (!canSave) return;
    if (evalCase) {
      update.mutate(
        { id: evalCase.id, skillId, patch: payload() },
        {
          onSuccess: () => {
            if (runOnSave) fireRun(evalCase.id);
            else onClose();
          },
        },
      );
      return;
    }
    create.mutate(
      { skillId, input: payload() },
      {
        onSuccess: (created) => {
          if (runOnSave) fireRun(created.id);
          else onClose();
        },
      },
    );
  }

  /* A save with `Run on save` on spends two model calls, so it is confirmed
     the same way a run control is — the one place spend attaches to a save. */
  function onSaveClick() {
    if (runOnSave) setConfirm({ calls: CALLS_PER_CASE, run: save });
    else save();
  }

  const saving = create.isPending || update.isPending;
  const canSave =
    parsed.ok && name.trim() !== "" && path.trim() !== "" && !identical && !saving;
  const saveTitle = !parsed.ok
    ? t("saveNeedsValidJson")
    : path.trim() === ""
      ? t("saveNeedsPath")
      : identical
        ? t("saveNeedsChange")
        : undefined;

  const result = trial ?? lastRun ?? null;
  const actual = result?.actual_output ?? null;
  const hasSides =
    !!actual && typeof actual === "object" && !Array.isArray(actual) && "with" in actual;

  const dialog = (
    <>
      <Modal
        width={960}
        title={t("caseTitle", { name: name || t("newCase") })}
        subtitle={t("subtitle", { skill: skillName ?? "" })}
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
              disabled={!evalCase || !hasAgent || runCase.isPending}
              title={
                !evalCase ? t("runCaseNeedsSave") : !hasAgent ? t("noAgent") : undefined
              }
              onClick={() =>
                evalCase &&
                setConfirm({ calls: CALLS_PER_CASE, run: () => fireRun(evalCase.id) })
              }
            >
              {runCase.isPending ? t("running") : t("runCase")}
            </Button>
            <Button
              kind="primary"
              icon="Check"
              disabled={!canSave}
              title={saveTitle}
              onClick={onSaveClick}
            >
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        }
      >
        <div style={s.body}>
          <div style={s.left}>
            <div style={s.pad}>
              <FormField label={t("nameLabel")} required>
                <TextInput
                  value={name}
                  onChange={setName}
                  mono
                  aria-label={t("nameLabel")}
                  placeholder={t("namePlaceholder")}
                />
              </FormField>
              {/* Not drawn by the reference, and required by the server: a case
                  asserts either a finding or its absence, and the set needs
                  both kinds. */}
              <FormField label={t("expectationLabel")}>
                <div style={s.subTabs}>
                  {(["must_find", "must_not_flag"] as const).map((e) => (
                    <button
                      key={e}
                      type="button"
                      style={s.subTab(expectation === e)}
                      onClick={() => setExpectation(e)}
                    >
                      {e === "must_find" ? t("mustFind") : t("mustNotFlag")}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>

            <div style={s.inputHeading}>{t("inputLabel")}</div>
            <Tabs
              tabs={[
                { key: "code", label: t("tabs.code") },
                { key: "prMeta", label: t("tabs.prMeta") },
              ]}
              value={tab}
              onChange={setTab}
              pad="0 16px"
            />

            {tab === "code" && (
              <>
                <div style={s.subTabs}>
                  {(["new", "modified"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      style={s.subTab(mode === m)}
                      onClick={() => setMode(m)}
                    >
                      {m === "new" ? t("subTabs.newFile") : t("subTabs.modifiedFile")}
                    </button>
                  ))}
                </div>
                <div style={s.tabBody}>
                  <FormField label={t("pathLabel")} required>
                    <TextInput
                      value={path}
                      onChange={setPath}
                      mono
                      aria-label={t("pathLabel")}
                      placeholder={t("pathPlaceholder")}
                    />
                  </FormField>
                  {mode === "modified" ? (
                    <>
                      <FormField label={t("beforeLabel")}>
                        <textarea
                          className="mono"
                          aria-label={t("beforeLabel")}
                          style={s.area}
                          value={before}
                          onChange={(e) => setBefore(e.target.value)}
                        />
                      </FormField>
                      <FormField label={t("afterLabel")}>
                        <textarea
                          className="mono"
                          aria-label={t("afterLabel")}
                          style={s.area}
                          value={after}
                          onChange={(e) => setAfter(e.target.value)}
                        />
                      </FormField>
                    </>
                  ) : (
                    /* A new file has no before-image, so there is one textarea. */
                    <FormField label={t("contentsLabel")}>
                      <textarea
                        className="mono"
                        aria-label={t("contentsLabel")}
                        style={s.area}
                        value={after}
                        onChange={(e) => setAfter(e.target.value)}
                      />
                    </FormField>
                  )}

                  <button
                    type="button"
                    style={s.disclosure}
                    aria-expanded={previewOpen}
                    onClick={() => (previewOpen ? setPreviewOpen(false) : openPreview())}
                  >
                    {previewOpen ? <Icon.ChevronDown size={12} /> : <Icon.ChevronRight size={12} />}
                    {t("previewDiff")}
                  </button>
                  {previewOpen && (
                    <pre className="mono" style={s.previewPre}>
                      {preview.isPending
                        ? t("previewLoading")
                        : (preview.data?.diff ?? t("previewEmpty"))}
                    </pre>
                  )}
                </div>
              </>
            )}

            {tab === "prMeta" && (
              <div style={s.tabBody}>
                <FormField label={t("titleLabel")}>
                  <TextInput value={prTitle} onChange={setPrTitle} aria-label={t("titleLabel")} />
                </FormField>
                <FormField label={t("bodyLabel")}>
                  <textarea
                    aria-label={t("bodyLabel")}
                    style={s.area}
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                  />
                </FormField>
              </div>
            )}
          </div>

          <div style={s.right}>
            <div style={s.expectedHeader}>
              <span style={s.expectedTitle}>{t("expectedOutput")}</span>
              {parsed.ok ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                  {t("validJson")}
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
                    // exactly as they were.
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

            {/* The second panel the reference draws: both halves of the one run
                — `{ with: {…}, without: {…} }` — because for a `must find`
                case the mark is the difference between them. */}
            <div style={s.actualPanel}>
              <div style={s.actualTitle}>{t("actualOutput")}</div>
              <div style={s.actualBox}>
                {!result || !hasSides ? (
                  <div style={s.actualEmpty}>{t("neverRunYet")}</div>
                ) : (
                  <pre className="mono" style={s.actualJson}>
                    {JSON.stringify(actual, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {confirm && (
        <EvalRunConfirm
          calls={confirm.calls}
          label={name || (skillName ?? "")}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );

  // Guarded so server rendering never touches `document`.
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
