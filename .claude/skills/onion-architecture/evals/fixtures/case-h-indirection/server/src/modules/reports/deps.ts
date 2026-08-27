import type { BlastService } from '../blast/facade.js';
import type { GitHubClient, LLMProvider, Provider } from '@devdigest/shared';

/**
 * Narrow dependency bag for `modules/reports`. `routes.ts` builds it from the
 * Container at registration time; nothing else in this module imports
 * `platform/container.ts`.
 *
 * The service-shaped entries are thunks for the same reason `brief/deps.ts`
 * uses them: both are built from lazy container getters, and resolving them at
 * plugin registration would move construction to boot.
 */
export interface ReportsDeps {
  blast: () => BlastService;
  /** Rejects with `ConfigError` when no GITHUB_TOKEN is configured. */
  github: () => Promise<GitHubClient>;
  llm: (id: Provider) => Promise<LLMProvider>;
}
