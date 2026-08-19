import { and, eq, inArray, ne, sql } from 'drizzle-orm';
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
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        status: t.pullRequests.status,
        updatedAt: t.pullRequests.updatedAt,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
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
}
