import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import { desc } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  // What the case asserts: every expected finding must appear, or the
  // forbidden range must stay unflagged. Compared by code, never prompted.
  expectation: text('expectation', { enum: ['must_find', 'must_not_flag'] })
    .notNull()
    .default('must_find'),
  // Provenance when the case was seeded from a real finding.
  seededFrom: jsonb('seeded_from'),
  notes: text('notes'),
});

/**
 * One set run: every case of an agent executed against ONE prompt. The prompt
 * and the version are copied here when the batch is created, so a later edit of
 * the agent cannot rewrite what a past run was measuring.
 */
export const evalRunBatches = pgTable(
  'eval_run_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    state: text('state', { enum: ['running', 'complete', 'partial'] })
      .notNull()
      .default('running'),
    progressIndex: integer('progress_index').notNull().default(0),
    progressTotal: integer('progress_total').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    // Null when the denominator is zero — the client renders an em dash.
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    tracesPassed: integer('traces_passed'),
    tracesProduced: integer('traces_produced'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
  },
  (t) => ({
    // Every screen reads one agent's runs newest-first.
    agentStartedIdx: index('eval_run_batches_agent_started_idx').on(t.agentId, desc(t.startedAt)),
  }),
);

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => evalCases.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  actualOutput: jsonb('actual_output'),
  pass: boolean('pass'),
  recall: doublePrecision('recall'),
  // Skill evals only: the same case's recall from the run WITHOUT the skill
  // body in the prompt. Both calls of a skill case land on THIS one row, so the
  // two sides sit side by side rather than in two rows every existing read path
  // would have to be taught to tell apart.
  recallWithout: doublePrecision('recall_without'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  durationMs: integer('duration_ms'),
  costUsd: doublePrecision('cost_usd'),
  // Null means a single-case trial: a trial never enters an agent's run history.
  batchId: uuid('batch_id').references(() => evalRunBatches.id, { onDelete: 'cascade' }),
  outcome: text('outcome', { enum: ['passed', 'failed', 'errored'] }),
  // The provider's error message, truncated to 500 characters.
  failureReason: text('failure_reason'),
});

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
