/* SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" bar.
   Without onSelect: a read-only PR-level tally. With onSelect: a per-run
   filter that toggles that FindingsPanel down to one severity. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

const LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function SeverityCounters({
  findings,
  active = null,
  onSelect,
}: {
  findings: FindingRecord[];
  active?: Severity | null;
  onSelect?: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  const interactive = !!onSelect;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: interactive ? 16 : 14,
        fontSize: 13,
      }}
    >
      {LEVELS.map((level, i) => {
        const count = findings.filter((f) => f.severity === level).length;
        const isActive = active === level;
        const label = `${count} ${t(`severity.${level}`)}`;
        const color = SEV[level].c;
        return (
          <React.Fragment key={level}>
            {i > 0 && <span style={{ color: "var(--text-muted)" }}>·</span>}
            {interactive ? (
              <button
                type="button"
                disabled={count === 0}
                aria-pressed={isActive}
                onClick={() => {
                  if (count === 0) return;
                  onSelect(isActive ? null : level);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "none",
                  border: "none",
                  padding: "2px 4px",
                  borderRadius: 4,
                  cursor: count === 0 ? "default" : "pointer",
                  fontSize: "inherit",
                  fontWeight: isActive ? 700 : 500,
                  color,
                  opacity: count === 0 ? 0.45 : 1,
                  outline: isActive ? `1px solid ${color}` : "none",
                }}
              >
                {label}
              </button>
            ) : (
              <span style={{ fontWeight: 500, color }}>{label}</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
