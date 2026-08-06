import { describe, it, expect } from "vitest";
import { modelChipBg, modelColor } from "./helpers";

describe("modelColor / modelChipBg", () => {
  it("resolves colour from the short model name", () => {
    expect(modelColor("openai/gpt-4.1")).toBe("#3b82f6");
    expect(modelColor("gpt-4.1")).toBe("#3b82f6");
  });

  it("tints hex colours for the chip background", () => {
    expect(modelChipBg("#3b82f6")).toBe("#3b82f61a");
  });

  it("falls back to a surface token for CSS-variable colours", () => {
    expect(modelChipBg("var(--text-secondary)")).toBe("var(--bg-surface)");
  });
});
