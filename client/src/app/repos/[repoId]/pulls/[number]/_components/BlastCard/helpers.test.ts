import { describe, it, expect } from "vitest";
import type { BlastResponse, BlastSymbolImpact } from "@devdigest/shared";
import { buildFlowchart, splitHighlight, countGraphNodes } from "./helpers";
import { MAX_GRAPH_NODES } from "./constants";

/* Copied from MermaidDiagram.tsx:9 — a string that fails this renders nothing
   at all, with no error anywhere. */
const MERMAID_RE =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context)\b/;

function symbol(over: Partial<BlastSymbolImpact> = {}): BlastSymbolImpact {
  return {
    file: "src/lib/money.ts",
    name: "formatMoney",
    kind: "function",
    callers: [{ file: "src/api/public/index.ts", symbol: "handler", line: 23, rank: 0.9 }],
    callers_total: 1,
    callers_truncated: false,
    importers: [],
    endpoints: ["GET /invoices"],
    crons: [],
    ...over,
  };
}

function payload(symbols: BlastSymbolImpact[]): BlastResponse {
  return {
    state: "ok",
    index: { status: "full", last_indexed_sha: "a1b2c3d", updated_at: "2026-08-19T00:00:00.000Z" },
    totals: { symbols: symbols.length, callers: 1, callers_found: 1, endpoints: 1, crons: 0 },
    symbols,
    downstream_truncated: false,
    prior_pulls: [],
    link: { repo_full_name: "acme/payments-api", indexed_sha: "a1b2c3d", head_sha: "deadbee" },
  };
}

describe("buildFlowchart", () => {
  it("emits a parseable flowchart with generated node ids", () => {
    const chart = buildFlowchart(payload([symbol()]));

    expect(chart.startsWith("flowchart LR")).toBe(true);
    expect(MERMAID_RE.test(chart)).toBe(true);

    const declared = chart.match(/^ {2}(\S+)\[/gm) ?? [];
    expect(declared.length).toBeGreaterThan(0);
    for (const line of declared) {
      expect(line.trim().replace("[", "")).toMatch(/^n\d+$/);
    }
    expect(chart).toContain("n0 --> n1");
  });

  it("strips quotes from a label and still quotes the whole thing", () => {
    const chart = buildFlowchart(
      payload([
        symbol({
          callers: [
            { file: 'src/we"ird (x) path.ts', symbol: "handler", line: 3, rank: 0.1 },
          ],
        }),
      ]),
    );

    expect(chart).toContain('  n1["src/weird (x) path.ts"]');
  });

  it("returns an empty string when there is nothing to draw", () => {
    expect(buildFlowchart(payload([]))).toBe("");
  });

  it("caps the graph at MAX_GRAPH_NODES nodes", () => {
    const callers = Array.from({ length: MAX_GRAPH_NODES * 2 }, (_, i) => ({
      file: `src/caller-${i}.ts`,
      symbol: "handler",
      line: i + 1,
      rank: 0.5,
    }));
    const res = payload([symbol({ callers, callers_total: callers.length })]);

    expect(countGraphNodes(res)).toBeGreaterThan(MAX_GRAPH_NODES);

    const chart = buildFlowchart(res);
    const declared = chart.match(/^ {2}n\d+\[/gm) ?? [];
    expect(declared).toHaveLength(MAX_GRAPH_NODES);
    // No edge may reference a node the cap dropped.
    for (const edge of Array.from(chart.matchAll(/^ {2}n(\d+) --> n(\d+)$/gm))) {
      expect(Number(edge[1])).toBeLessThan(MAX_GRAPH_NODES);
      expect(Number(edge[2])).toBeLessThan(MAX_GRAPH_NODES);
    }
  });
});

describe("splitHighlight", () => {
  const tokens = ["src/lib/money.ts", "money.ts", "GET /invoices", "formatMoney"];

  it("chips a token only when it really names code in this payload", () => {
    const parts = splitHighlight("Touches src/lib/money.ts and README.md today", tokens);
    expect(parts.filter((p) => p.code).map((p) => p.text)).toEqual(["src/lib/money.ts"]);
    // README.md is path-shaped but is NOT in the payload — a regex would have
    // chipped it, which is the whole reason this matches a known set instead.
    expect(parts.map((p) => p.text).join("")).toBe("Touches src/lib/money.ts and README.md today");
  });

  it("prefers the longest token, so a suffix does not win", () => {
    const parts = splitHighlight("see src/lib/money.ts", tokens);
    expect(parts.filter((p) => p.code).map((p) => p.text)).toEqual(["src/lib/money.ts"]);
  });

  it("chips a multi-word endpoint", () => {
    const parts = splitHighlight("reaches GET /invoices downstream", tokens);
    expect(parts.filter((p) => p.code).map((p) => p.text)).toEqual(["GET /invoices"]);
  });

  it("always chips an explicit backtick span, known or not", () => {
    const parts = splitHighlight("run `pnpm test` first", tokens);
    expect(parts.filter((p) => p.code).map((p) => p.text)).toEqual(["pnpm test"]);
  });

  it("returns the text unchanged when nothing is known", () => {
    expect(splitHighlight("plain sentence", [])).toEqual([
      { text: "plain sentence", code: false },
    ]);
  });
});
