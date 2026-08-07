import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  vector,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    category: text('category'),
    evidencePath: text('evidence_path'),
    evidenceSnippet: text('evidence_snippet'),
    evidenceLineStart: integer('evidence_line_start'),
    evidenceLineEnd: integer('evidence_line_end'),
    confidence: doublePrecision('confidence'),
    /** Legacy — unused by Conventions Extractor; status is the source of truth. */
    accepted: boolean('accepted').notNull().default(false),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    sourceSha: text('source_sha'),
    sampleFileCount: integer('sample_file_count'),
    position: integer('position'),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('conventions_repo_idx').on(t.repoId) }),
);

/**
 * One row per repo — the last extraction run. Separate from `conventions`
 * because a scan that grounds zero candidates still happened: keeping scan
 * metadata only on candidate rows makes "scanned, found nothing"
 * indistinguishable from "never scanned".
 */
export const conventionScans = pgTable('convention_scans', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceSha: text('source_sha'),
  sampleFileCount: integer('sample_file_count').notNull().default(0),
  createdAt: now(),
});
