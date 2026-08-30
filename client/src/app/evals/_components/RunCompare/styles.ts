import type { CSSProperties } from "react";

/** Co-located styles for the compare-two-runs modal (design RunCompare). */
export const s = {
  body: { padding: "16px 18px", maxHeight: 560, overflow: "auto" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  metric: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  metricLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  metricRow: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  metricOld: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  metricNew: { fontSize: 21, fontWeight: 700 } satisfies CSSProperties,
  metricDelta: { fontSize: 11.5, fontWeight: 600 } satisfies CSSProperties,

  note: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    marginBottom: 18,
  } satisfies CSSProperties,

  legend: {
    display: "flex",
    gap: 14,
    fontSize: 11.5,
    color: "var(--text-secondary)",
    margin: "8px 0 10px",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  swatchDel: {
    width: 11,
    height: 11,
    borderRadius: 3,
    background: "var(--code-del)",
  } satisfies CSSProperties,
  swatchAdd: {
    width: 11,
    height: 11,
    borderRadius: 3,
    background: "var(--code-add)",
  } satisfies CSSProperties,

  diff: {
    fontSize: 12.5,
    lineHeight: 1.75,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px 16px",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,

  footer: { display: "flex", gap: 8, marginLeft: "auto" } satisfies CSSProperties,
};
