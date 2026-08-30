/* CostBadge — single formatting authority for run cost (USD) across every cost
   surface: PR list, run timeline, Run Trace drawer stats, the eval case editor
   and the run-compare metric cards. */
import React from "react";

/* A real cost below the third decimal reads as `$0.000`, which says "free"
   where the truth is "0.015 cents". Reported 2026-08-24 on a PR brief whose
   stored cost was $0.000145 — and it appeared only after the blast map was
   deduplicated, i.e. our own optimisation pushed the figure under the
   display's precision. `< $0.001` keeps the badge one short token wide and
   never claims a paid call was free. Exact zero stays `$0.000`: nothing was
   spent, and that is a different statement. */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.001) return "< $0.001";
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

/* The badge rule collapses everything under a tenth of a cent to one token,
   which is right for a badge and wrong for the run-compare card: two real
   two-case runs cost $0.000868 and $0.000811, and `< $0.001 → < $0.001` hides
   the very difference that card exists to show. Dollars cannot state that
   difference briefly — `$0.000868` is nine characters and still not the whole
   number. Cents can: below a cent the figure is shown as `0.09¢`, which is the
   width the design draws (`0.21 → 0.23`) and keeps two runs distinguishable.
   Above a cent it stays in dollars, because that is what every other cost
   surface shows and a unit switch mid-scale is worse than a long number. */
export function formatUsdCompact(usd: number): string {
  if (usd <= 0 || usd >= 0.01) return formatUsd(usd);
  const cents = usd * 100;
  return cents < 0.005 ? "< 0.01¢" : `${cents.toFixed(2)}¢`;
}

export function CostBadge({ usd }: { usd: number | null | undefined }) {
  if (usd == null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <span className="mono tnum" style={{ color: "var(--text-secondary)" }}>
      {formatUsd(usd)}
    </span>
  );
}
