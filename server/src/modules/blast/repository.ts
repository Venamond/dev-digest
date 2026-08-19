import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PriorPullRow, PullRow, RepoRow } from '../../db/rows.js';

/**
 * Ring 2 — the only file in modules/blast/ allowed to import drizzle-orm /
 * db/schema. getPull/prFiles are duplicated from
 * modules/reviews/repository/pull.repo.ts and modules/pulls/repository.ts
 * (no-cross-module-internals forbids importing them directly) — exactly as
 * modules/smart-diff/repository.ts:7-13 does and documents.
 *
 * Index-derived data (symbols / references / file_edges / file_facts /
 * file_rank) is NOT queried here — it comes through the RepoIntel facade.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  /** Duplicated from modules/reviews/repository/pull.repo.ts:9-19. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepo(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async prFiles(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  /**
   * Other PRs in the same repo that touched any of `paths`, newest first.
   * `pull_requests.updated_at` is nullable (db/schema/pulls.ts:27), hence
   * NULLS LAST. SELECT DISTINCT requires every ORDER BY expression to be in
   * the select list — `updatedAt` is.
   */
  async priorPulls(
    repoId: string,
    excludePrId: string,
    paths: string[],
    limit: number,
  ): Promise<PriorPullRow[]> {
    if (paths.length === 0) return [];
    return this.db
      .selectDistinct({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        status: t.pullRequests.status,
        updatedAt: t.pullRequests.updatedAt,
        // The Intent layer's one-line "why" for that PR when it exists, its
        // description otherwise. LEFT join: most older PRs never had intent
        // derived, and a missing row must not drop the PR from the list.
        intent: t.prIntent.intent,
        body: t.pullRequests.body,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .leftJoin(t.prIntent, eq(t.prIntent.prId, t.pullRequests.id))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, excludePrId),
          inArray(t.prFiles.path, paths),
        ),
      )
      .orderBy(sql`${t.pullRequests.updatedAt} desc nulls last`)
      .limit(limit);
  }

  /**
   * Which of the CURRENT PR's changed paths each prior PR also touched.
   * The block header claims "touching these files"; without this the rows
   * never say which, and with several changed files that is the first thing
   * a reviewer wants to know.
   */
  async sharedFiles(prIds: string[], paths: string[]): Promise<Map<string, string[]>> {
    const byPull = new Map<string, string[]>();
    if (prIds.length === 0 || paths.length === 0) return byPull;
    const rows = await this.db
      .selectDistinct({ prId: t.prFiles.prId, path: t.prFiles.path })
      .from(t.prFiles)
      .where(and(inArray(t.prFiles.prId, prIds), inArray(t.prFiles.path, paths)))
      .orderBy(asc(t.prFiles.path));
    for (const r of rows) {
      const list = byPull.get(r.prId);
      if (list) list.push(r.path);
      else byPull.set(r.prId, [r.path]);
    }
    return byPull;
  }

  /**
   * Findings raised on a prior PR and then DISMISSED — a concern someone
   * decided not to act on, on a file this PR is touching again. Accepted and
   * still-open findings are deliberately excluded: the first were dealt with,
   * and the second belong to that PR's own review, not to this one's context.
   */
  async unresolvedFindings(
    prIds: string[],
    perPull: number,
  ): Promise<Map<string, Array<{ severity: string; title: string }>>> {
    const byPull = new Map<string, Array<{ severity: string; title: string }>>();
    if (prIds.length === 0) return byPull;
    const rows = await this.db
      .select({
        prId: t.reviews.prId,
        severity: t.findings.severity,
        title: t.findings.title,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(inArray(t.reviews.prId, prIds), isNotNull(t.findings.dismissedAt)))
      .orderBy(desc(t.findings.dismissedAt));
    for (const r of rows) {
      const list = byPull.get(r.prId) ?? [];
      if (list.length >= perPull) continue;
      list.push({ severity: r.severity, title: r.title });
      byPull.set(r.prId, list);
    }
    return byPull;
  }
}
