import type { Container } from '../../platform/container.js';
import { PullsService } from './service.js';

/**
 * Cross-module entry point for pulls orchestration. Other modules (e.g.
 * polling) import this factory instead of service.ts directly — keeps
 * `no-cross-module-internals` happy while sharing PullsService.
 */
export function createPullsService(container: Container): PullsService {
  return new PullsService(container);
}
