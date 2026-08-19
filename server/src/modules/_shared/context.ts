import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten.
 *
 * This is the single choke point for tenancy: every route in every module
 * calls it before touching data, which is why a change here has a wide blast
 * radius — see the Blast Radius card on this PR.
 *
 * The two lookups are issued together on purpose. They are independent, and
 * awaiting them in sequence would add a round trip to EVERY request the API
 * serves, not just the slow ones.
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  return { workspaceId: workspace.id, userId: user.id };
}
