import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Smart diff fixture PR',
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 0,
      deletions: 0,
      filesCount: 0,
      status: 'needs_review',
      ...overrides,
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('Smart Diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWithMocks() {
    const openrouter = new MockLLMProvider('openai');
    const openai = new MockLLMProvider('openai');
    return {
      appPromise: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          git: new MockGitClient({}),
          llm: { openai, openrouter },
        },
      }),
      openrouter,
      openai,
    };
  }

  it('GET /pulls/:id/smart-diff makes zero LLM calls, across every provider and every method', async () => {
    const { appPromise, openai, openrouter } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr.id, path: 'src/service.ts', additions: 10, deletions: 2, patch: '+export const x = 1;' },
      { prId: pr.id, path: 'pnpm-lock.yaml', additions: 500, deletions: 400, patch: null },
    ]);
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'approve', summary: 'ok' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/service.ts',
      startLine: 3,
      endLine: 3,
      severity: 'WARNING',
      category: 'bug',
      title: 'x',
      rationale: 'x',
      confidence: 0.5,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);

    expect(openai.calls.length).toBe(0);
    expect(openrouter.calls.length).toBe(0);

    await app.close();
  });

  it('a lock-file in pr_files lands in the boilerplate group, core group first', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr.id, path: 'src/service.ts', additions: 5, deletions: 0, patch: '+const x = 1;' },
      { prId: pr.id, path: 'package.json', additions: 1, deletions: 0, patch: '+"x": "1"' },
      { prId: pr.id, path: 'pnpm-lock.yaml', additions: 3, deletions: 1, patch: '+lock' },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    const boilerplateGroup = body.groups.find((g: { role: string }) => g.role === 'boilerplate');
    expect(boilerplateGroup.files.map((f: { path: string }) => f.path)).toEqual(['pnpm-lock.yaml']);

    await app.close();
  });

  it('empty pr_files returns 200 with the exact documented empty shape, not 404 or null', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });

    await app.close();
  });

  it('finding_lines aggregates every kind=review row for the PR, not just the newest', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'src/service.ts',
      additions: 10,
      deletions: 0,
      patch: '+const x = 1;',
    });

    const [reviewA] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'approve', summary: 'agent A' })
      .returning();
    const [reviewB] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'approve', summary: 'agent B' })
      .returning();
    const [summaryReview] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'summary', verdict: null, summary: 'summary row' })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: reviewA!.id,
        file: 'src/service.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'A',
        rationale: 'A',
        confidence: 0.9,
      },
      {
        reviewId: reviewB!.id,
        file: 'src/service.ts',
        startLine: 42,
        endLine: 42,
        severity: 'WARNING',
        category: 'bug',
        title: 'B',
        rationale: 'B',
        confidence: 0.8,
      },
      // A 'summary' row's finding must NOT contribute (would double-count) —
      // on a distinct line (99) so its exclusion is actually observable in
      // the asserted finding_lines array below, not masked by dedup.
      {
        reviewId: summaryReview!.id,
        file: 'src/service.ts',
        startLine: 99,
        endLine: 99,
        severity: 'CRITICAL',
        category: 'security',
        title: 'S',
        rationale: 'S',
        confidence: 0.9,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    const file = core.files.find((f: { path: string }) => f.path === 'src/service.ts');
    expect(file.finding_lines).toEqual([11, 42]);

    await app.close();
  });

  it('404 for a PR not in the caller workspace', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('422 for a non-uuid :id', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;

    const res = await app.inject({ method: 'GET', url: `/pulls/not-a-uuid/smart-diff` });
    expect(res.statusCode).toBe(422);

    await app.close();
  });

  it('a pr_files.patch of NULL does not throw — the file appears with pseudocode_summary: null', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr.id,
      path: 'src/service.ts',
      additions: 3,
      deletions: 1,
      patch: null,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    const file = core.files.find((f: { path: string }) => f.path === 'src/service.ts');
    expect(file).toBeDefined();
    expect(file.pseudocode_summary).toBeNull();

    await app.close();
  });
});
