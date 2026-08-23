import type { Container } from '../../platform/container.js';
import { ContextService } from './service.js';

/**
 * Cross-module entry point for the Project Context module — the shape
 * `src/modules/pulls/facade.ts` already uses.
 *
 * `reviews` needs the effective-document set at run time, and
 * `no-cross-module-internals` forbids it importing `context/service.ts` or
 * `context/repository.ts`. It imports THIS file instead: the pure resolver for
 * the ordering rules, and the factory for the lookups behind them.
 */
export function createContextService(container: Container): ContextService {
  return new ContextService(container);
}

export type { ContextService } from './service.js';
export { rootOf } from './walk.js';
export {
  resolveEffectiveDocs,
  type EffectiveDoc,
  type ResolveInput,
  type SkillContribution,
} from './resolve.js';
