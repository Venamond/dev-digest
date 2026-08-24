/* CostBadge — single formatting authority for run cost (USD) across all three
   cost surfaces: PR list, run timeline, Run Trace drawer stats. */
import React from "react";

export function CostBadge({ usd }: { usd: number | null | undefined }) {
  if (usd == null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  /* A real cost below the third decimal reads as `$0.000`, which says "free"
     where the truth is "0.015 cents". Reported 2026-08-24 on a PR brief whose
     stored cost was $0.000145 — and it appeared only after the blast map was
     deduplicated, i.e. our own optimisation pushed the figure under the
     display's precision. `< $0.001` keeps the badge one short token wide and
     never claims a paid call was free. Exact zero stays `$0.000`: nothing was
     spent, and that is a different statement. */
  const formatted =
    usd > 0 && usd < 0.001
      ? "< $0.001"
      : usd < 1
        ? `$${usd.toFixed(3)}`
        : `$${usd.toFixed(2)}`;
  return (
    <span className="mono tnum" style={{ color: "var(--text-secondary)" }}>
      {formatted}
    </span>
  );
}
