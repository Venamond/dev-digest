import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentSkillEditorRow,
  AgentSkillLink,
  AgentStats,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { buildEditorRows, toAgentDto, toAgentVersionDto } from './helpers.js';
import { buildAgentStats } from './stats-helpers.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

/** Card-footer stats window: last 7 days, matching the "7d" label on `AgentCard`. */
const CARD_STATS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  /**
   * Workspace agents with `skill_count` and 7-day run/accept/cost stats for
   * card footers.
   */
  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    const since = new Date(Date.now() - CARD_STATS_WINDOW_MS);
    const [counts, cardStats] = await Promise.all([
      this.repo.linkedSkillCounts(workspaceId),
      this.repo.cardStats(workspaceId, since),
    ]);
    return rows.map((r) =>
      toAgentDto(r, counts.get(r.id) ?? 0, cardStats.get(r.id) ?? { runs: 0, accept: 0, cost: 0 }),
    );
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({
      agent_id: agentId,
      skill_id: l.skill.id,
      order: l.order,
      enabled: l.enabled,
    }));
  }

  /**
   * Pool-oriented rows for the Agent → Skills editor: every workspace skill
   * with `linked` / per-agent `enabled` / `order` for “N of M”.
   */
  async editorRows(
    workspaceId: string,
    agentId: string,
  ): Promise<AgentSkillEditorRow[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [pool, links] = await Promise.all([
      this.repo.listWorkspaceSkills(workspaceId),
      this.repo.linkedSkills(agentId),
    ]);
    return buildEditorRows(pool, links);
  }

  /**
   * Set / reorder the agent's linked skills (legacy). All links enabled=true.
   * Returns editor rows for the Skills tab.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillEditorRow[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.repo.setSkills(agentId, skillIds);
    return this.editorRows(workspaceId, agentId);
  }

  /**
   * Full replace of linked skills with explicit order + per-agent enabled.
   * Returns editor rows for the Skills tab.
   */
  async setSkillLinks(
    workspaceId: string,
    agentId: string,
    links: Array<{ skill_id: string; order: number; enabled: boolean }>,
  ): Promise<AgentSkillEditorRow[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.repo.setSkillLinks(
      agentId,
      links.map((l) => ({ skillId: l.skill_id, order: l.order, enabled: l.enabled })),
    );
    return this.editorRows(workspaceId, agentId);
  }

  /** Link a single skill (append or set order) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillEditorRow[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const existing = await this.repo.linkedSkills(agentId);
    const resolvedOrder = order ?? existing.length;
    await this.repo.linkSkill(agentId, skillId, resolvedOrder);
    return this.editorRows(workspaceId, agentId);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }

  /** Aggregates for the Agent Editor → Stats tab. Undefined → agent not in workspace. */
  async stats(workspaceId: string, agentId: string): Promise<AgentStats | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [runs, findings] = await Promise.all([
      this.repo.listRunsForStats(agentId),
      this.repo.listFindingsForStats(agentId),
    ]);
    return buildAgentStats(agent.id, agent.name, runs, findings);
  }
}
