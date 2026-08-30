/* Compare two eval runs (design RunCompare): metric deltas plus the word-level
   diff of the two prompts the runs actually used.

   The prompts come off the runs (`run.system_prompt`), never off the agent — a
   batch froze the prompt when it was created, so editing the agent afterwards
   cannot rewrite what a past run was measured on. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, SectionLabel } from "@devdigest/ui";
import type { EvalRunBatch } from "@devdigest/shared";
import { formatUsdCompact } from "@/components/cost-badge";
import { diffTokens } from "./diffTokens";
import { s } from "./styles";

/* `unit` decides the formatter, not just the suffix. The design's own
   CompareMetric printed a non-percentage value raw, which is fine on the
   mockup's round `0.21` fixture and leaks `0.0009258000000000001` on a real
   run — our per-case costs live three decimals below where `toFixed(2)` can
   say anything. Cost goes through the shared money formatter's compact
   variant, which drops to cents below $0.01 so a sub-cent delta is still a
   short, readable number rather than `$0.00` or a nine-character float. */
function CompareMetric({
  label,
  oldV,
  newV,
  color,
  unit,
}: {
  label: string;
  oldV: number | null;
  newV: number | null;
  color: string;
  unit: "pct" | "usd";
}) {
  const pct = unit === "pct";
  const fmt = (v: number | null) =>
    v == null ? "—" : pct ? `${Math.round(v * 100)}%` : formatUsdCompact(v);
  const d = oldV != null && newV != null ? newV - oldV : 0;
  /* The design's single `> 0.0001` threshold is a percentage-point epsilon; on
     a cost of $0.0009 it suppresses every real delta, so a run that got 6%
     cheaper drew no arrow at all. Each unit gets the threshold at which its own
     formatter still prints something: a hundredth of a cent for money. */
  const show = Math.abs(d) > (pct ? 0.0001 : 0.00005);
  return (
    <div style={s.metric}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricRow}>
        <span className="tnum" style={s.metricOld}>
          {fmt(oldV)}
        </span>
        <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
        <span className="tnum" style={{ ...s.metricNew, color }}>
          {fmt(newV)}
        </span>
        {show && (
          <span
            className="tnum"
            style={{ ...s.metricDelta, color: d >= 0 ? "var(--ok)" : "var(--crit)" }}
          >
            {(d >= 0 ? "▲ " : "▼ ") +
              (pct ? `${Math.abs(Math.round(d * 100))}pt` : formatUsdCompact(Math.abs(d)))}
          </span>
        )}
      </div>
    </div>
  );
}

/** Whichever ran first is the "old" side, whatever order they were selected in. */
function order(a: EvalRunBatch, b: EvalRunBatch): [EvalRunBatch, EvalRunBatch] {
  const key = (r: EvalRunBatch) => r.ran_at ?? r.started_at;
  return key(a).localeCompare(key(b)) <= 0 ? [a, b] : [b, a];
}

export function RunCompare({
  a,
  b,
  casesTotal,
  onClose,
}: {
  a: EvalRunBatch;
  b: EvalRunBatch;
  casesTotal: number;
  onClose: () => void;
}) {
  const t = useTranslations("eval.compare");
  const [older, newer] = order(a, b);
  const tokens = diffTokens(older.system_prompt ?? "", newer.system_prompt ?? "");

  return (
    <Modal
      width={960}
      onClose={onClose}
      title={t("title", { older: older.agent_version, newer: newer.agent_version })}
      subtitle={t("subtitle", { cases: casesTotal })}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("close")}
          </Button>
          <Button kind="primary" icon="GitBranch" disabled title={t("promoteDisabled")}>
            {t("promote", { version: newer.agent_version })}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.metrics}>
          <CompareMetric
            label={t("metrics.recall")}
            oldV={older.recall}
            newV={newer.recall}
            color="var(--accent)"
            unit="pct"
          />
          <CompareMetric
            label={t("metrics.precision")}
            oldV={older.precision}
            newV={newer.precision}
            color="var(--ok)"
            unit="pct"
          />
          <CompareMetric
            label={t("metrics.citation")}
            oldV={older.citation_accuracy}
            newV={newer.citation_accuracy}
            color="var(--warn)"
            unit="pct"
          />
          <CompareMetric
            label={t("metrics.cost")}
            oldV={older.cost_usd}
            newV={newer.cost_usd}
            color="var(--text-primary)"
            unit="usd"
          />
        </div>

        <p style={s.note}>{t("comparability")}</p>

        <SectionLabel icon="FileText">{t("promptDiff")}</SectionLabel>
        <div style={s.legend}>
          <span style={s.legendItem}>
            <span style={s.swatchDel} />
            {t("legendOld", { version: older.agent_version })}
          </span>
          <span style={s.legendItem}>
            <span style={s.swatchAdd} />
            {t("legendNew", { version: newer.agent_version })}
          </span>
        </div>
        <div className="mono" style={s.diff}>
          {tokens.map((tk, i) => (
            <span
              key={i}
              style={{
                background:
                  tk.k === "add" ? "var(--code-add)" : tk.k === "del" ? "var(--code-del)" : "transparent",
                color: tk.k === "same" ? "var(--text-secondary)" : "var(--text-primary)",
                textDecoration: tk.k === "del" ? "line-through" : "none",
                textDecorationColor: "var(--crit)",
              }}
            >
              {tk.t}
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}
