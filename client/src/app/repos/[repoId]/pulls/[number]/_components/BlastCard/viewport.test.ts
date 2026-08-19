import { describe, expect, it } from "vitest";
import {
  fit,
  IDENTITY,
  rotateBy,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  toLayout,
  toTransform,
  zoomAt,
  ZOOM_STEP,
} from "./viewport";

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const before = { x: 30, y: -10, k: 1.4, a: 0 };
    const [cx, cy] = [520, 300];
    // The layout coordinate under the cursor, computed the same way the view
    // will read it back.
    const layoutX = (cx - before.x) / before.k;
    const layoutY = (cy - before.y) / before.k;

    const after = zoomAt(before, ZOOM_STEP, cx, cy);

    expect(after.x + layoutX * after.k).toBeCloseTo(cx, 6);
    expect(after.y + layoutY * after.k).toBeCloseTo(cy, 6);
  });

  it("is reversible, so a notch out and back leaves you where you were", () => {
    const start = { x: 12, y: 34, k: 1, a: 0 };
    const out = zoomAt(start, 1 / ZOOM_STEP, 400, 200);
    const back = zoomAt(out, ZOOM_STEP, 400, 200);
    expect(back.k).toBeCloseTo(start.k, 6);
    expect(back.x).toBeCloseTo(start.x, 6);
    expect(back.y).toBeCloseTo(start.y, 6);
  });

  it("clamps, and returns the same object once clamped so React can bail out", () => {
    const maxed = zoomAt({ x: 0, y: 0, k: MAX_ZOOM, a: 0 }, 4, 0, 0);
    expect(maxed.k).toBe(MAX_ZOOM);
    const floored = zoomAt({ x: 0, y: 0, k: MIN_ZOOM, a: 0 }, 0.1, 0, 0);
    expect(floored.k).toBe(MIN_ZOOM);
  });
});

describe("panBy", () => {
  it("moves without changing the zoom", () => {
    expect(panBy({ x: 5, y: 5, k: 2, a: 30 }, 10, -3)).toEqual({ x: 15, y: 2, k: 2, a: 30 });
  });
});

describe("fit", () => {
  it("centres the layout inside the viewport", () => {
    const v = fit(900, 560, 1800, 1000, 0);
    // Scale is the tighter of the two ratios — height here.
    expect(v.k).toBeCloseTo(1000 / 560, 6);
    expect(v.x + (900 * v.k) / 2).toBeCloseTo(900, 6);
    expect(v.y + (560 * v.k) / 2).toBeCloseTo(500, 6);
  });

  it("scales down to fit a small window rather than clipping", () => {
    expect(fit(900, 560, 400, 300).k).toBeLessThan(1);
  });

  it("returns identity for an empty layout instead of dividing by zero", () => {
    expect(fit(0, 0, 800, 600)).toEqual(IDENTITY);
  });
});

describe("rotateBy", () => {
  it("normalises into [0, 360) so a full turn is the same as none", () => {
    expect(rotateBy({ ...IDENTITY, a: 350 }, 20).a).toBe(10);
    expect(rotateBy({ ...IDENTITY, a: 10 }, -20).a).toBe(350);
  });

  it("leaves pan and zoom alone", () => {
    const v = rotateBy({ x: 4, y: 5, k: 1.5, a: 0 }, 15);
    expect(v.x).toBe(4);
    expect(v.y).toBe(5);
    expect(v.k).toBe(1.5);
  });
});

describe("toTransform", () => {
  it("emits pan, then zoom, then rotation about the layout centre", () => {
    // The order is load-bearing: zoomAt maps screen pixels through
    // translate+scale only, so a rotation applied OUTSIDE the scale would
    // silently break cursor-anchored zooming.
    expect(toTransform({ x: 10, y: 20, k: 2, a: 45 }, 450, 280)).toBe(
      "translate(10 20) scale(2) rotate(45 450 280)",
    );
  });
});

describe("toLayout", () => {
  const CX = 450;
  const CY = 280;

  /** Apply the same maths `toTransform` describes, so the round trip is real. */
  function forward(v: { x: number; y: number; k: number; a: number }, x: number, y: number) {
    const rad = (v.a * Math.PI) / 180;
    const dx = x - CX;
    const dy = y - CY;
    const rx = CX + dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = CY + dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: v.x + rx * v.k, y: v.y + ry * v.k };
  }

  it("inverts the transform at any angle", () => {
    for (const a of [0, 15, 90, 197, 350]) {
      const v = { x: 37, y: -11, k: 1.7, a };
      const point = { x: 610, y: 190 };
      const screen = forward(v, point.x, point.y);
      const back = toLayout(v, CX, CY, screen.x, screen.y);
      // Without the rotation step this passes at a = 0 and fails everywhere
      // else — which is exactly how a drag that only works upright presents.
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });
});
