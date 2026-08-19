import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import {
  INDEXER_VERSION,
  MAX_CALLERS_PER_SYMBOL,
  MAX_REVERSE_DEPENDENTS,
} from '../src/modules/repo-intel/constants.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: NodeJS.ProcessEnv = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

const INDEXED_SHA = 'aaa111';
const HEAD_SHA = 'bbb222';

let repoSeq = 0;

d('Blast Radius (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  type Db = PgFixture['handle']['db'];
  let db: Db;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    db = pg.handle.db;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // -- fixtures -------------------------------------------------------------

  async function setupRepoAndPr(overrides: Partial<typeof t.pullRequests.$inferInsert> = {}) {
    const name = `blast-${repoSeq++}`;
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
        title: 'Blast fixture PR',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: HEAD_SHA,
        status: 'needs_review',
        ...overrides,
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function indexState(
    repoId: string,
    over: Partial<typeof t.repoIndexState.$inferInsert> = {},
  ) {
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: INDEXED_SHA,
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      ...over,
    });
  }

  /** A declared symbol plus `n` ranked caller files that reference it. */
  async function seedSymbolWithCallers(
    repoId: string,
    declFile: string,
    name: string,
    callerFiles: string[],
  ) {
    await db
      .insert(t.symbols)
      .values({ repoId, path: declFile, name, kind: 'function', line: 1, exported: true });
    let i = callerFiles.length;
    for (const file of callerFiles) {
      await db
        .insert(t.symbols)
        .values({ repoId, path: file, name: `use_${i}`, kind: 'function', line: 1 });
      await db
        .insert(t.references)
        .values({ repoId, fromPath: file, toSymbol: name, line: 10, declFile });
      await db.insert(t.fileRank).values({
        repoId,
        filePath: file,
        pagerank: i,
        hotness: 0,
        rank: i,
        percentile: 50,
      });
      i -= 1;
    }
  }

  function appWithMocks(
    over: { env?: NodeJS.ProcessEnv; spies?: boolean; summary?: string } = {},
  ) {
    // The blast_summary feature defaults to the `openrouter` provider slot.
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: { BlastSummary: { summary: over.summary ?? 'A grounded paragraph.' } },
    });
    const openai = new MockLLMProvider('openai');
    const boom = () => {
      throw new Error('clone / AST read on the blast request path');
    };
    const codeIndex = { grep: vi.fn(boom), symbols: vi.fn(boom), references: vi.fn(boom) };
    const fs = { readFile: vi.fn(boom), readdir: vi.fn(boom), stat: vi.fn(boom) };
    return {
      appPromise: buildApp({
        config: config(over.env),
        db,
        overrides: {
          embedder: new MockEmbedder(),
          git: new MockGitClient({}),
          llm: { openai, openrouter },
          ...(over.spies ? { codeIndex, fs } : {}),
        },
      }),
      openrouter,
      openai,
      codeIndex,
      fs,
    };
  }

  // -- cases ----------------------------------------------------------------

  it('happy path: 200 ok with callers, endpoints and the INDEXED sha as the link ref', async () => {
    const { appPromise, openai, openrouter } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', [
      'src/routes/pay.ts',
      'src/routes/refund.ts',
      'src/jobs/settle.ts',
    ]);
    await db
      .insert(t.fileFacts)
      .values({ repoId: repo.id, filePath: 'src/routes/pay.ts', endpoints: ['POST /pay'] });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.state).toBe('ok');
    expect('reason' in body).toBe(false);
    expect(body.symbols.length).toBeGreaterThanOrEqual(1);
    expect(body.symbols[0].callers.length).toBeGreaterThanOrEqual(2);
    expect(body.totals.endpoints).toBeGreaterThanOrEqual(1);

    // The whole point of the fixture: the two shas differ, and every file:line
    // is relative to the indexed one.
    expect(body.link.indexed_sha).toBe(INDEXED_SHA);
    expect(body.link.head_sha).toBe(HEAD_SHA);
    expect(body.link.indexed_sha).not.toBe(body.link.head_sha);
    expect(body.link.repo_full_name).toBe(repo.fullName);

    // Zero LLM calls, on BOTH providers.
    expect(openai.calls.length).toBe(0);
    expect(openrouter.calls.length).toBe(0);

    await app.close();
  });

  it('never reads the clone, the AST or the graph — flag on AND flag off', async () => {
    for (const env of [{}, { REPO_INTEL_ENABLED: 'false' }]) {
      const { appPromise, codeIndex, fs } = appWithMocks({ env, spies: true });
      const app = await appPromise;
      const { repo, pr } = await setupRepoAndPr();
      // An index row EXISTS — with the flag off this is the case that falls
      // through to the clone without `persistentOnly`.
      await indexState(repo.id);
      await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
      await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', [
        'src/routes/pay.ts',
      ]);

      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
      expect(res.statusCode).toBe(200);
      for (const spy of [codeIndex.grep, codeIndex.symbols, codeIndex.references]) {
        expect(spy).not.toHaveBeenCalled();
      }
      for (const spy of [fs.readFile, fs.readdir, fs.stat]) {
        expect(spy).not.toHaveBeenCalled();
      }
      await app.close();
    }
  });

  it('no repo_index_state row → 200 degraded/no_data, not 404', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr();
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('degraded');
    expect(body.reason).toBe('no_data');
    expect(body.symbols).toEqual([]);
    expect(body.prior_pulls).toEqual([]);
    await app.close();
  });

  it('partial index → 200 partial/index_partial with the map still populated', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id, { status: 'partial' });
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('partial');
    expect(body.reason).toBe('index_partial');
    expect(body.symbols.length).toBe(1);
    expect(body.symbols[0].callers.length).toBe(1);
    await app.close();
  });

  it('caps callers PER symbol and reports both the rendered and the found totals', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(
      repo.id,
      'src/lib/money.ts',
      'alpha',
      Array.from({ length: 25 }, (_, i) => `src/a/${i}.ts`),
    );
    await seedSymbolWithCallers(
      repo.id,
      'src/lib/money.ts',
      'beta',
      Array.from({ length: 25 }, (_, i) => `src/b/${i}.ts`),
    );

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const sym of body.symbols) {
      expect(sym.callers.length).toBe(MAX_CALLERS_PER_SYMBOL);
      expect(sym.callers_total).toBe(25);
      expect(sym.callers_truncated).toBe(true);
    }
    expect(body.totals.callers).toBe(40);
    expect(body.totals.callers_found).toBe(50);
    await app.close();
  });

  it('a v1 index reports index_stale, not "ok with zero callers"', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id, { status: 'full', indexerVersion: 1 });
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    // Symbols + references but NO file_rank — exactly the v1 shape.
    await db.insert(t.symbols).values({
      repoId: repo.id,
      path: 'src/lib/money.ts',
      name: 'formatMoney',
      kind: 'function',
      line: 1,
      exported: true,
    });
    await db.insert(t.references).values({
      repoId: repo.id,
      fromPath: 'src/routes/pay.ts',
      toSymbol: 'formatMoney',
      line: 10,
      declFile: 'src/lib/money.ts',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('degraded');
    expect(body.reason).toBe('index_stale');
    expect(body.symbols).toEqual([]);
    await app.close();
  });

  it('surfaces downstream truncation when a BFS level hits the cap', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);
    await db.insert(t.fileEdges).values(
      Array.from({ length: MAX_REVERSE_DEPENDENTS + 5 }, (_, i) => ({
        repoId: repo.id,
        fromFile: `src/dep/${String(i).padStart(4, '0')}.ts`,
        toFile: 'src/lib/money.ts',
      })),
    );

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    expect(res.json().downstream_truncated).toBe(true);
    await app.close();
  });

  it('getReverseEdges truncates by RANK, not alphabetically, and keeps unranked rows', async () => {
    const { repo } = await setupRepoAndPr();
    await db.insert(t.fileEdges).values([
      { repoId: repo.id, fromFile: 'a.ts', toFile: 'target.ts' },
      { repoId: repo.id, fromFile: 'm.ts', toFile: 'target.ts' },
      { repoId: repo.id, fromFile: 'z.ts', toFile: 'target.ts' },
      { repoId: repo.id, fromFile: 'unranked.ts', toFile: 'target.ts' },
    ]);
    // Rank is the exact reverse of the alphabetical order.
    await db.insert(t.fileRank).values([
      { repoId: repo.id, filePath: 'a.ts', pagerank: 1, hotness: 0, rank: 1, percentile: 10 },
      { repoId: repo.id, filePath: 'm.ts', pagerank: 2, hotness: 0, rank: 2, percentile: 50 },
      { repoId: repo.id, filePath: 'z.ts', pagerank: 3, hotness: 0, rank: 3, percentile: 90 },
    ]);

    const repository = new RepoIntelRepository(db);
    const top1 = await repository.getReverseEdges(repo.id, ['target.ts'], 1);
    expect(top1.map((e) => e.fromFile)).toEqual(['z.ts']);

    const all = await repository.getReverseEdges(repo.id, ['target.ts'], 10);
    expect(all.map((e) => e.fromFile)).toEqual(['z.ts', 'm.ts', 'a.ts', 'unranked.ts']);
  });

  it('importers include a file that imports the change without calling a symbol', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);
    // imp.ts imports the changed file but has no `references` row at all.
    await db
      .insert(t.fileEdges)
      .values({ repoId: repo.id, fromFile: 'imp.ts', toFile: 'src/lib/money.ts' });
    await db
      .insert(t.fileFacts)
      .values({ repoId: repo.id, filePath: 'imp.ts', endpoints: ['GET /imp'] });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const sym = res.json().symbols[0];
    expect(sym.importers).toEqual([{ file: 'imp.ts', depth: 1 }]);
    expect(sym.callers.map((c: { file: string }) => c.file)).not.toContain('imp.ts');
    expect(sym.endpoints).toContain('GET /imp');
    await app.close();
  });

  it('the reverse walk is seeded from the CHANGED file, so depth 3 is out of range', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'changed.ts' });
    await seedSymbolWithCallers(repo.id, 'changed.ts', 'formatMoney', ['a.ts']);
    // changed.ts <- a.ts <- b.ts <- c.ts
    await db.insert(t.fileEdges).values([
      { repoId: repo.id, fromFile: 'a.ts', toFile: 'changed.ts' },
      { repoId: repo.id, fromFile: 'b.ts', toFile: 'a.ts' },
      { repoId: repo.id, fromFile: 'c.ts', toFile: 'b.ts' },
    ]);
    for (const file of ['a.ts', 'b.ts', 'c.ts']) {
      await db
        .insert(t.fileFacts)
        .values({ repoId: repo.id, filePath: file, endpoints: [`GET /${file}`] });
    }

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const sym = res.json().symbols[0];
    expect(sym.endpoints).toContain('GET /a.ts');
    expect(sym.endpoints).toContain('GET /b.ts');
    // Three hops from the change — outside the two-level budget. Under the old
    // caller-seeded walk this would have been reached.
    expect(sym.endpoints).not.toContain('GET /c.ts');
    expect(sym.importers).toEqual([{ file: 'a.ts', depth: 1 }]);
    await app.close();
  });

  it('a PR with zero pr_files is an empty impact, never degraded', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('ok');
    expect(body.symbols).toEqual([]);
    expect(body.totals).toEqual({
      symbols: 0,
      callers: 0,
      callers_found: 0,
      endpoints: 0,
      crons: 0,
    });
    await app.close();
  });

  it('prior PRs: serialized, null updated_at sorts last, self never listed', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr({ updatedAt: new Date('2026-08-01T00:00:00Z') });
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);

    const [dated] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 2,
        title: 'Earlier money change',
        author: 'ana',
        branch: 'feat/y',
        base: 'main',
        headSha: 'ccc333',
        status: 'merged',
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      })
      .returning();
    const [undated] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 3,
        title: 'Undated money change',
        author: 'bo',
        branch: 'feat/z',
        base: 'main',
        headSha: 'ddd444',
        status: 'open',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: dated!.id, path: 'src/lib/money.ts' },
      { prId: undated!.id, path: 'src/lib/money.ts' },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const prior = res.json().prior_pulls as Array<{ number: number; updated_at: string | null }>;
    expect(prior.map((p) => p.number)).toEqual([2, 3]);
    expect(prior[0].updated_at).toBe('2026-07-01T00:00:00.000Z');
    expect(prior[1].updated_at).toBeNull();
    expect(prior.map((p) => p.number)).not.toContain(1);
    await app.close();
  });

  // -- POST /pulls/:id/blast/summary ---------------------------------------

  it('summary: exactly one LLM call, while the GET on the same PR makes none', async () => {
    const { appPromise, openai, openrouter } = appWithMocks({
      summary: 'Changing `formatMoney` in `src/lib/money.ts` reaches `POST /pay`.',
    });
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);
    await db
      .insert(t.fileFacts)
      .values({ repoId: repo.id, filePath: 'src/routes/pay.ts', endpoints: ['POST /pay'] });

    const [{ count: runsBefore }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.agentRuns);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(get.statusCode).toBe(200);
    expect(openrouter.calls.length).toBe(0);
    expect(openai.calls.length).toBe(0);

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/summary` });
    expect(post.statusCode).toBe(200);
    const body = post.json();
    expect(body.summary).toContain('formatMoney');
    expect(body.nodes).toBeGreaterThan(0);

    const structured = openrouter.calls.filter((c) => c.method === 'completeStructured');
    expect(structured).toHaveLength(1);
    expect((structured[0]!.req as { schemaName: string }).schemaName).toBe('BlastSummary');
    expect(openai.calls.length).toBe(0);

    // Nothing is persisted — there is no table and no migration for it.
    const [{ count: runsAfter }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.agentRuns);
    expect(runsAfter).toBe(runsBefore);
    const reviewsForPr = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(reviewsForPr).toEqual([]);

    await app.close();
  });

  it('summary: a hallucinated node is rejected with 422', async () => {
    const { appPromise } = appWithMocks({
      summary: 'It also rewrites `src/does-not-exist.ts`.',
    });
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });
    await seedSymbolWithCallers(repo.id, 'src/lib/money.ts', 'formatMoney', ['src/routes/pay.ts']);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/summary` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('summary: an unindexed repo is 409 and spends no LLM call', async () => {
    const { appPromise, openai, openrouter } = appWithMocks();
    const app = await appPromise;
    const { pr } = await setupRepoAndPr();
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'src/lib/money.ts' });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/summary` });
    expect(res.statusCode).toBe(409);
    expect(openrouter.calls.length).toBe(0);
    expect(openai.calls.length).toBe(0);
    await app.close();
  });

  it('summary: an ok-but-empty map is 409 and spends no LLM call', async () => {
    // A fully indexed repo whose PR touches a file with no declared symbols
    // is `state: "ok"` with zero symbols — a genuinely empty impact. Paying a
    // model to write a paragraph about nothing is worse than saying so.
    const { appPromise, openai, openrouter } = appWithMocks();
    const app = await appPromise;
    const { repo, pr } = await setupRepoAndPr();
    await indexState(repo.id);
    await db.insert(t.prFiles).values({ prId: pr.id, path: 'docs/readme.md' });

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(get.statusCode).toBe(200);
    expect(get.json().state).toBe('ok');
    expect(get.json().symbols).toEqual([]);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/summary` });
    expect(res.statusCode).toBe(409);
    expect(openrouter.calls.length).toBe(0);
    expect(openai.calls.length).toBe(0);
    await app.close();
  });

  it('404 for an unknown pr uuid, 422 for a non-uuid id', async () => {
    const { appPromise } = appWithMocks();
    const app = await appPromise;

    const missing = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/blast',
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
