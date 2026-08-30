import type { FastifyBaseLogger } from 'fastify';
import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus, rollupSeverities } from './status.js';
import { PullsRepository } from './repository.js';

/**
 * F1 — pulls service. Orchestrates GitHub sync, persistence, and list/detail
 * rollups. No HTTP and no raw SQL — persistence goes through PullsRepository.
 */

const BACKFILL_LIMIT = 10;

export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * Sync PR list from GitHub (when available), backfill diff stats, and return
   * the workspace-scoped list with review rollups. Local-first: never fails the
   * read when GitHub is offline.
   */
  async listForRepo(
    workspaceId: string,
    repoId: string,
    log: FastifyBaseLogger,
  ): Promise<PrMeta[]> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.container.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.repo.upsertFromGhList(workspaceId, repo.id, pr);
        }
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listPulls(repo.id);

    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest(
            { owner: repo.owner, name: repo.name },
            r.number,
          );
          await this.repo.updateDiffStats(
            r.id,
            detail.additions,
            detail.deletions,
            detail.files_count,
          );
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    return this.toPrMetaList(rows);
  }

  /**
   * Full PR detail: refresh from GitHub when available, otherwise serve
   * persisted files/commits/body.
   */
  async getDetail(
    workspaceId: string,
    prId: string,
    log: FastifyBaseLogger,
  ): Promise<PrDetail> {
    const pr = await this.repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');

    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await this.repo.replacePrFiles(pr.id, detail.files);
      await this.repo.replacePrCommits(pr.id, detail.commits);
      await this.repo.updatePullBodyAndStats(
        pr.id,
        detail.body ?? null,
        detail.additions,
        detail.deletions,
        detail.files_count,
      );

      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return this.toPersistedDetail(pr);
    }
  }

  async listComments(
    workspaceId: string,
    prId: string,
    log: FastifyBaseLogger,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError(
        'github_unavailable',
        'Connect a GitHub token to post comments.',
        400,
      );
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  /**
   * Manual poll: sync PR list from GitHub and bump `last_polled_at`.
   * Does NOT trigger a review.
   */
  async poll(
    workspaceId: string,
    repoId: string,
  ): Promise<{ synced: number; reviewTriggered: boolean }> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    let synced = 0;
    for (const pr of pulls) {
      await this.repo.upsertFromGhList(workspaceId, repo.id, pr, { persistOpenedAt: false });
      synced++;
    }
    await this.repo.bumpRepoLastPolled(repo.id);

    return { synced, reviewTriggered: false };
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.repo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  private async toPrMetaList(rows: PullRow[]): Promise<PrMeta[]> {
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = await this.repo.latestReviewsByPr(prIds);
    const bySeverityRows = await this.repo.findingsSeveritiesByPr(prIds);
    const { totalCostByPr, hasCostByPr } = await this.repo.costsByPr(prIds);

    const findingsByPr = new Map<string, ReturnType<typeof rollupSeverities>>();
    for (const prId of prIds) {
      findingsByPr.set(prId, rollupSeverities(bySeverityRows.get(prId) ?? []));
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        findings: review
          ? (findingsByPr.get(r.id) ?? { critical: 0, warning: 0, suggestion: 0 })
          : null,
        cost_usd: hasCostByPr.has(r.id) ? totalCostByPr.get(r.id)! : null,
      };
    });
  }

  private async toPersistedDetail(pr: PullRow): Promise<PrDetail> {
    const files = await this.repo.listPrFiles(pr.id);
    const commits = await this.repo.listPrCommits(pr.id);
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      head_sha: pr.headSha,
      additions: pr.additions,
      deletions: pr.deletions,
      files_count: pr.filesCount,
      status: pr.status as PrDetail['status'],
      opened_at: pr.openedAt?.toISOString() ?? null,
      updated_at: pr.updatedAt?.toISOString() ?? null,
      body: pr.body ?? null,
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt?.toISOString() ?? null,
      })),
    };
  }
}
