import { describe, expect, it } from "vitest";
import { createLiveGraph } from "./live-graph";
import type { ForceLayout } from "./force-layout";

const LAYOUT: ForceLayout = {
  width: 900,
  height: 560,
  nodes: [
    { id: "a", label: "a", role: "symbol", x: 400, y: 280 },
    { id: "b", label: "b", role: "caller", x: 500, y: 280 },
    { id: "c", label: "c", role: "caller", x: 300, y: 280 },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "a", to: "c" },
  ],
};

describe("createLiveGraph", () => {
  it("opens exactly where the static layout left off", () => {
    // Seeded, not restarted: a graph that flies apart and re-converges every
    // time the modal opens reads as a glitch.
    const g = createLiveGraph(LAYOUT);
    expect(g.snapshot()).toEqual(LAYOUT.nodes);
    g.stop();
  });

  it("moves a dragged node to the pointer", () => {
    const g = createLiveGraph(LAYOUT);
    g.grab("a", 400, 280);
    g.drag("a", 700, 120);

    const a = g.snapshot().find((n) => n.id === "a")!;
    expect(a.x).toBe(700);
    expect(a.y).toBe(120);
    g.stop();
  });

  it("pulls the neighbours along — the point of a live graph", () => {
    const g = createLiveGraph(LAYOUT);
    const before = g.snapshot().find((n) => n.id === "b")!;

    g.grab("a", 400, 280);
    g.drag("a", 800, 500);
    // A tick is what a running simulation does between frames; calling it
    // directly keeps the assertion deterministic instead of waiting on rAF.
    g.tick(60);

    const after = g.snapshot().find((n) => n.id === "b")!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
    g.stop();
  });

  it("leaves a dropped node exactly where it was put", () => {
    // The bug this replaces: d3's drag examples unpin on drop, so every node
    // you place springs back and the graph cannot be arranged at all.
    const g = createLiveGraph(LAYOUT);
    g.grab("a", 400, 280);
    g.drag("a", 800, 500);
    g.release("a");
    g.tick(120);

    const a = g.snapshot().find((n) => n.id === "a")!;
    expect(a.x).toBe(800);
    expect(a.y).toBe(500);
    expect(g.pinned().has("a")).toBe(true);
    g.stop();
  });

  it("lets a pinned node go again", () => {
    const g = createLiveGraph(LAYOUT);
    g.grab("a", 400, 280);
    g.drag("a", 800, 500);
    g.release("a");

    g.unpin("a");
    expect(g.pinned().has("a")).toBe(false);
    g.tick(120);
    // Released, the simulation pulls it back towards its neighbours.
    const a = g.snapshot().find((n) => n.id === "a")!;
    expect(a.x).not.toBe(800);
    g.stop();
  });

  it("unpinAll releases everything the reader placed", () => {
    const g = createLiveGraph(LAYOUT);
    g.grab("a", 400, 280);
    g.release("a");
    g.grab("b", 100, 100);
    g.release("b");
    expect(g.pinned().size).toBe(2);

    g.unpinAll();
    expect(g.pinned().size).toBe(0);
    g.stop();
  });

  it("notifies subscribers and stops notifying once unsubscribed", () => {
    const g = createLiveGraph(LAYOUT);
    let ticks = 0;
    const off = g.subscribe(() => {
      ticks += 1;
    });

    g.grab("a", 400, 280);
    g.tick();
    expect(ticks).toBeGreaterThan(0);

    off();
    const seen = ticks;
    g.tick();
    expect(ticks).toBe(seen);
    g.stop();
  });
});
