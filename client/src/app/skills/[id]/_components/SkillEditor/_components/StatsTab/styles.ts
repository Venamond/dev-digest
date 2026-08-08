import type { CSSProperties } from "react";

/** Co-located styles for Skill → Stats tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  kpiRow: { display: "flex", gap: 12, marginBottom: 4 } satisfies CSSProperties,
  kpi: {
    flex: 1,
    padding: 15,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  kpiHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  kpiValueRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    marginTop: 10,
  } satisfies CSSProperties,
  kpiValue: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  kpiSuffix: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  emptyHint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    padding: "12px 0 4px",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 8,
  } satisfies CSSProperties,
  agentRow: (muted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    opacity: muted ? 0.55 : 1,
  }),
  agentIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  agentName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  donutWrap: { display: "grid", placeItems: "center", paddingTop: 6 } satisfies CSSProperties,
} as const;
