import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "22px 28px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 960,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  } satisfies CSSProperties,
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 650,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  repoAccent: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  selectionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  acceptedCount: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  droppedCount: {
    fontSize: 12.5,
    color: "var(--text-tertiary, var(--text-secondary))",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
