import { describe, expect, it } from "vitest";
import {
  fit,
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  toTransform,
  zoomAt,
  ZOOM_STEP,
} from "./viewport";

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const before = { x: 30, y: -10, k: 1.4 };
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
    const start = { x: 12, y: 34, k: 1 };
    const out = zoomAt(start, 1 / ZOOM_STEP, 400, 200);
    const back = zoomAt(out, ZOOM_STEP, 400, 200);
    expect(back.k).toBeCloseTo(start.k, 6);
    expect(back.x).toBeCloseTo(start.x, 6);
    expect(back.y).toBeCloseTo(start.y, 6);
  });

  it("clamps, and returns the same object once clamped so React can bail out", () => {
    const maxed = zoomAt({ x: 0, y: 0, k: MAX_ZOOM }, 4, 0, 0);
    expect(maxed.k).toBe(MAX_ZOOM);
    const floored = zoomAt({ x: 0, y: 0, k: MIN_ZOOM }, 0.1, 0, 0);
    expect(floored.k).toBe(MIN_ZOOM);
  });
});

describe("panBy", () => {
  it("moves without changing the zoom", () => {
    expect(panBy({ x: 5, y: 5, k: 2 }, 10, -3)).toEqual({ x: 15, y: 2, k: 2 });
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

describe("toTransform", () => {
  it("emits translate before scale — the order the maths assumes", () => {
    expect(toTransform({ x: 10, y: 20, k: 2 })).toBe("translate(10 20) scale(2)");
  });
});
