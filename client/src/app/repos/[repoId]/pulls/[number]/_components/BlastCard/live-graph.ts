/* A running force simulation for the network modal.
   Framework-agnostic on purpose: React only subscribes to it, so dragging can
   be tested by calling functions instead of synthesising pointer events. */
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { ForceLayout, PlacedNode } from "./force-layout";
import type { NodeRole } from "./helpers";

interface LiveNode extends SimulationNodeDatum {
  id: string;
  label: string;
  role: NodeRole;
}

export interface LiveGraph {
  /** Current positions. Mutated in place by the simulation; read on each tick. */
  snapshot(): PlacedNode[];
  /** Pin a node under the pointer and heat the simulation so neighbours move. */
  grab(id: string, x: number, y: number): void;
  /** Move the pinned node. */
  drag(id: string, x: number, y: number): void;
  /** Unpin and let the graph settle again. */
  release(id: string): void;
  subscribe(onTick: () => void): () => void;
  /**
   * Advance the simulation by hand. The running loop does this on its own;
   * exposed so a test can step it deterministically instead of waiting on
   * requestAnimationFrame, which jsdom does not drive.
   */
  tick(steps?: number): void;
  stop(): void;
}

const CHARGE = -320;
const LINK_DISTANCE = 110;
/**
 * Heat applied while a node is held. High enough that neighbours follow the
 * dragged node, low enough that the rest of the graph does not reshuffle —
 * a drag should answer "what is attached to this?", not redraw the map.
 */
const DRAG_ALPHA = 0.3;

/**
 * Start a live simulation seeded from an already-settled layout.
 *
 * Seeding matters: starting from scratch would make the graph fly apart and
 * re-converge every time the modal opens, which reads as a glitch. Beginning
 * at the static positions with almost no alpha means it opens still, and only
 * moves when the reader moves it.
 */
export function createLiveGraph(layout: ForceLayout): LiveGraph {
  const nodes: LiveNode[] = layout.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    role: n.role,
    x: n.x,
    y: n.y,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: SimulationLinkDatum<LiveNode>[] = layout.edges.map((e) => ({
    source: e.from,
    target: e.to,
  }));

  const sim: Simulation<LiveNode, SimulationLinkDatum<LiveNode>> = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(CHARGE))
    .force(
      "link",
      forceLink<LiveNode, SimulationLinkDatum<LiveNode>>(links)
        .id((d) => d.id)
        .distance(LINK_DISTANCE),
    )
    .force("center", forceCenter(layout.width / 2, layout.height / 2))
    .alpha(0)
    .alphaTarget(0);

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  sim.on("tick", notify);

  return {
    snapshot: () =>
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        role: n.role,
        // `fx`/`fy` first: while a node is held it IS at the pointer, and d3
        // only copies the fixed position into x/y on the next tick. Reading
        // x/y here made a dragged node lag a frame behind the cursor.
        x: n.fx ?? n.x ?? 0,
        y: n.fy ?? n.y ?? 0,
      })),
    grab(id, x, y) {
      const n = byId.get(id);
      if (!n) return;
      n.fx = x;
      n.fy = y;
      sim.alphaTarget(DRAG_ALPHA).restart();
      notify();
    },
    drag(id, x, y) {
      const n = byId.get(id);
      if (!n) return;
      n.fx = x;
      n.fy = y;
      // Notify immediately rather than waiting for the next tick: the held
      // node must track the cursor at pointer rate, and a simulation that has
      // cooled to alpha 0 would otherwise not redraw it at all.
      notify();
    },
    release(id) {
      const n = byId.get(id);
      if (n) {
        n.fx = null;
        n.fy = null;
      }
      // Back to zero target: the graph coasts to a stop instead of freezing
      // mid-motion, which is what makes it feel like a physical object.
      sim.alphaTarget(0);
    },
    subscribe(onTick) {
      listeners.add(onTick);
      return () => listeners.delete(onTick);
    },
    tick(steps = 1) {
      sim.tick(steps);
      // `Simulation.tick` deliberately does NOT dispatch the tick event — it
      // is the headless entry point. Notifying here is why this module keeps
      // its own listener set rather than delegating to `sim.on`: manual
      // stepping and the running loop must look identical to a subscriber.
      notify();
    },
    stop() {
      sim.stop();
    },
  };
}
