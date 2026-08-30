import { describe, it, expect } from "vitest";
import type { ContextDocEditorRow } from "@devdigest/shared";
import {
  applyDisplayOrder,
  attachedCount,
  displayOrderIds,
  fileNameOf,
  filterDraftRows,
  folderOf,
  groupAttachedByRoot,
  injectedTokens,
  moveAttached,
  overCeiling,
  reorderAttached,
  rowKind,
  toDraftRows,
  toggleAttached,
  toPathsPayload,
  type ContextDraftRow,
  rootColor,
  reconcileOrder,
} from "./project-context";

function row(
  path: string,
  over: Partial<ContextDraftRow> = {},
): ContextDraftRow {
  return {
    path,
    root: path.split("/")[0]!,
    approxTokens: 100,
    usedBy: [],
    attached: false,
    order: -1,
    inheritedFrom: [],
    readable: true,
    ...over,
  };
}

describe("project-context helpers — shaping", () => {
  it("maps editor rows and drops the order of an unattached document", () => {
    const api: ContextDocEditorRow[] = [
      {
        doc: {
          path: "specs/api.md",
          root: "specs",
          approx_tokens: 400,
          used_by_agents: 1,
          used_by: [{ agent_id: "a1", agent_name: "Security", via: "agent" }],
        },
        attached: true,
        order: 0,
        inherited_from: [],
        readable: true,
      },
      {
        doc: {
          path: "docs/setup.md",
          root: "docs",
          approx_tokens: 200,
          used_by_agents: 0,
          used_by: [],
        },
        // A server that leaves a stale `order` on an unattached row must not
        // make it sort as if it were attached.
        attached: false,
        order: 5,
        inherited_from: [],
        readable: true,
      },
    ];

    const rows = toDraftRows(api);
    expect(rows[0]).toMatchObject({ path: "specs/api.md", attached: true, order: 0 });
    expect(rows[1]).toMatchObject({ path: "docs/setup.md", attached: false, order: -1 });
    expect(rows[0]!.usedBy).toHaveLength(1);
  });

  it("folderOf and fileNameOf split a nested path", () => {
    expect(folderOf(row("docs/adr/0001-choice.md"))).toBe("docs/adr");
    expect(folderOf(row("specs/api.md"))).toBe("specs");
    expect(fileNameOf("docs/adr/0001-choice.md")).toBe("0001-choice.md");
  });

  it("classifies a document that is BOTH attached and inherited as one attached row", () => {
    const both = row("specs/api.md", {
      attached: true,
      order: 0,
      inheritedFrom: [{ skill_id: "s1", skill_name: "House Style" }],
    });
    expect(rowKind(both)).toBe("attached");
    expect(rowKind(row("docs/x.md", { inheritedFrom: [{ skill_id: "s1", skill_name: "S" }] }))).toBe(
      "inherited",
    );
    expect(rowKind(row("docs/y.md"))).toBe("available");
  });
});

describe("project-context helpers — order", () => {
  const rows = [
    row("docs/setup.md"),
    row("specs/api.md", { attached: true, order: 1 }),
    row("insights/perf.md", { inheritedFrom: [{ skill_id: "s1", skill_name: "Perf" }] }),
    row("specs/auth.md", { attached: true, order: 0 }),
    row("docs/adr.md"),
  ];

  it("puts attached first in the human's order, then inherited, then the rest by root", () => {
    expect(displayOrderIds(rows)).toEqual([
      "specs/auth.md", // attached, order 0
      "specs/api.md", // attached, order 1
      "insights/perf.md", // inherited
      "docs/adr.md", // available, root docs
      "docs/setup.md",
    ]);
  });

  it("applyDisplayOrder keeps the frozen order and sorts unknown paths last", () => {
    const frozen = ["specs/auth.md", "specs/api.md"];
    const withNew = [...rows, row("docs/new.md")];
    const out = applyDisplayOrder(withNew, frozen).map((r) => r.path);
    expect(out.slice(0, 2)).toEqual(["specs/auth.md", "specs/api.md"]);
    expect(out).toContain("docs/new.md");
  });

  it("ticking a row does NOT change its index under a frozen order (the jumping-row defect)", () => {
    const frozen = displayOrderIds(rows);
    const last = frozen[frozen.length - 1]!;
    const before = applyDisplayOrder(rows, frozen).findIndex((r) => r.path === last);

    const next = toggleAttached(rows, last, true);
    const after = applyDisplayOrder(next, frozen).findIndex((r) => r.path === last);

    expect(after).toBe(before);
  });
});

describe("project-context helpers — reorder", () => {
  const attached = [
    row("a.md", { attached: true, order: 0 }),
    row("b.md", { attached: true, order: 1 }),
    row("c.md", { attached: true, order: 2 }),
    row("z.md"),
  ];

  it("moveAttached swaps with the neighbour and reindexes", () => {
    expect(toPathsPayload(moveAttached(attached, "c.md", -1))).toEqual(["a.md", "c.md", "b.md"]);
    expect(toPathsPayload(moveAttached(attached, "a.md", 1))).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("moveAttached at either end, and on an unattached row, is a no-op", () => {
    expect(moveAttached(attached, "a.md", -1)).toBe(attached);
    expect(moveAttached(attached, "c.md", 1)).toBe(attached);
    expect(moveAttached(attached, "z.md", -1)).toBe(attached);
  });

  it("reorderAttached moves a row two positions without shuffling the others", () => {
    // The defect this pins: swapping by INDEX instead of by the dragged row
    // made step 2 undo step 1, so a 2-position drag moved nothing.
    expect(toPathsPayload(reorderAttached(attached, "a.md", "c.md"))).toEqual([
      "b.md",
      "c.md",
      "a.md",
    ]);
    expect(toPathsPayload(reorderAttached(attached, "c.md", "a.md"))).toEqual([
      "c.md",
      "a.md",
      "b.md",
    ]);
  });

  it("toggleAttached appends at the end and reindexes on detach", () => {
    expect(toPathsPayload(toggleAttached(attached, "z.md", true))).toEqual([
      "a.md",
      "b.md",
      "c.md",
      "z.md",
    ]);
    expect(toPathsPayload(toggleAttached(attached, "b.md", false))).toEqual(["a.md", "c.md"]);
  });
});

describe("project-context helpers — counts and totals", () => {
  it("counts and sums over the rows given, and counts a both-ways document once", () => {
    const rows = [
      row("specs/api.md", {
        attached: true,
        order: 0,
        approxTokens: 1000,
        inheritedFrom: [{ skill_id: "s1", skill_name: "House Style" }],
      }),
      row("insights/perf.md", {
        approxTokens: 300,
        inheritedFrom: [{ skill_id: "s2", skill_name: "Perf" }],
      }),
      // Available — never counted into what a run injects.
      row("docs/huge.md", { approxTokens: 90_000 }),
    ];

    expect(attachedCount(rows)).toBe(1);
    // 1000 + 300, and the both-ways document contributes its 1000 exactly once.
    expect(injectedTokens(rows)).toBe(1300);
  });

  it("warns only above the ceiling it is given", () => {
    // The ceiling always comes from the payload (`token_ceiling`), never from a
    // constant here: a workspace can override it and the run caps against ITS
    // value, so a default in this module could only ever be a second answer.
    expect(overCeiling(32_000, 32_000)).toBe(false);
    expect(overCeiling(32_001, 32_000)).toBe(true);
    expect(overCeiling(4_001, 4_000)).toBe(true);
    expect(overCeiling(3_999, 4_000)).toBe(false);
  });
});

describe("project-context helpers — grouped index (AC-17)", () => {
  it("groups ONLY attached documents by root, in the human's order, omitting empty roots", () => {
    const rows = [
      row("docs/setup.md", { attached: true, order: 2 }),
      row("specs/auth.md", { attached: true, order: 1 }),
      row("specs/api.md", { attached: true, order: 0 }),
      // Nothing under `insights` is attached — it must produce no group at all.
      row("insights/perf.md"),
      row("docs/unused.md"),
    ];

    expect(groupAttachedByRoot(rows)).toEqual([
      { root: "specs", paths: ["specs/api.md", "specs/auth.md"] },
      { root: "docs", paths: ["docs/setup.md"] },
    ]);
  });

  it("returns no group when nothing is attached", () => {
    expect(groupAttachedByRoot([row("specs/api.md")])).toEqual([]);
  });

  it("puts an unknown root after the three known ones", () => {
    const rows = [
      row("guides/x.md", { attached: true, order: 0 }),
      row("insights/y.md", { attached: true, order: 1 }),
    ];
    expect(groupAttachedByRoot(rows).map((g) => g.root)).toEqual(["insights", "guides"]);
  });
});

describe("project-context helpers — filter", () => {
  const rows = [row("specs/api.md"), row("docs/setup.md"), row("insights/perf.md")];

  it("narrows on path and on root, and is a no-op when blank", () => {
    expect(filterDraftRows(rows, "api").map((r) => r.path)).toEqual(["specs/api.md"]);
    expect(filterDraftRows(rows, "docs").map((r) => r.path)).toEqual(["docs/setup.md"]);
    expect(filterDraftRows(rows, "   ")).toBe(rows);
  });
});

describe("rootColor — one colour per search root (M5)", () => {
  it("gives each named root its own colour", () => {
    const specs = rootColor("specs");
    const docs = rootColor("docs");
    const insights = rootColor("insights");
    // The point of the map is that they DIFFER; assert that, not the values,
    // so a palette change does not break the test.
    expect(new Set([specs.text, docs.text, insights.text]).size).toBe(3);
    expect(new Set([specs.bg, docs.bg, insights.bg]).size).toBe(3);
  });

  it("falls back to neutral for a configured root it does not know", () => {
    // Roots are configurable; an unknown one must not borrow a colour's meaning.
    const other = rootColor("adr");
    expect(other.text).toBe("var(--text-muted)");
    expect([rootColor("specs").text, rootColor("docs").text]).not.toContain(other.text);
  });
});

describe("applyDisplayOrder — a document that appeared after the tab loaded", () => {
  const row = (path: string, attached = false, order = 0) =>
    ({ path, root: path.split("/")[0], approxTokens: 10, attached, order,
       inheritedFrom: [], readable: true, usedBy: [] }) as ContextDraftRow;

  it("puts a newly ATTACHED document at the top, not below fifty others", () => {
    // The reported symptom: attach a document the frozen order predates, and it
    // sits at the very end of a 50-row list — attaching reads as a no-op.
    const frozen = ["docs/a.md", "docs/b.md", "docs/c.md"];
    const rows = [
      row("docs/a.md"),
      row("docs/b.md"),
      row("docs/c.md"),
      row("docs/brand-new.md", true),
    ];
    expect(applyDisplayOrder(rows, frozen).map((r) => r.path)[0]).toBe("docs/brand-new.md");
  });

  it("still sends an unattached newcomer to the bottom", () => {
    const frozen = ["docs/a.md", "docs/b.md"];
    const rows = [row("docs/a.md"), row("docs/b.md"), row("docs/brand-new.md")];
    expect(applyDisplayOrder(rows, frozen).map((r) => r.path)).toEqual([
      "docs/a.md",
      "docs/b.md",
      "docs/brand-new.md",
    ]);
  });

  it("does not disturb rows the frozen order knows — no jumping", () => {
    // The anti-jump rule: ticking a known row must not move it.
    const frozen = ["docs/a.md", "docs/b.md", "docs/c.md"];
    const rows = [row("docs/a.md"), row("docs/b.md", true), row("docs/c.md")];
    expect(applyDisplayOrder(rows, frozen).map((r) => r.path)).toEqual(frozen);
  });
});

describe("reconcileOrder — the frozen order must cover every row", () => {
  const row = (path: string, attached = false) =>
    ({ path, root: path.split("/")[0], approxTokens: 10, attached, order: 0,
       inheritedFrom: [], readable: true, usedBy: [] }) as ContextDraftRow;

  it("gives a document added after load a position, instead of leaving it out", () => {
    // Missing from the order means indexOf === -1: no arrows, while drag still
    // works. That mismatch is what "you removed the buttons but drag works" was.
    const rows = [row("docs/a.md"), row("docs/b.md"), row("docs/new.md", true)];
    const next = reconcileOrder(rows, ["docs/a.md", "docs/b.md"]);
    expect(next).toContain("docs/new.md");
    expect(next).toHaveLength(3);
  });

  it("puts the newcomer with its own kind, matching applyDisplayOrder", () => {
    const rows = [row("docs/a.md"), row("docs/b.md"), row("docs/new.md", true)];
    expect(reconcileOrder(rows, ["docs/a.md", "docs/b.md"])[0]).toBe("docs/new.md");
  });

  it("keeps existing positions — freezing still holds", () => {
    const rows = [row("docs/a.md"), row("docs/b.md")];
    const frozen = ["docs/b.md", "docs/a.md"];
    expect(reconcileOrder(rows, frozen)).toEqual(frozen);
  });

  it("drops a path whose document is gone", () => {
    const rows = [row("docs/a.md")];
    expect(reconcileOrder(rows, ["docs/a.md", "docs/deleted.md"])).toEqual(["docs/a.md"]);
  });
});
