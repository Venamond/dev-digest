"use client";

import React from "react";
import type { RunSummary, PrCommit, ReviewRecord, FindingRecord } from "@devdigest/shared";
import { CommitRow } from "./CommitRow";
import { RunRow } from "./RunRow";
import { tsOf, type TimelineItem } from "./helpers";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against.
 */

export function RunHistory({
  runs,
  reviews = [],
  commits = [],
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  /** The PR's persisted reviews (with findings), keyed to runs via `run_id`. */
  reviews?: ReviewRecord[];
  commits?: PrCommit[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const findingsByRunId = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const review of reviews) {
      if (review.run_id) map.set(review.run_id, review.findings);
    }
    return map;
  }, [reviews]);

  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRunId.get(item.run.run_id)}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
