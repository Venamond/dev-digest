import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { visibleFindings } from "./helpers";

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "confidence">): FindingRecord {
  return {
    category: "security",
    title: over.id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", confidence: 0.95, title: "Hardcoded secret" }),
  finding({ id: "f2", severity: "WARNING", confidence: 0.9, title: "N+1 query" }),
];

describe("visibleFindings", () => {
  it("drops a low-confidence finding when hideLow is on", () => {
    const crit = finding({ id: "low", severity: "CRITICAL", confidence: 0.2 });
    const warn = finding({ id: "ok", severity: "WARNING", confidence: 0.9 });
    expect(visibleFindings([crit, warn], true, null).map((f) => f.id)).toEqual(["ok"]);
  });

  it("keeps a low-confidence finding when it is the keepId", () => {
    const crit = finding({ id: "low", severity: "CRITICAL", confidence: 0.2 });
    const warn = finding({ id: "ok", severity: "WARNING", confidence: 0.9 });
    expect(visibleFindings([crit, warn], true, null, "low").map((f) => f.id)).toEqual(["low", "ok"]);
  });

  it("exempts keepId from the severity filter", () => {
    expect(visibleFindings(FINDINGS, false, "WARNING", "f1").map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});
