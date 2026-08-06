import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, RepoRow, SkillRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';
import type { GroundedCandidate } from './helpers.js';

/**
 * Conventions data-access. Owns `conventions`. Also reads `repos` for
 * workspace scoping and writes extracted `skills` (+ version snapshot) so this
 * module never imports another module's repository (no-cross-module-internals).
 */

export type { ConventionRow };

export interface InsertConventionBatch {
  workspaceId: string;
  repoId: string;
  sourceSha: string | null;
  sampleFileCount: number;
  candidates: GroundedCandidate[];
}

export interface UpdateConventionPatch {
  status?: ConventionStatus;
  rule?: string;
}

export interface InsertExtractedSkill {
  workspaceId: string;
  name: string;
  description: string;
  body: string;
  enabled: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * Workspace-scoped lookup by exact skill name (for upsert).
   * Prefers an existing `source: extracted` row when duplicates already exist.
   */
  async findSkillByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return rows.find((r) => r.source === 'extracted') ?? rows[0];
  }

  /**
   * Persist an extracted skill with `type: convention` / `source: extracted`.
   * Same name in the workspace → update in place and bump version when
   * description/body change (enabled-only toggles do not bump).
   */
  async upsertExtractedSkill(values: InsertExtractedSkill): Promise<SkillRow> {
    const existing = await this.findSkillByName(values.workspaceId, values.name);
    if (!existing) {
      const [row] = await this.db
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: 'convention',
          source: 'extracted',
          body: values.body,
          enabled: values.enabled,
          version: 1,
        })
        .returning();
      await this.db.insert(t.skillVersions).values({
        skillId: row!.id,
        version: 1,
        body: row!.body,
        note: 'Extracted from codebase scan',
      });
      return row!;
    }

    const configChanged =
      values.description !== existing.description || values.body !== existing.body;
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        description: values.description,
        body: values.body,
        enabled: values.enabled,
        type: 'convention',
        source: 'extracted',
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, values.workspaceId), eq(t.skills.id, existing.id)))
      .returning();

    if (configChanged && row) {
      await this.db
        .insert(t.skillVersions)
        .values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          note: 'Updated from conventions extractor',
        })
        .onConflictDoNothing();
    }
    return row!;
  }

  /** Replace all rows for a repo with a fresh scan (atomic delete + insert). */
  async replaceForRepo(input: InsertConventionBatch): Promise<ConventionRow[]> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      await tx.delete(t.conventions).where(eq(t.conventions.repoId, input.repoId));
      if (input.candidates.length === 0) return [];

      const rows = await tx
        .insert(t.conventions)
        .values(
          input.candidates.map((c, i) => ({
            workspaceId: input.workspaceId,
            repoId: input.repoId,
            rule: c.rule,
            category: c.category,
            evidencePath: c.evidence_path,
            evidenceSnippet: c.evidence_snippet,
            evidenceLineStart: c.evidence_line_start,
            evidenceLineEnd: c.evidence_line_end,
            confidence: c.confidence,
            status: 'pending' as const,
            accepted: false,
            sourceSha: input.sourceSha,
            sampleFileCount: input.sampleFileCount,
            position: i,
            createdAt: now,
          })),
        )
        .returning();
      return rows;
    });
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(asc(t.conventions.position));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(asc(t.conventions.position));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async updateOne(
    workspaceId: string,
    id: string,
    patch: UpdateConventionPatch,
  ): Promise<ConventionRow | undefined> {
    if (patch.status === undefined && patch.rule === undefined) {
      return this.getById(workspaceId, id);
    }

    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status, accepted: patch.status === 'accepted' } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Move all accepted rows for a repo back to pending (Deselect all). */
  async deselectAllAccepted(workspaceId: string, repoId: string): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ status: 'pending', accepted: false })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }
}
