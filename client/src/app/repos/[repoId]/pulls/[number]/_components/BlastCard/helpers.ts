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

/**
 * Every string in this payload that we KNOW names code: a file the index
 * recorded, an endpoint or cron it extracted, a path a prior PR shares with
 * this one. Used to decide what to highlight inside free prose.
 *
 * The point of matching against this set rather than a path-shaped regex is
 * that a highlight then means "this really is a file in this repository",
 * not "this word had a slash in it". A regex would chip `и т.д.` and every
 * `README.md` mentioned in passing that does not exist here.
 */
export function codeTokens(data: BlastResponse): string[] {
  const out = new Set<string>();
  for (const sym of data.symbols) {
    out.add(sym.file);
    out.add(sym.name);
    for (const c of sym.callers) {
      out.add(c.file);
      out.add(c.symbol);
    }
    for (const imp of sym.importers) out.add(imp.file);
    for (const e of sym.endpoints) out.add(e);
    for (const c of sym.crons) out.add(c);
  }
  for (const p of data.prior_pulls) for (const f of p.shared_files) out.add(f);
  return [...out].filter((t) => t.length > 1);
}

export interface TextPart {
  text: string;
  code: boolean;
}

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split `text` into plain and code runs.
 *
 * Two sources of truth, in order: an explicit backtick span is always code
 * (the author said so), and anything else is code only if it appears in
 * `tokens`. Longest tokens are tried first so `src/a/b.ts` wins over `b.ts`.
 */
export function splitHighlight(text: string, tokens: string[]): TextPart[] {
  const parts: TextPart[] = [];
  const pushPlain = (chunk: string) => {
    if (!chunk) return;
    if (tokens.length === 0) {
      parts.push({ text: chunk, code: false });
      return;
    }
    const ordered = [...tokens].sort((a, b) => b.length - a.length);
    const re = new RegExp(`(${ordered.map(escapeRe).join("|")})`, "g");
    for (const piece of chunk.split(re)) {
      if (!piece) continue;
      parts.push({ text: piece, code: tokens.includes(piece) });
    }
  };

  for (const span of text.split(/(`[^`]+`)/g)) {
    if (!span) continue;
    if (span.length >= 2 && span.startsWith("`") && span.endsWith("`")) {
      parts.push({ text: span.slice(1, -1), code: true });
    } else {
      pushPlain(span);
    }
  }
  return parts;
}

/**
 * The tail of a path, for display only.
 *
 * The reference design was drawn against a shallow repo where a path is
 * `src/api/public/index.ts` and fits a line. Real paths here run
 * `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
 * and wrap onto two, which turns a map of impact into a wall of prefixes —
 * every entry sharing the same first six segments, none of them the part that
 * tells them apart.
 *
 * The full path is never lost: callers keep it in the link href, and every
 * rendered path carries it in `title`.
 */
export function shortPath(path: string, segments = 3): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= segments) return path;
  return `…/${parts.slice(-segments).join("/")}`;
}

/**
 * Importers that are NOT already listed as callers of this symbol.
 *
 * `references.decl_file` is resolved through `file_edges`, so nearly every
 * caller file also imports the declaring file — listing both in full made the
 * importers section a near-copy of the callers above it. What is worth its
 * space is the remainder: a file that imports this one and has no call site we
 * could resolve. That is the re-export, the side-effect import, or the
 * reference the indexer could not pin down.
 */
export function importersBeyondCallers(
  importers: ReadonlyArray<{ file: string }>,
  callers: ReadonlyArray<{ file: string }>,
): string[] {
  const seen = new Set(callers.map((c) => c.file));
  return importers.filter((i) => !seen.has(i.file)).map((i) => i.file);
}
