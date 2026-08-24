import type { CSSProperties } from "react";

export const s = {
  // `cursor: help` signals "hover for detail" — matching the dotted-underline
  // convention this trigger's caller applies to the count text itself (see
  // PRRow.tsx / RunHistory.tsx), same visual language the codebase already
  // uses for the Timeline's "go to review" link.
  wrapper: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "help",
  } satisfies CSSProperties,
  // Portal-friendly: rendered via createPortal into document.body (see
  // HoverPreviewAnchor.tsx) so the panel escapes any ancestor's
  // `overflow: hidden`. top/bottom/left/maxHeight are computed per-instance
  // from the trigger's measured bounding rect and applied as inline styles —
  // whichever side (above/below) has more room wins, and maxHeight is capped
  // to that room so the popover shows in full when it fits, scrolling only
  // when it doesn't.
  popoverAnchor: {
    position: "fixed",
    zIndex: 1000,
    overflowY: "auto",
  } satisfies CSSProperties,
  panel: {
    width: 360,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    boxShadow: "var(--shadow-modal)",
    padding: "10px 0",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 14px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    marginBottom: 8,
  } satisfies CSSProperties,
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: "12px 0",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // Same layout slot as `loading` — shown instead of the empty-state `null`
  // when the reviews fetch errors, so hovering doesn't silently show nothing.
  error: {
    display: "flex",
    justifyContent: "center",
    padding: "12px 14px",
    color: "var(--text-muted)",
    fontSize: 12,
    textAlign: "center",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  item: {
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  } satisfies CSSProperties,
  fileLine: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  rationale: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.4,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
