import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow, RepoRow, SkillRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { GroundedCandidate } from './helpers.js';

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`. Also
 * reads `repos` for workspace scoping and writes extracted `skills` (+ version
 * snapshot) so this module never imports another module's repository
 * (no-cross-module-internals).
 */

export type { ConventionRow, ConventionScanRow };

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
   * `skills` has no unique constraint on (workspace_id, name), so duplicates
   * are possible: prefer an existing `source: extracted` row, and break
   * remaining ties by oldest-first so repeated upserts keep hitting the same
   * row instead of drifting with unordered scan output.
   */
  async findSkillByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)))
      .orderBy(asc(t.skills.createdAt), asc(t.skills.id));
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
      if (!row) throw new NotFoundError('Skill insert returned no row');
      await this.db.insert(t.skillVersions).values({
        skillId: row.id,
        version: 1,
        body: row.body,
        note: 'Extracted from codebase scan',
      });
      return row;
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

    // The row was read a statement ago; a concurrent delete can leave the
    // UPDATE matching nothing. Fail loudly instead of asserting with `row!`.
    if (!row) throw new NotFoundError('Skill disappeared while saving');

    if (configChanged) {
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
    return row;
  }

  /**
   * Replace all rows for a repo with a fresh scan, and record the scan itself.
   * One transaction: the scan row and the candidates it produced must never
   * disagree. The scan row is written even when zero candidates survive
   * grounding — that is how "scanned, found nothing" stays distinguishable
   * from "never scanned".
   */
  async replaceForRepo(
    input: InsertConventionBatch,
  ): Promise<{ rows: ConventionRow[]; scan: ConventionScanRow }> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, input.workspaceId),
            eq(t.conventions.repoId, input.repoId),
          ),
        );

      const [scan] = await tx
        .insert(t.conventionScans)
        .values({
          repoId: input.repoId,
          workspaceId: input.workspaceId,
          sourceSha: input.sourceSha,
          sampleFileCount: input.sampleFileCount,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: t.conventionScans.repoId,
          set: {
            workspaceId: input.workspaceId,
            sourceSha: input.sourceSha,
            sampleFileCount: input.sampleFileCount,
            createdAt: now,
          },
        })
        .returning();
      if (!scan) throw new NotFoundError('Failed to record convention scan');

      if (input.candidates.length === 0) return { rows: [], scan };

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
            // Default to accepted: the UX is review-and-deselect, not
            // review-and-select — the LLM's candidates are pre-checked and
            // the user unchecks the ones they don't want (see the "Deselect
            // all" flow, which was otherwise dead on a fresh scan).
            status: 'accepted' as const,
            accepted: true,
            sourceSha: input.sourceSha,
            sampleFileCount: input.sampleFileCount,
            position: i,
            createdAt: now,
          })),
        )
        .returning();
      return { rows, scan };
    });
  }

  /** Last scan for a repo, or undefined if this repo was never scanned. */
  async getScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.repoId, repoId),
        ),
      );
    return row;
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
