/**
 * S2 — the `0018_pr_brief_cache` migration.
 *
 * The testcontainers harness applies the WHOLE migration chain to a fresh
 * Postgres, so inserting a `pr_brief` row that uses every new column and
 * reading it back is the only cheap proof the migration actually runs
 * (`server/INSIGHTS.md:718-736`). A green `pnpm typecheck` proves nothing
 * here: it does not compile `server/test/**` at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrBrief } from '@devdigest/shared';
import { BriefRepository } from '../src/modules/brief/repository.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { MockLLMProvider, MockGitHubClient } from '../src/adapters/mocks.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { createBlastService } from '../src/modules/blast/facade.js';
import { createContextService } from '../src/modules/context/facade.js';
import { resolveFeatureModel } from '../src/modules/settings/feature-models.js';
import type { BriefDeps } from '../src/modules/brief/deps.js';
import { gather } from '../src/modules/brief/gather.js';
import { BriefService } from '../src/modules/brief/service.js';
import { ValidationError } from '../src/platform/errors.js';
import { buildApp } from '../src/app.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const BRIEF: PrBrief = {
  what: 'Adds a cached PR brief to the Overview tab.',
  why: 'A reviewer opening a PR cannot tell what it is for.',
  risk_level: 'medium',
  risks: [
    {
      title: 'Cache key misses a head push',
      explanation: 'A stale brief would render as current.',
      severity: 'high',
      file_refs: ['server/src/modules/brief/service.ts'],
    },
  ],
  review_focus: [
    { file_ref: 'server/src/modules/brief/budget.ts', reason: 'New trimming logic.' },
  ],
};

d('pr_brief cache columns (migration 0018)', () => {
  let pg: PgFixture;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: ws!.id,
        owner: 'acme',
        name: 'brief',
        fullName: 'acme/brief',
        defaultBranch: 'main',
        clonePath: '/tmp/acme-brief',
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'Add the PR brief',
        author: 'octocat',
        branch: 'feat/brief',
        base: 'main',
        headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
      .returning();
    prId = pr!.id;
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('round-trips a row using every cache-key and provenance column', async () => {
    const builtAt = new Date('2026-08-23T21:05:50.000Z');
    await pg.handle.db.insert(t.prBrief).values({
      prId,
      json: BRIEF,
      headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      intentKey: 'bbbbbbbb',
      blastKey: 'cccccccc:full:1786310400000',
      runKey: 'none',
      stateKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|bbbbbbbb|cccccccc:full:1786310400000|none',
      model: 'gpt-4.1',
      costUsd: 0.014,
      tokensIn: 8200,
      tokensOut: 1300,
      builtAt,
      inputs: { included: ['pr_meta', 'blast_map'], cut: [], missing: ['issue'] },
    });

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

    expect(row).toBeDefined();
    expect(row!.json.risk_level).toBe('medium');
    expect(row!.json.review_focus[0]!.file_ref).toBe('server/src/modules/brief/budget.ts');
    expect(row!.intentKey).toBe('bbbbbbbb');
    expect(row!.blastKey).toBe('cccccccc:full:1786310400000');
    expect(row!.runKey).toBe('none');
    expect(row!.stateKey).toContain('|none');
    expect(row!.model).toBe('gpt-4.1');
    expect(row!.costUsd).toBeCloseTo(0.014, 6);
    expect(row!.tokensIn).toBe(8200);
    expect(row!.tokensOut).toBe(1300);
    expect(row!.builtAt?.toISOString()).toBe('2026-08-23T21:05:50.000Z');
    expect(row!.inputs).toEqual({
      included: ['pr_meta', 'blast_map'],
      cut: [],
      missing: ['issue'],
    });
  });

  it('leaves every provenance column nullable — a pre-0018 row still inserts', async () => {
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.name, 'brief'));
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 2,
        title: 'Legacy row',
        author: 'octocat',
        branch: 'feat/legacy',
        base: 'main',
        headSha: 'dddddddddddddddddddddddddddddddddddddddd',
      })
      .returning();

    await pg.handle.db.insert(t.prBrief).values({ prId: pr!.id, json: BRIEF });

    const [row] = await pg.handle.db
      .select()
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, pr!.id));
    expect(row!.stateKey).toBeNull();
    expect(row!.costUsd).toBeNull();
    expect(row!.builtAt).toBeNull();
    expect(row!.inputs).toBeNull();
  });
});

/**
 * S5 — the brief module's own repository: the cache key and the empty parent.
 *
 * Shares nothing with the migration suite above on purpose: a fresh container
 * per describe keeps `repo_index_state` / `agent_runs` absent so the three
 * `'none'` components are observable.
 */
d('BriefRepository.currentStateKey (S5)', () => {
  let pg: PgFixture;
  let repo: BriefRepository;
  let workspaceId: string;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'keys',
        fullName: 'acme/keys',
        defaultBranch: 'main',
        clonePath: '/tmp/acme-keys',
      })
      .returning();
    repoId = r!.id;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 7,
        title: 'Cache key fixture',
        author: 'octocat',
        branch: 'feat/keys',
        base: 'main',
        headSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      })
      .returning();
    prId = pr!.id;
    repo = new BriefRepository(pg.handle.db);
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  it("reports 'none' for each optional component whose row is absent", async () => {
    const key = await repo.currentStateKey(workspaceId, prId);
    expect(key.head_sha).toBe('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(key.intent_key).toBe('none');
    expect(key.blast_key).toBe('none');
    expect(key.run_key).toBe('none');
    expect(key.state_key).toBe(
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee|none|none|none',
    );
  });

  it('moves the key when the intent is recomputed and the head sha stands still', async () => {
    const before = await repo.currentStateKey(workspaceId, prId);
    await pg.handle.db.insert(t.prIntent).values({
      prId,
      intent: 'Add a cached brief',
      headSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      classifiedAt: new Date('2026-08-23T10:00:00.000Z'),
    });
    const first = await repo.currentStateKey(workspaceId, prId);

    // Recompute: same head, new classified_at. This is the case AC-19 exists
    // for — a key built from head_sha alone would not move here.
    await pg.handle.db
      .update(t.prIntent)
      .set({ classifiedAt: new Date('2026-08-23T11:30:00.000Z') })
      .where(eq(t.prIntent.prId, prId));
    const second = await repo.currentStateKey(workspaceId, prId);

    expect(first.state_key).not.toBe(before.state_key);
    expect(second.head_sha).toBe(first.head_sha);
    expect(second.intent_key).not.toBe(first.intent_key);
    expect(second.state_key).not.toBe(first.state_key);
  });

  it('picks up the index state and the newest finished run', async () => {
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'ffff1111',
      indexerVersion: 1,
      status: 'full',
      updatedAt: new Date('2026-08-22T09:00:00.000Z'),
    });
    // A running row must not count: only a finished run can have fed a brief.
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      prId,
      ranAt: new Date('2026-08-23T12:00:00.000Z'),
      status: 'running',
    });
    const [done] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId,
        ranAt: new Date('2026-08-23T11:00:00.000Z'),
        status: 'done',
      })
      .returning();

    const key = await repo.currentStateKey(workspaceId, prId);
    expect(key.blast_key).toBe('full|ffff1111|2026-08-22T09:00:00.000Z');
    expect(key.run_key).toBe(`${done!.id}|2026-08-23T11:00:00.000Z`);
    expect(key.state_key.split('|').length).toBeGreaterThan(4);
  });

  it('returns undefined for an unknown pull request instead of throwing', async () => {
    await expect(
      repo.getBrief('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeUndefined();
  });

  it('upserts twice on the same pr_id and keeps one row', async () => {
    const values = {
      json: BRIEF,
      headSha: 'eeee',
      intentKey: 'a',
      blastKey: 'b',
      runKey: 'none',
      stateKey: 'eeee|a|b|none',
      model: 'gpt-4.1',
      costUsd: 0.01,
      tokensIn: 10,
      tokensOut: 5,
      builtAt: new Date('2026-08-23T12:00:00.000Z'),
      inputs: {
        included: ['pr_meta' as const],
        cut: [],
        missing: [],
        over_budget: null,
        blast_state: null,
      },
    };
    await repo.upsertBrief(prId, values);
    await repo.upsertBrief(prId, { ...values, model: 'gpt-4.1-mini', stateKey: 'eeee|a|b|x' });

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.model).toBe('gpt-4.1-mini');
    expect(rows[0]!.stateKey).toBe('eeee|a|b|x');
  });
});

/**
 * S7 — gather: every input read once, and no boundary failure allowed to
 * propagate.
 *
 * A real Postgres, a real clone directory on disk and the mock adapters. The
 * dependency bag is built exactly as `brief/routes.ts` will build it, so the
 * wiring is under test too.
 */
d('brief gather (S7)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let cloneDir: string;
  let seq = 0;

  const PATCH = [
    '@@ -1,4 +1,6 @@',
    ' const a = 1;',
    '-const removed = "gone";',
    '+const added = "SECRET_DIFF_BODY";',
  ].join('\n');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    cloneDir = await mkdtemp(join(tmpdir(), 'brief-gather-'));
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  /** A repo with a clone on disk, a PR, its files and (optionally) everything else. */
  async function fixture(opts: {
    doc?: string;
    indexStatus?: 'full' | 'degraded';
    intent?: boolean;
    findings?: boolean;
    patch?: string;
    title?: string;
  }) {
    const name = `gather-${seq++}`;
    const clonePath = join(cloneDir, 'acme', name);
    if (opts.doc !== undefined) {
      await mkdir(join(clonePath, 'docs'), { recursive: true });
      await writeFile(join(clonePath, 'docs/design.md'), opts.doc);
    }
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        defaultBranch: 'main',
        clonePath: opts.doc === undefined ? null : clonePath,
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: opts.title ?? 'Rework the money path',
        author: 'octocat',
        branch: 'feat/money',
        base: 'main',
        headSha: 'aaaa1111',
        body: 'Body text.',
        additions: 12,
        deletions: 3,
        filesCount: 1,
      })
      .returning();
    await db
      .insert(t.prFiles)
      .values({ prId: pr!.id, path: 'src/a.ts', additions: 12, deletions: 3, patch: opts.patch ?? null });

    if (opts.indexStatus) {
      await db.insert(t.repoIndexState).values({
        repoId: repo!.id,
        lastIndexedSha: 'idx0001',
        indexerVersion: INDEXER_VERSION,
        status: opts.indexStatus,
      });
    }
    if (opts.indexStatus === 'full') {
      await db
        .insert(t.symbols)
        .values({ repoId: repo!.id, path: 'src/a.ts', name: 'formatMoney', kind: 'function', line: 1, exported: true });
      await db
        .insert(t.symbols)
        .values({ repoId: repo!.id, path: 'src/pay.ts', name: 'pay', kind: 'function', line: 1 });
      await db
        .insert(t.references)
        .values({ repoId: repo!.id, fromPath: 'src/pay.ts', toSymbol: 'formatMoney', line: 10, declFile: 'src/a.ts' });
      await db.insert(t.fileRank).values({
        repoId: repo!.id,
        filePath: 'src/pay.ts',
        pagerank: 1,
        hotness: 0,
        rank: 1,
        percentile: 50,
      });
    }
    if (opts.intent) {
      await db.insert(t.prIntent).values({
        prId: pr!.id,
        intent: 'Rework the money path',
        headSha: 'aaaa1111',
        classifiedAt: new Date('2026-08-23T10:00:00.000Z'),
      });
    }
    if (opts.findings) {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId, prId: pr!.id, status: 'done', ranAt: new Date('2026-08-23T09:00:00.000Z') })
        .returning();
      const [review] = await db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr!.id, runId: run!.id, kind: 'review' })
        .returning();
      await db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'src/a.ts',
        startLine: 3,
        endLine: 3,
        severity: 'critical',
        category: 'security',
        title: 'Hardcoded key',
        rationale: 'A literal secret.',
        confidence: 0.9,
      });
    }
    return { repo: repo!, pr: pr! };
  }

  /** The bag `brief/routes.ts` builds — same shape, mock adapters. */
  function makeDeps(over: Partial<BriefDeps> = {}): BriefDeps {
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: { BlastSummary: { summary: 'A grounded paragraph about `formatMoney`.' } },
    });
    const container = new Container(
      loadConfig({ ...process.env, NODE_ENV: 'test', DEVDIGEST_CLONE_DIR: cloneDir } as NodeJS.ProcessEnv),
      db,
      {
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai'), openrouter },
      },
    );
    return {
      db: container.db,
      reviewRepo: container.reviewRepo,
      blast: () => createBlastService(container),
      context: () => createContextService(container),
      github: () => container.github(),
      git: container.git,
      llm: (id) => container.llm(id),
      featureModel: (ws, id) => resolveFeatureModel(container, ws, id),
      countTokens: (text) => container.tokenizer.count(text),
      estimateCost: (m, i, o) => container.priceBook.estimate(m, i, o),
      ...over,
    };
  }

  it('reads every input and reports nothing missing when they are all there', async () => {
    const { repo, pr } = await fixture({
      doc: '# Design\n\nThe money path lives in src/a.ts.\n',
      indexStatus: 'full',
      intent: true,
      findings: true,
      title: 'Rework the money path (fixes #42)',
    });

    const raw = await gather(makeDeps(), { workspaceId, pull: pr, repo });

    expect(raw.missing).toEqual([]);
    expect(raw.intent?.intent).toBe('Rework the money path');
    expect(raw.blastState).toBe('ok');
    expect(raw.blastMap?.symbols.length).toBeGreaterThan(0);
    expect(raw.blastSummary).toContain('formatMoney');
    expect(raw.issue).toEqual({ number: 42, title: 'Issue #42', body: 'mock issue' });
    expect(raw.documents.map((d) => d.path)).toEqual(['docs/design.md']);
    expect(raw.findings).toEqual([
      { severity: 'critical', title: 'Hardcoded key', file: 'src/a.ts', start_line: 3 },
    ]);
    expect(raw.prMeta).toMatchObject({ number: 1, additions: 12, deletions: 3, filesCount: 1 });
  });

  it('AC-2: no part of pr_files.patch reaches the gathered inputs', async () => {
    const { repo, pr } = await fixture({ patch: PATCH, indexStatus: 'full' });

    const raw = await gather(makeDeps(), { workspaceId, pull: pr, repo });
    const serialised = JSON.stringify(raw);

    expect(raw.changedFiles).toEqual(['src/a.ts']);
    expect(serialised).not.toContain('@@');
    expect(serialised).not.toContain('SECRET_DIFF_BODY');
    expect(serialised).not.toContain('const removed');
    // AC-40's second source: the patch is reduced to the `+1` of its first
    // hunk header and the diff text itself is dropped with the row.
    expect(raw.changedFileLines).toEqual({ 'src/a.ts': 1 });
  });

  it('AC-7: a PR with no derived intent still gathers', async () => {
    const { repo, pr } = await fixture({ indexStatus: 'full' });

    const raw = await gather(makeDeps(), { workspaceId, pull: pr, repo });

    expect(raw.intent).toBeNull();
    expect(raw.missing).toContain('intent');
  });

  it('AC-5: a PR with no finished run gathers with no findings', async () => {
    const { repo, pr } = await fixture({ indexStatus: 'full' });

    const raw = await gather(makeDeps(), { workspaceId, pull: pr, repo });

    expect(raw.findings).toEqual([]);
    expect(raw.missing).toContain('findings');
  });

  it('AC-6: a GitHub client that rejects costs the issue and nothing else', async () => {
    const { repo, pr } = await fixture({ indexStatus: 'full', title: 'Fixes #99' });

    const raw = await gather(
      makeDeps({ github: () => Promise.reject(new Error('GITHUB_TOKEN is not configured')) }),
      { workspaceId, pull: pr, repo },
    );

    expect(raw.issue).toBeNull();
    expect(raw.missing).toContain('issue');
    expect(raw.prMeta.number).toBe(1);
  });

  it('AC-32: a degraded blast map and a rejected summary still produce a brief input set', async () => {
    const { repo, pr } = await fixture({ indexStatus: 'degraded' });

    const raw = await gather(makeDeps(), { workspaceId, pull: pr, repo });

    expect(raw.blastState).toBe('degraded');
    expect(raw.blastSummary).toBeNull();
    expect(raw.missing).toContain('blast_map');
    expect(raw.missing).toContain('blast_summary');
    expect(raw.changedFiles).toEqual(['src/a.ts']);
  });
});

/**
 * S10 — the service: one call, the grounding check, the cache and single-flight.
 *
 * A real Postgres and `MockLLMProvider`. `risk_brief` and `blast_summary` BOTH
 * default to the `openrouter` provider slot (`FEATURE_MODELS`), so both
 * fixtures live on that one mock; the `openai` slot is present only so the
 * container can resolve it. That mock's `id` is `'openai'` on purpose —
 * `BriefService` refuses a provider whose id is `openrouter` under VITEST, so
 * no test can reach a live key.
 */
d('BriefService (S10)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let seq = 0;

  /** Grounded against a PR that changes `src/a.ts`. */
  const GROUNDED = {
    what: 'Reworks the money path.',
    why: 'The old one double-charged.',
    risk_level: 'medium',
    risks: [
      {
        title: 'Rounding',
        explanation: 'Totals may drift.',
        severity: 'high',
        file_refs: ['src/a.ts'],
      },
    ],
    review_focus: [{ file_ref: 'src/a.ts', reason: 'The new rounding.' }],
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr(opts: { files?: boolean; body?: string } = {}) {
    const name = `svc-${seq++}`;
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
        title: 'Rework the money path',
        author: 'octocat',
        branch: 'feat/money',
        base: 'main',
        headSha: 'aaaa1111',
        body: opts.body ?? 'Body.',
      })
      .returning();
    if (opts.files !== false) {
      await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 5, deletions: 1 });
    }
    return { repo: repo!, pr: pr! };
  }

  function makeService(over: { structured?: unknown; delayMs?: number } = {}) {
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: {
        PrBrief: over.structured ?? GROUNDED,
        BlastSummary: { summary: 'nothing to say' },
      },
      delayMs: over.delayMs,
    });
    const openai = new MockLLMProvider('openai');
    const container = new Container(
      loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      { github: new MockGitHubClient(), llm: { openai, openrouter } },
    );
    const deps: BriefDeps = {
      db: container.db,
      reviewRepo: container.reviewRepo,
      blast: () => createBlastService(container),
      context: () => createContextService(container),
      github: () => container.github(),
      git: container.git,
      llm: (id) => container.llm(id),
      featureModel: (ws, id) => resolveFeatureModel(container, ws, id),
      countTokens: (text) => container.tokenizer.count(text),
      estimateCost: (m, i, o) => container.priceBook.estimate(m, i, o),
    };
    const structuredCalls = () => openrouter.calls.filter((c) => c.method === 'completeStructured');
    return { service: new BriefService(deps), llm: openrouter, structuredCalls };
  }

  it('AC-8: a build makes exactly one structured model call', async () => {
    const { pr } = await makePr();
    const { service, structuredCalls } = makeService();

    const record = await service.build(workspaceId, pr.id, {});

    expect(structuredCalls()).toHaveLength(1);
    expect(record.brief.what).toBe('Reworks the money path.');
    expect(record.stale).toBe(false);
    // The `risk_brief` registry default (`FEATURE_MODELS`), recorded on the row.
    expect(record.model).toBe('deepseek/deepseek-v4-flash');
    expect(record.tokens_in).toBe(100);
    expect(record.inputs_included).toContain('pr_meta');
    expect(record.inputs_included).toContain('changed_files');
  });

  it('AC-20: a second build on the same state makes no further call', async () => {
    const { pr } = await makePr();
    const { service, structuredCalls } = makeService();

    const first = await service.build(workspaceId, pr.id, {});
    const second = await service.build(workspaceId, pr.id, {});

    expect(structuredCalls()).toHaveLength(1);
    expect(second.brief).toEqual(first.brief);
    expect(second.stale).toBe(false);
  });

  it('AC-21: force rebuilds the same unchanged state', async () => {
    const { pr } = await makePr();
    const { service, structuredCalls } = makeService();

    await service.build(workspaceId, pr.id, {});
    await service.build(workspaceId, pr.id, { force: true });

    expect(structuredCalls()).toHaveLength(2);
  });

  it('AC-19/AC-22: recomputing the intent without moving the head sha makes the brief stale', async () => {
    const { pr } = await makePr();
    const { service } = makeService();

    await service.build(workspaceId, pr.id, {});
    expect((await service.get(workspaceId, pr.id))!.stale).toBe(false);

    // The head commit stands still; only the derived intent moves.
    await db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'Rework the money path',
      headSha: 'aaaa1111',
      classifiedAt: new Date('2026-08-23T13:00:00.000Z'),
    });

    const after = await service.get(workspaceId, pr.id);
    expect(after!.stale).toBe(true);
    expect(after!.head_sha).toBe('aaaa1111');
  });

  /**
   * The over-budget statement rides in the same jsonb column as `blast_state`,
   * so it needs the same two guarantees: it survives the round trip, and a row
   * written before the key existed still reads back — losing the parse there
   * would silently blank the CUT list this statement stands beside.
   */
  it('round-trips the over-budget statement and defaults a pre-existing row to null', async () => {
    const { pr } = await makePr();
    const { service } = makeService();

    const built = await service.build(workspaceId, pr.id, {});
    expect(built.inputs_over_budget).toBeNull();

    // A row in the shape `0018_pr_brief_cache` wrote: no `over_budget` key.
    const legacyCut = [{ input: 'documents' as const, detail: 'docs/x.md' }];
    await db
      .update(t.prBrief)
      .set({
        inputs: { included: ['pr_meta'], cut: legacyCut, missing: [], blast_state: null },
      })
      .where(eq(t.prBrief.prId, pr.id));

    const legacy = await service.get(workspaceId, pr.id);
    expect(legacy!.inputs_over_budget).toBeNull();
    expect(legacy!.inputs_cut).toEqual(legacyCut);
  });

  it('AC-23: two builds started in the same tick share one model call and one result', async () => {
    const { pr } = await makePr();
    const { service, structuredCalls } = makeService({ delayMs: 60 });

    const [a, b] = await Promise.all([
      service.build(workspaceId, pr.id, {}),
      service.build(workspaceId, pr.id, {}),
    ]);

    expect(structuredCalls()).toHaveLength(1);
    expect(a).toBe(b);
  });

  it('AC-10: an ungrounded file_ref is rejected and nothing is persisted', async () => {
    const { pr } = await makePr();
    const { service } = makeService({
      structured: {
        ...GROUNDED,
        risks: [{ ...GROUNDED.risks[0]!, file_refs: ['src/never-in-the-input.ts'] }],
      },
    });

    await expect(service.build(workspaceId, pr.id, {})).rejects.toBeInstanceOf(ValidationError);

    // The trap case: a rejected response must not become a brief.
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();
    expect(await service.get(workspaceId, pr.id)).toBeNull();
  });

  /**
   * The wide-PR case that failed live on 2026-08-24: 1 200 changed files, the
   * fitter trims the list to fit the 16 000-token budget, and the model names a
   * file that was cut. The set is built from the COMPLETE inputs, so that name
   * is grounded and the brief is accepted.
   *
   * The count is 1 200 rather than the original 700 because AC-12's ceiling
   * moved to 16 000 on 2026-08-24: 700 of these paths cost 11 199 `cl100k_base`
   * tokens and now FIT, which left this case asserting a cut that no longer
   * happened. 1 200 cost 19 599 and put the premise back.
   */
  async function makeWidePr() {
    const { pr } = await makePr();
    // Ranked by additions + deletions desc, then path asc (`gather.ts`), so a
    // zero-churn path sorting last is the one the fitter is sure to cut.
    const cutPath = 'zzz/generated/cut-by-the-fitter/deliberately-last.ts';
    const bulk = Array.from({ length: 1200 }, (_, i) => ({
      prId: pr.id,
      path: `src/generated/module-${i}/deep/nested/segment/file-${i}.ts`,
      additions: 5,
      deletions: 1,
    }));
    await db.insert(t.prFiles).values([
      ...bulk,
      { prId: pr.id, path: cutPath, additions: 0, deletions: 0 },
    ]);
    return { pr, cutPath };
  }

  it('a changed file the fitter cut is still an allowed name', async () => {
    const { pr, cutPath } = await makeWidePr();
    const { service, llm } = makeService({
      structured: {
        ...GROUNDED,
        risks: [{ ...GROUNDED.risks[0]!, file_refs: [cutPath] }],
        review_focus: [{ file_ref: cutPath, reason: 'Cut from the prompt, not from the PR.' }],
      },
    });

    const record = await service.build(workspaceId, pr.id, {});

    // The list really was trimmed, and this path really did not reach the model.
    expect(record.inputs_cut.some((c) => c.input === 'changed_files')).toBe(true);
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const sent = JSON.stringify(call.req);
    expect(sent).not.toContain(cutPath);
    // And the brief naming it was accepted and persisted.
    expect(record.brief.review_focus[0]!.file_ref).toBe(cutPath);
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeDefined();
  });

  it('the mirror: a name in no input at all is still rejected on a wide PR', async () => {
    const { pr } = await makeWidePr();
    const { service } = makeService({
      structured: {
        ...GROUNDED,
        risks: [{ ...GROUNDED.risks[0]!, file_refs: ['src/never-in-the-input.ts'] }],
        review_focus: [{ file_ref: 'src/never-in-the-input.ts', reason: 'Invented.' }],
      },
    });

    await expect(service.build(workspaceId, pr.id, {})).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();
  });

  /**
   * The 422 of 2026-08-24 round 10: the model named a path it had read in the
   * TEXT we sent — here the pull request's body, live the prose of a selected
   * document — and the structural set alone did not hold it. The set is now the
   * union of the complete structural inputs and every path-like token of the
   * sent text, so the brief is accepted.
   */
  it('a path the model saw only in the sent text is grounded', async () => {
    const twin = 'client/src/vendor/shared/contracts/platform.ts';
    const { pr } = await makePr({
      body: `The contract in src/a.ts is mirrored byte for byte into ${twin}.`,
    });
    const { service, llm } = makeService({
      structured: {
        ...GROUNDED,
        risks: [{ ...GROUNDED.risks[0]!, file_refs: [twin] }],
        review_focus: [{ file_ref: twin, reason: 'The twin must move with it.' }],
      },
    });

    const record = await service.build(workspaceId, pr.id, {});

    // It is not a changed file, not a document path and not a finding — the
    // only place it occurs is the text the model was handed.
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    expect(JSON.stringify(call.req)).toContain(twin);
    expect(record.brief.review_focus[0]!.file_ref).toBe(twin);
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeDefined();
  });

  it('a path in neither the sent text nor the structural inputs is still rejected', async () => {
    const { pr } = await makePr({ body: 'The contract lives in src/a.ts.' });
    const { service } = makeService({
      structured: {
        ...GROUNDED,
        risks: [{ ...GROUNDED.risks[0]!, file_refs: ['src/totally-made-up.ts'] }],
        review_focus: [{ file_ref: 'src/totally-made-up.ts', reason: 'Invented.' }],
      },
    });

    await expect(service.build(workspaceId, pr.id, {})).rejects.toBeInstanceOf(ValidationError);
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();
  });

  it('AC-35: a fourth risk_level is rejected', async () => {
    const { pr } = await makePr();
    const { service } = makeService({ structured: { ...GROUNDED, risk_level: 'unknown' } });

    await expect(service.build(workspaceId, pr.id, {})).rejects.toThrow();
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();
  });

  /**
   * The deterministic risk-level floor. The card's most prominent field used to
   * be the only one grounded in nothing: a live brief of 2026-08-24 read
   * `risk_level: medium` one line above a risk of `severity: high`, and the
   * reviewer saw the contradiction before the server did.
   */
  it('raises a medium level whose own risks say high — and persists the raised one', async () => {
    const { pr } = await makePr();
    const { service } = makeService({
      structured: {
        ...GROUNDED,
        risk_level: 'medium',
        risks: [{ ...GROUNDED.risks[0]!, severity: 'high' }],
      },
    });

    const record = await service.build(workspaceId, pr.id, {});

    expect(record.brief.risk_level).toBe('high');
    // Raised BEFORE the write, so the cached read shows the corrected level
    // rather than the model's.
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row!.json.risk_level).toBe('high');
    expect((await service.get(workspaceId, pr.id))!.brief.risk_level).toBe('high');
  });

  it('never lowers: a high level over low risks only stays high', async () => {
    const { pr } = await makePr();
    const { service } = makeService({
      structured: {
        ...GROUNDED,
        risk_level: 'high',
        risks: [{ ...GROUNDED.risks[0]!, severity: 'low' }],
      },
    });

    const record = await service.build(workspaceId, pr.id, {});

    expect(record.brief.risk_level).toBe('high');
  });

  it("leaves the model's level untouched when there are no risks at all", async () => {
    const { pr } = await makePr();
    const { service } = makeService({
      structured: { ...GROUNDED, risk_level: 'medium', risks: [] },
    });

    const record = await service.build(workspaceId, pr.id, {});

    expect(record.brief.risk_level).toBe('medium');
  });

  it('a pull request that changes no files still builds', async () => {
    const { pr } = await makePr({ files: false });
    const { service } = makeService({
      structured: { ...GROUNDED, risks: [{ ...GROUNDED.risks[0]!, file_refs: [] }], review_focus: [] },
    });

    const record = await service.build(workspaceId, pr.id, {});

    // 'high', not the fixture's 'medium': its one risk is `severity: high`, so
    // the floor raises the headline (`risk-level.ts`). What this test is about
    // is that a PR with no changed files builds at all.
    expect(record.brief.risk_level).toBe('high');
    expect(record.inputs_included).toEqual(['pr_meta']);
    expect(record.inputs_missing).toContain('documents');
  });

  it('404s for an unknown pull request', async () => {
    const { service } = makeService();
    await expect(
      service.build(workspaceId, '00000000-0000-4000-8000-000000000000', {}),
    ).rejects.toThrow(/not found/i);
  });
});

/**
 * S11 — the routes, driven through the built Fastify app.
 *
 * The `200 null` case is the one that matters most: `server/INSIGHTS.md:298-308`
 * proves by red-proof mutation that dropping `.nullable()` from the response
 * schema turns it into a 500, and that `pnpm typecheck` does not catch it.
 */
d('brief routes (S11)', () => {
  let pg: PgFixture;
  let db: PgFixture['handle']['db'];
  let workspaceId: string;
  let seq = 0;

  const GROUNDED = {
    what: 'Reworks the money path.',
    why: 'The old one double-charged.',
    risk_level: 'low',
    risks: [],
    review_focus: [{ file_ref: 'src/a.ts', reason: 'The new rounding.' }],
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 180_000);

  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr() {
    const name = `routes-${seq++}`;
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
        title: 'Rework the money path',
        author: 'octocat',
        branch: 'feat/money',
        base: 'main',
        headSha: 'aaaa1111',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 5, deletions: 1 });
    return pr!;
  }

  function appWith(structured: unknown = GROUNDED) {
    // Both features resolve to the `openrouter` slot, so both fixtures sit on
    // that mock — see the S10 docstring above.
    const openrouter = new MockLLMProvider('openai', {
      structuredBySchema: {
        PrBrief: structured,
        BlastSummary: { summary: 'nothing to say' },
      },
    });
    const openai = new MockLLMProvider('openai');
    return {
      appPromise: buildApp({
        config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        db,
        overrides: { github: new MockGitHubClient(), llm: { openai, openrouter } },
      }),
      llm: openrouter,
    };
  }

  it('GET answers 200 with a JSON null when the PR has no brief yet', async () => {
    const app = await appWith().appPromise;
    const pr = await makePr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('POST builds, and GET then answers 200 with the record', async () => {
    const app = await appWith().appPromise;
    const pr = await makePr();

    const post = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: {},
    });
    expect(post.statusCode).toBe(200);
    expect(post.json().brief.what).toBe('Reworks the money path.');
    expect(post.json().stale).toBe(false);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(200);
    expect(get.json().pr_id).toBe(pr.id);
    expect(get.json().brief.review_focus[0].file_ref).toBe('src/a.ts');
  });

  // `payload: {}` is what the client sends and what the sibling `/pulls/:id/intent`
  // tests send (test/intent.it.test.ts:219). `inject` with NO payload transmits a
  // JSON `null`, which the body schema rejects with a 422 — the same answer that
  // route already gives, so the schema is left identical to it.
  it('POST with an empty body builds once; POST {"force":true} rebuilds', async () => {
    const { appPromise, llm } = appWith();
    const app = await appPromise;
    const pr = await makePr();
    const structured = () => llm.calls.filter((c) => c.method === 'completeStructured').length;

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: {} });
    expect(structured()).toBe(1);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: {} });
    expect(structured()).toBe(1);

    const forced = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: true },
    });
    expect(forced.statusCode).toBe(200);
    expect(structured()).toBe(2);
  });

  it('answers 404 for an unknown uuid on both verbs', async () => {
    const app = await appWith().appPromise;
    const unknown = '00000000-0000-4000-8000-000000000000';

    const get = await app.inject({ method: 'GET', url: `/pulls/${unknown}/brief` });
    const post = await app.inject({
      method: 'POST',
      url: `/pulls/${unknown}/brief`,
      payload: {},
    });

    expect(get.statusCode).toBe(404);
    expect(post.statusCode).toBe(404);
  });

  it('rejects a non-uuid id at the edge', async () => {
    const app = await appWith().appPromise;
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' });
    expect(res.statusCode).toBe(422);
  });

  it('surfaces an ungrounded response as a 422, not a 500', async () => {
    const app = await appWith({
      ...GROUNDED,
      review_focus: [{ file_ref: 'src/never-in-the-input.ts', reason: 'invented' }],
    }).appPromise;
    const pr = await makePr();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row).toBeUndefined();
  });
});
