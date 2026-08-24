import { describe, it, expect } from "vitest";
import type { SkillListItem } from "@devdigest/shared";
import { filterSkills } from "./helpers";

function skill(partial: Partial<SkillListItem> & Pick<SkillListItem, "id" | "name">): SkillListItem {
  return {
    description: "",
    type: "custom",
    source: "manual",
    body: "# x",
    enabled: true,
    version: 1,
    agent_count: 0,
    pull_rate: null,
    accept_rate: null,
    ...partial,
  };
}

describe("filterSkills", () => {
  const list = [
    skill({ id: "1", name: "happy-path", description: "Coverage gaps", type: "rubric" }),
    skill({ id: "2", name: "over-mocking", description: "Smell checks", type: "convention" }),
  ];

  it("returns all skills for empty query", () => {
    expect(filterSkills(list, "")).toHaveLength(2);
    expect(filterSkills(list, "   ")).toHaveLength(2);
  });

  it("matches name, description, or type case-insensitively", () => {
    expect(filterSkills(list, "happy").map((a) => a.id)).toEqual(["1"]);
    expect(filterSkills(list, "SMELL")).toHaveLength(1);
    expect(filterSkills(list, "rubric")).toHaveLength(1);
    expect(filterSkills(list, "missing")).toHaveLength(0);
  });
});
