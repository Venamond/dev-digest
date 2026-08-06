import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab. */
export const s = {
  wrap: { width: "100%" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20, gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 10,
    marginTop: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  snapshotHint: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  danger: {
    marginTop: 32,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } satisfies CSSProperties,
  dangerCopy: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  dangerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,
  dangerBody: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 4,
    lineHeight: 1.45,
  } satisfies CSSProperties,
} as const;
