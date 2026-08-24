import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import type { IntentMissingContext, IntentRiskArea, PrBrief } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  riskAreas: jsonb('risk_areas').$type<IntentRiskArea[]>().notNull().default(sql`'[]'::jsonb`),
  confidence: doublePrecision('confidence').notNull().default(0),
  sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  missingContext: jsonb('missing_context').$type<IntentMissingContext[]>().notNull().default(sql`'[]'::jsonb`),
  headSha: text('head_sha'),
  model: text('model'),
  classifiedAt: timestamp('classified_at', { withTimezone: true }),
});

/**
 * The cached PR Why + Risk Brief, one row per pull request.
 *
 * `json` holds the model's own output (`PrBrief`); everything else is
 * provenance the server knows and the model never returns.
 *
 * The four key components are stored separately from the joined `state_key`
 * on purpose: when a cached brief goes stale, the row says WHICH input moved,
 * and a wrong key is debuggable by eye against `pr_intent.head_sha` above.
 *
 * All the provenance columns are nullable — they were added by
 * `0018_pr_brief_cache` and any row written before it has none of them.
 */
export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').$type<PrBrief>().notNull(),
  /** PR head at build time — one of the four cache-key components. */
  headSha: text('head_sha'),
  /** `pr_intent.head_sha` at build time, or 'none' when no intent exists. */
  intentKey: text('intent_key'),
  /** `repo_index_state` sha/status/updated_at, or 'none' when unindexed. */
  blastKey: text('blast_key'),
  /** The last finished review run this brief saw, or 'none'. */
  runKey: text('run_key'),
  /** The four above, joined. A cache hit is `state_key` equality. */
  stateKey: text('state_key'),
  model: text('model'),
  costUsd: doublePrecision('cost_usd'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  builtAt: timestamp('built_at', { withTimezone: true }),
  /** `{ included, cut, missing }` — what went into this brief. */
  inputs: jsonb('inputs'),
});
