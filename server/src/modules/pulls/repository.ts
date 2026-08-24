import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { PullRow, RepoRow, PrFileRow, PrCommitRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';

/**
 * F1 — pulls data-access layer. The ONLY place in this module that touches
 * `pull_requests`, `pr_files`, `pr_commits`, and related rollup tables.
 * Every workspace-scoped lookup guards tenancy via `workspaceId`.
 */

export type { RepoRow, PrFileRow, PrCommitRow };

export interface GhPullUpsert {
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  head_sha: string;
  additions: number;
  deletions: number;
  files_count: number;
  status: string;
  opened_at?: string | null;
  updated_at?: string | null;
}

export interface GhPullFile {
  path: string;
  additions: number;
  deletions: number;
  patch?: string | null;
}

export interface GhPullCommit {
  sha: string;
  message: string;
  author: string;
  committed_at?: string | null;
}

export class PullsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async listPulls(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /**
   * Idempotent upsert from a GitHub PR-list payload. `persistOpenedAt` mirrors
   * the pre-refactor split: GET /repos/:id/pulls sets opened_at on insert;
   * POST /repos/:id/poll did not.
   */
  async upsertFromGhList(
    workspaceId: string,
    repoId: string,
    pr: GhPullUpsert,
    options?: { persistOpenedAt?: boolean },
  ): Promise<void> {
    const persistOpenedAt = options?.persistOpenedAt ?? true;
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        ...(persistOpenedAt
          ? { openedAt: pr.opened_at ? new Date(pr.opened_at) : null }
          : {}),
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async updateDiffStats(
    prId: string,
    additions: number,
    deletions: number,
    filesCount: number,
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions, deletions, filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Latest review score per PR (newest `reviews` row with kind=review). */
  async latestReviewsByPr(
    prIds: string[],
  ): Promise<Map<string, { id: string; score: number | null }>> {
    const latestReviewByPr = new Map<string, { id: string; score: number | null }>();
    if (prIds.length === 0) return latestReviewByPr;

    const reviewRows = await this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));

    for (const rv of reviewRows) {
      if (!latestReviewByPr.has(rv.prId)) {
        latestReviewByPr.set(rv.prId, { id: rv.id, score: rv.score });
      }
    }
    return latestReviewByPr;
  }

  /** Raw finding severities grouped by PR (every review, kind=review). */
  async findingsSeveritiesByPr(prIds: string[]): Promise<Map<string, { severity: string }[]>> {
    const bySeverityRows = new Map<string, { severity: string }[]>();
    if (prIds.length === 0) return bySeverityRows;

    const findingRows = await this.db
      .select({ prId: t.reviews.prId, severity: t.findings.severity })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')));

    for (const fr of findingRows) {
      const list = bySeverityRows.get(fr.prId) ?? [];
      list.push({ severity: fr.severity });
      bySeverityRows.set(fr.prId, list);
    }
    return bySeverityRows;
  }

  /** Total known cost per PR (sum of non-null agent_runs.cost_usd). */
  async costsByPr(prIds: string[]): Promise<{
    totalCostByPr: Map<string, number>;
    hasCostByPr: Set<string>;
  }> {
    const totalCostByPr = new Map<string, number>();
    const hasCostByPr = new Set<string>();
    if (prIds.length === 0) return { totalCostByPr, hasCostByPr };

    const runRows = await this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds));

    for (const rr of runRows) {
      if (!rr.prId || rr.costUsd == null) continue;
      hasCostByPr.add(rr.prId);
      totalCostByPr.set(rr.prId, (totalCostByPr.get(rr.prId) ?? 0) + rr.costUsd);
    }
    return { totalCostByPr, hasCostByPr };
  }

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async replacePrFiles(prId: string, files: GhPullFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }

  async replacePrCommits(prId: string, commits: GhPullCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }

  async updatePullBodyAndStats(
    prId: string,
    body: string | null,
    additions: number,
    deletions: number,
    filesCount: number,
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ body, additions, deletions, filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  async listPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  async bumpRepoLastPolled(repoId: string): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ lastPolledAt: new Date() })
      .where(eq(t.repos.id, repoId));
  }
}
