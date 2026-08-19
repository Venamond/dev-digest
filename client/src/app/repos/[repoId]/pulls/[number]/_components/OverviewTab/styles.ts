import type { CSSProperties } from "react";

export const s = {
  /* auto-fit rather than a media query: these style objects are inline, so
     they cannot carry one, and auto-fit degrades to one column on narrow
     viewports with no CSS file. */
  cards: {
    display: "grid",
    /*
     * 600px, not 360px. The Blast Radius stat row has to fit four counters
     * plus the Tree|Graph control on ONE line — roughly 520px of content, so
     * ~560px once the card's 20px side padding is taken off. A 360px track
     * guaranteed a wrapped counter on every two-column layout.
     *
     * With this track the pair sits side by side only when each side really
     * has the room; below ~1216px of content the grid drops to a single
     * full-width column, which is wider still. Cards never get squeezed into
     * a width their own content cannot use.
     */
    gridTemplateColumns: "repeat(auto-fit, minmax(600px, 1fr))",
    gap: 16,
    alignItems: "start",
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
