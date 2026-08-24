import type { CSSProperties } from "react";

export const s = {
  /* One full-width card below the Intent/Blast grid — not a grid item, so it
     is not on the half-width budget of client/INSIGHTS.md:70-87. */
  card: {
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
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,
  title: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  } satisfies CSSProperties,
  /* ONE line per row, as the mockup draws it: marker, reference, dash, reason.
     `nowrap` and `baseline` — with `wrap` the reason dropped onto a second line
     and the block stopped looking like the design. The reason is what gives way
     (see `reason` below), never the reference. */
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "nowrap",
    fontSize: 13,
    lineHeight: 1.55,
    minWidth: 0,
    /* Padding and a radius so the `.dd-focus-row:hover` fill in globals.css
       reads as one item rather than a bare colour change; the transparent
       resting background is what that rule overrides. */
    background: "transparent",
    borderRadius: 6,
    paddingTop: 5,
    paddingRight: 8,
    paddingBottom: 5,
    paddingLeft: 8,
    marginLeft: -8,
    marginRight: -8,
  } satisfies CSSProperties,
  marker: {
    color: "var(--accent-text)",
    flexShrink: 0,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  /* The reference keeps its whole width and never breaks. `FileRefLink` carries
     `overflow-wrap: anywhere`, which the RISK AREAS block needs to wrap a path
     inside a narrow card — here it split the reference mid-token
     (`…/modules/blast/serv` / `ice.ts:1`). `white-space` is inherited, so
     setting it on this wrapper disables the break for this row only, without
     touching the shared component. */
  refWrap: {
    display: "inline-flex",
    flexShrink: 0,
    whiteSpace: "nowrap",
    minWidth: 0,
  } satisfies CSSProperties,
  separator: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  /* The reason absorbs whatever width is left and is cut with an ellipsis
     rather than wrapping — `minWidth: 0` is what lets a flex item shrink below
     its content at all, and without it `text-overflow` never fires. The whole
     text stays in a `title`, the same recovery the truncated paths use. */
  reason: {
    color: "var(--text-secondary)",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
} as const;
