import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefRecord } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { createBlastService } from '../blast/facade.js';
import { createContextService } from '../context/facade.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefService } from './service.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief — the cached brief or null. ZERO LLM calls.
 *   POST /pulls/:id/brief — build it: one LLM call, single-flighted.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Composition happens here, at the ring-3 edge: the service declares ten
  // ports (brief/deps.ts) instead of taking the Container. Built ONCE per
  // plugin registration, which is also what makes the single-flight map on the
  // instance meaningful. `git`, `tokenizer` and `priceBook` are getters;
  // `github()` and `llm(id)` are async methods.
  const service = new BriefService({
    db: container.db,
    reviewRepo: container.reviewRepo,
    blast: () => createBlastService(container),
    context: () => createContextService(container),
    github: () => container.github(),
    git: container.git,
    llm: (id) => container.llm(id),
    featureModel: (ws, id) => resolveFeatureModel(container, ws, id),
    countTokens: (text) => container.tokenizer.count(text),
    estimateCost: (m, i, o) => container.priceBook.estimate(m, i, o),
  });

  app.get(
    '/pulls/:id/brief',
    // `.nullable()` on the response schema is REQUIRED: without it
    // fastify-type-provider-zod serializes a `null` return as a 500, not a 200,
    // and `pnpm typecheck` does not catch it (server/INSIGHTS.md:298-308).
    { schema: { params: IdParams, response: { 200: PrBriefRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: {
        params: IdParams,
        body: z.object({ force: z.boolean().optional() }).optional(),
        response: { 200: PrBriefRecord },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = req.body ?? {};
      return service.build(workspaceId, req.params.id, { force: body.force }, req.log);
    },
  );
}
