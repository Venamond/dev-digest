import { describe, it, expect } from "vitest";
import {
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

  it("filterDraftRows matches name/type", () => {
    const rows = [
      row({ skill_id: "1", name: "happy-path", type: "rubric" }),
      row({ skill_id: "2", name: "other", type: "security", description: "ssrf" }),
    ];
    expect(filterDraftRows(rows, "happy")).toHaveLength(1);
    expect(filterDraftRows(rows, "security")).toHaveLength(1);
  });
});
