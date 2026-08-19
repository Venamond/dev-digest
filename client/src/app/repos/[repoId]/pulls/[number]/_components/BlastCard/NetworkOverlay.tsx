"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ForceLayout } from "./force-layout";
import { GraphContent } from "./ForceGraph";
import { fit, panBy, toTransform, zoomAt, ZOOM_STEP, type Viewport } from "./viewport";
import { s } from "./styles";

/**
 * The network graph, full screen and interactive: scroll to zoom, drag to move.
 *
 * Full screen rather than inline because a force layout needs room. Inside a
 * half-width card the nodes are either too small to read or too crowded to
 * separate, which is the state the inline version was in.
 *
 * The maths lives in `viewport.ts` — this component only turns events into
 * calls. "The graph jumps when I scroll" is an arithmetic bug, and arithmetic
 * is cheaper to test than a pointer gesture.
 */
export function NetworkOverlay({
  layout,
  onClose,
}: {
  layout: ForceLayout;
  onClose: () => void;
}) {
  const t = useTranslations("blast");
  const [view, setView] = React.useState<Viewport>(() => fit(layout.width, layout.height, 1200, 700));
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);

  // Fit to the real window once mounted; the initial state above is only a
  // sensible guess for the first paint (and for jsdom, which has no layout).
  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setView(fit(layout.width, layout.height, r.width, r.height));
  }, [layout]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const zoomBy = (factor: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    setView((v) => zoomAt(v, factor, (r?.width ?? 0) / 2, (r?.height ?? 0) / 2));
  };

  const reset = () => {
    const r = frameRef.current?.getBoundingClientRect();
    setView(fit(layout.width, layout.height, r?.width ?? 1200, r?.height ?? 700));
  };

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-label={t("graph.ariaLabel")}>
      <div style={s.overlayBar}>
        <span style={s.overlayTitle}>{t("title")}</span>
        <div style={s.overlayActions}>
          <button type="button" style={s.iconBtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label={t("graph.zoomIn")}>
            <Icon.Plus size={15} />
          </button>
          <button type="button" style={s.iconBtn} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label={t("graph.zoomOut")}>
            <Icon.Slash size={15} style={{ transform: "rotate(90deg)" }} />
          </button>
          <button type="button" style={s.iconBtn} onClick={reset} aria-label={t("graph.reset")}>
            <Icon.RefreshCw size={15} />
          </button>
          <button type="button" style={s.iconBtn} onClick={onClose} aria-label={t("graph.close")}>
            <Icon.X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        style={s.overlayCanvas}
        onWheel={(e) => {
          const r = frameRef.current?.getBoundingClientRect();
          setView((v) =>
            zoomAt(
              v,
              e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
              e.clientX - (r?.left ?? 0),
              e.clientY - (r?.top ?? 0),
            ),
          );
        }}
        onPointerDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const from = dragRef.current;
          if (!from) return;
          setView((v) => panBy(v, e.clientX - from.x, e.clientY - from.y));
          dragRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          dragRef.current = null;
        }}
      >
        <svg width="100%" height="100%" style={{ display: "block", cursor: "grab" }}>
          <g transform={toTransform(view)}>
            <GraphContent layout={layout} />
          </g>
        </svg>
      </div>

      <div style={s.overlayLegend}>
        {(
          [
            ["#93bbfc", "graph.legendSymbol"],
            ["#cccccc", "graph.legendCallers"],
            ["#93bbfc", "graph.legendEndpoints"],
            ["#f59e0b", "graph.legendCrons"],
          ] as const
        ).map(([color, key]) => (
          <span key={key} style={s.legendItem}>
            <span style={s.legendDot(color)} />
            {t(key)}
          </span>
        ))}
      </div>
    </div>
  );
}
