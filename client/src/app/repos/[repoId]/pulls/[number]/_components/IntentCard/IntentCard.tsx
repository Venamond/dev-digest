"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BriefRisk, IntentRiskArea } from "@devdigest/shared";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/reviews";
import { FileRefLink } from "../FileRefLink/FileRefLink";
import {
  RISK_COLOR,
  RISK_COLOR_FALLBACK,
  RISK_ICON,
  RISK_ICON_FALLBACK,
} from "./constants";
import { s } from "./styles";

/**
 * One row of the RISK AREAS block, whichever source produced it.
 *
 * The two sources are normalised to this shape BEFORE rendering, so "a brief
 * risk and an intent risk area render identically" (AC-37) is structural
 * rather than a promise. There is deliberately no `source` field: nothing may
 * mark which of the two produced a row, so there is nowhere legitimate to read
 * one.
 */
interface RiskRow {
  title: string;
  severity: string;
  explanation: string;
  fileRefs: string[];
}

/** Intent rows first, then the brief's. An `IntentRiskArea` carries a single
 *  `file_ref`; a `BriefRisk` carries a list. */
function toRiskRows(
  areas: IntentRiskArea[] | undefined,
  briefRisks: BriefRisk[] | undefined,
): RiskRow[] {
  const fromIntent = (Array.isArray(areas) ? areas : []).map((a) => ({
    title: a.title,
    severity: a.severity,
    explanation: a.explanation,
    fileRefs: a.file_ref ? [a.file_ref] : [],
  }));
  const fromBrief = (Array.isArray(briefRisks) ? briefRisks : []).map((r) => ({
    title: r.title,
    severity: r.severity,
    explanation: r.explanation,
    fileRefs: Array.isArray(r.file_refs) ? r.file_refs : [],
  }));
  return [...fromIntent, ...fromBrief];
}

function RiskExplanation({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p style={s.detailText}>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? (
          <code key={i} style={s.inlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

function RiskAreas({
  rows,
  repoId,
  prNumber,
}: {
  rows: RiskRow[];
  repoId: string;
  prNumber: number;
}) {
  const t = useTranslations("prReview.intent");
  const [selected, setSelected] = useState<number | null>(null);
  const open = selected != null ? rows[selected] : undefined;

  return (
    <>
      <div style={s.divider} />
      <div>
        <div style={s.scopeHeading}>
          <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)" }} />
          <span style={s.sectionLabel}>{t("risks")}</span>
        </div>
        <div style={s.riskRows}>
          {rows.map((r, i) => {
            const color = RISK_COLOR[r.severity] ?? RISK_COLOR_FALLBACK;
            const Glyph = Icon[RISK_ICON[r.severity] ?? RISK_ICON_FALLBACK];
            const expanded = selected === i;
            return (
              <React.Fragment key={`${r.title}:${i}`}>
              <div style={s.riskRow}>
                {/* Box A — no click handler of its own, so the file reference
                    inside it can be a link without competing with the toggle. */}
                <div style={s.riskBox(color, expanded)}>
                  <div style={s.riskTitleLine}>
                    <Glyph size={13} style={{ color, flexShrink: 0 }} />
                    {r.title}
                  </div>
                  {r.fileRefs.length > 0 && (
                    <div style={s.riskRefLine}>
                      {r.fileRefs.map((ref) => (
                        <FileRefLink
                          key={ref}
                          fileRef={ref}
                          repoId={repoId}
                          prNumber={prNumber}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {/* Box B — the control. `aria-pressed` and the toggle
                    expression are the existing ones, verbatim: exactly one row
                    open, and clicking the open one closes it. */}
                <button
                  type="button"
                  aria-label={r.title}
                  aria-pressed={expanded}
                  style={s.riskChevron(expanded)}
                  onClick={() => setSelected((cur) => (cur === i ? null : i))}
                >
                  <Icon.ChevronDown size={14} style={s.chevronGlyph(expanded)} />
                </button>
              </div>
              {/* Directly under the row it belongs to, pushing the rows below
                  it down. M2/M3 draw this block beneath the whole list; the
                  human asked on 2026-08-24 for it to open in place instead, so
                  the explanation sits beside the title it explains rather than
                  at a distance that grows with the number of risks. */}
              {expanded && (
                <div style={s.detail}>
                  {r.explanation ? <RiskExplanation text={r.explanation} /> : null}
                  {r.fileRefs.map((ref) => (
                    <div key={ref} style={s.fileRef}>
                      {ref}
                    </div>
                  ))}
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ScopeList({
  items,
  bulletColor,
  textStyle,
}: {
  items: string[];
  bulletColor: string;
  textStyle: React.CSSProperties;
}) {
  if (items.length === 0) return null;
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item} style={{ ...s.listItem, ...textStyle }}>
          <span style={s.bullet(bulletColor)} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function IntentCard({
  prId,
  briefRisks,
}: {
  prId: string | null;
  /** The brief's risks, supplied by OverviewTab. They render inside this
   *  card's own RISK AREAS block (AC-34) and are indistinguishable there from
   *  the intent's (AC-37). */
  briefRisks?: BriefRisk[];
}) {
  const t = useTranslations("prReview.intent");
  const params = useParams<{ repoId: string; number: string }>();
  const { data, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  const onRecompute = () => {
    if (!prId) return;
    derive.mutate({ force: true });
  };

  // Computed from both sources, and gated on what it produced — so a PR with
  // no intent still shows the block when the brief raised a risk (AC-7 x AC-34).
  const riskRows = toRiskRows(data?.risk_areas, briefRisks);

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.headerLabel}>
            <Icon.Target size={14} style={{ color: "var(--text-muted)" }} />
            <span style={s.headerTitle}>{t("title")}</span>
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={derive.isPending}
            disabled={!prId}
            onClick={onRecompute}
          >
            {t("recompute")}
          </Button>
        </div>
        {isLoading || data == null ? (
          <p style={s.empty}>{t("empty")}</p>
        ) : (
          <>
            {data.stale && <div style={s.banner}>{t("stale")}</div>}
            <p style={s.summary}>{data.intent}</p>
            <div style={s.scopeGrid}>
              <div>
                <div style={s.scopeHeading}>
                  <Icon.Check size={14} style={{ color: "var(--ok)" }} />
                  <span style={s.inScopeLabel}>{t("inScope")}</span>
                </div>
                <ScopeList
                  items={data.in_scope}
                  bulletColor="var(--ok)"
                  textStyle={s.inScopeText}
                />
              </div>
              <div>
                <div style={s.scopeHeading}>
                  <Icon.X size={14} style={{ color: "var(--text-muted)" }} />
                  <span style={s.outScopeLabel}>{t("outOfScope")}</span>
                </div>
                <ScopeList
                  items={data.out_of_scope}
                  bulletColor="var(--text-muted)"
                  textStyle={s.outScopeText}
                />
              </div>
            </div>
          </>
        )}
        {riskRows.length > 0 && (
          <RiskAreas
            rows={riskRows}
            repoId={params.repoId}
            prNumber={Number(params.number)}
          />
        )}
        {data != null && (
          <>
            <div style={s.meta}>
              <span>
                {t("confidence")}: {Math.round(data.confidence * 100)}%
              </span>
              {data.sources.length > 0 && (
                <span>
                  {t("sources")}: {data.sources.join(", ")}
                </span>
              )}
            </div>
            {data.missing_context.length > 0 && (
              <div>
                <div style={s.scopeHeading}>
                  <span style={s.sectionLabel}>{t("missing")}</span>
                </div>
                {data.missing_context.map((m) => (
                  <p key={`${m.kind}:${m.ref}`} style={s.missing}>
                    {t("unavailable")}: {m.kind} {m.ref} — {m.reason}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
