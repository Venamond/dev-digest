import type { CSSProperties } from "react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

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
    columnGap: 10,
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
    minWidth: 0,
  } satisfies CSSProperties,
  symbol: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  /* A row, not a heading: the whole strip is the disclosure control, with the
     caller count parked on the right so a collapsed list still says how much
     is hidden. */
  symbolHeader: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    // Highlighted only while expanded, as on the reference: it ties the header
    // to the rows that just appeared under it.
    //
    // `--bg-hover` (#242424) — LIGHTER than the card's `--bg-elevated`
    // (#1c1c1c). I reached for `--bg-primary` first, which is #0a0a0a, i.e.
    // the page behind everything: on a card that reads as a black slab, not a
    // raised row. Raised surfaces here go up the scale, never down.
    background: open ? "var(--bg-hover)" : "none",
    borderRadius: 6,
    borderStyle: "none",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 6,
    paddingRight: 8,
    paddingBottom: 6,
    paddingLeft: 6,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  }),
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
    // Without this a flex column refuses to shrink below its widest child, so
    // a long path widens the whole card instead of wrapping inside it.
    minWidth: 0,
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  /* The rail is what makes a caller list read as a branch of the symbol above
     it rather than a second, unrelated list. */
  /* The rail runs unbroken down the whole list — `gap` would cut it, so rows
     carry their own spacing as padding instead. `--text-muted` rather than
     `--border`: at this width the border token is nearly invisible on the
     card. */
  list: {
    margin: 0,
    paddingTop: 2,
    paddingRight: 0,
    paddingBottom: 2,
    paddingLeft: 0,
    marginLeft: 9,
    listStyleType: "none",
    display: "flex",
    flexDirection: "column",
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    borderLeftColor: "var(--text-muted)",
  } satisfies CSSProperties,
  /** The ├ tick: a short horizontal stub joining the rail to one row. */
  listTick: {
    width: 10,
    flexShrink: 0,
    alignSelf: "center",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    borderTopColor: "var(--text-muted)",
  } satisfies CSSProperties,
  listRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,
  /** An importer row: dimmer than a caller, because it is weaker evidence —
   *  we know the file depends on this one, but not where. No new hue: blue is
   *  taken by endpoints and amber by crons, and a third colour would read as a
   *  third category rather than as a weaker version of this one. */
  importerItem: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.45,
    paddingTop: 3,
    paddingBottom: 3,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  importerLink: {
    color: "var(--text-muted)",
    textDecorationLine: "none",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  listItem: {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.45,
    paddingTop: 3,
    paddingBottom: 3,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  /* The reference renders caller paths as plain light text, not blue links —
     the blue in that column belongs to the `<>` marks and the endpoint chips.
     Still an anchor: it deep-links, it just does not shout. */
  link: {
    color: "var(--text-secondary)",
    textDecorationLine: "none",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  tag: {
    display: "inline-block",
    fontFamily: MONO,
    fontSize: 12,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  /* Endpoints and crons are the ANSWER the map exists to give — what this
     change can reach from outside. The reference gives them chips, in two
     colours, so they read at a glance instead of as two more grey lines. */
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    // Indented to sit under the caller paths, as on the reference — they are
    // reached THROUGH those callers, not alongside the symbol.
    marginLeft: 19,
    marginTop: 2,
  } satisfies CSSProperties,
  chip: (kind: "endpoint" | "cron"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.5,
    borderRadius: 6,
    paddingTop: 3,
    paddingRight: 9,
    paddingBottom: 3,
    paddingLeft: 8,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    overflowWrap: "anywhere",
    ...(kind === "endpoint"
      ? {
          background: "var(--accent-bg)",
          color: "var(--accent-text)",
          borderTopColor: "var(--accent-text)",
          borderRightColor: "var(--accent-text)",
          borderBottomColor: "var(--accent-text)",
          borderLeftColor: "var(--accent-text)",
        }
      : {
          background: "color-mix(in srgb, var(--warn) 14%, transparent)",
          color: "var(--warn)",
          borderTopColor: "var(--warn)",
          borderRightColor: "var(--warn)",
          borderBottomColor: "var(--warn)",
          borderLeftColor: "var(--warn)",
        }),
  }),
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
  /* The number and the title share ONE line. Without `minWidth: 0` on the
     title, flex refuses to break it and pushes the whole title to its own
     row — which is what made #8 render as a bare number above its heading. */
  priorTitleLine: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "nowrap",
    gap: 8,
  } satisfies CSSProperties,
  priorNumber: {
    fontFamily: MONO,
    fontSize: 12,
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  priorTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  priorStatus: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--warn)",
  } satisfies CSSProperties,
  /* Same chip as IntentCard's inline code: a highlight here means "this names
     real code in this repository", verified against the payload — not "this
     word looked path-shaped". */
  inlineCode: {
    fontFamily: MONO,
    fontSize: 12,
    fontStyle: "normal",
    overflowWrap: "anywhere",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    borderRadius: 4,
    paddingTop: 1,
    paddingRight: 5,
    paddingBottom: 1,
    paddingLeft: 5,
  } satisfies CSSProperties,
  /* What that PR set out to do, in its own words — the intent line the Intent
     layer already derived for it, or its description. A fact about that PR,
     never a claim about how it relates to this one. */
  priorDescription: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /* The join made visible: which path this PR and that one have in common. */
  priorFiles: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    fontSize: 12,
    lineHeight: 1.9,
  } satisfies CSSProperties,
  priorFinding: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--warn)",
  } satisfies CSSProperties,
  priorMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
