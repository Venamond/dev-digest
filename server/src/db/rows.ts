import * as t from './schema.js';

/**
 * Shared row types inferred from the Drizzle schema.
 *
 * They live here — next to the schema — rather than inside a module's
 * `repository.ts`, so cross-cutting consumers (ci, eval, performance,
 * conformance, compose, hooks, runs, reviews) can reference a row shape
 * WITHOUT importing another module's data layer. Each owning repository
 * re-exports its row from here to keep its public type API unchanged.
 */
export type AgentRow = typeof t.agents.$inferSelect;
export type AgentVersionRow = typeof t.agentVersions.$inferSelect;
export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;
export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;
export type FindingRow = typeof t.findings.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;
export type AgentRunRow = typeof t.agentRuns.$inferSelect;
export type RunSkillRow = typeof t.runSkills.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;
export type PrIntentRow = typeof t.prIntent.$inferSelect;
export type PrBriefRow = typeof t.prBrief.$inferSelect;

/**
 * A projection, not a table row: the prior-PR list `modules/blast` shows is a
 * `pr_files ⋈ pull_requests` select, and its shape crosses from the repository
 * (ring 2) into the pure shaper (ring 1). Row shapes that cross that boundary
 * travel through this file rather than being imported out of a `repository.ts`.
 */
export interface PriorPullRow {
  /** Needed to fetch this PR's shared files and unresolved findings. */
  id: string;
  number: number;
  title: string;
  author: string;
  status: string;
  updatedAt: Date | null;
  /** That PR's derived intent, if the Intent layer ever ran on it. */
  intent: string | null;
  /** Its description — the fallback when no intent was derived. */
  body: string | null;
}
