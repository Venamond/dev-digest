import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * A15 — reports data-access. Owns the module's own persistence: the cached
 * report rows it regenerates when they go stale.
 */

export type ReportCacheRow = typeof t.reviews.$inferSelect;

export class ReportsRepository {
  constructor(private db: Db) {}

  async latestForWorkspace(workspaceId: string): Promise<ReportCacheRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.kind, 'summary')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    return row;
  }

  async countForWorkspace(workspaceId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.workspaceId, workspaceId));
    return rows.length;
  }
}
