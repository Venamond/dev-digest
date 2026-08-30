import { describe, it, expect } from "vitest";
import {
  confidenceColor,
  countAccepted,
  formatEvidenceLabel,
  formatRelativeTime,
  preconditionReason,
} from "./helpers";
import type { ConventionCandidate } from "@devdigest/shared";

function cand(status: ConventionCandidate["status"]): ConventionCandidate {
  return {
    id: "1",
    rule: "r",
    category: null,
    evidence_path: "a.ts",
    evidence_snippet: "x",
    evidence_line_start: 1,
    evidence_line_end: 1,
    evidence_url: null,
    confidence: 0.9,
    status,
  };
}

describe("formatEvidenceLabel", () => {
  it("formats single and ranged lines", () => {
    expect(formatEvidenceLabel("a.ts", 2, 2)).toBe("a.ts:2");
    expect(formatEvidenceLabel("a.ts", 2, 4)).toBe("a.ts:2-4");
  });
});

describe("confidenceColor", () => {
  it("maps thresholds", () => {
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.78)).toBe("var(--warn)");
    expect(confidenceColor(0.4)).toBe("var(--text-muted)");
  });
});

describe("countAccepted / formatRelativeTime / preconditionReason", () => {
  it("counts accepted", () => {
    expect(countAccepted([cand("accepted"), cand("pending"), cand("rejected")])).toBe(1);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-08-06T12:00:00Z");
    expect(formatRelativeTime("2026-08-06T11:00:00Z", now)).toBe("1h ago");
  });

  it("reads precondition reason", () => {
    expect(preconditionReason({ reason: "not_indexed" })).toBe("not_indexed");
    expect(preconditionReason({})).toBeNull();
  });
});
