import type {
  Agent,
  AgentSkillEditorRow,
  AgentVersion,
  CiFailOn,
  Provider,
  ReviewStrategy,
  Skill,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentRow, AgentVersionRow, SkillRow } from '../../db/rows.js';
import type { CardStats } from './stats-helpers.js';

/** Link shape used by prompt assembly + editor-row builders (no I/O). */
export interface LinkedSkillView {
  skill: SkillRow;
  order: number;
  enabled: boolean;
}

/**
 * Pure helpers for the agents module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O; behaviour-identical to the previous inline
 * implementations.
 */

/** Map a persisted agent row to the public `Agent` DTO. */
export function toAgentDto(row: AgentRow, skillCount?: number, cardStats?: CardStats): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
    skill_count: skillCount ?? null,
    runs_7d: cardStats?.runs ?? null,
    accept_rate_7d: cardStats?.accept ?? null,
    avg_cost_usd_7d: cardStats?.cost ?? null,
  };
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Skill identity + version at prompt-assembly time (for run_skills stats). */
export interface PromptSkillRef {
  skillId: string;
  skillVersion: number;
}

/**
 * Skill bodies for `reviewPullRequest({ skills })`: both global and per-agent
 * enabled, ordered by link order ASC. Disabled at either layer are omitted.
 */
export function promptSkillBodies(links: LinkedSkillView[]): string[] {
  return links
    .filter((l) => l.enabled && l.skill.enabled)
    .map((l) => l.skill.body);
}

/**
 * Skill refs for `run_skills` recording: same filter as `promptSkillBodies`,
 * projecting `{ skillId, skillVersion }` in link order ASC.
 */
export function promptSkillRefs(links: LinkedSkillView[]): PromptSkillRef[] {
  return links
    .filter((l) => l.enabled && l.skill.enabled)
    .map((l) => ({ skillId: l.skill.id, skillVersion: l.skill.version }));
}

/**
 * Build Agent → Skills editor rows: every workspace skill with link state.
 * Linked skills sort by `order` ASC; unlinked follow by name ASC (`order` = -1).
 */
export function buildEditorRows(
  pool: SkillRow[],
  links: LinkedSkillView[],
): AgentSkillEditorRow[] {
  const byId = new Map(links.map((l) => [l.skill.id, l]));
  const linked: AgentSkillEditorRow[] = [];
  const unlinked: AgentSkillEditorRow[] = [];
  for (const skill of pool) {
    const link = byId.get(skill.id);
    if (link) {
      linked.push({
        skill: toSkillDto(skill),
        linked: true,
        enabled: link.enabled,
        order: link.order,
      });
    } else {
      unlinked.push({
        skill: toSkillDto(skill),
        linked: false,
        enabled: false,
        order: -1,
      });
    }
  }
  linked.sort((a, b) => a.order - b.order);
  unlinked.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
  return [...linked, ...unlinked];
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot throws here rather than leaking an unvalidated blob to the client.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(row.configJson),
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    AgentRow,
    | 'name'
    | 'description'
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    patch.outputSchema !== undefined
  );
}
