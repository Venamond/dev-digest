import type { CSSProperties } from "react";

/** Type → accent color (design SkillsTab). */
export const TYPE_COLORS: Record<string, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Co-located styles for the Agent → Skills tab (design SkillsTab). */
export const s = {
  wrap: { display: "flex", flexDirection: "column", width: "100%" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
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
    margin: "0 0 14px",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (on: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: on ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.7 : on ? 1 : 0.7,
    cursor: "grab",
    width: "100%",
    boxSizing: "border-box",
  }),
  /**
   * Only linked rows are `draggable`, so the handle must not advertise a grab
   * on the unlinked ones at the bottom of the list — that read as "drag is
   * broken down here". Dimmed + default cursor when reordering is unavailable.
   */
  /* Identical to the Context tab's: reordering must look and behave the same
     wherever this product orders a list. */
  moveGroup: { display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 } satisfies CSSProperties,
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

  dragHandle: (canDrag: boolean) =>
    ({
      color: "var(--text-muted)",
      display: "inline-flex",
      flexShrink: 0,
      cursor: canDrag ? "grab" : "default",
      opacity: canDrag ? 1 : 0.3,
    }) satisfies CSSProperties,
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  typePill: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
    flexShrink: 0,
  }),
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "20px 0" } satisfies CSSProperties,
} as const;
