import { describe, expect, it } from "vitest";
import { joinWhatWhy } from "./helpers";

/* The banner shows one paragraph (M1), but `what` and `why` arrive as two
   fields and the model punctuates neither — a bare space produced the run-on
   "Add external webhook sharing for reviews To allow sharing…" seen on PR #3,
   2026-08-24. */
describe("joinWhatWhy", () => {
  it("supplies the full stop the model omits", () => {
    expect(
      joinWhatWhy("Add external webhook sharing for reviews", "To allow sharing reviews"),
    ).toBe("Add external webhook sharing for reviews. To allow sharing reviews");
  });

  it("adds no second terminator when the model already wrote one", () => {
    for (const end of [".", "!", "?", ":", ";"]) {
      expect(joinWhatWhy(`Adds a limiter${end}`, "To stop abuse")).toBe(
        `Adds a limiter${end} To stop abuse`,
      );
    }
  });

  it("returns the other half alone when one is empty or blank", () => {
    expect(joinWhatWhy("", "To stop abuse")).toBe("To stop abuse");
    expect(joinWhatWhy("Adds a limiter", "   ")).toBe("Adds a limiter");
  });
});
