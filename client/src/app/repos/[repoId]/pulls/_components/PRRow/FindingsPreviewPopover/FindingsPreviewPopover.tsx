/* FindingsPreviewPopover — wraps the PR-list findings badge. On hover (after a
   short delay), lazily fetches this PR's reviews (the same data the PR-detail
   page uses) and shows a read-only preview of the individual findings behind
   the badge's count. Closes on mouse-leave after a short grace delay so
   moving the pointer from the badge into the popover doesn't flicker-close
   it — both the badge and the popover live inside one relatively-positioned
   wrapper, so a single pair of mouseEnter/mouseLeave handlers on that wrapper
   covers both. */
"use client";

import React from "react";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPreviewPanel } from "./FindingsPreviewPanel";
import { s } from "./styles";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 150;

export function FindingsPreviewPopover({
  prId,
  count,
  children,
}: {
  prId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = usePrReviews(prId, { enabled: open, staleTime: 60_000 });

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

  const findings = React.useMemo(() => (data ?? []).flatMap((r) => r.findings), [data]);

  return (
    <div data-findings-preview style={s.wrapper} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {open && (
        <div style={s.popoverAnchor}>
          <FindingsPreviewPanel findings={findings} count={count} loading={isLoading} />
        </div>
      )}
    </div>
  );
}
