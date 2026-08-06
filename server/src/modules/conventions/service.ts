import { join } from 'node:path';
import type {
  ConventionCandidate,
  ConventionSkillCreate,
  ConventionSkillDraft,
  ConventionsExtractResult,
  ConventionsList,
  ConventionUpdate,
  Provider,
  Skill,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { toSkillDto } from '../skills/helpers.js';
import { CONFIG_FILENAMES, SAMPLE_FILE_COUNT } from './constants.js';
import {
  buildPrompt,
  composeDraftMeta,
  dedupeCandidates,
  EXTRACTION_SCHEMA_NAME,
  ExtractionResponseSchema,
  groundCandidate,
  selectSamplePaths,
  toCandidateDto,
  type GroundedCandidate,
  type RawCandidate,
  type SampleFile,
} from './helpers.js';
import { ConventionsRepository } from './repository.js';

const SECRET_BY_PROVIDER: Record<
  Provider,
  'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OPENROUTER_API_KEY'
> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Conventions Extractor — sample → LLM → ground → persist → skill draft/create.
 */

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listByRepo(workspaceId, repoId);
    const candidates = rows.map((r) => toCandidateDto(r, repo.fullName));
    if (rows.length === 0) return { candidates: [], scan: null };

    const first = rows[0]!;
    return {
      candidates,
      scan: {
        sampled_file_count: first.sampleFileCount ?? 0,
        scanned_at: first.createdAt.toISOString(),
        source_sha: first.sourceSha,
      },
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ConflictError('Repository is not cloned', { reason: 'not_cloned' });
    }

    const index = await this.container.repoIntel.getIndexState(repoId);
    if (!index.lastIndexedSha || index.status === 'degraded' || index.status === 'failed') {
      throw new ConflictError('Repository is not indexed', { reason: 'not_indexed' });
    }

    const feature = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const secretKey = SECRET_BY_PROVIDER[feature.provider];
    let llm;
    try {
      llm = await this.container.llm(feature.provider);
    } catch {
      throw new ConflictError(`${secretKey} is not configured`, {
        reason: 'missing_provider_key',
        provider: feature.provider,
      });
    }

    const configPaths = await this.existingConfigs(repo.clonePath);
    const topFiles = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    if (configPaths.length === 0 && topFiles.length === 0) {
      throw new ConflictError('No sample files available — index the repository first', {
        reason: 'not_indexed',
      });
    }

    const samplePaths = selectSamplePaths(configPaths, topFiles);
    const fileContents = new Map<string, string>();
    const samples: SampleFile[] = [];
    for (const path of samplePaths) {
      const content = await this.readClone(repo.clonePath, path);
      if (content == null) continue;
      fileContents.set(path, content);
      samples.push({ path, content });
    }

    const prompt = buildPrompt(samples);
    // OpenRouter (default conventions model) only implements completeStructured.
    const completion = await llm.completeStructured({
      model: feature.model,
      schema: ExtractionResponseSchema,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: [
        {
          role: 'system',
          content: 'You are a precise convention extractor. Return structured candidates only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 4_096,
    });

    const raw: RawCandidate[] = completion.data.candidates.map((c) => ({
      ...c,
      evidence: {
        ...c.evidence,
        line_start: Math.min(c.evidence.line_start, c.evidence.line_end),
        line_end: Math.max(c.evidence.line_start, c.evidence.line_end),
      },
    }));
    const sampledSet = new Set(fileContents.keys());
    const grounded: GroundedCandidate[] = [];
    let dropped = 0;
    for (const c of raw) {
      const g = groundCandidate(c, sampledSet, fileContents);
      if (g) grounded.push(g);
      else dropped += 1;
    }
    const kept = dedupeCandidates(grounded);
    dropped += grounded.length - kept.length;

    const rows = await this.repo.replaceForRepo({
      workspaceId,
      repoId,
      sourceSha: index.lastIndexedSha,
      sampleFileCount: samples.length,
      candidates: kept,
    });

    const candidates = rows.map((r) => toCandidateDto(r, repo.fullName));
    const scannedAt = rows[0]?.createdAt.toISOString() ?? new Date().toISOString();

    return {
      candidates,
      scan: {
        sampled_file_count: samples.length,
        scanned_at: scannedAt,
        source_sha: index.lastIndexedSha,
      },
      dropped,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdate,
  ): Promise<ConventionCandidate> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) throw new NotFoundError('Convention not found');
    if (!existing.repoId) throw new NotFoundError('Convention not found');

    const row = await this.repo.updateOne(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');

    const repo = await this.repo.getRepo(workspaceId, existing.repoId);
    return toCandidateDto(row, repo?.fullName ?? null);
  }

  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ConflictError('No accepted conventions to build a skill from', {
        reason: 'no_accepted',
      });
    }
    return composeDraftMeta(
      repo.name,
      accepted.map((r) => ({
        rule: r.rule,
        evidence_path: r.evidencePath ?? '',
        evidence_line_start: r.evidenceLineStart,
        evidence_line_end: r.evidenceLineEnd,
      })),
    );
  }

  async createSkill(
    workspaceId: string,
    repoId: string,
    input: ConventionSkillCreate,
  ): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ConflictError('No accepted conventions to build a skill from', {
        reason: 'no_accepted',
      });
    }

    const row = await this.repo.upsertExtractedSkill({
      workspaceId,
      name: input.name.trim(),
      description: input.description,
      body: input.body,
      enabled: input.enabled ?? true,
    });
    return toSkillDto(row);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async existingConfigs(clonePath: string): Promise<string[]> {
    const found: string[] = [];
    for (const name of CONFIG_FILENAMES) {
      const content = await this.readClone(clonePath, name);
      if (content != null) found.push(name);
    }
    return found;
  }

  private async readClone(clonePath: string, rel: string): Promise<string | null> {
    try {
      return await this.container.fs.readFile(join(clonePath, rel), 'utf8');
    } catch {
      return null;
    }
  }
}
