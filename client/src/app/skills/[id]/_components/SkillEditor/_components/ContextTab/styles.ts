import { rootColor } from "@/lib/project-context";
import type { CSSProperties } from "react";

/* Inline style objects — no :hover, no media queries (client/INSIGHTS.md).
   Every column that can hold a repository path carries `minWidth: 0`, and the
   paths themselves `overflowWrap: "anywhere"`: `break-word` only breaks
   BETWEEN words, and a path has no spaces to break at. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
    minWidth: 0,
  } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  filterBox: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
    color: "var(--text-muted)",
    fontSize: 12,
    flexShrink: 0,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 12,
  } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "0 0 12px",
    lineHeight: 1.45,
  } satisfies CSSProperties,

  /* M5/M4 draw this as one line under the list — tokens left, the injection
     sentence right — not as a filled card. */
  totals: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,
  totalsLine: {
    fontSize: 12.5,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
  totalsCaption: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    textAlign: "right",
    flexShrink: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  ceilingWarning: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 12,
    minWidth: 0,
  } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  row: (attached: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    /* A ticked row IS highlighted — the human asked for the selection to be
       visible, 2026-08-23. */
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.7 : attached ? 1 : 0.85,
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
  }),
  dragHandle: (canDrag: boolean) =>
    ({
      color: "var(--text-muted)",
      display: "inline-flex",
      flexShrink: 0,
      cursor: canDrag ? "grab" : "default",
      opacity: canDrag ? 1 : 0.3,
    }) satisfies CSSProperties,
  moveGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  moveBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 14,
    padding: 0,
    borderRadius: 3,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
  attachBox: (attached: boolean) =>
    ({
      width: 16,
      height: 16,
      flexShrink: 0,
      borderRadius: 4,
      border: "1.5px solid " + (attached ? "var(--accent)" : "var(--border-strong)"),
      background: attached ? "var(--accent)" : "transparent",
      display: "grid",
      placeItems: "center",
      padding: 0,
      cursor: "pointer",
      color: "var(--bg-primary)",
    }) satisfies CSSProperties,

  nameCol: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  meta: {
    fontSize: 11,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  /* Colour per root (M5): specs blue, docs green, insights amber. The map is
     in `@/lib/project-context` so both tabs and both drawers agree. */
  rootPill: (root: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color: rootColor(root).text,
    background: rootColor(root).bg,
    padding: "1px 7px",
    borderRadius: 4,
    flexShrink: 0,
  }),
  tokens: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  previewBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    padding: "3px 8px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
    font: "inherit",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "20px 0" } satisfies CSSProperties,

  drawer: {
    marginTop: 14,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  drawerHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    minWidth: 0,
  } satisfies CSSProperties,
  drawerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,

  /* `alignItems: flex-start` matters: in a flex COLUMN the default `stretch`
     makes the Attached button span the drawer's whole width, where M6/M3 draw
     a small one sitting at the left. */
  drawerInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 18px 20px",
    minWidth: 0,
  } satisfies CSSProperties,

  drawerMetaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,

  drawerPath: {
    fontSize: 13,
    fontWeight: 650,
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  drawerMeta: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 0,
  } satisfies CSSProperties,
  drawerUsedBy: {
    alignSelf: "stretch",
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  drawerUsedByLink: {
    fontSize: 12,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  drawerUsedByVia: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  drawerUsedByNone: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  drawerBody: { fontSize: 13, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,

  /* Grouped INDEX of what is attached (AC-17). Not a preview of the block a
     run sends — grouping by root reorders, and the real block is one
     `## Project context` in the human's order. The caption says so. */
  panel: {
    marginTop: 14,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  panelTitle: { fontSize: 12.5, fontWeight: 700 } satisfies CSSProperties,
  panelCaption: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  panelGroups: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  panelGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  } satisfies CSSProperties,
  panelHeading: {
    fontSize: 12,
    fontWeight: 650,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  panelPath: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,
  panelEmpty: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
