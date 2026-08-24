import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ContextDocUser } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentRow, RepoRow, SkillRow } from '../../db/rows.js';
import {
  DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING,
  DEFAULT_ROOTS,
  SETTINGS_KEY_SEARCH_ROOTS,
  SETTINGS_KEY_TOKEN_CEILING,
} from './constants.js';

/**
 * Ring 2 — the only file in `modules/context/` allowed to import `drizzle-orm`
 * / `db/schema`. It owns the two attachment tables and reads the module's two
 * configurables straight out of `settings`: `no-cross-module-internals` forbids
 * `context → settings/service`, and the data layer may import `db/schema` while
 * the application layer may not.
 */
export class ContextRepository {
  constructor(private db: Db) {}

  /**
   * The repository row, workspace-scoped. `clone_path` is nullable — a repo
   * that was never cloned has no documents, which is an empty list and never
   * an error.
   */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The workspace's search roots, or `DEFAULT_ROOTS` when unset or malformed. */
  async readRoots(workspaceId: string): Promise<string[]> {
    const value = await this.readSetting(workspaceId, SETTINGS_KEY_SEARCH_ROOTS);
    if (!Array.isArray(value)) return [...DEFAULT_ROOTS];
    const roots = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return roots.length > 0 ? roots : [...DEFAULT_ROOTS];
  }

  /**
   * The workspace's project-context token ceiling, or the default when unset or
   * not a positive integer.
   */
  async readCeiling(workspaceId: string): Promise<number> {
    const value = await this.readSetting(workspaceId, SETTINGS_KEY_TOKEN_CEILING);
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING;
  }

  /**
   * Which agents each of `paths` reaches, keyed by path.
   *
   * The EFFECTIVE set: an agent uses a document when it is attached to the
   * agent directly, or attached to a skill linked to it with BOTH switches on
   * (`agent_skills.enabled` AND `skills.enabled`) — the same definition
   * `AgentsRepository.linkedSkillCounts` uses for the agent card, so the two
   * numbers cannot disagree. An agent reached both ways appears ONCE, with
   * `via: 'agent'` winning; an agent reaching a document through two skills
   * also appears once, named with the skill it lists first.
   *
   * A path nobody uses has NO entry in the returned Map — `map.get(p)` is
   * `undefined`, not `[]`. The service defaults it before the DTO mapper.
   */
  async usedByAgents(
    workspaceId: string,
    repoId: string,
    paths: string[],
  ): Promise<Map<string, ContextDocUser[]>> {
    const out = new Map<string, ContextDocUser[]>();
    if (paths.length === 0) return out;

    const [direct, viaSkill] = await Promise.all([
      this.db
        .select({
          path: t.agentContextDocs.path,
          agentId: t.agents.id,
          agentName: t.agents.name,
        })
        .from(t.agentContextDocs)
        .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
        .where(
          and(
            eq(t.agents.workspaceId, workspaceId),
            eq(t.agentContextDocs.repoId, repoId),
            inArray(t.agentContextDocs.path, paths),
          ),
        )
        .orderBy(asc(t.agents.name)),
      this.db
        .select({
          path: t.skillContextDocs.path,
          agentId: t.agents.id,
          agentName: t.agents.name,
          skillId: t.skills.id,
          skillName: t.skills.name,
        })
        .from(t.skillContextDocs)
        .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
        .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
        .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
        .where(
          and(
            eq(t.agents.workspaceId, workspaceId),
            eq(t.skillContextDocs.repoId, repoId),
            inArray(t.skillContextDocs.path, paths),
            eq(t.agentSkills.enabled, true),
            eq(t.skills.enabled, true),
          ),
        )
        .orderBy(asc(t.agents.name), asc(t.agentSkills.order)),
    ]);

    // Direct attachments first, so `via: 'agent'` is already present when the
    // inherited pass reaches the same agent and is skipped.
    const seen = new Map<string, Set<string>>();
    const push = (path: string, agentId: string, user: ContextDocUser): void => {
      const agents = seen.get(path) ?? new Set<string>();
      if (agents.has(agentId)) return;
      agents.add(agentId);
      seen.set(path, agents);
      out.set(path, [...(out.get(path) ?? []), user]);
    };

    for (const r of direct) {
      push(r.path, r.agentId, {
        agent_id: r.agentId,
        agent_name: r.agentName,
        via: 'agent',
        skill_id: null,
        skill_name: null,
      });
    }
    for (const r of viaSkill) {
      push(r.path, r.agentId, {
        agent_id: r.agentId,
        agent_name: r.agentName,
        via: 'skill',
        skill_id: r.skillId,
        skill_name: r.skillName,
      });
    }
    return out;
  }

  // ---- Attachments (agent_context_docs / skill_context_docs) -------------

  /** The agent's own attached paths for this repo, in the human's order. */
  async agentDocPaths(agentId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(
        and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)),
      )
      .orderBy(asc(t.agentContextDocs.order), asc(t.agentContextDocs.path));
    return rows.map((r) => r.path);
  }

  /** The skill's own attached paths for this repo, in the human's order. */
  async skillDocPaths(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(
        and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)),
      )
      .orderBy(asc(t.skillContextDocs.order), asc(t.skillContextDocs.path));
    return rows.map((r) => r.path);
  }

  /**
   * Every skill linked to the agent, with both enable switches and that skill's
   * own ordered paths for this repo — the exact input `resolveEffectiveDocs`
   * takes. Disabled links are included: the resolver decides, and the editor
   * tab needs to know a skill is linked but contributing nothing.
   */
  async linkedSkillDocs(
    agentId: string,
    repoId: string,
  ): Promise<
    Array<{
      skillId: string;
      skillName: string;
      order: number;
      linkEnabled: boolean;
      skillEnabled: boolean;
      paths: string[];
    }>
  > {
    const links = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        order: t.agentSkills.order,
        linkEnabled: t.agentSkills.enabled,
        skillEnabled: t.skills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name));
    if (links.length === 0) return [];

    const docs = await this.db
      .select({
        skillId: t.skillContextDocs.skillId,
        path: t.skillContextDocs.path,
      })
      .from(t.skillContextDocs)
      .where(
        and(
          eq(t.skillContextDocs.repoId, repoId),
          inArray(
            t.skillContextDocs.skillId,
            links.map((l) => l.skillId),
          ),
        ),
      )
      .orderBy(asc(t.skillContextDocs.order), asc(t.skillContextDocs.path));

    const bySkill = new Map<string, string[]>();
    for (const d of docs) bySkill.set(d.skillId, [...(bySkill.get(d.skillId) ?? []), d.path]);
    return links.map((l) => ({ ...l, paths: bySkill.get(l.skillId) ?? [] }));
  }

  /**
   * Replace the agent's attachments for one repo: delete its rows, insert the
   * new ones with `order` = array index, in ONE transaction so a failed insert
   * cannot leave the list empty. Only the path is stored — never the text.
   *
   * Writes NO `agent_versions` row: attaching is not a config change, which is
   * what makes "restoring an old version leaves the attachments alone" true by
   * construction rather than by a rule someone has to remember.
   */
  async replaceAgentDocs(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(
          and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)),
        );
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, order) => ({ agentId, repoId, path, order })));
    });
  }

  /** The same for a skill. Writes no `skill_versions` row — see above (AC-42). */
  async replaceSkillDocs(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(
          and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)),
        );
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, order) => ({ skillId, repoId, path, order })));
    });
  }

  /** Owner existence checks — a `404` for an unknown agent/skill, not a `400`. */
  async getAgent(workspaceId: string, agentId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  async getSkill(workspaceId: string, skillId: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }

  /** First value for `key` in the workspace, whichever user owns the row. */
  private async readSetting(workspaceId: string, key: string): Promise<unknown> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, key)))
      .limit(1);
    return row?.value ?? undefined;
  }
}
