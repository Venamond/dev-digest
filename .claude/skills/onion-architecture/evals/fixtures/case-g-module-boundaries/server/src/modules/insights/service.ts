import { toAgentDto } from '../agents/helpers.js';
import { BFS_DEPTH } from '../repo-intel/constants.js';
import type { AgentRow } from '../../db/rows.js';
import type { InsightsDeps } from './deps.js';
import { InsightsRepository } from './repository.js';
import { groupByCategory } from './helpers.js';

/**
 * A14 — insights service. Finds findings that keep coming back across a pull
 * request's reviews and turns them into the recurring-issue list the Insights
 * tab renders.
 */
export class InsightsService {
  constructor(
    private deps: InsightsDeps,
    private repo: InsightsRepository,
  ) {}

  async recurring(prId: string, agent: AgentRow | null) {
    const reviews = await this.deps.reviewRepo.reviewsForPull(prId);
    const findings = reviews.flatMap((r) => r.findings);
    const grouped = groupByCategory(findings);

    return grouped.map((group) => ({
      category: group.category,
      occurrences: group.rows.length,
      depth: BFS_DEPTH,
      agent: agent ? toAgentDto(agent) : null,
    }));
  }

  async mute(findingId: string) {
    return this.repo.markDismissed(findingId);
  }
}
