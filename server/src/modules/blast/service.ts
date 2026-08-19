import type { FastifyBaseLogger } from 'fastify';
import type {
  BlastReason,
  BlastResponse,
  BlastState,
  BlastSummaryResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConfigError, ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  BFS_DEPTH,
  INDEXER_VERSION,
  MAX_CALLERS_PER_SYMBOL,
} from '../repo-intel/constants.js';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { MAX_PRIOR_PULLS } from './constants.js';
import { BlastRepository } from './repository.js';
import { shapeBlastResponse } from './shape.js';
import {
  BLAST_SUMMARY_SYSTEM_PROMPT,
  BlastSummaryLlmSchema,
  buildBlastSummaryPrompt,
  ungroundedNodes,
} from './summary.js';

const EMPTY_BLAST: BlastResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
};

export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  /**
   * The blast map for a PR. ZERO LLM calls, and — via the facade's
   * `persistentOnly` option — zero clone / AST reads: everything comes from
   * the persistent index.
   */
  async getBlast(
    workspaceId: string,
    prId: string,
    log?: FastifyBaseLogger,
  ): Promise<BlastResponse> {
    const startedAt = Date.now();

    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const link = { repo_full_name: repoRow.fullName, head_sha: pull.headSha };
    const changedFiles = await this.repo.prFiles(prId);
    const index = await this.container.repoIntel.getIndexState(pull.repoId);

    // The gate has TWO conditions.
    // (a) the index must exist and be usable at all;
    const usable = index.status === 'full' || index.status === 'partial';
    if (!usable) {
      return this.degraded(index, link, index.degradedReason ?? 'no_data');
    }
    // (b) it must have been written by the CURRENT indexer. tryGetIndexState
    // never compares versions, so a v1 index reports `full` — but file_rank
    // did not exist in v1 and getResolvedCallers INNER JOINs it, so the map
    // would come back with symbols and zero callers. A false negative
    // presented as a fact is the failure this feature exists to remove.
    if (index.indexerVersion !== INDEXER_VERSION) {
      return this.degraded(index, link, 'index_stale');
    }

    const state: BlastState = index.status === 'partial' ? 'partial' : 'ok';
    const reason: BlastReason | undefined = state === 'partial' ? 'index_partial' : undefined;

    // A PR that touches nothing has a genuinely empty impact — never dressed
    // up as degraded, and it costs no facade call.
    if (changedFiles.length === 0) {
      return shapeBlastResponse({
        blast: EMPTY_BLAST,
        reverse: { dependents: [], truncated: false },
        prior: [],
        index,
        link,
        state,
        reason,
      });
    }

    const blast = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles, {
      maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL,
      persistentOnly: true,
    });
    // TOCTOU: the gate passed, but the facade could not serve from the index.
    if (blast.degraded) {
      return this.degraded(index, link, blast.reason ?? 'no_data');
    }

    // Seeded with the CHANGED files, not the caller files: the requirement is
    // two levels from the change. Seeding from callers both missed every file
    // that imports a changed file without referencing a detected symbol, and
    // measured the depth budget one hop too far out.
    const reverse = await this.container.repoIntel.getReverseDependents(
      pull.repoId,
      changedFiles,
      BFS_DEPTH,
    );
    const prior = await this.repo.priorPulls(pull.repoId, prId, changedFiles, MAX_PRIOR_PULLS);

    const res = shapeBlastResponse({ blast, reverse, prior, index, link, state, reason });

    log?.info(
      {
        prId,
        repoId: pull.repoId,
        changedFiles: changedFiles.length,
        symbols: res.totals.symbols,
        callers: res.totals.callers,
        endpoints: res.totals.endpoints,
        crons: res.totals.crons,
        state: res.state,
        durationMs: Date.now() - startedAt,
      },
      'blast',
    );
    log?.debug({ prId, changedFiles, symbols: res.symbols.map((s) => s.name) }, 'blast detail');

    return res;
  }

  /**
   * The one optional LLM call in this module. Explicitly triggered, exactly
   * one `completeStructured`, never persisted (there is no table and no
   * migration, so its tokens belong to no agent_runs row).
   */
  async summarize(
    workspaceId: string,
    prId: string,
    log?: FastifyBaseLogger,
  ): Promise<BlastSummaryResponse> {
    // Reuses the whole read path — a 404 still comes from getPull.
    const res = await this.getBlast(workspaceId, prId, log);
    if (res.state === 'degraded') {
      throw new ConflictError('Repository is not indexed yet', { reason: 'not_indexed' });
    }

    try {
      const feature = await resolveFeatureModel(this.container, workspaceId, 'blast_summary');
      const llm = await this.container.llm(feature.provider);
      // Mirrors reviews/intent/classify.ts:101-103 — a developer machine with a
      // real OPENROUTER_API_KEY must never make a live call from the suite.
      if (process.env.VITEST && llm.id === 'openrouter') {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      }

      const { mapText, nodes } = buildBlastSummaryPrompt(res);
      const out = await llm.completeStructured({
        model: feature.model,
        schema: BlastSummaryLlmSchema,
        schemaName: 'BlastSummary',
        messages: [
          { role: 'system', content: BLAST_SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: wrapUntrusted('blast-map', mapText) },
        ],
        maxRetries: 2,
      });

      const bad = ungroundedNodes(out.data.summary, nodes);
      if (bad.length > 0) {
        throw new ValidationError('Summary named nodes that are not in the blast map', {
          nodes: bad,
        });
      }

      // Counts and the model id only — never mapText, never the summary text.
      log?.info(
        {
          prId,
          model: feature.model,
          tokensIn: out.tokensIn,
          tokensOut: out.tokensOut,
          nodes: nodes.size,
        },
        'blast_summary',
      );

      return { summary: out.data.summary, model: feature.model, nodes: nodes.size };
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new ConflictError(err.message, { reason: 'missing_provider_key' });
      }
      throw err;
    }
  }

  /** Uniform degraded reply: no map, no prior PRs, no walk. */
  private degraded(
    index: IndexState,
    link: { repo_full_name: string; head_sha: string },
    reason: BlastReason,
  ): BlastResponse {
    return shapeBlastResponse({
      blast: EMPTY_BLAST,
      reverse: { dependents: [], truncated: false },
      prior: [],
      index,
      link,
      state: 'degraded',
      reason,
    });
  }
}
