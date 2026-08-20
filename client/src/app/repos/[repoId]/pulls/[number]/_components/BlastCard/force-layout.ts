/* Force-directed placement for the BlastCard network view.
   Pure: nodes + edges in, coordinates out. No React, no DOM, no animation. */
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { BlastResponse } from "@devdigest/shared";
import { MAX_GRAPH_NODES } from "./constants";
import { collectGraph, type NodeRole } from "./helpers";

export interface PlacedNode {
  id: string;
  label: string;
  role: NodeRole;
  x: number;
  y: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
}

export interface ForceLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  label: string;
  role: NodeRole;
}

/** Viewport the coordinates are laid out in; the SVG scales to fit it. */
const WIDTH = 900;
const HEIGHT = 560;
/**
 * The simulation is run to completion here rather than animated. d3-force is
 * built for a `tick` loop driving a render, but nothing on this card needs to
 * watch the graph settle — running it headless keeps this a pure function, so
 * it is testable like any other helper and cannot drop frames on a big map.
 * 400 iterations is past the point where positions stop moving visibly at
 * this node count.
 */
const ITERATIONS = 400;

/** Repulsion between every pair; the negative sign is what spreads them out. */
const CHARGE = -320;
/** Resting length of an edge. Long enough that labels below nodes do not collide. */
const LINK_DISTANCE = 110;

/**
 * Place the blast graph with a force simulation.
 *
 * Same node set and edges as the flowchart view (`collectGraph`), so the two
 * renderings never disagree about what the map contains — only about how it is
 * arranged. Isolated nodes are dropped for the same reason as there: a node no
 * edge touches states no relationship, and in a force layout it also drifts to
 * a corner and reads as an error.
 */
export function computeForceLayout(res: BlastResponse): ForceLayout {
  const { nodes, roles, edges } = collectGraph(res);
  const kept = nodes.slice(0, MAX_GRAPH_NODES);
  const keptSet = new Set(kept);

  const drawn = edges.filter(([from, to]) => keptSet.has(from) && keptSet.has(to));
  const connected = new Set<string>();
  for (const [from, to] of drawn) {
    connected.add(from);
    connected.add(to);
  }
  const visible = kept.filter((label) => connected.has(label));
  if (visible.length === 0) return { nodes: [], edges: [], width: WIDTH, height: HEIGHT };

  const simNodes: SimNode[] = visible.map((label) => ({
    id: label,
    label,
    role: roles.get(label) ?? "caller",
  }));
  const simLinks: SimulationLinkDatum<SimNode>[] = drawn.map(([from, to]) => ({
    source: from,
    target: to,
  }));

  forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(CHARGE))
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(LINK_DISTANCE),
    )
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .stop()
    .tick(ITERATIONS);

  return {
    nodes: simNodes.map((n) => ({
      id: n.id,
      label: n.label,
      role: n.role,
      // Rounded: sub-pixel precision is noise in an SVG, and whole numbers make
      // the output stable enough to assert on.
      x: Math.round(n.x ?? 0),
      y: Math.round(n.y ?? 0),
    })),
    edges: drawn.map(([from, to]) => ({ from, to })),
    width: WIDTH,
    height: HEIGHT,
  };
}
