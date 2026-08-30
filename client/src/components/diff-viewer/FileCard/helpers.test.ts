import { describe, it, expect } from "vitest";
import { fileCardStartsOpen } from "./helpers";

describe("fileCardStartsOpen", () => {
  it("keeps boilerplate collapsed even with findings", () => {
    expect(
      fileCardStartsOpen({ role: "boilerplate", smart: true, changedLines: 4, findingsCount: 2 }),
    ).toBe(false);
  });

  it("opens a large Smart-order file when it has findings", () => {
    expect(
      fileCardStartsOpen({ role: "core", smart: true, changedLines: 350, findingsCount: 1 }),
    ).toBe(true);
  });

  it("keeps a large Smart-order file collapsed when it has no findings", () => {
    expect(
      fileCardStartsOpen({ role: "core", smart: true, changedLines: 350, findingsCount: 0 }),
    ).toBe(false);
  });

  it("does not let findings rescue a large file in Original order", () => {
    expect(fileCardStartsOpen({ smart: false, changedLines: 350, findingsCount: 1 })).toBe(false);
  });
});
