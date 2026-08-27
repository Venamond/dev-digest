import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { InsightsService } from './service.js';
import { InsightsRepository } from './repository.js';

/**
 * A14 — insights module.
 *   GET  /insights            → recurring-finding insights for the workspace
 *   POST /insights/:id/mute   → stop surfacing one insight
 */

const InsightsQuery = z.object({
  pr_id: z.string().uuid(),
});

export default async function insightsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const service = new InsightsService(
    { reviewRepo: app.container.reviewRepo },
    new InsightsRepository(app.container.db),
  );

  r.get('/insights', { schema: { querystring: InsightsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const items = await service.recurring(req.query.pr_id, null);
    return { workspace_id: workspaceId, items };
  });

  r.post('/insights/:id/mute', { schema: { params: IdParams } }, async (req) => {
    await getContext(app.container, req);
    const muted = await service.mute(req.params.id);
    if (!muted) throw new NotFoundError('insight not found');
    return muted;
  });
}
