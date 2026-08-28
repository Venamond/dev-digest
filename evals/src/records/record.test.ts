/**
 * Pure unit test for the persisted verdict — no model call, no file I/O. It exists because the
 * workflow tier shipped with `outcome` meaning "the session did not error" rather than "the case
 * passed": on the 2026-08-27 run three cases that failed their assertions were persisted as
 * `outcome: true`, and the one negative that genuinely passed was persisted as `false` because
 * its session hit maxTurns. Every pass rate derived from records.jsonl was wrong for that tier.
 */

import { describe, test, expect } from "vitest";
import { deriveOutcome } from "./record.js";
import type { Result } from "../runtime/run-claude.js";
import type { Verdict } from "../scoring/llm-judge.js";

const result = (isError: boolean): Result => ({
  text: "",
  toolsUsed: [],
  subagents: [],
  skillsInvoked: [],
  filesRead: [],
  numTurns: 1,
  isError,
  metrics: { durationMs: 0, inputTokens: 0, outputTokens: 0, toolCallCount: 0 },
});

/** A judge verdict carrying just the score the precedence rules read. */
const judged = (score: number): Verdict => ({ results: [], passed: 0, total: 0, score });

describe("deriveOutcome", () => {
  test("a failed assertion is recorded as a failure even though the session succeeded", () => {
    // The regression itself: this returned `true` before `passed` existed.
    expect(deriveOutcome({ result: result(false), passed: false })).toBe(false);
  });

  test("a passed assertion is recorded as a pass", () => {
    expect(deriveOutcome({ result: result(false), passed: true })).toBe(true);
  });

  test("an explicit verdict outranks the session's error state in both directions", () => {
    expect(deriveOutcome({ result: result(true), passed: true })).toBe(true);
    expect(deriveOutcome({ result: result(false), passed: false })).toBe(false);
  });

  test("without an explicit verdict, a grounding-gate failure short-circuits to false", () => {
    const verdict = judged(1);
    expect(deriveOutcome({ result: result(false), grounded: 0, verdict, threshold: 0.6 })).toBe(false);
  });

  test("without an explicit verdict, the judge threshold decides", () => {
    const passing = judged(0.8);
    const failing = judged(0.4);
    expect(deriveOutcome({ result: result(false), verdict: passing, threshold: 0.6 })).toBe(true);
    expect(deriveOutcome({ result: result(false), verdict: failing, threshold: 0.6 })).toBe(false);
  });

  test("with nothing else to go on, it falls back to whether the run itself succeeded", () => {
    expect(deriveOutcome({ result: result(false) })).toBe(true);
    expect(deriveOutcome({ result: result(true) })).toBe(false);
  });
});
