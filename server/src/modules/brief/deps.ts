/**
 * Narrow dependency bag for `modules/brief` application code.
 *
 * Deliberately NOT `Container`, for the reason `blast/deps.ts:1-14` records:
 * the composition root as a service locator hides what the service actually
 * needs, and it is the import edge that produced the `repo-intel ↔ container`
 * cycle burned down 2026-08-04. The `onion-architecture` skill grandfathers the
 * services that already take the Container and closes the door on new ones.
 *
 * `routes.ts` builds this from the Container at registration time; nothing else
 * in this module imports `platform/container.ts`.
 */
import type {
  FeatureModelChoice,
  FeatureModelId,
  GitClient,
  GitHubClient,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { FindingRow, PrFileRow, PrIntentRow, PullRow, RepoRow } from '../../db/rows.js';
import type { BlastService } from '../blast/facade.js';
import type { ContextService } from '../context/facade.js';

/**
 * The slice of `container.reviewRepo` this module uses — the seam named in
 * `no-cross-module-internals`' own comment.
 *
 * It is declared structurally rather than as `import type { ReviewRepository }`
 * because that rule bans the import edge itself: its `to.path` is
 * `^src/modules/([^/]+)/(service|repository)(\.ts|/)`, and
 * `.dependency-cruiser.cjs` runs with `tsPreCompilationDeps: true`, so a
 * type-only import is a real edge and a real violation. `ReviewRepository`
 * satisfies this interface as it stands; row shapes travel through
 * `db/rows.ts`, the sanctioned seam.
 */
export interface BriefReviewRepo {
  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined>;
  getRepo(repoId: string): Promise<RepoRow | undefined>;
  getPrFiles(prId: string): Promise<PrFileRow[]>;
  getIntent(prId: string): Promise<PrIntentRow | undefined>;
  /** Reviews for a PR, newest first, each with its findings. */
  reviewsForPull(prId: string): Promise<{ findings: FindingRow[] }[]>;
}

export interface BriefDeps {
  db: Db;
  reviewRepo: BriefReviewRepo;
  /**
   * Thunks, for the same reason `BlastDeps.repoIntel` is one: both are built
   * from lazy container getters, and resolving them at plugin registration
   * would move construction to boot.
   */
  blast: () => BlastService;
  context: () => ContextService;
  /** Rejects with `ConfigError` when no GITHUB_TOKEN is configured. */
  github: () => Promise<GitHubClient>;
  git: GitClient;
  llm: (id: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  /** `container.tokenizer.count` — a real `cl100k_base` encoder (AC-12). */
  countTokens: (text: string) => number;
  /** `container.priceBook.estimate` — synchronous, `null` when unpriced. */
  estimateCost: (model: string, tokensIn: number, tokensOut: number) => number | null;
}
