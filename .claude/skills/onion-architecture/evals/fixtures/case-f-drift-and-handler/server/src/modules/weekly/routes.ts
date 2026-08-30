import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WeeklyReport, type Severity } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * A13 — weekly module.
 *   GET /weekly → the current week's report for the workspace
 */

const PRICE_PER_M_IN = 3.0;
const PRICE_PER_M_OUT = 15.0;

export async function weeklyRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/weekly', { schema: { response: { 200: WeeklyReport } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);

    const runs = await app.container.weeklyService.runsThisWeek(workspaceId);
    if (runs.length === 0) throw new NotFoundError('no runs this week');

    const counts: Record<string, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const run of runs) {
      for (const finding of run.findings) {
        counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
      }
    }

    let costUsd = 0;
    const modelMix: Record<string, number> = {};
    for (const run of runs) {
      costUsd += (run.tokensIn / 1_000_000) * PRICE_PER_M_IN;
      costUsd += (run.tokensOut / 1_000_000) * PRICE_PER_M_OUT;
      modelMix[run.model] = (modelMix[run.model] ?? 0) + 1;
    }

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    return {
      workspace_id: workspaceId,
      week_start: weekStart.toISOString().slice(0, 10),
      buckets: (Object.keys(counts) as Severity[]).map((severity) => ({
        severity,
        count: counts[severity],
      })),
      reviews_run: runs.length,
      cost_usd: Math.round(costUsd * 100) / 100,
      model_mix: modelMix,
    };
  });
}
