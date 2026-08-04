/* HoverPreviewAnchor — generic hover-triggered popover: debounced open, a
   grace-period close, and viewport-aware positioning. Content-agnostic —
   callers supply what to render via `content`; this component only owns
   WHEN and WHERE it shows. Two callers today: FindingsPreviewPopover (PR
   list — fetches its content lazily) and RunFindingsPreview (PR-detail
   Timeline — findings already in hand, no fetch). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { s } from "./styles";

const HOVER_OPEN_DELAY_MS = 200;
// Must stay LESS than HOVER_OPEN_DELAY_MS: each trigger holds independent
// open/close state, and "only one popover visible at a time" relies on the
// previously-hovered trigger finishing its close before a newly-hovered one
// opens. Don't reorder/change these without preserving that relationship.
const HOVER_CLOSE_DELAY_MS = 150;

// Clearance from the browser viewport edge, and from the trigger itself.
const VIEWPORT_GAP = 8;
const TRIGGER_GAP = 6;

type Pos =
  | { top: number; bottom?: undefined; left: number; maxHeight: number }
  | { bottom: number; top?: undefined; left: number; maxHeight: number };

export function HoverPreviewAnchor({
  content,
  onOpenChange,
  children,
}: {
  content: React.ReactNode;
  /** Fires whenever the popover opens/closes — lets a caller gate its own
   *  data fetch behind the same hover debounce (e.g. FindingsPreviewPopover's
   *  lazy `usePrReviews`) without this component knowing about fetching. */
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(false);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };

  React.useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Measure the trigger's position when the popover opens, so the portaled
  // content (rendered into document.body) can be placed with position: fixed
  // instead of relying on an absolutely-positioned ancestor — which is what
  // let ancestor cards' `overflow: hidden` clip it before. Prefer whichever
  // side (below/above the trigger) has more room; cap maxHeight to that
  // available space so the popover renders at its full natural height when
  // the content fits, and only scrolls (via s.popoverAnchor's overflowY)
  // when it genuinely doesn't fit either side.
  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_GAP;
    const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_GAP;
    if (spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + TRIGGER_GAP, left: rect.left, maxHeight: spaceBelow });
    } else {
      setPos({ bottom: window.innerHeight - rect.top + TRIGGER_GAP, left: rect.left, maxHeight: spaceAbove });
    }
  }, [open]);

  return (
    <div
      data-findings-preview
      ref={anchorRef}
      style={s.wrapper}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {open && pos && createPortal(<div style={{ ...s.popoverAnchor, ...pos }}>{content}</div>, document.body)}
    </div>
  );
}
