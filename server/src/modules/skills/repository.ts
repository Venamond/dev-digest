import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillType } from '@devdigest/shared';
import {
  DEFAULT_SKILL_DESCRIPTION,
  INITIAL_SKILL_VERSION,
} from './constants.js';
import { isSkillConfigChange, skillVersionNote } from './helpers.js';
import type {
  SkillAgentInput,
  SkillFindingInput,
  SkillRunInput,
  SkillUsageInputs,
} from './stats-helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Workspace-scoped
 * throughout. Agent↔skill links are owned by the agents module; this repo only
 * reads `agent_skills` for `agent_count` / stats and `run_skills` for usage.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  /** `manual` for CRUD/import; `extracted` for Conventions Extractor. */
  source?: 'manual' | 'extracted';
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillWithAgentCount {
  skill: SkillRow;
  agentCount: number;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillWithAgentCount[]> {
    const skillRows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));

    if (skillRows.length === 0) return [];

    const counts = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        count: sql<number>`count(*)::int`,
      })
      .from(t.agentSkills)
      .where(
        inArray(
          t.agentSkills.skillId,
          skillRows.map((s) => s.id),
        ),
      )
      .groupBy(t.agentSkills.skillId);

    const countMap = new Map(counts.map((c) => [c.skillId, Number(c.count)]));
    return skillRows.map((skill) => ({
      skill,
      agentCount: countMap.get(skill.id) ?? 0,
    }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). Versions/links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable body snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
        type: values.type,
        source: values.source ?? 'manual',
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION, skillVersionNote({ next: row! }));
    return row!;
  }

  /**
   * Update a skill. Content changes (name/description/type/body) bump version
   * and snapshot body into skill_versions. Enabled-only toggles do not.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const configChanged = isSkillConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (configChanged && row) {
      await this.snapshotVersion(
        row,
        nextVersion,
        skillVersionNote({ previous: existing, next: row }),
      );
    }
    return row;
  }

  /**
   * Restore a historical body snapshot as a new current version (bumps version
   * and writes a fresh skill_versions row).
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return undefined;

    // Same body as current → still bump so restore is an explicit history event
    // (mirrors "restore as new current version").
    const nextVersion = existing.version + 1;
    const [row] = await this.db
      .update(t.skills)
      .set({ body: snapshot.body, version: nextVersion })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (row) {
      await this.snapshotVersion(
        row,
        nextVersion,
        skillVersionNote({ previous: existing, next: row, restoredFrom: version }),
      );
    }
    return row;
  }

  private async snapshotVersion(row: SkillRow, version: number, note: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row.id,
        version,
        body: row.body,
        note,
      })
      .onConflictDoNothing();
  }

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /** Agents currently linked to a skill (Stats → Agents using this skill). */
  async listLinkedAgents(skillId: string): Promise<SkillAgentInput[]> {
    return this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        enabled: t.agents.enabled,
        linkEnabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }

  /**
   * All-time runs for skill pull-rate: union of (a) runs by currently linked
   * agents and (b) runs recorded in `run_skills` for this skill.
   */
  async listRunsForSkillStats(skillId: string): Promise<SkillRunInput[]> {
    const linked = await this.db
      .select({ agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skillId));
    const agentIds = linked.map((r) => r.agentId);

    const pulledRows = await this.db
      .select({ runId: t.runSkills.runId })
      .from(t.runSkills)
      .where(eq(t.runSkills.skillId, skillId));
    const pulledSet = new Set(pulledRows.map((r) => r.runId));

    const runIds = new Set<string>(pulledSet);
    if (agentIds.length > 0) {
      const agentRuns = await this.db
        .select({ id: t.agentRuns.id })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.agentId, agentIds));
      for (const r of agentRuns) runIds.add(r.id);
    }

    return [...runIds].map((id) => ({ id, pulled: pulledSet.has(id) }));
  }

  /**
   * Findings attributed to a skill via review → run_skills, within the findings
   * window (`reviews.createdAt >= since`).
   */
  async listFindingsForSkillStats(
    skillId: string,
    since: Date,
  ): Promise<SkillFindingInput[]> {
    const rows = await this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.runSkills, eq(t.reviews.runId, t.runSkills.runId))
      .where(and(eq(t.runSkills.skillId, skillId), gte(t.reviews.createdAt, since)));

    return rows.map((r) => ({
      category: r.category,
      acceptedAt: r.acceptedAt,
      dismissedAt: r.dismissedAt,
    }));
  }

  /**
   * Workspace-scoped inputs for list-card pull/accept rates: links + runs +
   * pulls are all-time; findings are windowed by `since`.
   */
  async listUsageInputs(workspaceId: string, since: Date): Promise<SkillUsageInputs> {
    const [links, runs, pulls, findings] = await Promise.all([
      this.db
        .select({
          skillId: t.agentSkills.skillId,
          agentId: t.agentSkills.agentId,
        })
        .from(t.agentSkills)
        .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
        .where(eq(t.skills.workspaceId, workspaceId)),
      this.db
        .select({
          id: t.agentRuns.id,
          agentId: t.agentRuns.agentId,
        })
        .from(t.agentRuns)
        .where(eq(t.agentRuns.workspaceId, workspaceId)),
      this.db
        .select({
          runId: t.runSkills.runId,
          skillId: t.runSkills.skillId,
        })
        .from(t.runSkills)
        .innerJoin(t.skills, eq(t.runSkills.skillId, t.skills.id))
        .where(eq(t.skills.workspaceId, workspaceId)),
      this.db
        .select({
          skillId: t.runSkills.skillId,
          acceptedAt: t.findings.acceptedAt,
          dismissedAt: t.findings.dismissedAt,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .innerJoin(t.runSkills, eq(t.reviews.runId, t.runSkills.runId))
        .where(and(eq(t.reviews.workspaceId, workspaceId), gte(t.reviews.createdAt, since))),
    ]);

    return { links, runs, pulls, findings };
  }
}
