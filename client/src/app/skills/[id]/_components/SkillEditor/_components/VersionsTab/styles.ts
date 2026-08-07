import type { CSSProperties } from "react";

export const s = {
  wrap: { width: "100%" } satisfies CSSProperties,
  header: { marginBottom: 8 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.45,
    marginBottom: 16,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  versionChip: {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  meta: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  noteTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  // Widest occupant (the Restore button) sets the slot width; the Current
  // badge is narrower and right-aligns within it, so it lands flush with
  // where Restore would sit — and Diff/Hide (outside this slot) stays put.
  statusSlot: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    minWidth: 92,
  } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
  // Sits directly under its own row (Diff/Hide toggles it), not below the
  // whole list — negative top margin pulls it flush against that row.
  diffPanel: {
    marginTop: -2,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderTop: "none",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  diffTitle: { fontSize: 13, fontWeight: 600, marginBottom: 10 } satisfies CSSProperties,
  diffPre: {
    fontSize: 12,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    whiteSpace: "pre-wrap",
    margin: 0,
    maxHeight: 320,
    overflow: "auto",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)", marginTop: 12 } satisfies CSSProperties,
} as const;
