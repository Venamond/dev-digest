import type { CSSProperties } from "react";

/** Co-located styles for the AgentEditor shell. */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  /* One row: the `Tabs` bar, then the disabled `CI` tab as a sibling, then a
     filler that carries the bar's underline to the right edge. `TabDef` has no
     `disabled` flag and `src/vendor/ui` is read-only third-party code, so the
     sixth tab is a plain <button> styled to match an inactive tab. */
  tabsBar: { marginTop: 14, display: "flex", alignItems: "stretch" } satisfies CSSProperties,
  disabledTab: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    border: "none",
    borderBottom: "1px solid var(--border)",
    background: "transparent",
    cursor: "not-allowed",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-muted)",
    opacity: 0.6,
  } satisfies CSSProperties,
  tabsFiller: { flex: 1, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;
