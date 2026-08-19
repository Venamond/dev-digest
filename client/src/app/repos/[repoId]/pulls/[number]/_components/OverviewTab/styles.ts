import type { CSSProperties } from "react";

export const s = {
  /* auto-fit rather than a media query: these style objects are inline, so
     they cannot carry one, and auto-fit degrades to one column on narrow
     viewports with no CSS file. */
  cards: {
    display: "grid",
    /*
     * Always TWO columns — Intent and Blast Radius sit side by side, which is
     * the whole point of the pair: what the PR meant to do, beside what it can
     * reach. `auto-fit` + a `minmax` floor was tried and rejected twice: a low
     * floor (360px) let the Blast stat row wrap, and a floor high enough to
     * stop that (600px) collapsed the grid to one column on ordinary laptop
     * widths — the cards ended up stacked, which is worse than a wrapped
     * counter.
     *
     * `minmax(0, 1fr)`, not `1fr`: a bare `1fr` floors at min-content, so one
     * card with a long unbreakable path could push the other narrow.
     *
     * styles.ts objects cannot carry media queries (see the plan's D20), so
     * this is deliberately unconditional: the studio is a desktop surface.
     * Below roughly 1100px of content the Blast counters wrap among
     * themselves — the toggle stays pinned right — which degrades far more
     * gracefully than stacking.
     */
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
    // Stretch, not start: the taller card sets the row height and the other
    // grows to match, so the pair reads as one band. Shrinking Blast Radius
    // lets Intent shrink back with it — the row is only ever as tall as its
    // tallest member. Each card also needs height:100% to fill the cell its
    // <section> wrapper stretches to.
    alignItems: "stretch",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
