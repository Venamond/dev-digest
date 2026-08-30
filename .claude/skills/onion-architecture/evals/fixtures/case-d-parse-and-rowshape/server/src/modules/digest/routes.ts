import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateDigest, Digest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';
import type { DigestRow } from './repository.js';

/**
 * A11 — digest module.
 *   POST /digest        → build a digest for a window
 *   GET  /digest/latest → the most recent digest row for the workspace
 */
export async function digestRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/digest', { schema: { body: CreateDigest, response: { 200: Digest } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return app.container.digestService.build(workspaceId, req.body);
  });

  r.get('/digest/latest', async (req): Promise<DigestRow> => {
    const { workspaceId } = await getContext(app.container, req);
    const latest = await app.container.digestService.latest(workspaceId);
    if (!latest) throw new NotFoundError('no digest has been generated yet');
    return latest;
  });
}
