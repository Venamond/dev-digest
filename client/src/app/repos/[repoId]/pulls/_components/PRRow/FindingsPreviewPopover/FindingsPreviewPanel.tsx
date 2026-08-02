/* FindingsPreviewPanel — pure, read-only preview of a PR's findings, shown in
   the PR-list hover popover. Deliberately NOT a reuse of the PR-detail page's
   FindingCard: no accept/dismiss actions, no click-to-expand, no GitHub link
   on file:line (this is a glance-and-move-on preview, not the full finding
   view). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { s } from "./styles";

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingsPreviewPanel({
  findings,
  count,
  loading,
}: {
  findings: FindingRecord[];
  count: number;
  loading?: boolean;
}) {
  const t = useTranslations("prReview");
  if (!loading && findings.length === 0) return null;

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <div style={s.panel} onClick={(e) => e.stopPropagation()}>
      <div style={s.header}>
        <Icon.AlertOctagon size={14} />
        {t("list.findingsPreview.title", { count })}
      </div>
      {loading ? (
        <div style={s.loading}>
          <Icon.RefreshCw size={14} style={{ animation: "ddspin 1s linear infinite" }} />
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map((f) => (
            <div key={f.id} style={s.item}>
              <div style={s.itemHeader}>
                <SeverityBadge severity={f.severity} compact />
                <span style={s.itemTitle}>{f.title}</span>
                <CategoryTag category={f.category} />
              </div>
              <div style={s.itemMeta}>
                <span className="mono" style={s.fileLine}>
                  {f.file}:{lineLabel(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <p style={s.rationale}>{f.rationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
