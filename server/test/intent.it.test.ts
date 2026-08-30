import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, Intent } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A unified diff touching src/config.ts (line 11 added). */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Review fixture the `openai` mock returns for the per-agent review call. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/**
 * Intent fixture the `openrouter` mock returns for the classifier call.
 * Matches classify.ts's IntentLlmSchema (all fields required — strict
 * json_schema rejects `.default()` optionals).
 */
const INTENT_FIXTURE: Intent = {
  intent: 'Add rate limiting to protect the payments API from abuse.',
  in_scope: ['rate limiting middleware'],
  out_of_scope: ['stripe key rotation'],
  risk_areas: [{ title: 'Security', severity: 'medium', explanation: 'Touches auth-adjacent code.', file_ref: 'src/config.ts:11' }],
  confidence: 0.8,
  sources: ['title', 'body', 'files'],
  missing_context: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-intent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting to protect the payments API.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Intent layer (Testcontainers pg)', () => {
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

  /**
   * Both providers mocked: openrouter for the intent classifier
   * (`review_intent`'s default provider), openai for the per-agent review
   * call. `MockLLMProvider`'s `id` union doesn't include 'openrouter' — the
   * override MAP key is what routes `container.llm('openrouter')`, the
   * instance's own `.id` is irrelevant to that routing (server/INSIGHTS.md
   * risk table, S5).
   */
  function appWithBothProviders() {
    const openrouter = new MockLLMProvider('openai', { structuredBySchema: { PrIntent: INTENT_FIXTURE } });
    const openai = new MockLLMProvider('openai', { structuredBySchema: { Review: REVIEW_FIXTURE } });
    return {
      app: buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          git: new MockGitClient({ diff: DIFF }),
          llm: { openrouter, openai },
        },
      }),
      openrouter,
      openai,
    };
  }

  it('GET /pulls/:id/intent returns 200 with JSON null when no intent row exists', async () => {
    const { app } = appWithBothProviders();
    const builtApp = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await builtApp.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    // Assert on the raw payload, not `.json()`: `JSON.parse('null')` is `null`,
    // but `.json() === null` would also pass for an empty/invalid body — the
    // literal wire text is the thing actually at risk per the plan's Zod
    // `.nullable()` serializer concern.
    expect(res.payload).toBe('null');
    expect(res.json()).toBeNull();

    await builtApp.close();
  });

  it('a review run makes two completeStructured calls in order: PrIntent (openrouter) then Review (openai)', async () => {
    const { app, openrouter, openai } = appWithBothProviders();
    const builtApp = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await builtApp.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const started = await builtApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(started.statusCode).toBe(200);
    const runId = started.json().runs[0].run_id as string;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const orCalls = openrouter.calls.filter((c) => c.method === 'completeStructured');
    const oaCalls = openai.calls.filter((c) => c.method === 'completeStructured');

    expect(orCalls).toHaveLength(1);
    expect((orCalls[0]!.req as { schemaName: string }).schemaName).toBe('PrIntent');

    expect(oaCalls.length).toBeGreaterThanOrEqual(1);
    expect((oaCalls[0]!.req as { schemaName: string }).schemaName).toBe('Review');

    // trace.tool_calls records the classifier as a distinct tool entry, with
    // only the model id as args — no evidence text / patch bodies / secrets.
    const trace = (await builtApp.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const intentToolCall = trace.tool_calls.find((tc: { tool: string }) => tc.tool === 'intent_classifier');
    expect(intentToolCall).toBeDefined();
    expect(intentToolCall.args).not.toContain('sk_live');
    expect(intentToolCall.args).not.toContain('stripeKey');
    expect(typeof intentToolCall.args).toBe('string');

    // The "## PR intent" section reached the review prompt (proves the
    // classify → review sequencing, not just call counts).
    expect(trace.prompt_assembly.intent).toBeTruthy();

    // GET now returns the persisted record, not null, with stale: false
    // (head_sha matches the PR's current head_sha right after classifying).
    const got = (await builtApp.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(got.stale).toBe(false);
    expect(got.head_sha).toBe(pr.headSha);
    expect(got.intent).toBe(INTENT_FIXTURE.intent);
    expect(got.out_of_scope).toEqual(INTENT_FIXTURE.out_of_scope);

    await builtApp.close();
  });

  it('POST /pulls/:id/intent upserts a PrIntentRecord and computes stale from head_sha drift', async () => {
    const { app, openrouter } = appWithBothProviders();
    const builtApp = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const posted = await builtApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/intent`,
      payload: {},
    });
    expect(posted.statusCode).toBe(200);
    const record = posted.json();
    expect(record.stale).toBe(false);
    expect(record.head_sha).toBe(pr.headSha);
    expect(record.model).toBeTruthy();
    expect(openrouter.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // A second POST without `force` reuses the persisted row for the same
    // head_sha: no additional completeStructured call.
    const posted2 = await builtApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/intent`,
      payload: {},
    });
    expect(posted2.statusCode).toBe(200);
    expect(posted2.json().stale).toBe(false);
    expect(openrouter.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // POST { force: true } reclassifies even though head_sha is unchanged.
    const forced = await builtApp.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/intent`,
      payload: { force: true },
    });
    expect(forced.statusCode).toBe(200);
    expect(openrouter.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    // Simulate a new commit landing (head_sha changes) without reclassifying:
    // toPrIntentRecord's `stale = !row.headSha || row.headSha !== pull.headSha`
    // must now read true on GET.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'newsha999' }).where(eq(t.pullRequests.id, pr.id));

    const staleCheck = (await builtApp.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(staleCheck.stale).toBe(true);
    // head_sha on the record is still the classified-at sha (row.headSha),
    // not the PR's new head_sha the update above just wrote.
    expect(staleCheck.head_sha).not.toBe('newsha999');

    await builtApp.close();
  });
});
