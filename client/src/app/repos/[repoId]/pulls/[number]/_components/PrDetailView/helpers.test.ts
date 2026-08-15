import { describe, it, expect } from "vitest";
import { openFindingPatch, patchedSearch } from "./helpers";

describe("patchedSearch / openFindingPatch", () => {
  it("switches to the findings tab, names the finding, drops severity, and keeps trace", () => {
    const qs = patchedSearch(
      new URLSearchParams("tab=diff&severity=WARNING&trace=r1"),
      openFindingPatch("f1"),
    );
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      tab: "findings",
      trace: "r1",
      finding: "f1",
    });
  });

  it("clears finding when switching tabs", () => {
    expect(
      patchedSearch(new URLSearchParams("tab=findings&finding=f1"), { tab: "diff", finding: null }),
    ).toBe("tab=diff");
  });
});
