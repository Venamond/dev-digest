import { describe, it, expect } from "vitest";
import {
  applyDisplayOrder,
  reorderLinked,
  displayOrderIds,
  enabledCount,
  filterDraftRows,
  moveLinked,
  toggleEnabled,
  toggleLinked,
  toLinksPayload,
  type SkillDraftRow,
} from "./helpers";

function row(partial: Partial<SkillDraftRow> & Pick<SkillDraftRow, "skill_id" | "name">): SkillDraftRow {
  return {
    description: "",
    type: "rubric",
    linked: false,
    enabled: false,
    order: -1,
    skillEnabled: true,
    ...partial,
  };
}

describe("SkillsTab helpers", () => {
  it("enabledCount counts linked+enabled only", () => {
    const rows = [
      row({ skill_id: "a", name: "a", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "b", name: "b", linked: true, enabled: false, order: 1 }),
      row({ skill_id: "c", name: "c", linked: false, enabled: false }),
    ];
    expect(enabledCount(rows)).toBe(1);
  });

  it("toggleLinked appends and unlinks with reindex", () => {
    let rows = [
      row({ skill_id: "a", name: "a", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "b", name: "b" }),
    ];
    rows = toggleLinked(rows, "b", true);
    expect(toLinksPayload(rows)).toEqual([
      { skill_id: "a", order: 0, enabled: true },
      { skill_id: "b", order: 1, enabled: true },
    ]);
    rows = toggleLinked(rows, "a", false);
    expect(toLinksPayload(rows)).toEqual([{ skill_id: "b", order: 0, enabled: true }]);
  });

  it("moveLinked swaps order among linked skills", () => {
    const rows = [
      row({ skill_id: "a", name: "a", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "b", name: "b", linked: true, enabled: true, order: 1 }),
      row({ skill_id: "c", name: "c" }),
    ];
    expect(toLinksPayload(moveLinked(rows, "a", 1)).map((l) => l.skill_id)).toEqual(["b", "a"]);
  });

  it("toggleEnabled links when enabling an unlinked skill", () => {
    const rows = [row({ skill_id: "x", name: "x" })];
    expect(toLinksPayload(toggleEnabled(rows, "x", true))).toEqual([
      { skill_id: "x", order: 0, enabled: true },
    ]);
  });

  describe("reorderLinked (drag & drop)", () => {
    const linkedRows = () => [
      row({ skill_id: "a", name: "a", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "b", name: "b", linked: true, enabled: true, order: 1 }),
      row({ skill_id: "c", name: "c", linked: true, enabled: true, order: 2 }),
      row({ skill_id: "d", name: "d", linked: true, enabled: true, order: 3 }),
      row({ skill_id: "u", name: "u" }),
    ];
    const ids = (rows: SkillDraftRow[]) => toLinksPayload(rows).map((l) => l.skill_id);

    // Regression: the old inline loop named `linked[i]` instead of the dragged
    // row, so step 2 swapped a neighbour back. Measured old results — a→c and
    // d→b did not move at all (["a","b","c","d"]), and a→d shuffled unrelated
    // rows (["a","b","d","c"]). Hence a drag that visibly did nothing.
    it("moves a row down across two positions", () => {
      expect(ids(reorderLinked(linkedRows(), "a", "c"))).toEqual(["b", "c", "a", "d"]);
    });

    it("moves a row up across two positions", () => {
      expect(ids(reorderLinked(linkedRows(), "d", "b"))).toEqual(["a", "d", "b", "c"]);
    });

    it("moves a row to either end", () => {
      expect(ids(reorderLinked(linkedRows(), "a", "d"))).toEqual(["b", "c", "d", "a"]);
      expect(ids(reorderLinked(linkedRows(), "d", "a"))).toEqual(["d", "a", "b", "c"]);
    });

    it("handles an adjacent swap", () => {
      expect(ids(reorderLinked(linkedRows(), "a", "b"))).toEqual(["b", "a", "c", "d"]);
    });

    it("is a no-op for the same row, or when either row is not linked", () => {
      const rows = linkedRows();
      expect(reorderLinked(rows, "a", "a")).toBe(rows);
      expect(reorderLinked(rows, "a", "u")).toBe(rows);
      expect(reorderLinked(rows, "u", "a")).toBe(rows);
    });
  });

  it("displayOrderIds puts linked first by order, then unlinked by name", () => {
    const rows = [
      row({ skill_id: "z", name: "zeta" }),
      row({ skill_id: "b", name: "beta", linked: true, enabled: true, order: 1 }),
      row({ skill_id: "a", name: "alpha", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "m", name: "mu" }),
    ];
    expect(displayOrderIds(rows)).toEqual(["a", "b", "m", "z"]);
  });

  it("applyDisplayOrder keeps a row in place after it becomes linked", () => {
    const rows = [
      row({ skill_id: "a", name: "alpha", linked: true, enabled: true, order: 0 }),
      row({ skill_id: "m", name: "mu" }),
      row({ skill_id: "z", name: "zeta" }),
    ];
    const frozen = displayOrderIds(rows);

    // Enabling `z` links it and moves it to the end of the linked group —
    // the frozen order must still render it last, not jump it upward.
    const next = toggleEnabled(rows, "z", true);
    expect(applyDisplayOrder(next, frozen).map((r) => r.skill_id)).toEqual(["a", "m", "z"]);
  });

  it("applyDisplayOrder sorts unknown ids last, by name", () => {
    const rows = [
      row({ skill_id: "known", name: "known" }),
      row({ skill_id: "new-b", name: "b-new" }),
      row({ skill_id: "new-a", name: "a-new" }),
    ];
    expect(applyDisplayOrder(rows, ["known"]).map((r) => r.skill_id)).toEqual([
      "known",
      "new-a",
      "new-b",
    ]);
  });

  it("filterDraftRows matches name/type", () => {
    const rows = [
      row({ skill_id: "1", name: "happy-path", type: "rubric" }),
      row({ skill_id: "2", name: "other", type: "security", description: "ssrf" }),
    ];
    expect(filterDraftRows(rows, "happy")).toHaveLength(1);
    expect(filterDraftRows(rows, "security")).toHaveLength(1);
  });
});
