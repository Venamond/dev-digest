import type { CSSProperties } from "react";

/** Co-located styles for the all-agents eval overview (design AgentEvalOverview). */
export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "flex-end", marginBottom: 6 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto" } satisfies CSSProperties,

  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 24,
    marginTop: 8,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  } satisfies CSSProperties,
  agentIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  agentText: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  agentTitleRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  agentName: { fontSize: 14.5, fontWeight: 700 } satisfies CSSProperties,
  modelChip: {
    fontSize: 10.5,
    color: "var(--text-muted)",
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentSub: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,

  mini: { textAlign: "center", minWidth: 66 } satisfies CSSProperties,
  miniLabel: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  miniValue: { fontSize: 18, fontWeight: 700, marginTop: 2 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,

  feed: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
    marginTop: 8,
  } satisfies CSSProperties,
  feedRow: {
    display: "grid",
    // AGENT · CASE · DATE · VER · RECALL · PREC · CITE · PASS — the
    // reference's column set. `CASE` is what distinguishes a set run from a
    // single-case trial now that both appear here.
    gridTemplateColumns: "150px 1fr 130px 56px 1fr 1fr 1fr 64px",
    gap: 12,
    padding: "10px 16px",
    alignItems: "center",
    fontSize: 12.5,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    background: "transparent",
  } satisfies CSSProperties,
  feedAgent: {
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  feedRanAt: { color: "var(--text-secondary)", fontSize: 11.5 } satisfies CSSProperties,
  feedVersion: { color: "var(--accent-text)" } satisfies CSSProperties,
  feedPass: { fontWeight: 600 } satisfies CSSProperties,

  // MetricBar (the mockup's MiniBar): a filled track plus its right-aligned value.
  bar: { display: "flex", alignItems: "center", gap: 7 } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 6,
    background: "var(--bg-hover)",
    borderRadius: 3,
    overflow: "hidden",
  } satisfies CSSProperties,
  barValue: {
    fontSize: 11,
    color: "var(--text-secondary)",
    width: 30,
    textAlign: "right",
  } satisfies CSSProperties,

  state: { padding: "20px 0", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  feedCase: {
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
};
