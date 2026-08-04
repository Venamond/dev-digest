import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime, sizeOf } from "./helpers";
import type { PrMeta } from "@/lib/types";

afterEach(() => {
  vi.useRealTimers();
});

function pr(partial: Partial<PrMeta> & Pick<PrMeta, "additions" | "deletions">): PrMeta {
  return {
    number: 1,
    title: "t",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "abc",
    files_count: 1,
    status: "open",
    ...partial,
  };
}

describe("sizeOf", () => {
  it("buckets by total changed lines", () => {
    expect(sizeOf(pr({ additions: 10, deletions: 0 })).size).toBe("S");
    expect(sizeOf(pr({ additions: 80, deletions: 20 })).size).toBe("M");
    expect(sizeOf(pr({ additions: 500, deletions: 500 })).size).toBe("L");
  });
});

describe("relativeTime", () => {
  it("returns em dash for missing/invalid timestamps", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime("not-a-date")).toBe("—");
  });

  it("formats compact relative ages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
    expect(relativeTime("2026-08-04T12:00:00Z")).toBe("now");
    expect(relativeTime("2026-08-04T11:45:00Z")).toBe("15m");
    expect(relativeTime("2026-08-04T09:00:00Z")).toBe("3h");
    expect(relativeTime("2026-08-02T12:00:00Z")).toBe("2d");
  });
});
