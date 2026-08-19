"use client";

import React from "react";
import type { ForceLayout, PlacedNode } from "./force-layout";
import { NODE_COLOR, NODE_RADIUS, MAX_NODE_LABEL } from "./constants";

/**
 * The drawn contents of the network view: edges, then nodes with their labels.
 *
 * No `<svg>` wrapper and no viewport maths — this renders inside whatever
 * transform its parent applies, so the same markup serves the pannable,
 * zoomable overlay without a second copy that could drift from it.
 *
 * Plain SVG on purpose. d3-force computes the coordinates (`force-layout.ts`)
 * and nothing else: no d3 selections, no imperative DOM. React owns the
 * markup, so this renders under test in jsdom like any other component.
 */
function label(text: string): string {
  return text.length > MAX_NODE_LABEL ? `${text.slice(0, MAX_NODE_LABEL - 1)}…` : text;
}

function Node({ node }: { node: PlacedNode }) {
  const r = NODE_RADIUS[node.role];
  return (
    <g>
      <circle cx={node.x} cy={node.y} r={r} fill={NODE_COLOR[node.role]} />
      {/* Below the circle, as in the reference — beside it, long paths overlap
          their neighbours at any useful node count. */}
      <text
        x={node.x}
        y={node.y + r + 13}
        textAnchor="middle"
        fontSize={11}
        fill="var(--text-muted)"
      >
        {label(node.label)}
      </text>
      <title>{node.label}</title>
    </g>
  );
}

export function GraphContent({ layout }: { layout: ForceLayout }) {
  const byId = React.useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes],
  );

  return (
    <>
      {layout.edges.map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to) return null;
        return (
          <line
            key={`${e.from}->${e.to}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--border)"
            strokeWidth={1}
          />
        );
      })}
      {layout.nodes.map((n) => (
        <Node key={n.id} node={n} />
      ))}
    </>
  );
}
