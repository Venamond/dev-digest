import type { CSSProperties } from "react";

export const s = {
  card: {
    // Fills the grid cell so the pair stays level (OverviewTab/styles.ts).
    height: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: "var(--border)",
    background: "var(--bg-elevated)",
    paddingTop: 18,
    paddingRight: 20,
    paddingBottom: 18,
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
  headerLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  headerTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 15,
    fontStyle: "italic",
    fontWeight: 400,
    lineHeight: 1.5,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    columnGap: 32,
    rowGap: 16,
  } satisfies CSSProperties,
  scopeHeading: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  } satisfies CSSProperties,
  inScopeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--ok)",
  } satisfies CSSProperties,
  outScopeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyleType: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  inScopeText: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  outScopeText: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  bullet: (color: string): CSSProperties => ({
    width: 5,
    height: 5,
    borderRadius: 999,
    background: color,
    marginTop: 6,
    flexShrink: 0,
  }),
  divider: {
    height: 1,
    background: "var(--border)",
  } satisfies CSSProperties,
  /* A VERTICAL stack, not a wrapping chip row: each row is a pair (a bordered
     box beside its own chevron control), and the open row's description is a
     sibling in this same column, sitting directly under the row it belongs to
     rather than under the whole list. */
  riskRows: {
    display: "flex",
    flexDirection: "column",
    /* `stretch`, not `flex-start`: in a column flex box the cross axis is the
       WIDTH, so `flex-start` sizes every row to its own content and no amount
       of `flexGrow` inside the row can widen it — the row itself is already
       narrow. Both are needed for one column of equal blocks. */
    alignItems: "stretch",
    gap: 10,
  } satisfies CSSProperties,
  riskRow: {
    display: "flex",
    alignItems: "stretch",
    gap: 8,
    maxWidth: "100%",
    minWidth: 0,
  } satisfies CSSProperties,
  /* Box A. Subtle border while collapsed; expanded it takes the row's own
     severity colour.
     All boxes share one width: `flexGrow: 1` makes each fill the row beside its
     chevron, so the list reads as a column of equal blocks rather than a ragged
     edge. This overrides the mockup, where the three demo rows hug their own
     content — asked for by the human on 2026-08-24 against real data, where the
     titles differ far more in length than the mockup's do. */
  riskBox: (color: string, expanded: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: 4,
    minWidth: 0,
    borderRadius: 8,
    paddingTop: 8,
    paddingRight: 12,
    paddingBottom: 8,
    paddingLeft: 10,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: expanded ? color : "var(--border)",
    borderRightColor: expanded ? color : "var(--border)",
    borderBottomColor: expanded ? color : "var(--border)",
    borderLeftColor: expanded ? color : "var(--border)",
  }),
  riskTitleLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.35,
    color: "var(--text-primary)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  /* Line 2 of box A: the file reference, on the COLLAPSED row. `minWidth: 0`
     on every flex column above a path, per client/INSIGHTS.md:110-118. */
  riskRefLine: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  /* Box B — its own bordered control beside box A, never a glyph inside it.
     Blue border when open, and the chevron flips. */
  riskChevron: (expanded: boolean): CSSProperties => ({
    display: "grid",
    placeItems: "center",
    width: 34,
    alignSelf: "stretch",
    flexShrink: 0,
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
    color: expanded ? "var(--accent-text)" : "var(--text-muted)",
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: expanded ? "var(--accent)" : "var(--border)",
    borderRightColor: expanded ? "var(--accent)" : "var(--border)",
    borderBottomColor: expanded ? "var(--accent)" : "var(--border)",
    borderLeftColor: expanded ? "var(--accent)" : "var(--border)",
  }),
  /* No ChevronUp exists in the icon registry — the down chevron is turned. */
  chevronGlyph: (expanded: boolean): CSSProperties => ({
    transform: expanded ? "rotate(180deg)" : "none",
    transition: "transform .12s",
  }),
  detail: {
    /* No top margin: the block now sits INSIDE the rows column, whose `gap`
       already spaces it from the row above. A margin here would double that
       gap and detach the explanation from the row it belongs to. */
    marginTop: 0,
    borderRadius: 8,
    /* The darkest token in the scale, deliberately. `--bg-hover` is one step up
       from the card's `--bg-elevated` and the two read as almost the same
       surface — the opened block was barely distinguishable from the card
       around it. The human asked on 2026-08-24 for the detail to sit on black,
       and here the "slab cut out of the card" that client/INSIGHTS.md:190-201
       warns about is exactly the wanted effect: it is what marks one row as
       open. */
    background: "var(--bg-primary)",
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  detailText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  inlineCode: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    fontStyle: "normal",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    borderRadius: 4,
    paddingTop: 1,
    paddingRight: 5,
    paddingBottom: 1,
    paddingLeft: 5,
  } satisfies CSSProperties,
  fileRef: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  missing: {
    fontSize: 12,
    color: "var(--text-muted)",
    margin: 0,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  banner: {
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg, transparent)",
    borderRadius: 6,
    paddingTop: 8,
    paddingRight: 10,
    paddingBottom: 8,
    paddingLeft: 10,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "var(--warn)",
    borderRightColor: "var(--warn)",
    borderBottomColor: "var(--warn)",
    borderLeftColor: "var(--warn)",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
  } satisfies CSSProperties,
} as const;
