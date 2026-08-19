import type { CSSProperties } from "react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export const s = {
  card: {
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
    flexWrap: "wrap",
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
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    // Never squeezed, never wrapped away from the counters row.
    flexShrink: 0,
    borderRadius: 6,
    overflow: "hidden",
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: "var(--border)",
  } satisfies CSSProperties,
  toggleButton: (active: boolean): CSSProperties => ({
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.2,
    cursor: "pointer",
    borderStyle: "none",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 4,
    paddingRight: 9,
    paddingBottom: 4,
    paddingLeft: 9,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
  }),
  /* The stat row shares a line with the view toggle: the counts ARE the
     summary of the map, so they read as one band above the tree rather than
     as four large tiles competing with the symbol names below. */
  statBar: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    // NOT wrap: the card lives in a two-column grid, and at that width four
    // counters plus the toggle exceed one line. Wrapping the BAR pushed the
    // whole toggle onto a second row; wrapping only the counters keeps the
    // toggle pinned to the right of the first line, which is the reference.
    flexWrap: "nowrap",
    gap: 12,
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    // Tight on purpose: this row has to fit four counters plus the toggle
    // inside half the Overview width. Every px here buys a px of margin
    // before a counter wraps.
    columnGap: 12,
    rowGap: 6,
    // Take the slack and be the thing that wraps.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  statValue: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  statLabel: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  banner: {
    fontSize: 13,
    color: "var(--warn)",
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
  note: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  skeleton: {
    height: 96,
    borderRadius: 6,
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  summaryBox: {
    borderRadius: 8,
    background: "var(--bg-primary)",
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  /* The whole header is the disclosure control, so a generated summary can be
     folded away without losing it — it was paid for once and re-deriving costs
     another model call. */
  summaryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    borderStyle: "none",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  } satisfies CSSProperties,
  /* One chevron, rotated: the icon set has no ChevronUp. */
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    marginLeft: "auto",
    flexShrink: 0,
    transform: open ? "rotate(180deg)" : "none",
  }),
  summaryText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  symbol: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  /* A row, not a heading: the whole strip is the disclosure control, with the
     caller count parked on the right so a collapsed list still says how much
     is hidden. */
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    borderStyle: "none",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 2,
    paddingRight: 0,
    paddingBottom: 2,
    paddingLeft: 0,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  } satisfies CSSProperties,
  symbolCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingLeft: 22,
  } satisfies CSSProperties,
  symbolName: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolKind: {
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolFile: {
    fontFamily: MONO,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyleType: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  listItem: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  link: {
    color: "var(--accent-text)",
    textDecorationLine: "none",
  } satisfies CSSProperties,
  tag: {
    display: "inline-block",
    fontFamily: MONO,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /* Separates the map (structure) from the history below it — the reference
     draws a rule there, and without it the prior-PR block reads as one more
     row of the tree rather than a different kind of evidence. */
  divider: {
    borderTopStyle: "solid",
    borderTopWidth: 1,
    borderTopColor: "var(--border)",
    marginTop: 2,
  } satisfies CSSProperties,
  /* Prior PRs are their own bordered block, not a footnote: they are a second
     kind of evidence (history) beside the map (structure), and the reference
     design gives them a card of equal weight. */
  priorCard: {
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
    // The block itself is NOT filled: only its header is. Filling the whole
    // thing made the body a second surface floating inside the card; the
    // reference keeps the body at the card's own colour and lets borders do
    // the separating.
    background: "transparent",
    overflow: "hidden",
  } satisfies CSSProperties,
  /**
   * Closed, the block is an outline and nothing else — same colour as the card
   * around it, set apart only by its border. The fill appears only once it is
   * OPEN, where it marks the header off from the rows it now has beneath it.
   * A permanently filled strip read as a black slab sitting on the card.
   */
  priorToggle: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: open ? "var(--bg-primary)" : "transparent",
    borderStyle: "none",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderBottomStyle: "solid",
    borderBottomWidth: open ? 1 : 0,
    borderBottomColor: "var(--border)",
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13,
    color: "var(--text-secondary)",
    textAlign: "left",
  }),
  priorCountBadge: {
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.6,
    minWidth: 18,
    textAlign: "center",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
    paddingTop: 0,
    paddingRight: 5,
    paddingBottom: 0,
    paddingLeft: 5,
  } satisfies CSSProperties,
  /* No padding of its own: each row is full-bleed so its separator line spans
     the block, the way the reference draws it. */
  priorList: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  priorRow: (first: boolean): CSSProperties => ({
    display: "flex",
    gap: 10,
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    borderTopStyle: "solid",
    borderTopWidth: first ? 0 : 1,
    borderTopColor: "var(--border)",
  }),
  priorBullet: {
    fontSize: 12,
    lineHeight: 1.4,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  priorBody: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,
  priorTitleLine: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  priorNumber: {
    fontFamily: MONO,
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  priorTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
