import type { CSSProperties } from "react";

/* Colocated inline styles (client/'s convention). No `:hover` is possible
   here — the one interactive control, the regenerate button, is `IconBtn`,
   which owns its own hover state, so this file needs no `dd-` escape hatch in
   app/globals.css. */
export const s = {
  wrap: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
    padding: 18,
    borderRadius: 10,
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
  } satisfies CSSProperties,
  /* Column 1 — fixed, never shrinks. */
  statusTile: (bg: string, color: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: bg,
    color,
    flexShrink: 0,
  }),
  /* Column 2 — the only column that gives way. `minWidth: 0` is load-bearing:
     without it a flex item refuses to shrink below min-content and the long
     verdict label jumps to its own line (client/INSIGHTS.md:104-109). */
  main: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  /* The largest text in the banner. */
  verdictLabel: (color: string): CSSProperties => ({
    fontSize: 18,
    fontWeight: 700,
    color,
  }),
  paragraph: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    marginTop: 8,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  staleNote: {
    fontSize: 12,
    color: "var(--warn)",
    marginTop: 8,
  } satisfies CSSProperties,
  /* The `ⓘ` glyph itself: no background, sits on the title row's baseline. */
  infoGlyph: {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--text-muted)",
    background: "transparent",
  } satisfies CSSProperties,
  /* The hover panel. It renders paths, so it needs `anywhere` — `break-word`
     only breaks BETWEEN words and a repo path has no spaces
     (client/INSIGHTS.md:110-118). */
  panel: {
    width: 320,
    maxWidth: "min(320px, 90vw)",
    boxSizing: "border-box",
    background: "var(--bg-elevated)",
    borderStyle: "solid",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: "var(--border)",
    borderRadius: 8,
    boxShadow: "var(--shadow-modal)",
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
    overflowWrap: "anywhere",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  panelGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
  } satisfies CSSProperties,
  panelHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  panelList: {
    margin: 0,
    paddingLeft: 0,
    listStyleType: "none",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  } satisfies CSSProperties,
  panelItem: {
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  /* Column 3 — fixed width band holding the regenerate control, the ring and
     the cost line. */
  side: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  /* The regenerate control sits to the LEFT of the ring, on the verdict's
     horizontal band — not inside the ring's stack. */
  sideTop: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  } satisfies CSSProperties,
  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  } satisfies CSSProperties,
  scoreLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  /* AC-38's empty ring. `CircularScore` types `score: number` and renders it,
     and src/vendor/ui is do-not-touch — so the no-run ring is drawn here.
     Precedent: BlastCard/NetworkOverlay.tsx:92. The track colour matches
     CircularScore's own unfilled circle (`--bg-hover`). */
  emptyRing: {
    boxSizing: "border-box",
    width: 52,
    height: 52,
    borderRadius: 999,
    borderStyle: "solid",
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderTopColor: "var(--bg-hover)",
    borderRightColor: "var(--bg-hover)",
    borderBottomColor: "var(--bg-hover)",
    borderLeftColor: "var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    fontSize: 15.6,
    fontWeight: 700,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  costLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    fontSize: 12,
  } satisfies CSSProperties,
  costGlyph: {
    color: "var(--text-muted)",
    opacity: 0.7,
  } satisfies CSSProperties,
  /* Dimmer than the price beside it (AC-25). */
  tokens: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  /* The empty / in-progress / error states. Each is one box with its own
     copy, so the three are distinguishable on sight (AC-31). */
  stateBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 18,
    borderRadius: 10,
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
  } satisfies CSSProperties,
  stateText: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  errorText: {
    fontSize: 13,
    color: "var(--crit)",
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
