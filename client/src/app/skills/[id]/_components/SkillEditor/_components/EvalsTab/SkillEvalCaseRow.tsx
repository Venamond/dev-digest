/* SkillEvalCaseRow — one row of a skill's case set (screen A of the track-F
   reference, transcribed in the plan's `## 2d`).

   The row renders two numbers the agent-eval row does not have — `With skill`
   and `Without skill` — because for a `must find` case the mark IS the
   difference between them. It also renders WHY a case reached its mark, taken
   from the server's own verdict reason and never re-derived here: two
   derivations of one predicate is the defect `client/INSIGHTS.md:440` records. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn } from "@devdigest/ui";
import type { EvalRunRecord, EvalSkillCaseRow as SkillCaseRow } from "@devdigest/shared";
import { s } from "./styles";

/** The six reason codes `skillCaseVerdict` (server, ring 0) can return. */
const REASONS = [
  "skill_caused",
  "found_without_skill",
  "not_found_with_skill",
  "forbidden_range_clean",
  "forbidden_range_flagged",
  "no_without_result",
] as const;

export type SkillCaseReason = (typeof REASONS)[number];

/** `failure_reason` carries either a verdict reason code or a provider error. */
export function asReasonCode(reason: string | null | undefined): SkillCaseReason | null {
  return REASONS.includes(reason as SkillCaseReason) ? (reason as SkillCaseReason) : null;
}

/** A per-side number as a whole percent, or an em dash when there was none. */
export function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

/**
 * How many findings the WITH-skill run produced.
 *
 * Read structurally rather than through the contract's `Finding` schema: a
 * shape the schema rejects would silently read as zero, and a wrong count is
 * worse than a loose one. `actual_count` on the record is not usable here — it
 * counts an ARRAY `actual_output`, and a skill run stores `{with, without}`.
 */
export function withSideFindingCount(actualOutput: unknown): number {
  if (!actualOutput || typeof actualOutput !== "object" || Array.isArray(actualOutput)) return 0;
  const withSide = (actualOutput as { with?: unknown }).with;
  if (!withSide || typeof withSide !== "object") return 0;
  const findings = (withSide as { findings?: unknown }).findings;
  return Array.isArray(findings) ? findings.length : 0;
}

const STATUS = {
  passed: { icon: "CheckCircle", color: "var(--ok)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  /* Errored is a THIRD state, not a red cross: under the two-sided rule a
     missing without-result is an absent measurement, not a negative one. */
  errored: { icon: "AlertTriangle", color: "var(--warn)" },
  never: { icon: "Dot", color: "var(--text-muted)" },
} as const;

export function SkillEvalCaseRow({
  row,
  last,
  disabled,
  onRun,
  onEdit,
  onDelete,
}: {
  row: SkillCaseRow;
  /** The execution that last touched this case, or null when it never ran. */
  last?: EvalRunRecord | null;
  /** True while another run of this set is in flight — the agent refuses two. */
  disabled?: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval.skillEvalsTab");
  const outcome = last?.outcome ?? (last ? (last.pass ? "passed" : "failed") : null);
  const status = STATUS[outcome ?? "never"];
  const Ico = Icon[status.icon];
  const positive = row.expectation === "must_find";
  const errored = outcome === "errored";
  const reasonCode = asReasonCode(last?.failure_reason);

  let result: string;
  if (errored) {
    result = t("erroredLine", {
      reason: reasonCode ? t(`reason.${reasonCode}`) : (last?.failure_reason ?? t("reasonUnknown")),
    });
  } else if (last) {
    result = t("resultLine", {
      expected: last.expected_count ?? 0,
      actual: withSideFindingCount(last.actual_output),
      recall: pct(last.recall),
      withSkill: pct(last.recall),
      withoutSkill: pct(last.recall_without),
    });
  } else {
    result = t("neverRun");
  }

  // Why the row is marked as it is — the reason the server recorded. Shown on
  // every row that did not pass, which is where the question gets asked.
  const reasonLine = outcome !== null && outcome !== "passed" && reasonCode && !errored
    ? t(`reason.${reasonCode}`)
    : null;

  return (
    /* `data-status` is the row's mark as a structure, not a colour: an
       assertion on it survives a restyle, and the icon carries no text. */
    <div
      style={s.row}
      data-testid={`skill-eval-case-${row.id}`}
      data-status={outcome ?? "never"}
    >
      <Ico size={15} style={{ color: status.color, flexShrink: 0 }} />
      <div style={s.rowMain}>
        <div style={s.rowTitleLine}>
          <span className="mono" style={s.rowName}>
            {row.name}
          </span>
          <span style={s.expectation(positive)}>
            {positive ? t("mustFind") : t("mustNotFlag")}
          </span>
        </div>
        <div style={s.rowResult(errored)}>{result}</div>
        {reasonLine && <div style={s.rowReason(false)}>{reasonLine}</div>}
      </div>
      {/* The reference carries severity·category on MUST FIND rows only — a
          MUST NOT FLAG case asserts an absence and names no finding. */}
      {positive && (row.severity || row.category) && (
        <span style={s.rowMeta}>{[row.severity, row.category].filter(Boolean).join(" · ")}</span>
      )}
      <div style={s.rowActions}>
        {/* NOT rendered when there is nothing to run — a skill linked to no
            enabled agent has no agent to run against. `IconBtn` has no
            `disabled` prop and is read-only, so passing `onClick={undefined}`
            left a control that looks live and silently does nothing. The
            header's no-agent notice already says why it is missing. */}
        {!disabled && <IconBtn icon="Play" label={t("run")} size={26} onClick={onRun} />}
        <IconBtn icon="Edit" label={t("edit")} size={26} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("delete")} size={26} danger onClick={onDelete} />
      </div>
    </div>
  );
}
