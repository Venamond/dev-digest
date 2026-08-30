import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A diff touching src/config.ts only — line 11 is the added line. */
const CONFIG_PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
/** A second file in the same PR — AC-5 asserts a seed does NOT pull it in. */
const OTHER_PATCH = '@@ -1,2 +1,3 @@\n import x;\n+const unrelated = 1;\n';

const unifiedDiff = (path: string, patch: string) =>
  [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');

/** One finding grounded on src/config.ts:11, one hallucinated on line 999. */
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
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/**
 * A provider that answers normally but throws for one specific case, so a
 * single batch can contain a provider failure AND cases that still ran (AC-43).
 * `MockLLMProvider` alone cannot do this: its fixture is per-app, not per-call.
 */
class SelectivelyThrowingProvider implements LLMProvider {
  readonly id = 'openai' as const;
  private inner = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
  constructor(private throwOnMarker: string) {}
  listModels(): Promise<ModelInfo[]> {
    return this.inner.listModels();
  }
  complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.inner.complete(req);
  }
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (JSON.stringify(req.messages ?? req).includes(this.throwOnMarker)) {
      throw new Error('provider exploded while reviewing this case');
    }
    return this.inner.completeStructured(req);
  }
}

let seq = 0;

d('L06 eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 180_000);
  afterAll(async () => {
    await pg?.stop();
  });

  /** Fresh app per test: the spend routes are rate-limited per app instance. */
  function appWith(llm: LLMProvider = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE })) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: unifiedDiff('src/config.ts', CONFIG_PATCH) }),
        llm: { openai: llm },
      },
    });
  }

  async function makeAgent(name: string): Promise<string> {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `${name}-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        enabled: false, // opt in per test; AC-48 enables the one agent it measures
      })
      .returning();
    return agent!.id;
  }

  /** A PR with two files, a review by `agentId`, and three findings on it. */
  async function makeReviewWithFindings(agentId: string) {
    const db = pg.handle.db;
    const n = seq++;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `api-${n}`, fullName: `acme/api-${n}` })
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
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/config.ts', patch: CONFIG_PATCH },
      { prId: pr!.id, path: 'src/other.ts', patch: OTHER_PATCH },
    ]);
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId, kind: 'review', verdict: 'comment' })
      .returning();
    const rows = await db
      .insert(t.findings)
      .values([
        {
          reviewId: review!.id,
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          startLine: 11,
          endLine: 11,
          rationale: 'A live Stripe key is committed.',
          confidence: 0.9,
          dismissedAt: new Date(),
        },
        {
          reviewId: review!.id,
          severity: 'WARNING',
          category: 'bug',
          title: 'Missing null check',
          file: 'src/config.ts',
          startLine: 11,
          endLine: 12,
          rationale: 'x may be undefined.',
          confidence: 0.8,
          acceptedAt: new Date(),
        },
        {
          reviewId: review!.id,
          severity: 'SUGGESTION',
          category: 'style',
          title: 'Prefer const',
          file: 'src/config.ts',
          startLine: 11,
          endLine: 11,
          rationale: 'let is never reassigned.',
          confidence: 0.6,
        },
      ])
      .returning();
    return { dismissed: rows[0]!, accepted: rows[1]!, undecided: rows[2]! };
  }

  async function addCase(
    app: Awaited<ReturnType<typeof buildApp>>,
    agentId: string,
    body: Record<string, unknown>,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: {
        name: 'case',
        expectation: 'must_find',
        input_diff: unifiedDiff('src/config.ts', CONFIG_PATCH),
        expected_output: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
        ...body,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  /** Poll the batch until it leaves `running` — the run is fire-and-forget. */
  async function awaitBatch(app: Awaited<ReturnType<typeof buildApp>>, runId: string) {
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      if (res.statusCode === 200) {
        const body = res.json() as { batch: { state: string } };
        if (body.batch.state !== 'running') return res.json();
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('batch never left the running state');
  }

  // =========================================================================
  // Seeding a case from a real finding
  // =========================================================================

  it('AC-2/AC-4/AC-5: a dismissed finding seeds a must_not_flag case owned by the review agent, over its own file only', async () => {
    const app = await appWith();
    const agentId = await makeAgent('seeder');
    const { dismissed } = await makeReviewWithFindings(agentId);

    const res = await app.inject({ method: 'GET', url: `/findings/${dismissed.id}/eval-seed` });
    expect(res.statusCode).toBe(200);
    const seedBody = res.json();

    expect(seedBody.expectation).toBe('must_not_flag');
    expect(seedBody.assertion).toMatch(/MUST NOT comment on src\/config\.ts:11/);
    expect(seedBody.name).toBe('no-hardcoded-stripe-secret-key');
    // AC-4 — the case belongs to the agent that produced the finding.
    expect(seedBody.owner_id).toBe(agentId);
    expect(seedBody.seeded_from).toEqual({ finding_id: dismissed.id, disposition: 'dismissed' });
    // AC-5 — the finding's own file, and no other file of that PR.
    expect(seedBody.input_diff).toContain('src/config.ts');
    expect(seedBody.input_diff).not.toContain('src/other.ts');
    expect(seedBody.existing_case_id ?? null).toBeNull();
  });

  it('AC-3: an accepted finding AND a still-undecided one both seed must_find', async () => {
    const app = await appWith();
    const agentId = await makeAgent('seeder');
    const { accepted, undecided } = await makeReviewWithFindings(agentId);

    for (const finding of [accepted, undecided]) {
      const res = await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-seed` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.expectation).toBe('must_find');
      expect(body.assertion).toMatch(/^MUST find/);
    }
  });

  it('AC-65: the seed reports the existing case once one was created from that finding', async () => {
    const app = await appWith();
    const agentId = await makeAgent('seeder');
    const { dismissed } = await makeReviewWithFindings(agentId);

    const first = (await app.inject({ method: 'GET', url: `/findings/${dismissed.id}/eval-seed` })).json();
    const created = await addCase(app, agentId, {
      name: first.name,
      expectation: first.expectation,
      input_diff: first.input_diff,
      expected_output: first.expected_output,
      seeded_from: first.seeded_from,
    });

    const second = (await app.inject({ method: 'GET', url: `/findings/${dismissed.id}/eval-seed` })).json();
    expect(second.existing_case_id).toBe(created.id);
  });

  it('AC-4/AC-6: a created case appears in the agent case set', async () => {
    const app = await appWith();
    const agentId = await makeAgent('lister');
    const created = await addCase(app, agentId, { name: 'must-find-secret' });

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(res.statusCode).toBe(200);
    const cases = res.json();
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe(created.id);
    expect(cases[0].owner_id).toBe(agentId);
    expect(cases[0].last_run).toBeNull();
  });

  it('AC-34: an expected_output that is not valid JSON is a 400, not a stored row', async () => {
    const app = await appWith();
    const agentId = await makeAgent('validator');
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: { name: 'broken', expectation: 'must_find', expected_output: '{ not json' },
    });
    expect(res.statusCode).toBe(400);
    const listed = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json();
    expect(listed).toHaveLength(0);
  });

  // =========================================================================
  // Set runs
  // =========================================================================

  it('AC-11/AC-12/AC-32/AC-37/AC-41: the batch pins the prompt it ran, and a later prompt edit leaves it untouched', async () => {
    const app = await appWith();
    const agentId = await makeAgent('runner');
    await addCase(app, agentId, { name: 'must-find-secret' });
    await addCase(app, agentId, {
      name: 'no-secret',
      expectation: 'must_not_flag',
      expected_output: [{ file: 'src/other.ts', start_line: 2, end_line: 2 }],
    });

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(started.statusCode).toBe(200);
    const { run_id, cases_total } = started.json();
    expect(cases_total).toBe(2);

    // AC-37/AC-41 — the response returned while the batch was still running.
    const immediately = (await app.inject({ method: 'GET', url: `/eval-runs/${run_id}` })).json();
    expect(['running', 'complete', 'partial']).toContain(immediately.batch.state);

    const detail = (await awaitBatch(app, run_id)) as {
      batch: Record<string, unknown>;
      results: { batch_id: string; outcome: string }[];
    };
    expect(detail.batch.state).toBe('complete');
    expect(detail.batch.agent_version).toBe(1);
    expect(detail.batch.system_prompt).toBe('You are a reviewer.');
    // AC-11 — every case row of the batch shares its batch id.
    expect(detail.results).toHaveLength(2);
    expect(new Set(detail.results.map((r) => r.batch_id))).toEqual(new Set([run_id]));

    // AC-12/AC-32 — edit the agent's prompt, then read the run back.
    const patched = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: 'A completely different prompt.' },
    });
    expect(patched.statusCode).toBe(200);
    const after = (await app.inject({ method: 'GET', url: `/eval-runs/${run_id}` })).json();
    expect(after.batch).toEqual(detail.batch);
  });

  it('AC-42: a second set run and a trial are both refused with the stated reason while one is in flight', async () => {
    const app = await appWith(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE, delayMs: 400 }));
    const agentId = await makeAgent('conflict');
    const c = await addCase(app, agentId, { name: 'must-find-secret' });

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(started.statusCode).toBe(200);

    const second = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.message).toMatch(/already in progress/i);

    const trial = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(trial.statusCode).toBe(409);
    expect(trial.json().error.message).toMatch(/already in progress/i);

    await awaitBatch(app, started.json().run_id);
  });

  it('AC-43/AC-45: an unparseable diff and a throwing provider each fail one case; the batch still finishes as partial', async () => {
    const app = await appWith(new SelectivelyThrowingProvider('BOOM_MARKER'));
    const agentId = await makeAgent('resilient');
    await addCase(app, agentId, { name: 'a-good-case' });
    await addCase(app, agentId, { name: 'b-unparseable', input_diff: 'this is not a diff at all' });
    await addCase(app, agentId, {
      name: 'c-provider-throws',
      input_diff: unifiedDiff('BOOM_MARKER.ts', CONFIG_PATCH),
      expected_output: [{ file: 'BOOM_MARKER.ts', start_line: 11, end_line: 11 }],
    });

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const detail = (await awaitBatch(app, started.json().run_id)) as {
      batch: { state: string; traces_produced: number; cases_total: number };
      results: { case_name: string; outcome: string; failure_reason: string | null }[];
    };

    expect(detail.batch.state).toBe('partial');
    const byName = new Map(detail.results.map((r) => [r.case_name, r]));
    expect(byName.get('a-good-case')!.outcome).toBe('passed');
    expect(byName.get('b-unparseable')!.outcome).toBe('errored');
    expect(byName.get('b-unparseable')!.failure_reason).toMatch(/could not be parsed/i);
    expect(byName.get('c-provider-throws')!.outcome).toBe('errored');
    expect(byName.get('c-provider-throws')!.failure_reason).toMatch(/exploded/);
    // AC-45 — one of three produced output, and the caption reads it as such.
    expect(detail.batch.traces_produced).toBe(1);
    expect(detail.batch.cases_total).toBe(3);
  });

  it('AC-10: one LLM call per case, on the agent own provider and model', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith(llm);
    const agentId = await makeAgent('counter');
    await addCase(app, agentId, { name: 'one' });
    await addCase(app, agentId, { name: 'two' });

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    await awaitBatch(app, started.json().run_id);

    const structured = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structured).toHaveLength(2);
    for (const call of structured) {
      expect((call.req as { model: string }).model).toBe('gpt-4.1');
    }
  });

  it('AC-62/AC-63: a trial writes a batch-less row, stays out of run history, and becomes the case last result', async () => {
    const app = await appWith();
    const agentId = await makeAgent('trial');
    const c = await addCase(app, agentId, { name: 'must-find-secret' });

    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    await awaitBatch(app, started.json().run_id);

    const historyBefore = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })).json();
    expect(historyBefore).toHaveLength(1);

    const trial = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(trial.statusCode).toBe(200);
    const trialRun = trial.json();
    expect(trialRun.batch_id ?? null).toBeNull();

    // AC-62 — the trial added no row to the agent's run history.
    const historyAfter = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })).json();
    expect(historyAfter).toHaveLength(1);

    const batchless = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.caseId, c.id), isNull(t.evalRuns.batchId)));
    expect(batchless).toHaveLength(1);

    // AC-63 — the case's last result is the trial's, not the set run's.
    const cases = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json();
    expect(cases[0].last_run.id).toBe(trialRun.id);
  });

  it('AC-36: deleting a case removes its eval_runs rows', async () => {
    const app = await appWith();
    const agentId = await makeAgent('deleter');
    const c = await addCase(app, agentId, { name: 'doomed' });
    const started = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    await awaitBatch(app, started.json().run_id);

    const before = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c.id));
    expect(before.length).toBeGreaterThan(0);

    const deleted = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
    expect(deleted.statusCode).toBe(200);

    const after = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c.id));
    expect(after).toHaveLength(0);
  });

  it('AC-48: run-all starts one batch per enabled agent that has cases, and skips one already running', async () => {
    const app = await appWith(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE, delayMs: 300 }));
    const withCases = await makeAgent('run-all-with-cases');
    const withoutCases = await makeAgent('run-all-without-cases');
    await pg.handle.db
      .update(t.agents)
      .set({ enabled: true })
      .where(eq(t.agents.id, withCases));
    await pg.handle.db
      .update(t.agents)
      .set({ enabled: true })
      .where(eq(t.agents.id, withoutCases));
    await addCase(app, withCases, { name: 'must-find-secret' });

    const first = await app.inject({ method: 'POST', url: '/eval-runs/all' });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.runs.map((r: { agent_id: string }) => r.agent_id)).toContain(withCases);
    expect(firstBody.skipped.map((s: { agent_id: string }) => s.agent_id)).toContain(withoutCases);

    // A second call while that batch is in flight skips it with its reason.
    const second = await app.inject({ method: 'POST', url: '/eval-runs/all' });
    const skipped = second
      .json()
      .skipped.find((s: { agent_id: string }) => s.agent_id === withCases);
    expect(skipped.reason).toMatch(/already in progress/i);

    await awaitBatch(app, firstBody.runs.find((r: { agent_id: string }) => r.agent_id === withCases).run_id);
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, withCases));
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, withoutCases));
  });

  it('an agent with no cases answers 422 with the stated reason and creates no batch', async () => {
    const app = await appWith();
    const agentId = await makeAgent('empty');
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/no eval cases/i);

    const history = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })).json();
    expect(history).toHaveLength(0);
  });

  it('an unknown run id answers 404, never a 200 with a blank body', async () => {
    const app = await appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/eval-runs/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('AC-47: an agent that has never run reports null metrics, not zeros', async () => {
    const app = await appWith();
    const agentId = await makeAgent('never-run');
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-dashboard` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(body.runs).toHaveLength(0);
    expect(body.cases_total).toBe(0);
  });

  it('AC-64: the overview reports an agent real case count before it has ever run', async () => {
    const app = await appWith();
    const agentId = await makeAgent('authored-not-run');
    await addCase(app, agentId, { name: 'case-a' });
    await addCase(app, agentId, { name: 'case-b' });

    const res = await app.inject({ method: 'GET', url: '/eval-dashboard' });
    expect(res.statusCode).toBe(200);
    const row = (res.json() as { agents: { agent_id: string; latest: unknown; cases_total: number }[] })
      .agents.find((a) => a.agent_id === agentId);
    // No batch exists yet, so the count cannot come from one — the spend
    // estimate on `Run all agents` would otherwise read zero.
    expect(row?.latest).toBeNull();
    expect(row?.cases_total).toBe(2);
  });
});
