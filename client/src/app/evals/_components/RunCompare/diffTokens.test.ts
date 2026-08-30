import { describe, it, expect } from "vitest";
import { diffTokens } from "./diffTokens";

const kinds = (a: string, b: string) =>
  diffTokens(a, b)
    .filter((t) => t.t.trim() !== "")
    .map((t) => `${t.k}:${t.t}`);

describe("diffTokens", () => {
  it("marks every token of two identical strings as unchanged", () => {
    expect(kinds("review the diff", "review the diff")).toEqual([
      "same:review",
      "same:the",
      "same:diff",
    ]);
  });

  it("marks a replaced word as one deletion and one addition", () => {
    expect(kinds("review the code", "review the diff")).toEqual([
      "same:review",
      "same:the",
      "del:code",
      "add:diff",
    ]);
  });

  it("marks everything as added when the old prompt is empty", () => {
    expect(kinds("", "a new prompt")).toEqual(["add:a", "add:new", "add:prompt"]);
  });

  it("keeps whitespace tokens so the diff can render pre-wrap", () => {
    expect(diffTokens("a b", "a b").map((t) => t.t)).toEqual(["a", " ", "b"]);
  });
});
