import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';
import type { StatsFindingInput, StatsRunInput } from './stats-helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order + per-agent enable), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  enabled: boolean;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    const skills = await this.skillIdsForAgent(row.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({
        skill: t.skills,
        order: t.agentSkills.order,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  /** All skills in a workspace (pool for the Agent → Skills editor). */
  async listWorkspaceSkills(workspaceId: string): Promise<(typeof t.skills.$inferSelect)[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  /**
   * Effective-skill counts per agent in a workspace (for agent-card
   * footers). A skill only reaches the agent's prompt when BOTH the
   * per-agent link (`agent_skills.enabled`) AND the skill itself
   * (`skills.enabled`) are on — this counts exactly that set, not raw
   * `agent_skills` row count, so the card matches what actually runs.
   */
  async linkedSkillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        agentId: t.agentSkills.agentId,
        skillId: t.agentSkills.skillId,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      );
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.agentId, (counts.get(r.agentId) ?? 0) + 1);
    }
    return counts;
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(
    agentId: string,
    skillId: string,
    order: number,
    enabled = true,
  ): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order, enabled })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order, enabled },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent.
   * Prefer `setSkillLinks` when per-agent enabled flags are needed.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.setSkillLinks(
      agentId,
      skillIds.map((skillId, order) => ({ skillId, order, enabled: true })),
    );
  }

  /**
   * Replace linked skills with explicit order + per-agent enabled.
   * Skills not in the list are unlinked. Used by the Agent → Skills editor tab.
   */
  async setSkillLinks(
    agentId: string,
    links: Array<{ skillId: string; order: number; enabled: boolean }>,
  ): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (links.length === 0) return;
    await this.db.insert(t.agentSkills).values(
      links.map((l) => ({
        agentId,
        skillId: l.skillId,
        order: l.order,
        enabled: l.enabled,
      })),
    );
  }

  /** Runs for an agent (with PR number / repo when linked) — Stats tab inputs. */
  async listRunsForStats(agentId: string): Promise<StatsRunInput[]> {
    const rows = await this.db
      .select({
        id: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        durationMs: t.agentRuns.durationMs,
        tokensIn: t.agentRuns.tokensIn,
        tokensOut: t.agentRuns.tokensOut,
        costUsd: t.agentRuns.costUsd,
        findingsCount: t.agentRuns.findingsCount,
        source: t.agentRuns.source,
        prNumber: t.pullRequests.number,
        repoId: t.pullRequests.repoId,
      })
      .from(t.agentRuns)
      .leftJoin(t.pullRequests, eq(t.agentRuns.prId, t.pullRequests.id))
      .where(eq(t.agentRuns.agentId, agentId))
      .orderBy(desc(t.agentRuns.ranAt));

    return rows.map((r) => ({
      id: r.id,
      ranAt: r.ranAt,
      durationMs: r.durationMs,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: r.costUsd,
      findingsCount: r.findingsCount,
      source: (r.source === 'ci' ? 'ci' : 'local') as 'local' | 'ci',
      prNumber: r.prNumber,
      repoId: r.repoId,
    }));
  }

  /** Findings produced by this agent's reviews — Stats tab quality inputs. */
  async listFindingsForStats(agentId: string): Promise<StatsFindingInput[]> {
    const rows = await this.db
      .select({
        severity: t.findings.severity,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(eq(t.reviews.agentId, agentId));

    return rows.map((r) => ({
      severity: r.severity,
      category: r.category,
      acceptedAt: r.acceptedAt,
      dismissedAt: r.dismissedAt,
    }));
  }
}
