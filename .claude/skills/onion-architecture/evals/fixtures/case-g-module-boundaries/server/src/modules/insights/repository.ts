import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';

/**
 * A14 — insights data-access.
 */
export class InsightsRepository {
  constructor(private db: Db) {}

  async markDismissed(findingId: string): Promise<FindingRow | undefined> {
    const [row] = await this.db
      .update(t.findings)
      .set({ dismissedAt: new Date() })
      .where(eq(t.findings.id, findingId))
      .returning();
    return row;
  }

  async countDismissed(reviewId: string): Promise<number> {
    const rows = await this.db.select().from(t.findings).where(eq(t.findings.reviewId, reviewId));
    return rows.filter((r) => r.dismissedAt !== null).length;
  }
}
