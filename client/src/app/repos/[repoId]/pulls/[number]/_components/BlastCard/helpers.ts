/* Pure mermaid-string builders for the BlastCard graph view.
   MermaidDiagram validates with `mermaid.parse` and renders NOTHING on a
   parse failure, so a malformed string here is a silent blank card — every
   rule below exists to keep the output parseable. */
import type { BlastResponse } from "@devdigest/shared";
import { MAX_GRAPH_NODES } from "./constants";

type Edge = readonly [from: string, to: string];

/** Mermaid labels must be quoted, single-line and free of `"`. */
function sanitize(label: string): string {
  return label.replace(/"/g, "").replace(/[\r\n]+/g, " ").trim();
}

function symbolLabel(name: string, file: string): string {
  return `${name} (${file})`;
}

/**
 * The node set the graph would draw, deduplicated by label and in insertion
 * order. Endpoints and crons hang off the SYMBOL, not off individual callers:
 * the response attributes them per symbol (they come from the reverse-import
 * walk over all of that symbol's callers), so drawing caller → endpoint would
 * assert a call path the payload does not actually claim.
 */
function collectGraph(res: BlastResponse): { nodes: string[]; edges: Edge[] } {
  const nodes: string[] = [];
  const seen = new Set<string>();
  const edges: Edge[] = [];

  const add = (raw: string): string => {
    const label = sanitize(raw);
    if (!seen.has(label)) {
      seen.add(label);
      nodes.push(label);
    }
    return label;
  };

  for (const sym of res.symbols) {
    const from = add(symbolLabel(sym.name, sym.file));
    for (const caller of sym.callers) edges.push([from, add(caller.file)]);
    for (const endpoint of sym.endpoints) edges.push([from, add(endpoint)]);
    for (const cron of sym.crons) edges.push([from, add(cron)]);
  }

  return { nodes, edges };
}

/** Uncapped node count — the card compares it with MAX_GRAPH_NODES to decide
 *  whether to warn that the drawing is a subset. */
export function countGraphNodes(res: BlastResponse): number {
  return collectGraph(res).nodes.length;
}

/**
 * `flowchart LR` string for MermaidDiagram, or `""` when there is nothing to
 * draw (the card then renders `graph.empty`). Node ids are generated `n<i>` —
 * a file path is not a legal mermaid id — and every label is quoted.
 */
export function buildFlowchart(res: BlastResponse): string {
  const { nodes, edges } = collectGraph(res);
  const kept = nodes.slice(0, MAX_GRAPH_NODES);
  const id = new Map<string, string>(kept.map((label, i) => [label, `n${i}`]));

  const drawn = edges.filter(([from, to]) => id.has(from) && id.has(to));
  if (drawn.length === 0) return "";

  const lines = ["flowchart LR"];
  for (const label of kept) lines.push(`  ${id.get(label)}["${label}"]`);
  for (const [from, to] of drawn) lines.push(`  ${id.get(from)} --> ${id.get(to)}`);
  return lines.join("\n");
}
