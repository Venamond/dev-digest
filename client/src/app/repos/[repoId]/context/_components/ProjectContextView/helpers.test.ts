import { describe, it, expect } from "vitest";
import { byName, coveragePercent, freshestAgo, totalTokens } from "./helpers";

describe("totalTokens", () => {
  it("sums the array it is given, so the footer cannot drift from the list", () => {
    expect(totalTokens([{ approx_tokens: 300 }, { approx_tokens: 1000 }])).toBe(1300);
  });

  it("is 0 for an empty list rather than NaN", () => {
    expect(totalTokens([])).toBe(0);
  });
});

describe("coveragePercent (mockup M1's ring)", () => {
  it("is the share of ENABLED agents that read the document", () => {
    expect(coveragePercent(1, 2)).toBe(50);
    expect(coveragePercent(3, 4)).toBe(75);
  });

  it("reads 0 with no enabled agents instead of dividing by zero", () => {
    // The trap: 1/0 is Infinity and would render a ring with no upper bound.
    expect(coveragePercent(1, 0)).toBe(0);
    expect(coveragePercent(0, 0)).toBe(0);
  });

  it("never exceeds 100, even if more agents read it than are enabled", () => {
    // Reachable in the window between disabling an agent and the list refetching.
    expect(coveragePercent(5, 2)).toBe(100);
  });

  it("is 0 when nobody reads the document", () => {
    expect(coveragePercent(0, 7)).toBe(0);
  });
});

describe("byName — the rail's display order", () => {
  const sorted = (paths: string[]) => paths.map((path) => ({ path })).sort(byName).map((d) => d.path);

  it("orders by the FILE NAME, which is what the row shows", () => {
    expect(sorted(["docs/zebra.md", "specs/apple.md"])).toEqual([
      "specs/apple.md",
      "docs/zebra.md",
    ]);
  });

  it("ignores case, so Alpha and beta do not split the list", () => {
    expect(sorted(["docs/beta.md", "docs/Alpha.md"])).toEqual(["docs/Alpha.md", "docs/beta.md"]);
  });

  it("breaks a tie on the full path, so equal names keep a fixed order", () => {
    // Six README.md files must not shuffle between renders.
    expect(sorted(["specs/README.md", "client/specs/README.md", "server/docs/README.md"])).toEqual([
      "client/specs/README.md",
      "server/docs/README.md",
      "specs/README.md",
    ]);
  });
});

describe("freshestAgo — M1's freshness line", () => {
  const NOW = Date.parse("2026-08-23T12:00:00Z");
  const at = (iso: string) => ({ updated_at: iso });

  it("reports the NEWEST document, not the first or the last", () => {
    expect(
      freshestAgo([at("2026-08-20T12:00:00Z"), at("2026-08-23T11:00:00Z"), at("2026-08-21T12:00:00Z")], NOW),
    ).toBe("1h ago");
  });

  it("scales the unit with the distance", () => {
    expect(freshestAgo([at("2026-08-23T11:55:00Z")], NOW)).toBe("5m ago");
    expect(freshestAgo([at("2026-08-21T12:00:00Z")], NOW)).toBe("2d ago");
  });

  it("is null when nothing reports a time, so the caption stays instead", () => {
    // An attachment whose file is gone carries `updated_at: null`.
    expect(freshestAgo([{ updated_at: null }, {}], NOW)).toBeNull();
    expect(freshestAgo([], NOW)).toBeNull();
  });

  it("ignores an unparseable timestamp rather than rendering NaN", () => {
    expect(freshestAgo([at("not a date"), at("2026-08-23T11:00:00Z")], NOW)).toBe("1h ago");
  });
});
