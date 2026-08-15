import type { IconName } from "@devdigest/ui";

/** Risk-area tag colours (high=red, medium=orange, low=gray). */
export const RISK_COLOR: Record<string, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

export const RISK_COLOR_FALLBACK = "var(--text-muted)";

/** Icons on the example card: shield / honeycomb / bolt. */
export const RISK_ICON: Record<string, IconName> = {
  high: "Shield",
  medium: "Boxes",
  low: "Zap",
};

export const RISK_ICON_FALLBACK: IconName = "AlertTriangle";
