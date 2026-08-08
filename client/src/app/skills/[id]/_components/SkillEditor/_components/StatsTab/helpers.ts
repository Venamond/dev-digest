import type { DonutSegment } from "@devdigest/ui";

const CAT_COLORS: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "#8b5cf6",
  style: "var(--accent)",
  test: "var(--ok)",
  other: "var(--text-muted)",
};

/** Rate (0–1) → 0–100 for CircularScore / display; null stays null. */
export function pct(rate: number | null | undefined): number | null {
  if (rate == null) return null;
  return Math.round(rate * 100);
}

/** Donut segments from findings_by_category (largest first). */
export function categorySegments(byCat: Record<string, number>): DonutSegment[] {
  return Object.entries(byCat)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([label, value]) => ({
      label,
      value,
      color: CAT_COLORS[label] ?? "var(--text-muted)",
    }));
}
