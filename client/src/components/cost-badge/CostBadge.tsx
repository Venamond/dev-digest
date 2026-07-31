/* CostBadge — single formatting authority for run cost (USD) across all three
   cost surfaces: PR list, run timeline, Run Trace drawer stats. */
import React from "react";

export function CostBadge({ usd }: { usd: number | null | undefined }) {
  if (usd == null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  const formatted = usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  return (
    <span className="mono tnum" style={{ color: "var(--text-secondary)" }}>
      {formatted}
    </span>
  );
}
