import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportDraft,
  SkillListItem,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { SKILL_FINDINGS_WINDOW_DAYS } from './constants.js';
import { SkillsRepository } from './repository.js';
import {
  diffBodies,
  parseSkillImportFile,
  toSkillDto,
  toSkillListItemDto,
  toSkillVersionDto,
} from './helpers.js';
import { buildSkillStats, buildSkillUsageRates } from './stats-helpers.js';

/**
 * Skills service. Business logic for the Skills Lab — CRUD, version history,
 * restore, body diff, import preview/confirm (text only; never executes), and
 * usage stats.
 */

export { toSkillDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillBodyDiff {
  skill_id: string;
  version: number;
  against: number;
  diff: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillListItem[]> {
    const since = findingsSince();
    const [rows, usage] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.listUsageInputs(workspaceId, since),
    ]);
    const rates = buildSkillUsageRates(usage);
    return rows.map((r) =>
      toSkillListItemDto(
        r.skill,
        r.agentCount,
        rates.get(r.skill.id) ?? { pullRate: null, acceptRate: null },
      ),
    );
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Aggregates for the Skill Editor → Stats tab. Undefined → skill not in workspace. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const since = findingsSince();
    const [agents, runs, findings] = await Promise.all([
      this.repo.listLinkedAgents(id),
      this.repo.listRunsForSkillStats(id),
      this.repo.listFindingsForSkillStats(id, since),
    ]);
    return buildSkillStats(
      skill.id,
      skill.name,
      agents,
      runs,
      findings,
      SKILL_FINDINGS_WINDOW_DAYS,
    );
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      source: 'manual',
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async listVersions(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(skillId, version);
    if (!snapshot) return undefined;
    const row = await this.repo.restoreVersion(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Diff snapshot `version` body against current body, or against another
   * version when `against` is set.
   */
  async diffVersion(
    workspaceId: string,
    skillId: string,
    version: number,
    against?: number,
  ): Promise<SkillBodyDiff | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;

    const from = await this.repo.getVersion(skillId, version);
    if (!from) return undefined;

    let againstVersion: number;
    let toBody: string;

    if (against !== undefined) {
      if (against === skill.version) {
        againstVersion = skill.version;
        toBody = skill.body;
      } else {
        const other = await this.repo.getVersion(skillId, against);
        if (!other) return undefined;
        againstVersion = against;
        toBody = other.body;
      }
    } else {
      againstVersion = skill.version;
      toBody = skill.body;
    }

    return {
      skill_id: skillId,
      version,
      against: againstVersion,
      diff: diffBodies(from.body, toBody),
    };
  }

  /** Parse upload into a draft — no persist. */
  async previewImport(filename: string, bytes: Buffer | Uint8Array): Promise<SkillImportDraft> {
    return parseSkillImportFile(filename, bytes);
  }

  /** Persist a confirmed import draft as a manual skill. */
  async confirmImport(workspaceId: string, draft: SkillImportDraft): Promise<Skill> {
    return this.create(workspaceId, {
      name: draft.name,
      description: draft.description,
      type: draft.type,
      body: draft.body,
    });
  }
}

/** UTC cutoff for the findings window used by skill stats / list rates. */
function findingsSince(now = new Date()): Date {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - SKILL_FINDINGS_WINDOW_DAYS);
  return since;
}
