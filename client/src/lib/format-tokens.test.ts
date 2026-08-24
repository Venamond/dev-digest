import { describe, it, expect } from "vitest";
import { formatTokens } from "./format-tokens";

/**
 * SPEC-2026-08-23-pr-why-risk-brief / AC-25.
 *
 * These assert the EXACT string on purpose. `client/INSIGHTS.md:460-476` names
 * this the one legitimate case for exact copy — the helper exists to produce a
 * format, so the format IS the criterion. Change the string here and in the
 * criterion together, deliberately.
 */
describe("formatTokens", () => {
  it("AC-25: renders one decimal on each side with an uppercase K", () => {
    expect(formatTokens(8200, 1300)).toBe("8.2K→1.3K");
  });

  it("AC-25: keeps the decimal at zero", () => {
    expect(formatTokens(0, 0)).toBe("0.0K→0.0K");
  });

  it("AC-25: is NOT the old drawer format — that rounded the input side away", () => {
    // The trap the previous implementation passed: it rounded the input side
    // to zero decimals and used a lowercase k, so 8200 rendered as "8k" —
    // losing the .2 the criterion requires.
    expect(formatTokens(8200, 1300)).not.toBe("8k→1.3k");
    expect(formatTokens(8200, 1300)).not.toContain("k");
  });

  it("rounds rather than truncates", () => {
    expect(formatTokens(8250, 1_299_000)).toBe("8.3K→1299.0K");
  });
});
