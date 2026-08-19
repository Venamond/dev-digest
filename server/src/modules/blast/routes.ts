import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastResponse, BlastSummaryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module.
 *   GET  /pulls/:id/blast          — downstream impact map, zero LLM calls.
 *   POST /pulls/:id/blast/summary  — one explicitly-triggered LLM paragraph.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/pulls/:id/blast/summary',
    {
      schema: { params: IdParams, response: { 200: BlastSummaryResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.summarize(workspaceId, req.params.id, req.log);
    },
  );
}
