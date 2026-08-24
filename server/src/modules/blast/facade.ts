import type { Container } from '../../platform/container.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BlastService } from './service.js';

/**
 * Cross-module entry point for the blast-radius module — the shape
 * `src/modules/pulls/facade.ts` and `src/modules/context/facade.ts` already use.
 *
 * `modules/brief` needs the blast map and the summary paragraph, and
 * `no-cross-module-internals` forbids it importing `blast/service.ts` or
 * `blast/repository.ts`. It imports THIS file instead.
 *
 * The four-port literal is the one `blast/routes.ts:19-24` builds: `repoIntel`
 * stays a THUNK because `container.repoIntel` is a lazy getter that constructs
 * its service on first access (`blast/deps.ts:21-25`) — resolving it here would
 * move that construction to plugin-registration time.
 */
export function createBlastService(container: Container): BlastService {
  return new BlastService({
    db: container.db,
    repoIntel: () => container.repoIntel,
    llm: (id) => container.llm(id),
    featureModel: (workspaceId, id) => resolveFeatureModel(container, workspaceId, id),
  });
}

export type { BlastService } from './service.js';
