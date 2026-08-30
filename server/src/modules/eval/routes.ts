import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentDashboard,
  EvalCase,
  EvalCaseInput,
  EvalCaseSeed,
  EvalCaseWithLastRun,
  EvalOverview,
  EvalOwnerKind,
  EvalRunBatch,
  EvalRunRecord,
  EvalSkillCaseFiles,
  EvalSkillCaseRow,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkResponse } from '../_shared/schemas.js';
import { AppError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * eval module (L06 — the eval pipeline).
 *   GET    /agents/:id/eval-cases       → the agent's case set + each case's last result
 *   POST   /agents/:id/eval-cases       → create a case (owner comes from the URL)
 *   PUT    /eval-cases/:id              → update a case
 *   DELETE /eval-cases/:id              → delete a case and its run history
 *   POST   /eval-cases/:id/run          → single-case trial (never enters run history)
 *   GET    /findings/:id/eval-seed      → an unsaved case built from a real finding
 *   POST   /agents/:id/eval-runs        → start a set run (returns before it finishes)
 *   GET    /agents/:id/eval-runs        → run history, newest first
 *   GET    /eval-runs/:id               → one batch + its per-case results
 *   POST   /eval-runs/all               → start a set run per enabled agent with cases
 *   GET    /eval-dashboard              → all-agents overview
 *   GET    /agents/:id/eval-dashboard   → one agent's metrics, trend and history
 *
 * Skill evals (track F) — the same case run TWICE against the same diff, once
 * with the skill's body in the prompt and once without:
 *   GET    /skills/:id/eval-cases       → the skill's case set + last result + resolved agent
 *   POST   /skills/:id/eval-cases       → create (input_diff is BUILT from input_files)
 *   POST   /eval-cases/preview-diff     → build a diff without saving (the editor's preview)
 *   POST   /skill-eval-cases/:id/run    → run one case with and without the skill
 *
 * `PUT /eval-cases/:id` and `DELETE /eval-cases/:id` are already generic over
 * the owner and serve both kinds unchanged; the update dispatches on the case's
 * owner kind inside the service, so a skill case's generated diff is rebuilt.
 *
 * Progress is NOT a route here: the client subscribes to the existing
 * `GET /runs/:id/events` (`modules/reviews/routes.ts:62`) with the batch id.
 * `RunBus` is keyed by an arbitrary string, so no SSE plumbing is duplicated.
 */

/** The owner is taken from the URL, so the body's owner fields are advisory. */
const CreateEvalCaseBody = EvalCaseInput.extend({
  owner_kind: EvalOwnerKind.optional(),
  owner_id: z.string().optional(),
});
const UpdateEvalCaseBody = CreateEvalCaseBody.partial();

const EvalRunStarted = z.object({
  run_id: z.string(),
  cases_total: z.number().int(),
});

const EvalRunDetail = z.object({
  batch: EvalRunBatch,
  results: z.array(EvalRunRecord),
});

/** `› Preview generated diff` — the same builder the create path uses. */
const EvalDiffPreview = z.object({ diff: z.string() });

const EvalRunAllResponse = z.object({
  runs: z.array(EvalRunStarted.extend({ agent_id: z.string() })),
  skipped: z.array(z.object({ agent_id: z.string(), reason: z.string() })),
});

/**
 * The editor hands `expected_output` over as the text the author typed, so a
 * string arrives here far more often than a parsed value. Invalid JSON is a
 * 400 with a stated reason, never a row that only fails later on read
 * (`server/INSIGHTS.md:426` is the same class of bug one column over).
 */
function normalizeExpectedOutput<T extends { expected_output?: unknown }>(body: T): T {
  const raw = body.expected_output;
  if (typeof raw !== 'string') return body;
  const text = raw.trim();
  if (text === '') return { ...body, expected_output: null };
  try {
    return { ...body, expected_output: JSON.parse(text) };
  } catch {
    throw new AppError('validation_error', 'expected_output is not valid JSON', 400);
  }
}

/** Each of these can fan out to paid LLM calls — same limit as `POST /pulls/:id/review`. */
const SPEND_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);

  // ---- Cases --------------------------------------------------------------

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseWithLastRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    {
      schema: { params: IdParams, body: CreateEvalCaseBody, response: { 201: EvalCase } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const body = normalizeExpectedOutput(req.body);
      const created = await service.createCase(workspaceId, req.params.id, {
        ...body,
        owner_kind: 'agent',
        owner_id: req.params.id,
      });
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = normalizeExpectedOutput(req.body);
      return service.updateCase(workspaceId, req.params.id, body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true };
    },
  );

  // ---- Running ------------------------------------------------------------

  app.post(
    '/eval-cases/:id/run',
    { schema: { params: IdParams, response: { 200: EvalRunRecord } }, config: SPEND_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runSingleCase(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: EvalRunStarted } }, config: SPEND_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.startSetRun(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/eval-runs/all',
    { schema: { response: { 200: EvalRunAllResponse } }, config: SPEND_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.startAllAgentRuns(workspaceId, req.log);
    },
  );

  // ---- Reads --------------------------------------------------------------

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalRunBatch) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/findings/:id/eval-seed',
    { schema: { params: IdParams, response: { 200: EvalCaseSeed } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.seedFromFinding(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-dashboard',
    { schema: { response: { 200: EvalOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.overview(workspaceId);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalAgentDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  // ---- Skill evals --------------------------------------------------------

  app.get(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalSkillCaseRow) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listSkillCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, body: CreateEvalCaseBody, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const body = normalizeExpectedOutput(req.body);
      const created = await service.createSkillCase(workspaceId, req.params.id, {
        ...body,
        // The owner comes from the URL, never the body.
        owner_kind: 'skill',
        owner_id: req.params.id,
      });
      return reply.code(201).send(created);
    },
  );

  app.post(
    '/eval-cases/preview-diff',
    { schema: { body: EvalSkillCaseFiles, response: { 200: EvalDiffPreview } } },
    async (req) => {
      // Context is resolved even though nothing is read: the preview must not
      // be an unauthenticated corner of an otherwise scoped module.
      await getContext(container, req);
      return { diff: service.previewSkillDiff(req.body) };
    },
  );

  app.post(
    '/skill-eval-cases/:id/run',
    { schema: { params: IdParams, response: { 200: EvalRunRecord } }, config: SPEND_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      // One case is TWO paid model calls, so this carries the same per-route
      // limit as every other spend route in this module.
      return service.runSkillCase(workspaceId, req.params.id);
    },
  );
}
