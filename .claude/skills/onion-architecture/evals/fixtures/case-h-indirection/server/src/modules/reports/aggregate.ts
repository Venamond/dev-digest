import { and, desc, eq, gte } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { Db } from '../../db/client.js';
import { ATTENTION_SCORE, REPORT_TTL_MS } from './constants.js';

export type ReportReviewRow = typeof t.reviews.$inferSelect;

/**
 * A15 — window aggregation for the reports module. Builds the per-window
 * review set the service rolls up.
 */

const WINDOW_MS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export async function reviewsInWindow(
  db: Db,
  workspaceId: string,
  window: string,
): Promise<ReportReviewRow[]> {
  const since = new Date(Date.now() - (WINDOW_MS[window] ?? WINDOW_MS['7d']));
  return db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.workspaceId, workspaceId), gte(t.reviews.createdAt, since)))
    .orderBy(desc(t.reviews.createdAt));
}

export async function attentionCount(db: Db, workspaceId: string): Promise<number> {
  const rows = await db
    .select()
    .from(t.reviews)
    .where(eq(t.reviews.workspaceId, workspaceId));
  return rows.filter((r) => (r.score ?? 100) < ATTENTION_SCORE).length;
}

export function isStale(generatedAt: Date): boolean {
  return Date.now() - generatedAt.getTime() > REPORT_TTL_MS;
}
