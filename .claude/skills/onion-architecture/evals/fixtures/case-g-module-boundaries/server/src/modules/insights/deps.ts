import type { FindingRow } from '../../db/rows.js';

/**
 * Narrow dependency bag for `modules/insights`. `routes.ts` builds it from the
 * Container at registration time; nothing else in this module imports
 * `platform/container.ts`.
 *
 * The repository slice is declared structurally rather than as
 * `import type { ReviewRepository }` because that import edge is itself banned:
 * `.dependency-cruiser.cjs` runs with `tsPreCompilationDeps: true`, so a
 * type-only import of another module's repository is a real edge.
 */
export interface InsightsReviewRepo {
  reviewsForPull(
    prId: string,
  ): Promise<Array<{ review: { id: string; verdict: string | null }; findings: FindingRow[] }>>;
}

export interface InsightsDeps {
  reviewRepo: InsightsReviewRepo;
}
