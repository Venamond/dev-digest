import { describe, expect, it } from "vitest";
import { computeForceLayout } from "./force-layout";

/** A map with one changed symbol, two callers, an endpoint and an orphan. */
const RES = {
  state: "ok",
  index: { status: "full", last_indexed_sha: "a", updated_at: "" },
  totals: { symbols: 2, callers: 2, callers_found: 2, endpoints: 1, crons: 0 },
  downstream_truncated: false,
  prior_pulls: [],
  link: { repo_full_name: "o/r", indexed_sha: "a", head_sha: "b" },
  symbols: [
    {
      file: "src/mw.ts",
      name: "rateLimit",
      kind: "function",
      callers: [
        { file: "src/api/index.ts", symbol: "reg", line: 1, rank: 1 },
        { file: "src/server.ts", symbol: "boot", line: 2, rank: 1 },
      ],
      callers_total: 2,
      callers_truncated: false,
      importers: [],
      endpoints: ["GET /items"],
      crons: [],
    },
    {
      file: "src/lonely.ts",
      name: "orphan",
      kind: "function",
      callers: [],
      callers_total: 0,
      callers_truncated: false,
      importers: [],
      endpoints: [],
      crons: [],
    },
  ],
} as never;

describe("computeForceLayout", () => {
  it("places every connected node and drops the orphan", () => {
    const { nodes, edges } = computeForceLayout(RES);
    const labels = nodes.map((n) => n.label);

    expect(labels).toContain("rateLimit");
    expect(labels).toContain("GET /items");
    // Same rule as the flowchart: a node no edge touches states no
    // relationship, and here it would also drift into a corner.
    expect(labels).not.toContain("orphan");
    expect(edges).toHaveLength(3);
  });

  it("keeps every coordinate finite and inside the viewport", () => {
    const { nodes, width, height } = computeForceLayout(RES);
    // A force simulation that diverges produces NaN or values far off-canvas,
    // and an SVG renders that as an empty box with no error — the same silent
    // failure mode as a malformed mermaid chart.
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThan(-width);
      expect(n.x).toBeLessThan(width * 2);
      expect(n.y).toBeGreaterThan(-height);
      expect(n.y).toBeLessThan(height * 2);
    }
  });

  it("carries the role through, so the renderer can colour by kind", () => {
    const { nodes } = computeForceLayout(RES);
    expect(nodes.find((n) => n.label === "rateLimit")?.role).toBe("symbol");
    expect(nodes.find((n) => n.label === "GET /items")?.role).toBe("endpoint");
    expect(nodes.find((n) => n.label.includes("server.ts"))?.role).toBe("caller");
  });

  it("puts a connected pair closer together than the canvas is wide", () => {
    // Not an exact-coordinate assertion: d3-force jiggles coincident nodes with
    // Math.random, so positions are stable in shape but not to the pixel. What
    // must hold is that the link force actually pulled — otherwise the view is
    // a random scatter that happens to render.
    const { nodes, width } = computeForceLayout(RES);
    const sym = nodes.find((n) => n.label === "rateLimit")!;
    const caller = nodes.find((n) => n.label.includes("api/index.ts"))!;
    const distance = Math.hypot(sym.x - caller.x, sym.y - caller.y);
    expect(distance).toBeLessThan(width / 2);
  });

  it("returns an empty layout when nothing is connected", () => {
    const empty = { ...(RES as object), symbols: [] } as never;
    expect(computeForceLayout(empty).nodes).toEqual([]);
  });
});
