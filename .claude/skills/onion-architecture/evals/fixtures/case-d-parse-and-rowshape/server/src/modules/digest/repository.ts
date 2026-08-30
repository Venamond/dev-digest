import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * A11 — digest data-access. Reads the reviews a digest window covers.
 */

export type DigestRow = typeof t.reviews.$inferSelect;

const WINDOW_MS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export class DigestRepository {
  constructor(private db: Db) {}

  async reviewsInWindow(workspaceId: string, window: string): Promise<DigestRow[]> {
    const since = new Date(Date.now() - (WINDOW_MS[window] ?? WINDOW_MS['7d']));
    return this.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.workspaceId, workspaceId), gte(t.reviews.createdAt, since)))
      .orderBy(desc(t.reviews.createdAt));
  }

  async latestReview(workspaceId: string): Promise<DigestRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.workspaceId, workspaceId))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    return row;
  }
}
