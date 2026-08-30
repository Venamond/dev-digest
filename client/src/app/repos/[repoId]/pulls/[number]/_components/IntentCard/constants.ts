import type { IconName } from "@devdigest/ui";

/** Risk-area tag colours (high=red, medium=orange, low=gray). */
export const RISK_COLOR: Record<string, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

export const RISK_COLOR_FALLBACK = "var(--text-muted)";

/**
 * Backgrounds to match `RISK_COLOR`, for a chip that has to read as its level
 * at a glance. `--crit-bg` and `--warn-bg` are the same tints `VerdictBanner`
 * and `FindingsTab` already use, so a high risk looks like the other high
 * things in the product rather than like coloured text on a grey pill.
 *
 * `low` is deliberately absent: it falls back to the `Badge` default, because
 * a low risk should not shout.
 */
export const RISK_BG: Record<string, string | undefined> = {
  high: "var(--crit-bg)",
  medium: "var(--warn-bg)",
};

/** Icons on the example card: shield / honeycomb / bolt. */
export const RISK_ICON: Record<string, IconName> = {
  high: "Shield",
  medium: "Boxes",
  low: "Zap",
};

export const RISK_ICON_FALLBACK: IconName = "AlertTriangle";
