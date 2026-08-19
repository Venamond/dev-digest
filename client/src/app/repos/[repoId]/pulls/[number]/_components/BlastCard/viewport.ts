/* Pan/zoom arithmetic for the network overlay. Pure — no React, no DOM.
   Kept out of the component because "the graph jumps when I scroll" is a
   maths bug, and maths is cheaper to test than a pointer gesture. */

export interface Viewport {
  /** Translation applied before the scale, in screen pixels. */
  x: number;
  y: number;
  /** 1 = the layout's own coordinate scale. */
  k: number;
}

export const IDENTITY: Viewport = { x: 0, y: 0, k: 1 };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** One wheel notch. Multiplicative, so zooming out then in returns you home. */
export const ZOOM_STEP = 1.15;

function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/**
 * Zoom by `factor` while keeping the point under the cursor fixed.
 *
 * Without the anchor the graph slides away from the pointer as it grows, which
 * reads as the canvas fighting you. The identity is: the layout point under
 * the cursor before the zoom must still be under it after, so the translation
 * absorbs the difference.
 */
export function zoomAt(v: Viewport, factor: number, cx: number, cy: number): Viewport {
  const k = clampZoom(v.k * factor);
  if (k === v.k) return v;
  // Layout coordinate currently under the cursor.
  const lx = (cx - v.x) / v.k;
  const ly = (cy - v.y) / v.k;
  return { k, x: cx - lx * k, y: cy - ly * k };
}

/** Drag: translation only, zoom untouched. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/**
 * Fit the layout into the viewport with a margin, centred.
 *
 * Used on open and by "reset": a force layout is centred on its own canvas,
 * not on whatever window the user happens to have, so showing it at scale 1
 * with no translation clips it on a small screen and strands it in a corner on
 * a large one.
 */
export function fit(
  layoutWidth: number,
  layoutHeight: number,
  viewWidth: number,
  viewHeight: number,
  margin = 60,
): Viewport {
  if (layoutWidth <= 0 || layoutHeight <= 0) return IDENTITY;
  const k = clampZoom(
    Math.min(
      (viewWidth - margin * 2) / layoutWidth,
      (viewHeight - margin * 2) / layoutHeight,
    ),
  );
  return {
    k,
    x: (viewWidth - layoutWidth * k) / 2,
    y: (viewHeight - layoutHeight * k) / 2,
  };
}

/** The SVG transform for a group holding the whole graph. */
export function toTransform(v: Viewport): string {
  return `translate(${v.x} ${v.y}) scale(${v.k})`;
}
