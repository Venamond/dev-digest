import type { CSSProperties } from "react";

export const MODAL_WIDTH = 720;

export const s = {
  /** Fills Modal body; only the skill textarea scrolls inside. */
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "14px 24px 12px",
    flex: 1,
    minHeight: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  } satisfies CSSProperties,
  top: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  banner: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 12.5,
    lineHeight: 1.35,
  } satisfies CSSProperties,
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  label: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  typeRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  typeBadge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  enabledWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginLeft: "auto",
  } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    fontWeight: 500,
  } satisfies CSSProperties,
  enabledHint: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  /** Grows; owns the only scrollbar in the dialog. */
  bodySection: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    gap: 6,
  } satisfies CSSProperties,
  bodyLabel: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  } satisfies CSSProperties,
  footerNote: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  footerActions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
