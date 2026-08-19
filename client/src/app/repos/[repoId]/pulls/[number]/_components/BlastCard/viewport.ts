/* Pan/zoom arithmetic for the network overlay. Pure — no React, no DOM.
   Kept out of the component because "the graph jumps when I scroll" is a
   maths bug, and maths is cheaper to test than a pointer gesture. */

export interface Viewport {
  /** Translation applied before the scale, in screen pixels. */
  x: number;
  y: number;
  /** 1 = the layout's own coordinate scale. */
  k: number;
  /** Degrees, clockwise, about the layout's own centre. */
  a: number;
}

export const IDENTITY: Viewport = { x: 0, y: 0, k: 1, a: 0 };

/** One press of a rotate button. */
export const ROTATE_STEP = 15;

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
  return { ...v, k, x: cx - lx * k, y: cy - ly * k };
}

/** Drag: translation only, zoom and angle untouched. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/**
 * Spin the graph about its own centre.
 *
 * Normalised into [0, 360) so the angle stays readable and two full turns are
 * indistinguishable from none — a raw accumulator would drift to five digits
 * during a single drag.
 */
export function rotateBy(v: Viewport, degrees: number): Viewport {
  const a = (((v.a + degrees) % 360) + 360) % 360;
  return { ...v, a };
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
    a: 0,
    x: (viewWidth - layoutWidth * k) / 2,
    y: (viewHeight - layoutHeight * k) / 2,
  };
}

/**
 * The SVG transform for a group holding the whole graph.
 *
 * Order matters: pan, then zoom, then rotate about the layout's centre.
 * Rotating INSIDE the scale keeps `zoomAt` correct — its arithmetic maps
 * screen pixels through translate+scale only, so a rotation applied outside
 * would silently invalidate the cursor anchoring.
 */
export function toTransform(v: Viewport, cx: number, cy: number): string {
  return `translate(${v.x} ${v.y}) scale(${v.k}) rotate(${v.a} ${cx} ${cy})`;
}

/**
 * Screen point → layout point: the exact inverse of {@link toTransform}.
 *
 * Dragging a node needs this. The forward transform is
 * `translate · scale · rotate`, so the inverse undoes them in reverse order:
 * subtract the pan, divide by the zoom, then rotate back about the layout
 * centre. Skipping the rotation step is the bug where a node follows the
 * pointer correctly at 0° and drifts off at any other angle.
 */
export function toLayout(
  v: Viewport,
  cx: number,
  cy: number,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  const ux = (screenX - v.x) / v.k;
  const uy = (screenY - v.y) / v.k;
  const rad = (-v.a * Math.PI) / 180;
  const dx = ux - cx;
  const dy = uy - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}
