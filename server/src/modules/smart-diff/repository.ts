import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import type { SmartDiffFileInput } from './pure/assemble.js';

/**
 * Ring 2 — the only file in modules/smart-diff/ allowed to import
 * drizzle-orm / db/schema. Both queries below are duplicated from
 * modules/reviews/repository/pull.repo.ts and modules/pulls/repository.ts
 * (no-cross-module-internals forbids importing them directly) — see
 * docs/plans/2026-08-14-smart-diff.md §2b.
 */
export class SmartDiffRepository {
  constructor(private db: Db) {}

  /** Duplicated from modules/reviews/repository/pull.repo.ts:9-19 —
   *  no-cross-module-internals forbids importing it. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async prFiles(prId: string): Promise<SmartDiffFileInput[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Every kind='review' row for the PR — see this plan §2b. The filter is
   * load-bearing: without it 'summary' rows join in and findings are
   * double-counted (reviews/service.ts:162-176 does no such filtering).
   * Deduplication and sorting happen in buildSmartDiff (S3), not here.
   */
  async findingLinesByFile(prId: string): Promise<Map<string, number[]>> {
    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')));

    const byFile = new Map<string, number[]>();
    for (const row of rows) {
      const list = byFile.get(row.file) ?? [];
      list.push(row.startLine);
      byFile.set(row.file, list);
    }
    return byFile;
  }
}
