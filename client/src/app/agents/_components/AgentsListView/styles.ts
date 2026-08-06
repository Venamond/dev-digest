import type { CSSProperties } from "react";

/** Co-located styles for AgentsListView (empty/loading shell before redirect). */
export const s = {
  page: {
    display: "flex",
    height: "calc(100vh - 52px)",
    minHeight: 0,
    alignItems: "stretch",
  } satisfies CSSProperties,
  listCol: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "14px 10px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
