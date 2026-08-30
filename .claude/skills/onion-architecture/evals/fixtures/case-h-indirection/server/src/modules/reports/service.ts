import { ReviewRepository } from '../_shared/repos.js';
import type { Db } from '../../db/client.js';
import type { Report, ReportRow } from '@devdigest/shared';
import type { ReportsDeps } from './deps.js';
import { reviewsInWindow, attentionCount } from './aggregate.js';
import { bucketBySeverity, toReportRow } from './helpers.js';
import { ATTENTION_SCORE } from './constants.js';

/**
 * A15 — reports service. Rolls a workspace's reviews for a window into the
 * report card the studio renders on the Reports tab.
 */
export class ReportsService {
  private reviews: ReviewRepository;

  constructor(
    private db: Db,
    private deps: ReportsDeps,
  ) {
    this.reviews = new ReviewRepository(db);
  }

  async build(workspaceId: string, window: string): Promise<Report> {
    const rows = await reviewsInWindow(this.db, workspaceId, window);
    const reportRows: ReportRow[] = rows.map((row) =>
      toReportRow(row, (row.score ?? 100) < ATTENTION_SCORE),
    );

    return {
      window: window as Report['window'],
      generated_at: new Date().toISOString(),
      buckets: bucketBySeverity(reportRows),
      rows: reportRows,
    };
  }

  async attention(workspaceId: string): Promise<number> {
    return attentionCount(this.db, workspaceId);
  }

  async findingsFor(prId: string) {
    return this.reviews.reviewsForPull(prId);
  }

  async blastRadius(prId: string) {
    return this.deps.blast().forPull(prId);
  }
}
