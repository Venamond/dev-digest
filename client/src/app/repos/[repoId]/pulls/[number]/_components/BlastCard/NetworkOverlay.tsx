"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Modal } from "@devdigest/ui";
import type { ForceLayout } from "./force-layout";
import { GraphContent } from "./ForceGraph";
import { createLiveGraph, type LiveGraph } from "./live-graph";
import {
  fit,
  panBy,
  rotateBy,
  toLayout,
  toTransform,
  zoomAt,
  ROTATE_STEP,
  ZOOM_STEP,
  type Viewport,
} from "./viewport";
import { s } from "./styles";

/**
 * The network graph in a modal: scroll to zoom, drag to move, buttons to turn.
 *
 * A modal rather than the card, because a force layout needs room — at half
 * the page width its nodes are either too small to read or too crowded to
 * separate, and there is no way to look closer. It uses the shared `Modal`
 * primitive so it behaves like every other dialog here (backdrop click, the
 * same chrome) instead of being a bespoke full-bleed panel.
 *
 * All the arithmetic lives in `viewport.ts` as pure functions with their own
 * tests. This component only turns events into calls: "the graph jumps when I
 * scroll" is a maths bug, and maths is far cheaper to test than a gesture.
 */
export function NetworkOverlay({
  layout,
  onClose,
}: {
  layout: ForceLayout;
  onClose: () => void;
}) {
  const t = useTranslations("blast");
  const [view, setView] = React.useState<Viewport>(() =>
    fit(layout.width, layout.height, 1000, 620),
  );
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);
  /** Which node the pointer is holding, if any. */
  const heldRef = React.useRef<string | null>(null);

  // The simulation keeps running while the modal is open, so the graph answers
  // a drag instead of being a picture that can be panned.
  const graphRef = React.useRef<LiveGraph | null>(null);
  const [nodes, setNodes] = React.useState(layout.nodes);
  const [pinned, setPinned] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    const g = createLiveGraph(layout);
    graphRef.current = g;
    const off = g.subscribe(() => {
      setNodes(g.snapshot());
      setPinned(g.pinned());
    });
    return () => {
      off();
      g.stop();
      graphRef.current = null;
    };
  }, [layout]);

  /** Pointer → layout coordinates, through the current pan, zoom and angle. */
  const atPointer = (clientX: number, clientY: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    return toLayout(
      view,
      layout.width / 2,
      layout.height / 2,
      clientX - (r?.left ?? 0),
      clientY - (r?.top ?? 0),
    );
  };

  // Fit to the real frame once mounted. The initial state above is only a
  // guess for the first paint — and for jsdom, which reports no layout at all.
  React.useEffect(() => {
    const r = frameRef.current?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      setView(fit(layout.width, layout.height, r.width, r.height));
    }
  }, [layout]);

  // The shared Modal has a backdrop and a close button but no Escape handling,
  // and `vendor/ui` is do-not-touch — so the dialog adds it here.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const centre = (): { cx: number; cy: number } => {
    const r = frameRef.current?.getBoundingClientRect();
    return { cx: (r?.width ?? 0) / 2, cy: (r?.height ?? 0) / 2 };
  };

  const zoomBy = (factor: number) => {
    const { cx, cy } = centre();
    setView((v) => zoomAt(v, factor, cx, cy));
  };

  const reset = () => {
    const r = frameRef.current?.getBoundingClientRect();
    setView(fit(layout.width, layout.height, r?.width ?? 1000, r?.height ?? 620));
    // Fit restores the arrangement too, not just the camera — otherwise a
    // graph pinned into a shape you no longer want has no way back.
    graphRef.current?.unpinAll();
    setPinned(new Set());
  };

  const controls: Array<[label: string, icon: React.ReactNode, run: () => void]> = [
    [t("graph.zoomIn"), <Icon.Plus key="i" size={15} />, () => zoomBy(ZOOM_STEP)],
    [t("graph.zoomOut"), <Icon.Slash key="o" size={15} />, () => zoomBy(1 / ZOOM_STEP)],
    [
      t("graph.rotateLeft"),
      <Icon.RefreshCw key="l" size={15} style={{ transform: "scaleX(-1)" }} />,
      () => setView((v) => rotateBy(v, -ROTATE_STEP)),
    ],
    [
      t("graph.rotateRight"),
      <Icon.RefreshCw key="r" size={15} />,
      () => setView((v) => rotateBy(v, ROTATE_STEP)),
    ],
    [t("graph.reset"), <Icon.Target key="f" size={15} />, reset],
  ];

  return (
    <Modal width={1100} title={t("title")} onClose={onClose} bodyScroll={false}>
      <div style={s.overlayActions}>
        {controls.map(([label, icon, run]) => (
          <button key={label} type="button" style={s.iconBtn} onClick={run} aria-label={label}>
            {icon}
          </button>
        ))}
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
          const held = heldRef.current;
          if (held) {
            const p = atPointer(e.clientX, e.clientY);
            graphRef.current?.drag(held, p.x, p.y);
            return;
          }
          const from = dragRef.current;
          if (!from) return;
          // Shift turns the drag into a spin, so the graph can be seen from
          // another angle without leaving the pointer.
          if (e.shiftKey) setView((v) => rotateBy(v, (e.clientX - from.x) * 0.5));
          else setView((v) => panBy(v, e.clientX - from.x, e.clientY - from.y));
          dragRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          if (heldRef.current) graphRef.current?.release(heldRef.current);
          heldRef.current = null;
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          if (heldRef.current) graphRef.current?.release(heldRef.current);
          heldRef.current = null;
          dragRef.current = null;
        }}
      >
        <svg width="100%" height="100%" style={{ display: "block", cursor: "grab" }}>
          <g transform={toTransform(view, layout.width / 2, layout.height / 2)}>
            <GraphContent
              layout={{ ...layout, nodes }}
              pinned={pinned}
              onNodeDoubleClick={(id) => {
                graphRef.current?.unpin(id);
                setPinned(graphRef.current?.pinned() ?? new Set());
              }}
              onNodePointerDown={(id, e) => {
                // Stop the canvas handler: this gesture moves ONE node, not
                // the whole viewport.
                e.stopPropagation();
                const p = atPointer(e.clientX, e.clientY);
                heldRef.current = id;
                graphRef.current?.grab(id, p.x, p.y);
                setPinned(graphRef.current?.pinned() ?? new Set());
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
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
    </Modal>
  );
}
