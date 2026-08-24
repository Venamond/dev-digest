import { describe, it, expect, vi } from 'vitest';
import type { GitClient, GitHubClient, IssueMeta, RepoRef } from '@devdigest/shared';
import { gather, normalizeRepoPath } from './gather.js';
import type { PullRow } from '../../../db/rows.js';

const REPO = { owner: 'acme', name: 'payments-api' };

function makePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'a1b2c3d4',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: 'Add rate limiting.',
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

function makeGithub(opts: {
  getIssue?: (repo: RepoRef, n: number) => Promise<IssueMeta>;
} = {}): GitHubClient {
  return {
    getIssue: opts.getIssue ?? (async (_repo, n) => ({ number: n, title: `Issue #${n}`, body: '', state: 'open' })),
  } as unknown as GitHubClient;
}

function makeGit(opts: {
  readFile?: (repo: RepoRef, path: string) => Promise<string>;
} = {}): GitClient {
  return {
    readFile: opts.readFile ?? (async () => 'SPEC CONTENTS'),
  } as unknown as GitClient;
}

describe('gather — normalizeRepoPath', () => {
  it('accepts a same-repo relative doc path like /docs/x.md (strips leading slash)', () => {
    const result = normalizeRepoPath('/docs/x.md');
    expect(result).toEqual({ ok: true, path: 'docs/x.md' });
  });

  it('rejects path traversal (../etc/passwd)', () => {
    const result = normalizeRepoPath('../etc/passwd');
    expect(result.ok).toBe(false);
  });
});

describe('gather — evidence collection', () => {
  it('accepts a same-repo relative doc path: reads the file, does not mark it path_rejected', async () => {
    const readFile = vi.fn(async () => 'SPEC BODY');
    const pull = makePull({ body: 'See /docs/spec.md for details.' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub(),
      git: makeGit({ readFile }),
    });

    expect(readFile).toHaveBeenCalledWith(REPO, 'docs/spec.md');
    expect(result.evidenceText).toContain('SPEC docs/spec.md');
    expect(result.missing_context.some((m) => m.kind === 'path_rejected')).toBe(false);
  });

  it('rejects path traversal in a spec-like path: does not call readFile, records path_rejected', async () => {
    const readFile = vi.fn(async () => 'SHOULD NOT BE READ');
    const pull = makePull({ body: 'See ../../etc/passwd for details.' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub(),
      git: makeGit({ readFile }),
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(result.missing_context.some((m) => m.kind === 'path_rejected')).toBe(true);
  });

  it('SSRF: an off-host URL is unsupported_host, never fetched via git.readFile or github', async () => {
    const readFile = vi.fn(async () => 'SHOULD NOT BE READ');
    const getIssue = vi.fn(async (_r: RepoRef, n: number) => ({ number: n, title: 'x', body: '', state: 'open' }) as IssueMeta);
    const pull = makePull({ body: 'Spec at https://evil.example/x/steal-secrets' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub({ getIssue }),
      git: makeGit({ readFile }),
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(getIssue).not.toHaveBeenCalled();
    expect(
      result.missing_context.some(
        (m) => m.kind === 'unsupported_host' && m.ref === 'https://evil.example/x/steal-secrets',
      ),
    ).toBe(true);
  });

  it('accepts a same-repo issue URL: calls getIssue, not readFile', async () => {
    const readFile = vi.fn(async () => 'SHOULD NOT BE READ');
    const getIssue = vi.fn(async (_r: RepoRef, n: number) => ({ number: n, title: 'Rate limit ticket', body: 'issue body', state: 'open' }) as IssueMeta);
    const pull = makePull({ body: 'Implements https://github.com/acme/payments-api/issues/12' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub({ getIssue }),
      git: makeGit({ readFile }),
    });

    expect(getIssue).toHaveBeenCalledWith(REPO, 12);
    expect(readFile).not.toHaveBeenCalled();
    expect(result.evidenceText).toContain('ISSUE #12');
  });

  it('cross-repo issue URL is unsupported_host and does not call getIssue (issue-URL vs spec-URL split)', async () => {
    const getIssue = vi.fn(async (_r: RepoRef, n: number) => ({ number: n, title: 'x', body: '', state: 'open' }) as IssueMeta);
    const pull = makePull({ body: 'See https://github.com/other-org/other-repo/issues/9' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub({ getIssue }),
      git: makeGit(),
    });

    expect(getIssue).not.toHaveBeenCalled();
    expect(
      result.missing_context.some(
        (m) => m.kind === 'unsupported_host' && m.ref === 'https://github.com/other-org/other-repo/issues/9',
      ),
    ).toBe(true);
  });

  it('same-repo blob URL is treated as a spec (readFile), not an issue (getIssue)', async () => {
    const readFile = vi.fn(async () => 'BLOB SPEC CONTENTS');
    const getIssue = vi.fn(async (_r: RepoRef, n: number) => ({ number: n, title: 'x', body: '', state: 'open' }) as IssueMeta);
    const pull = makePull({ body: 'Design at https://github.com/acme/payments-api/blob/main/docs/design.md' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub({ getIssue }),
      git: makeGit({ readFile }),
    });

    expect(readFile).toHaveBeenCalledWith(REPO, 'docs/design.md');
    expect(getIssue).not.toHaveBeenCalled();
  });

  it('getIssue throw is not swallowed: recorded as issue_fetch_failed with the error message', async () => {
    const getIssue = vi.fn(async () => {
      throw new Error('Octokit 404');
    });
    const pull = makePull({ body: 'Closes #471' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: makeGithub({ getIssue }),
      git: makeGit(),
    });

    const entry = result.missing_context.find((m) => m.kind === 'issue_fetch_failed');
    expect(entry).toBeDefined();
    expect(entry?.reason).toBe('Octokit 404');
    expect(result.evidenceText).toContain('UNAVAILABLE: issue_fetch_failed');
  });

  it('no GitHub client configured: records github_unavailable instead of throwing', async () => {
    const pull = makePull({ body: 'Closes #471' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [],
      github: null,
      git: makeGit(),
    });

    expect(result.missing_context.some((m) => m.kind === 'github_unavailable')).toBe(true);
  });

  it('includes hunk headers but not the +/- feature-code body lines (hunk-only mode)', async () => {
    const pull = makePull();
    const result = await gather({
      repo: REPO,
      pull,
      files: [
        {
          path: 'src/config.ts',
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        },
      ],
      commits: [],
      github: makeGithub(),
      git: makeGit(),
    });

    expect(result.evidenceText).toContain('@@ -10,3 +10,4 @@');
    expect(result.evidenceText).not.toContain('stripeKey');
  });

  it('patch: null does not throw and produces no hunk lines for that file', async () => {
    const pull = makePull();
    await expect(
      gather({
        repo: REPO,
        pull,
        files: [{ path: 'src/config.ts', patch: null }],
        commits: [],
        github: makeGithub(),
        git: makeGit(),
      }),
    ).resolves.not.toThrow();
  });

  it('manifest_delta: package.json added dependency line is included, labeled manifest_delta:<path>', async () => {
    const pull = makePull();
    const result = await gather({
      repo: REPO,
      pull,
      files: [
        {
          path: 'package.json',
          patch: '@@ -1,3 +1,4 @@\n {\n+  "left-pad": "^1.0.0",\n   "name": "x"',
        },
      ],
      commits: [],
      github: makeGithub(),
      git: makeGit(),
    });

    expect(result.sourceLabels).toContain('manifest_delta:package.json');
    expect(result.evidenceText).toContain('manifest_delta:package.json');
    expect(result.evidenceText).toContain('+  "left-pad": "^1.0.0"');
  });

  it('empty body: includes PR_BODY: empty and falls back to commit subjects', async () => {
    const pull = makePull({ body: '' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [{ message: 'Add rate limiter middleware\n\nlonger body ignored' }],
      github: makeGithub(),
      git: makeGit(),
    });

    expect(result.evidenceText).toContain('PR_BODY: empty');
    expect(result.evidenceText).toContain('COMMITS:');
    expect(result.evidenceText).toContain('- Add rate limiter middleware');
  });

  it('non-empty body: does not fall back to commit subjects', async () => {
    const pull = makePull({ body: 'A real description.' });
    const result = await gather({
      repo: REPO,
      pull,
      files: [],
      commits: [{ message: 'Should not appear' }],
      github: makeGithub(),
      git: makeGit(),
    });

    expect(result.evidenceText).not.toContain('COMMITS:');
    expect(result.evidenceText).not.toContain('Should not appear');
  });
});
