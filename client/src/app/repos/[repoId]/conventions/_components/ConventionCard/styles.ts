import type { CSSProperties } from "react";

/** Wide enough for "Accepted" + icon so Accept → Accepted does not reflow the card. */
const ACTION_COL_WIDTH = 118;

export const s = {
  card: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderLeft: "3px solid var(--ok)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  rule: {
    margin: 0,
    fontSize: 14.5,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.35,
  } satisfies CSSProperties,
  ruleInput: {
    width: "100%",
    fontSize: 14,
    fontWeight: 500,
    fontStyle: "italic",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
    width: ACTION_COL_WIDTH,
  } satisfies CSSProperties,
  actionBtn: {
    width: "100%",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  /** Path header + code body as one recessed block (matches mockup). */
  evidenceBlock: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 30,
    padding: "0 10px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  evidenceLink: {
    flex: 1,
    minWidth: 0,
    color: "var(--accent-text)",
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  copyBtn: {
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    flexShrink: 0,
    marginLeft: "auto",
  } satisfies CSSProperties,
  /**
   * Exact file excerpt: preserve newlines + indentation (not wrapped prose).
   * Height grows with content, capped at ~1/4 of the viewport — then scrolls.
   */
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: "pre",
    tabSize: 2,
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: "25vh",
    minHeight: "2.5em",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  confRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    maxWidth: 160,
    height: 5,
    borderRadius: 999,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  barFill: (color: string, pct: number): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
  }),
  editRow: { display: "flex", gap: 6, width: "100%" } satisfies CSSProperties,
} as const;
