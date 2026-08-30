import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Report, ReportWindow } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReportsService } from './service.js';
import { ReportsRepository } from './repository.js';
import { scheduleFor } from './schedule.js';

/**
 * A15 — reports module.
 *   GET /reports          → the report card for a window
 *   GET /reports/schedule → when each window regenerates next
 */

const ReportQuery = z.object({ window: ReportWindow.default('7d') });

export default async function reportsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const service = new ReportsService(app.container.db, {
    blast: () => app.container.blast,
    github: () => app.container.github(),
    llm: (id) => app.container.llm(id),
  });
  const repo = new ReportsRepository(app.container.db);

  r.get('/reports', { schema: { querystring: ReportQuery, response: { 200: Report } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.build(workspaceId, req.query.window);
  });

  r.get('/reports/schedule', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const latest = await repo.latestForWorkspace(workspaceId);
    if (!latest) throw new NotFoundError('no report has been generated yet');
    return scheduleFor(latest.createdAt);
  });
}
