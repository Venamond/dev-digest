import type { CSSProperties } from "react";

/** Co-located styles for the skill editor's Evals tab (screen A of the track-F
    reference). Deliberately WITHOUT a metric strip: the reference draws none,
    and its absence is the design, not an omission. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,

  casesHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  } satisfies CSSProperties,
  casesTitle: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  casesActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  progress: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,

  agentLine: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  } satisfies CSSProperties,

  /* Why a `must find` row can be red at 100% / 100%. Without this the screen
     reads as broken while working exactly as ruled. */
  twoSidedNote: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,

  noAgent: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 14,
  } satisfies CSSProperties,
  noAgentText: { fontSize: 12, color: "var(--text-primary)" } satisfies CSSProperties,
  noAgentTitle: { fontWeight: 700, display: "block" } satisfies CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 6,
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowTitleLine: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  rowName: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  expectation: (positive: boolean): CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.03em",
    padding: "1px 7px",
    borderRadius: 4,
    textTransform: "uppercase",
    // Blue for MUST FIND, GREEN for MUST NOT FLAG — the reference colours both
    // as live assertions. Muted grey read as "disabled" or "not applicable",
    // which is the opposite of what a negative case is.
    color: positive ? "var(--accent-text)" : "var(--ok)",
    background: positive ? "var(--accent-bg)" : "var(--ok-bg)",
    border: "1px solid " + (positive ? "var(--accent)" : "var(--ok)"),
  }),
  /* An errored case is not a red cross: nothing was measured, so the line is
     warn-coloured and the failed line is crit-coloured. */
  rowResult: (errored: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: errored ? "var(--warn)" : "var(--text-muted)",
    marginTop: 2,
  }),
  rowReason: (errored: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: errored ? "var(--warn)" : "var(--crit)",
    marginTop: 2,
  }),
  rowMeta: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 2 } satisfies CSSProperties,

  confirmBody: { padding: "18px 24px", display: "grid", gap: 10 } satisfies CSSProperties,
  confirmText: { fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
  confirmNote: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmFooter: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
