import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab (ported from `screen_agents.jsx:139-179`
    and `agent_widgets.jsx:43-65`). */
export const s = {
  /* Full width, as the reference draws it. The mockup's `maxWidth: 720` was
     an artboard constraint, not a design rule: at 720 the case name wraps to
     two lines, the expectation badge breaks mid-phrase, and the actions bunch
     up in the middle of an otherwise empty pane. */
  wrap: { width: "100%" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  headerRight: { marginLeft: "auto" } satisfies CSSProperties,

  strip: { display: "flex", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  card: {
    flex: 1,
    padding: "11px 13px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  cardLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 6,
  } satisfies CSSProperties,
  cardValueRow: { display: "flex", alignItems: "baseline", gap: 7 } satisfies CSSProperties,
  cardValue: (color: string): CSSProperties => ({ fontSize: 22, fontWeight: 700, color }),
  cardDelta: (up: boolean): CSSProperties => ({
    fontSize: 11.5,
    fontWeight: 600,
    color: up ? "var(--ok)" : "var(--crit)",
  }),

  note: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  } satisfies CSSProperties,
  completion: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginBottom: 20,
  } satisfies CSSProperties,

  casesHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  } satisfies CSSProperties,
  casesTitle: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  casesActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  progress: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,

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
  rowTitleLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  rowName: {
    fontSize: 12.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  expectation: (positive: boolean): CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.03em",
    padding: "1px 7px",
    borderRadius: 4,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    flexShrink: 0,
    // Blue for MUST FIND, GREEN for MUST NOT FLAG — the reference colours both
    // as live assertions. Muted grey read as "disabled" or "not applicable",
    // which is the opposite of what a negative case is.
    color: positive ? "var(--accent-text)" : "var(--ok)",
    background: positive ? "var(--accent-bg)" : "var(--ok-bg)",
    border: "1px solid " + (positive ? "var(--accent)" : "var(--ok)"),
  }),
  /* A failed case reads differently from a case that ran and did not pass: the
     reason is on the crit colour, an assertion miss stays muted (AC-44). */
  rowResult: (errored: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: errored ? "var(--crit)" : "var(--text-muted)",
    marginTop: 2,
  }),
  rowActions: {
    display: "flex",
    gap: 2,
    marginLeft: "auto",
    flexShrink: 0,
    alignItems: "center",
  } satisfies CSSProperties,

  confirmBody: { padding: "18px 24px", display: "grid", gap: 10 } satisfies CSSProperties,
  confirmText: { fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
  confirmNote: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmFooter: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  /** Occupies the Run button's slot while that row's trial executes. */
  rowSpinner: {
    width: 26,
    height: 26,
    display: "inline-grid",
    placeItems: "center",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /** Keeps `CRITICAL · security` on one line beside the actions. */
  summaryBadge: { flexShrink: 0, whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
