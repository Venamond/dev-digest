import { describe, it, expect } from "vitest";
import { displayModelName, modelLabel, toModelOptions } from "./model-label";

describe("displayModelName", () => {
  it("strips the vendor prefix from OpenRouter-style ids", () => {
    expect(displayModelName("deepseek/deepseek-v4-flash")).toBe("deepseek-v4-flash");
    expect(displayModelName("openai/gpt-4.1")).toBe("gpt-4.1");
  });

  it("leaves bare model ids unchanged", () => {
    expect(displayModelName("gpt-4.1")).toBe("gpt-4.1");
    expect(displayModelName("o1")).toBe("o1");
  });
});

describe("modelLabel / toModelOptions", () => {
  it("uses the short name in labels while keeping the full id as value", () => {
    const opts = toModelOptions([{ id: "deepseek/deepseek-v4-flash" }]);
    expect(opts).toEqual([{ value: "deepseek/deepseek-v4-flash", label: "deepseek-v4-flash" }]);
  });

  it("appends pricing after the short name", () => {
    expect(
      modelLabel({
        id: "deepseek/deepseek-v4-flash",
        pricing: { promptPerM: 0.14, completionPerM: 0.28 },
      }),
    ).toBe("deepseek-v4-flash — $0.140/$0.280 per 1M");
  });
});
