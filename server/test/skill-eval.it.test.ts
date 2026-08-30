import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
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

/** The sentence that identifies the WITH side: it can only reach a prompt through the skill body. */
const SKILL_MARKER = 'Removing a response field is a breaking change and must be reported.';
const SKILL_BODY = `# Breaking change gate\n\n${SKILL_MARKER}\n`;

/** The reference's own example: a TS type loses a field. */
const FILES = {
  path: 'snippet.ts',
  mode: 'modified' as const,
  before: 'export type UserResponse = {\n  id: string;\n  legacyId: string;\n  name: string;\n};\n',
  after: 'export type UserResponse = {\n  id: string;\n  name: string;\n};\n',
};

/** New-side line 3 survives the deletion, so a finding cited there grounds. */
const EXPECTED = [
  {
    severity: 'CRITICAL',
    category: 'security',
    title: 'Breaking change: response field removed',
    file: 'snippet.ts',
    start_line: 3,
    end_line: 3,
  },
];

const review = (findings: Review['findings']): Review => ({
  verdict: findings.length > 0 ? 'request_changes' : 'comment',
  summary: 'Reviewed the authored snippet.',
  score: findings.length > 0 ? 40 : 90,
  findings,
});

const FOUND = review([
  {
    id: 'f-breaking',
    severity: 'CRITICAL',
    category: 'security',
    title: 'Breaking change: response field removed',
    file: 'snippet.ts',
    start_line: 3,
    end_line: 3,
    rationale: 'Clients reading `legacyId` now receive `undefined`.',
    confidence: 0.95,
    kind: 'finding',
  },
]);
const NOT_FOUND = review([]);

type Side = 'with' | 'without';

/**
 * A provider that answers differently depending on whether the skill body
 * reached the prompt. `MockLLMProvider` cannot do this — its fixture is
 * per-app, not per-call — and the with/without difference is the whole feature.
 */
class SidedProvider implements LLMProvider {
  readonly id = 'openai' as const;
  public calls: { method: string; side: Side; payload: string }[] = [];
  private inner: Record<Side, MockLLMProvider>;

  constructor(
    fixtures: { with: Review; without: Review },
    private failOn?: Side,
  ) {
    this.inner = {
      with: new MockLLMProvider('openai', { structured: fixtures.with }),
      without: new MockLLMProvider('openai', { structured: fixtures.without }),
    };
  }

  listModels(): Promise<ModelInfo[]> {
    return this.inner.with.listModels();
  }
  complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.inner.with.complete(req);
  }
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const payload = JSON.stringify(req.messages ?? req);
    const side: Side = payload.includes(SKILL_MARKER) ? 'with' : 'without';
    this.calls.push({ method: 'completeStructured', side, payload });
    if (this.failOn === side) throw new Error(`provider exploded on the ${side} side`);
    return this.inner[side].completeStructured(req);
  }
}

let seq = 0;

d('L06 skill evals — the same case run with and without the skill (Testcontainers pg)', () => {
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
  function appWith(llm: LLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: llm },
      },
    });
  }

  async function makeAgent(name: string, enabled = true, prompt?: string): Promise<string> {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `${name}-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: prompt ?? 'You are a reviewer.',
        strategy: 'single-pass',
        enabled,
      })
      .returning();
    return agent!.id;
  }

  async function makeSkill(): Promise<string> {
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `breaking-change-gate-${seq++}`,
        description: 'Flags removed response fields.',
        type: 'convention',
        source: 'manual',
        body: SKILL_BODY,
      })
      .returning();
    return skill!.id;
  }

  async function link(agentId: string, skillId: string, order = 0, enabled = true) {
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order, enabled });
  }

  /** A skill linked to one enabled agent — the ordinary setup. */
  async function makeLinkedSkill(prompt?: string) {
    const agentId = await makeAgent('reviewer', true, prompt);
    const skillId = await makeSkill();
    await link(agentId, skillId);
    return { agentId, skillId };
  }

  type App = Awaited<ReturnType<typeof buildApp>>;

  async function addCase(app: App, skillId: string, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/eval-cases`,
      payload: {
        name: 'breaking-change-gate-field-removal-is-flagged',
        expectation: 'must_find',
        input_files: FILES,
        expected_output: EXPECTED,
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; input_diff: string };
  }

  async function runCase(app: App, caseId: string) {
    return app.inject({ method: 'POST', url: `/skill-eval-cases/${caseId}/run` });
  }

  // =========================================================================
  // The two calls
  // =========================================================================

  it('runs one case TWICE — one call carries the skill body and the other does not', async () => {
    const provider = new SidedProvider({ with: FOUND, without: NOT_FOUND });
    const app = await appWith(provider);
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const res = await runCase(app, created.id);
    expect(res.statusCode).toBe(200);

    const structured = provider.calls.filter((c) => c.method === 'completeStructured');
    // This is the single assertion that proves the feature is the feature.
    expect(structured).toHaveLength(2);
    expect(structured.filter((c) => c.payload.includes(SKILL_MARKER))).toHaveLength(1);
    expect(structured.filter((c) => !c.payload.includes(SKILL_MARKER))).toHaveLength(1);
  });

  // =========================================================================
  // The pass rule — rows 2 and 3 of the reference
  // =========================================================================

  it('row 2: found WITH the skill and absent WITHOUT it → passed', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const body = (await runCase(app, created.id)).json();
    expect(body.outcome).toBe('passed');
    expect(body.pass).toBe(true);
    expect(body.recall).toBe(1);
    expect(body.recall_without).toBe(0);
  });

  it('row 3: found WITH the skill and also without it → failed, at 100% / 100%', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId, { name: 'adversarial-suppress-positive' });

    const body = (await runCase(app, created.id)).json();
    // Both halves of `server/INSIGHTS.md:210-233`: the harness is behaving
    // correctly — linked skills change a finding's CONTENT, not its COUNT, so
    // an equally-findable defect returns the same recall on both sides — AND
    // the case correctly fails, because it has demonstrated nothing about the
    // skill. This is the outcome an author will hit most often.
    expect(body.recall).toBe(1);
    expect(body.recall_without).toBe(1);
    expect(body.outcome).toBe('failed');
    expect(body.pass).toBe(false);
  });

  it('a must_not_flag case is marked on the with-run alone, even when the without-run flags the range', async () => {
    const app = await appWith(new SidedProvider({ with: NOT_FOUND, without: FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId, {
      name: 'adversarial-hallucinate-negative',
      expectation: 'must_not_flag',
    });

    const body = (await runCase(app, created.id)).json();
    expect(body.outcome).toBe('passed');
    expect(body.recall).toBe(1);
    // Reported beside the mark, and not consulted by it.
    expect(body.recall_without).toBe(0);
  });

  it('a must_find case the agent misses even with the skill fails', async () => {
    const app = await appWith(new SidedProvider({ with: NOT_FOUND, without: NOT_FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const body = (await runCase(app, created.id)).json();
    expect(body.outcome).toBe('failed');
    expect(body.recall).toBe(0);
    expect(body.recall_without).toBe(0);
  });

  // =========================================================================
  // One side failing must not lose the other
  // =========================================================================

  it('a failed WITHOUT call on a must_find case is errored, not failed', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }, 'without'));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const body = (await runCase(app, created.id)).json();
    // An absent measurement, not a negative one: the pass rule needs both sides.
    expect(body.outcome).toBe('errored');
    expect(body.pass).toBeNull();
    // The with side survived the other side's failure.
    expect(body.recall).toBe(1);
    expect(body.recall_without).toBeNull();
    expect(body.failure_reason).toMatch(/exploded on the without side/);
    expect(body.actual_output.with.findings).toHaveLength(1);
    expect(body.actual_output.without.error).toMatch(/exploded on the without side/);
  });

  it('a failed WITHOUT call leaves a must_not_flag case marked as normal', async () => {
    const app = await appWith(new SidedProvider({ with: NOT_FOUND, without: FOUND }, 'without'));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId, { expectation: 'must_not_flag' });

    const body = (await runCase(app, created.id)).json();
    expect(body.outcome).toBe('passed');
    expect(body.recall).toBe(1);
    expect(body.recall_without).toBeNull();
  });

  it('a failed WITH call errors the case whatever the expectation', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: FOUND }, 'with'));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const body = (await runCase(app, created.id)).json();
    expect(body.outcome).toBe('errored');
    expect(body.recall).toBeNull();
    expect(body.failure_reason).toMatch(/exploded on the with side/);
  });

  // =========================================================================
  // Which agent the case runs on (decision 3)
  // =========================================================================

  it('the first enabled linked agent wins, and its name is on the case row', async () => {
    const provider = new SidedProvider({ with: FOUND, without: NOT_FOUND });
    const app = await appWith(provider);
    const skillId = await makeSkill();
    const first = await makeAgent('aaa-first', true, 'PROMPT-FIRST');
    const second = await makeAgent('zzz-second', true, 'PROMPT-SECOND');
    await link(first, skillId, 0);
    await link(second, skillId, 1);
    const created = await addCase(app, skillId);

    const rows = (await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })).json();
    expect(rows[0].agent_id).toBe(first);
    expect(rows[0].agent_name).toMatch(/^aaa-first/);

    expect((await runCase(app, created.id)).statusCode).toBe(200);
    // Proven at the prompt, not only in the response: both calls used the
    // resolved agent's own system prompt.
    expect(provider.calls.every((c) => c.payload.includes('PROMPT-FIRST'))).toBe(true);
    expect(provider.calls.some((c) => c.payload.includes('PROMPT-SECOND'))).toBe(false);
  });

  it('a disabled LINK is skipped, and so is an enabled link to a disabled agent', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const skillId = await makeSkill();
    const disabledLink = await makeAgent('aaa-disabled-link', true);
    const disabledAgent = await makeAgent('bbb-disabled-agent', false);
    const usable = await makeAgent('ccc-usable', true);
    await link(disabledLink, skillId, 0, false);
    await link(disabledAgent, skillId, 1, true);
    await link(usable, skillId, 2, true);

    const rows = (await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })).json();
    expect(rows).toEqual([]);
    const withCase = await addCase(app, skillId);
    const listed = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })
    ).json();
    expect(listed[0].id).toBe(withCase.id);
    // Resolving to an agent whose link is disabled would measure a prompt no
    // real review would ever send.
    expect(listed[0].agent_id).toBe(usable);
  });

  it('a skill linked to no enabled agent answers 422 and runs nothing', async () => {
    const provider = new SidedProvider({ with: FOUND, without: NOT_FOUND });
    const app = await appWith(provider);
    const skillId = await makeSkill();
    const created = await addCase(app, skillId);

    const res = await runCase(app, created.id);
    // 422 and not 404, and not an empty 200 — the tab renders the reason.
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/not linked to any enabled agent/);
    expect(provider.calls).toHaveLength(0);
  });

  // =========================================================================
  // Where the row lands
  // =========================================================================

  it('a skill run has batch_id NULL, enters no agent run history, and becomes the case last result', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { agentId, skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const body = (await runCase(app, created.id)).json();
    expect(body.batch_id ?? null).toBeNull();

    const rows = await pg.handle.db
      .select()
      .from(t.evalRuns)
      .where(eq(t.evalRuns.caseId, created.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.batchId).toBeNull();

    const history = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })
    ).json();
    expect(history).toEqual([]);

    const listed = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })
    ).json();
    expect(listed[0].last_run.id).toBe(body.id);
    expect(listed[0].last_run.recall_without).toBe(0);
    // Screen A renders these right-aligned on a case row.
    expect(listed[0].severity).toBe('CRITICAL');
    expect(listed[0].category).toBe('security');
  });

  it('a run is refused with 409 while the resolved agent has a set run in flight', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { agentId, skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);
    await pg.handle.db.insert(t.evalRunBatches).values({
      workspaceId,
      agentId,
      agentVersion: 1,
      systemPrompt: 'You are a reviewer.',
      progressTotal: 1,
      state: 'running',
    });

    expect((await runCase(app, created.id)).statusCode).toBe(409);
  });

  // =========================================================================
  // The generated diff
  // =========================================================================

  it('the stored diff is BUILT from input_files and parses back to the authored file', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const parsed = parseUnifiedDiff(created.input_diff);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe('snippet.ts');
    expect(created.input_diff).toContain('@@ ');
  });

  it('identical Before and After are refused at save time with 400, and no case is created', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { skillId } = await makeLinkedSkill();

    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/eval-cases`,
      payload: {
        name: 'empty-case',
        expectation: 'must_find',
        input_files: { ...FILES, after: FILES.before },
        expected_output: EXPECTED,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/identical/i);

    const listed = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })
    ).json();
    expect(listed).toEqual([]);
  });

  it('editing a case rebuilds its diff through the shared PUT route', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));
    const { skillId } = await makeLinkedSkill();
    const created = await addCase(app, skillId);

    const res = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${created.id}`,
      payload: {
        input_files: { ...FILES, after: 'export type UserResponse = {\n  id: string;\n};\n' },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().input_diff).not.toBe(created.input_diff);
    expect(parseUnifiedDiff(res.json().input_diff).files[0]!.deletions).toBe(2);
  });

  it('POST /eval-cases/preview-diff returns bytes that parse back to one file', async () => {
    const app = await appWith(new SidedProvider({ with: FOUND, without: NOT_FOUND }));

    const res = await app.inject({
      method: 'POST',
      url: '/eval-cases/preview-diff',
      payload: { ...FILES, mode: 'new', before: '', after: 'export const x = 1;\n' },
    });
    expect(res.statusCode).toBe(200);
    const parsed = parseUnifiedDiff(res.json().diff);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe('snippet.ts');
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toEqual([1]);
  });
});
