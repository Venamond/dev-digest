/* SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" bar for the PR
   Findings tab. Clicking a level filters every run's FindingsPanel down to
   that severity; clicking the active level again clears the filter. */
"use client";

import React from "react";
import { SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

const LEVELS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function SeverityCounters({
  findings,
  active,
  onSelect,
}: {
  findings: FindingRecord[];
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13 }}>
      {LEVELS.map((level, i) => {
        const count = findings.filter((f) => f.severity === level).length;
        const isActive = active === level;
        return (
          <React.Fragment key={level}>
            {i > 0 && <span style={{ color: "var(--text-muted)" }}>·</span>}
            <button
              type="button"
              onClick={() => onSelect(isActive ? null : level)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                padding: "2px 4px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: "inherit",
                fontWeight: isActive ? 700 : 500,
                color: SEV[level].c,
                outline: isActive ? `1px solid ${SEV[level].c}` : "none",
              }}
            >
              {count} {level}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
