import type { CSSProperties } from "react";

export const LINE_HEIGHT_PX = 21;

export const s = {
  shell: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  shellFill: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileName: {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 11.5 } satisfies CSSProperties,
  // overflowX hidden in both modes: lines soft-wrap, so there is nothing to
  // scroll sideways — and a horizontal scrollbar would drag the line-number
  // gutter out of view with it.
  pane: {
    background: "var(--bg-primary)",
    overflowX: "hidden",
  } satisfies CSSProperties,
  paneFill: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  editorRows: {
    display: "flex",
    alignItems: "flex-start",
    minHeight: "100%",
  } satisfies CSSProperties,
  gutterCol: { flexShrink: 0, paddingTop: 10 } satisfies CSSProperties,
  gutterLine: {
    width: 40,
    textAlign: "right",
    paddingRight: 12,
    color: "var(--text-muted)",
    userSelect: "none",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontVariantNumeric: "tabular-nums",
    fontSize: 12.5,
    lineHeight: "21px",
    minHeight: 21,
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "none",
    overflow: "hidden",
    border: "none",
    borderRadius: 0,
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: 12.5,
    lineHeight: "21px",
    padding: "10px 12px 10px 0",
    // Soft-wrap instead of running off the right edge. `anywhere` also breaks
    // unbroken tokens (long paths, URLs) that no space would let wrap.
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  /**
   * Off-screen twin of the textarea's text box, used to measure how many
   * visual rows each logical line occupies once wrapped. Every property that
   * affects line breaking must match `textarea` exactly.
   */
  mirror: {
    position: "absolute",
    top: 0,
    left: -99999,
    visibility: "hidden",
    pointerEvents: "none",
    height: "auto",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: 12.5,
    lineHeight: "21px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
  } satisfies CSSProperties,
} as const;
