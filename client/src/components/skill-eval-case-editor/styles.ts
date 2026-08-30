import type { CSSProperties } from "react";

/** Co-located styles for the skill eval case editor (screen B of the track-F
    reference). Two panes: authored Before/After on the left, expected output
    over the two-sided actual output on the right. */
export const s = {
  body: { display: "flex", minHeight: 0, height: 520 } satisfies CSSProperties,
  left: {
    flex: 1,
    minWidth: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
  } satisfies CSSProperties,
  right: {
    width: 420,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    padding: "14px 16px",
    gap: 10,
  } satisfies CSSProperties,

  pad: { padding: "14px 16px 0" } satisfies CSSProperties,
  inputHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 16px 8px",
  } satisfies CSSProperties,
  subTabs: {
    display: "flex",
    gap: 6,
    padding: "10px 16px 0",
  } satisfies CSSProperties,
  subTab: (on: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid " + (on ? "var(--accent)" : "var(--border-strong)"),
    background: on ? "var(--accent-bg)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--text-secondary)",
  }),
  tabBody: { padding: "12px 16px 16px" } satisfies CSSProperties,

  area: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  disclosure: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
    marginTop: 4,
  } satisfies CSSProperties,
  previewPre: {
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    fontSize: 11.5,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    maxHeight: 220,
    overflow: "auto",
  } satisfies CSSProperties,

  expectedHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  expectedTitle: { fontSize: 13, fontWeight: 700 } satisfies CSSProperties,
  expectedActions: { marginLeft: "auto" } satisfies CSSProperties,
  expectedArea: {
    flex: 1,
    minHeight: 170,
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12,
    lineHeight: 1.5,
  } satisfies CSSProperties,

  /* Deliberately the same block as `Actual output` in the agent case editor
     (`components/eval-case-editor/styles.ts`) — reported 2026-08-29 as looking
     unlike its twin. It was the pre-fix shape: a 190px grey strip under an
     uppercase micro-label, where the agent editor had already been corrected
     to a full-height panel whose inner box mirrors Expected output above it.
     Change the two together or they drift apart again. */
  actualPanel: {
    // `expectedArea` above is `flex: 1`; matching it here makes the two share
    // the column instead of leaving this one a strip at the bottom edge, and
    // `minHeight: 0` is what lets the inner box scroll rather than push the
    // column past the modal.
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  actualTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  actualBox: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 12,
    background: "var(--code-bg)",
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  actualEmpty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actualJson: {
    fontSize: 11,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    color: "var(--text-secondary)",
    margin: 0,
    overflow: "auto",
    minHeight: 0,
  } satisfies CSSProperties,
  sideError: { fontSize: 11.5, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,

  footer: { display: "flex", alignItems: "center", gap: 10, width: "100%" } satisfies CSSProperties,
  runOnSave: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    marginRight: "auto",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
