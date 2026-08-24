import type { BriefRisk, RiskSeverity } from '@devdigest/shared';

/**
 * The deterministic floor under `risk_level`.
 *
 * Ring 0 — pure, in the shape of `focus-lines.ts` beside it, and applied by
 * `service.ts` AFTER the response is accepted.
 *
 * `risk_level` is the first thing a reviewer reads on the card, and until this
 * existed it was the only field of the brief grounded in nothing: `risks[]` and
 * `review_focus[]` are both checked against the allowed-name set, while the
 * headline rested on the prompt alone. A live brief of 2026-08-24 came back
 * reading `risk_level: medium` directly above a risk of `severity: high` — the
 * model contradicting itself, in the one place a reviewer cannot miss it, with
 * nothing on the server to notice.
 *
 * The floor raises, never lowers. The model MAY sit above its own listed risks
 * — "each of these is small, together they are dangerous" is a judgement worth
 * keeping — but it may never sit below them. With no risks at all there is
 * nothing to raise against and the model's own level stands.
 */

/** `high > medium > low`, the order of the `RiskSeverity` enum both fields use. */
const LEVEL_RANK: Record<RiskSeverity, number> = { low: 0, medium: 1, high: 2 };

/**
 * The model's `risk_level` raised to the most severe entry in `risks`, or
 * returned unchanged when it already covers them.
 */
export function floorRiskLevel(level: RiskSeverity, risks: BriefRisk[]): RiskSeverity {
  let worst = level;
  for (const risk of risks) {
    if (LEVEL_RANK[risk.severity] > LEVEL_RANK[worst]) worst = risk.severity;
  }
  return worst;
}
