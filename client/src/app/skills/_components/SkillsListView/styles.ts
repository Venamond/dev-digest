import type { CSSProperties } from "react";

/** Co-located styles for Skills Lab (design ScreenSkillsLab). */
export const s = {
  page: {
    display: "flex",
    height: "calc(100vh - 52px)",
    minHeight: 0,
  } satisfies CSSProperties,
  listCol: {
    width: 290,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHeader: { padding: "14px 14px 10px" } satisfies CSSProperties,
  listTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  h1: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-muted)",
    fontSize: 12,
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 12,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listBody: {
    flex: 1,
    overflow: "auto",
    padding: "0 8px 8px",
  } satisfies CSSProperties,
  selectPrompt: {
    flex: 1,
    display: "grid",
    placeItems: "center",
    padding: 40,
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  selectInner: { textAlign: "center", maxWidth: 340 } satisfies CSSProperties,
  selectTitle: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  selectBody: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    marginTop: 8,
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
