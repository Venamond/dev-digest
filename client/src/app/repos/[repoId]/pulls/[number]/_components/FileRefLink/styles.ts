import type { CSSProperties } from "react";

export const s = {
  /* The blue link colour, not `--text-muted`: a file reference in the brief is
     the click target of AC-29, and the colour is the affordance that says so.
     `overflowWrap: anywhere` + `minWidth: 0` because a path in this product
     runs past 90 characters with no spaces (client/INSIGHTS.md:110-118) — the
     tail truncation of AC-30 handles legibility, these two handle overflow. */
  link: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    color: "var(--accent-text)",
    textDecorationLine: "none",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  /* A reference that parses to no path has nowhere to go: plain muted text,
     never a broken link. */
  plain: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
