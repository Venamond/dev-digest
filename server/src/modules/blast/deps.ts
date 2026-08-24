/**
 * Narrow dependency bag for `modules/blast` application code.
 *
 * Deliberately NOT `Container`. The `onion-architecture` skill grandfathers the
 * services that already take the composition root and closes the door on new
 * ones: a service locator hides what the service actually needs, and it is the
 * exact import edge that produced the `repo-intel ↔ container` cycle burned
 * down 2026-08-04. Listing four ports here says, from the signature alone,
 * that `BlastService` reads the DB, the code index, one LLM provider and the
 * per-feature model choice — and nothing else.
 *
 * `routes.ts` builds this from the Container at registration time; nothing in
 * this module imports `platform/container.ts`.
 */
import type { FeatureModelChoice, FeatureModelId, LLMProvider, Provider } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { RepoIntel } from '../repo-intel/types.js';

export interface BlastDeps {
  db: Db;
  /**
   * A thunk, not the instance: `container.repoIntel` is a lazy getter that
   * constructs its service on first access, and resolving it at plugin
   * registration would move that construction to boot.
   */
  repoIntel: () => RepoIntel;
  llm: (id: Provider) => Promise<LLMProvider>;
  featureModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
}
