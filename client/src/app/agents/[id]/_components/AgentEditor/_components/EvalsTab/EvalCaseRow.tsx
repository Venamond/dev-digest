/* EvalCaseRow — one row of the agent's case set (mockup `EvalCaseRow`,
   img/mockup-src/agent_widgets.jsx:43-65). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import { s } from "./styles";

/** How many findings the case asserts — the row's trailing badge. */
export function expectedCount(c: EvalCase): number {
  return Array.isArray(c.expected_output) ? c.expected_output.length : 0;
}

/**
 * The badge the mockup puts at the end of the row (`agent_widgets.jsx:60`,
 * `ec.expected`): a summary of what the case asserts, not a count. A bare `1`
 * says nothing a reader can act on.
 *
 * `assert empty` for a negative case is the mockup's own wording for the
 * negative assertion — the spec records it as a LABEL, not a second rule: the
 * case still carries the forbidden location, and passing means nothing landed
 * on it, not that the run produced nothing at all.
 */
export function expectationSummary(c: EvalCase, emptyLabel: string): string {
  if (c.expectation === "must_not_flag") return emptyLabel;
  const first = Array.isArray(c.expected_output) ? c.expected_output[0] : undefined;
  const f = first as { severity?: unknown; category?: unknown } | undefined;
  const severity = typeof f?.severity === "string" ? f.severity : null;
  const category = typeof f?.category === "string" ? f.category : null;
  if (severity && category) return `${severity} · ${category}`;
  return severity ?? category ?? String(expectedCount(c));
}

const STATUS = {
  passed: { icon: "CheckCircle", color: "var(--ok)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  errored: { icon: "XCircle", color: "var(--crit)" },
  never: { icon: "Dot", color: "var(--text-muted)" },
} as const;

export function EvalCaseRow({
  evalCase,
  last,
  disabled,
  busy,
  onRun,
  onEdit,
  onDelete,
}: {
  evalCase: EvalCase;
  /** The most recent execution that touched this case, or undefined. */
  last?: EvalRunRecord;
  /** True while a set run is in flight — a trial would be refused (AC-42). */
  disabled?: boolean;
  /** This row's own trial is executing. */
  busy?: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval.evalsTab");
  const outcome = last?.outcome ?? (last ? (last.pass ? "passed" : "failed") : null);
  const status = STATUS[outcome ?? "never"];
  const Ico = Icon[status.icon];
  const positive = evalCase.expectation === "must_find";
  const errored = outcome === "errored";

  let result: string;
  if (errored) {
    result = t("resultErrored", { reason: last?.failure_reason ?? t("reasonUnknown") });
  } else if (outcome === "passed" || outcome === "failed") {
    // The reference states the counts and the recall, with no "Last run
    // passed" prefix — the status icon already carries the verdict.
    /* The two expectations invert what these numbers MEAN, so one sentence
       cannot serve both. On a `must_not_flag` case `expected` counts forbidden
       LOCATIONS, not findings the agent owed, and `actual` counts everything it
       produced anywhere in the diff — most of it irrelevant. Rendered with the
       positive wording it reads "expected 1 finding, got 3", i.e. "should have
       found one, found three", which is the opposite of what happened.
       Reported 2026-08-30. */
    result = positive
      ? t("resultCounts", {
          expected: last?.expected_count ?? expectedCount(evalCase),
          actual: last?.actual_count ?? 0,
          recall: last?.recall == null ? "—" : `${Math.round(last.recall * 100)}%`,
        })
      : t("resultCountsNegative", {
          expected: last?.expected_count ?? expectedCount(evalCase),
          actual: last?.actual_count ?? 0,
          verdict: outcome === "passed" ? t("negativeClean") : t("negativeHit"),
        });
  } else {
    result = t("neverRun");
  }

  return (
    <div style={s.row} data-testid={`eval-case-${evalCase.id}`}>
      <Ico size={15} style={{ color: status.color, flexShrink: 0 }} />
      <div style={s.rowMain}>
        <div style={s.rowTitleLine}>
          <span className="mono" style={s.rowName}>
            {evalCase.name}
          </span>
          <span
            style={s.expectation(positive)}
            title={
              evalCase.seeded_from
                ? t("seededFrom", { disposition: evalCase.seeded_from.disposition })
                : undefined
            }
          >
            {positive ? t("mustFind") : t("mustNotFlag")}
          </span>
        </div>
        <div style={s.rowResult(errored)}>{result}</div>
      </div>
      <span style={s.summaryBadge}>
        <Badge color="var(--text-muted)">
          {expectationSummary(evalCase, t("assertEmpty"))}
        </Badge>
      </span>
      <div style={s.rowActions}>
        {/* The reference draws `Run` and `Edit` as LABELLED buttons and leaves
            only delete as a bare icon (img/9.png). Using `Button` also gives
            the running state for free: `IconBtn` has neither `loading` nor a
            `style` prop, so pressing Run on a row previously changed nothing
            on screen at all. */}
        <Button
          kind="ghost"
          size="sm"
          icon="Play"
          loading={busy}
          disabled={disabled}
          onClick={onRun}
        >
          {t("run")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" onClick={onEdit}>
          {t("edit")}
        </Button>
        <IconBtn icon="Trash" label={t("delete")} size={26} danger onClick={onDelete} />
      </div>
    </div>
  );
}
