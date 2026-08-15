"use client";

import React from "react";

/**
 * Remembers the scroll offset of each PR-detail tab and restores it on return.
 *
 * Why this is needed: the page itself never scrolls. The scroll container is
 * the shell's `<main overflow:auto>` (`vendor/ui/shell/AppFrame.tsx`), which is
 * vendored read-only code, so we reach it with `closest("main")` from our own
 * root rather than holding a ref to it. Switching tabs unmounts the outgoing
 * tab's content, `<main>` shrinks to the incoming content's height, and the
 * browser clamps `scrollTop` — measured 2587 → 244 on this view. Nothing
 * restores it afterwards, so every return landed at the top of the list.
 */
export function useTabScroll(tab: string, opts?: { skipRestore?: boolean }) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const offsets = React.useRef<Record<string, number>>({});
  const skipRestore = opts?.skipRestore ?? false;

  const container = () => rootRef.current?.closest("main") ?? null;

  /** Call immediately BEFORE navigating away, while the old tab is still mounted. */
  const remember = React.useCallback((leavingTab: string) => {
    const el = rootRef.current?.closest("main");
    if (el) offsets.current[leavingTab] = el.scrollTop;
  }, []);

  React.useLayoutEffect(() => {
    const el = container();
    if (!el) return;

    // Arriving with an explicit target (?finding=…) — that component scrolls
    // itself to the card. Restoring a remembered offset here would fight it.
    if (skipRestore) return;

    const want = offsets.current[tab];
    if (want == null || want === 0) return;

    // The incoming tab may still be growing (async query, images, lazy rows),
    // so scrollTop can be clamped below `want` on the first pass. Retry over a
    // few frames, and stop as soon as it sticks or the content stops growing.
    let frame = 0;
    let raf = 0;
    const apply = () => {
      el.scrollTop = want;
      frame += 1;
      if (Math.abs(el.scrollTop - want) > 1 && frame < 10) raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, skipRestore]);

  return { rootRef, remember };
}
