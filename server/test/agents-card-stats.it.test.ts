import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-card-stats] Docker not available — skipping integration tests.');
}

d('Agent card 7-day stats (GET /agents)', () => {
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

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: 'diff' }) },
    });
  }

  async function makeAgent(name: string) {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name,
        description: 'card stats test',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        enabled: true,
        version: 1,
      })
      .returning();
    return agent!;
  }

  async function makePr(suffix: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `card-stats-${suffix}`,
        fullName: `acme/card-stats-${suffix}`,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Card stats fixture',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  /** Insert a run + review + one finding directly, at a given `ranAt`. */
  async function makeRun(
    agentId: string,
    prId: string,
    ranAt: Date,
    costUsd: number,
    findingStatus: 'accepted' | 'dismissed' | 'pending',
  ) {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId, prId, ranAt, costUsd, source: 'local' })
      .returning();
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, runId: run!.id, kind: 'review' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'bug',
      title: 'x',
      rationale: 'x',
      confidence: 0.5,
      acceptedAt: findingStatus === 'accepted' ? ranAt : null,
      dismissedAt: findingStatus === 'dismissed' ? ranAt : null,
    });
    return run!;
  }

  it('reports runs/accept-rate/avg-cost windowed to the last 7 days, excluding older activity', async () => {
    const app = await makeApp();
    const agent = await makeAgent(`Card Stats ${Date.now()}`);
    const pr = await makePr(String(Date.now()));

    const now = Date.now();
    const recent = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const stale = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago — out of window

    await makeRun(agent.id, pr.id, recent, 0.02, 'accepted');
    await makeRun(agent.id, pr.id, recent, 0.04, 'dismissed');
    // Stale run: would double the count/change the average if the window leaked.
    await makeRun(agent.id, pr.id, stale, 100, 'accepted');

    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(200);
    const found = (
      res.json() as Array<{
        id: string;
        runs_7d: number | null;
        accept_rate_7d: number | null;
        avg_cost_usd_7d: number | null;
      }>
    ).find((a) => a.id === agent.id);

    expect(found?.runs_7d).toBe(2);
    expect(found?.accept_rate_7d).toBeCloseTo(0.5);
    expect(found?.avg_cost_usd_7d).toBeCloseTo(0.03);

    await app.close();
  });

  it('an agent with no activity in the window reports zeros, not null or NaN', async () => {
    const app = await makeApp();
    const agent = await makeAgent(`Card Stats Idle ${Date.now()}`);

    const res = await app.inject({ method: 'GET', url: '/agents' });
    const found = (
      res.json() as Array<{
        id: string;
        runs_7d: number | null;
        accept_rate_7d: number | null;
        avg_cost_usd_7d: number | null;
      }>
    ).find((a) => a.id === agent.id);

    expect(found).toMatchObject({ runs_7d: 0, accept_rate_7d: 0, avg_cost_usd_7d: 0 });
    await app.close();
  });
});
