import { CreateDigest, type Digest } from '@devdigest/shared';
import { DigestRepository, type DigestRow } from './repository.js';
import { buildEntries, worstSeverity } from './helpers.js';

/**
 * A11 — digest service. Aggregates a workspace's reviews for a window into the
 * digest card the studio renders on the Overview tab.
 */
export class DigestService {
  constructor(private repo: DigestRepository) {}

  async build(workspaceId: string, body: unknown): Promise<Digest> {
    const input = CreateDigest.parse(body);
    const rows = await this.repo.reviewsInWindow(workspaceId, input.window);
    const entries = buildEntries(rows);

    return {
      window: input.window,
      generated_at: new Date().toISOString(),
      total_findings: entries.reduce((n, e) => n + e.finding_count, 0),
      entries,
    };
  }

  async latest(workspaceId: string): Promise<DigestRow | undefined> {
    return this.repo.latestReview(workspaceId);
  }

  async worst(workspaceId: string) {
    const rows = await this.repo.reviewsInWindow(workspaceId, '7d');
    return worstSeverity(rows);
  }
}
