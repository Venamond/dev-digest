/**
 * S15/S16 — project-context documents at run time.
 *
 * A real Postgres, a real clone on disk and the REAL `SimpleGitClient`: the
 * point of this step is that a run reads bytes out of the working tree and
 * records the revision it read them at, and a mock git client proves neither.
 * Only the LLM is stubbed.
 *
 * Every assertion is made against the PERSISTED trace rather than a spy on the
 * engine, because that is also the artefact the trace drawer renders (AC-25,
 * AC-26, AC-32, AC-33).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import {
  SETTINGS_KEY_TOKEN_CEILING,
  DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING,
} from '../src/modules/context/constants.js';
import * as t from '../src/db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-run] Docker not available — skipping integration tests.');
}

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

/** ~1000 approx tokens (approxTokens is chars/4), so a low ceiling is easy to set. */
const BIG_DOC = `# huge\n\n${'x'.repeat(4000)}`;

d('Project context at run time', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let cloneDir: string;
  let clonePath: string;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;
  let skillId: string;
  let head: string;
  let prSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // `SimpleGitClient.clonePathFor` is `<cloneDir>/<owner>/<name>` — the repo
    // row's clone_path and the adapter's base must agree.
    cloneDir = await mkdtemp(join(tmpdir(), 'context-run-'));
    clonePath = join(cloneDir, 'acme', 'ctxrun');
    await mkdir(join(clonePath, 'specs'), { recursive: true });
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    await writeFile(join(clonePath, 'specs/first.md'), '# first\n\nNever log a secret.');
    await writeFile(join(clonePath, 'specs/second.md'), '# second\n\nAlways paginate.');
    await writeFile(join(clonePath, 'specs/huge.md'), BIG_DOC);
    await writeFile(join(clonePath, 'specs/gone.md'), '# gone\n\nDeleted before the run.');
    await writeFile(join(clonePath, 'docs/from-skill.md'), '# skill doc\n\nUse UTC everywhere.');

    const git = simpleGit(clonePath);
    await git.init();
    await git.addConfig('user.email', 'test@devdigest.local');
    await git.addConfig('user.name', 'DevDigest Test');
    await git.add('.');
    await git.commit('initial');
    head = (await git.revparse(['HEAD'])).trim();

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'ctxrun',
        fullName: 'acme/ctxrun',
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    repoId = repo!.id;

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Context Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'review',
        // Repo-intel off: this suite is about project context, and the
        // enrichment sections would only add noise to the assembled prompt.
        repoIntel: false,
      })
      .returning();
    agentId = agent!.id;

    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'ctx-skill',
        description: 'invariants',
        type: 'convention',
        source: 'manual',
        body: 'Flag anything that logs a secret.',
        enabled: true,
      })
      .returning();
    skillId = skill!.id;

    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEVDIGEST_CLONE_DIR: cloneDir,
    } as NodeJS.ProcessEnv);
    // Real git (it must read the clone and report its HEAD), stubbed LLM only.
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) } },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
    await pg.handle.db.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
    await pg.handle.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    await pg.handle.db
      .delete(t.settings)
      .where(eq(t.settings.key, SETTINGS_KEY_TOKEN_CEILING));
  });

  // ---- helpers -----------------------------------------------------------

  async function attach(paths: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths },
    });
    expect(res.statusCode).toBe(200);
  }

  async function setCeiling(tokens: number) {
    await pg.handle.db
      .insert(t.settings)
      .values({ workspaceId, key: SETTINGS_KEY_TOKEN_CEILING, value: tokens });
  }

  /** Queue a run against a fresh PR and return the trace it persisted. */
  async function runAndReadTrace(): Promise<RunTrace> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 100 + prSeq++,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db
      .insert(t.prFiles)
      .values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });

    const queued = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId },
    });
    expect(queued.statusCode).toBe(200);

    const runs = await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    const run = runs[0]!;
    expect(run.status, run.error ?? '').toBe('done');

    const [row] = await pg.handle.db
      .select()
      .from(t.runTraces)
      .where(eq(t.runTraces.runId, run.id));
    return row!.trace as RunTrace;
  }

  // ---- AC-19, AC-39: both documents, in the agent's order ------------------

  it('sends every attached document, in the agent’s order (AC-19, AC-39)', async () => {
    await attach(['specs/second.md', 'specs/first.md']);
    const trace = await runAndReadTrace();

    const specs = trace.prompt_assembly.specs ?? '';
    expect(specs).toContain('### specs/second.md');
    expect(specs).toContain('### specs/first.md');
    expect(specs).toContain('Always paginate.');
    expect(specs).toContain('Never log a secret.');
    // The human's order, not the walk's alphabetical one.
    expect(specs.indexOf('### specs/second.md')).toBeLessThan(specs.indexOf('### specs/first.md'));
    expect(trace.prompt_assembly.user).toContain('## Project context');

    // AC-25 / AC-33 — the trace names what was read and at which revision.
    expect(trace.specs_read).toEqual(['specs/second.md', 'specs/first.md']);
    expect(trace.specs_omitted ?? []).toEqual([]);
    expect(trace.specs_revision).toBe(head);
  });

  // ---- AC-22: an unreadable document is skipped, the run completes ---------

  it('skips a document deleted from the clone and still completes (AC-22, AC-25)', async () => {
    await attach(['specs/first.md', 'specs/gone.md']);
    await rm(join(clonePath, 'specs/gone.md'));
    try {
      const trace = await runAndReadTrace();

      expect(trace.specs_read).toEqual(['specs/first.md']);
      expect(trace.specs_omitted ?? []).toEqual([
        { path: 'specs/gone.md', reason: 'unreadable' },
      ]);
      expect(trace.prompt_assembly.specs ?? '').not.toContain('specs/gone.md');
      // A missing document is not a failed review.
      expect(trace.stats.grounding).toBeTruthy();
    } finally {
      await writeFile(join(clonePath, 'specs/gone.md'), '# gone\n\nDeleted before the run.');
    }
  });

  // ---- AC-23: the ceiling skips and CONTINUES ------------------------------

  it('skips a document that does not fit and still considers the ones after it (AC-23, AC-28)', async () => {
    // huge.md costs ~1000 tokens; first.md costs ~10. A ceiling of 100 leaves
    // no room for the first but plenty for the second — "stop here" would drop
    // both, which is exactly the regression this pins.
    await setCeiling(100);
    await attach(['specs/huge.md', 'specs/first.md']);
    const trace = await runAndReadTrace();

    expect(trace.specs_read).toEqual(['specs/first.md']);
    expect(trace.specs_omitted ?? []).toEqual([
      { path: 'specs/huge.md', reason: 'over_ceiling' },
    ]);
    const specs = trace.prompt_assembly.specs ?? '';
    expect(specs).toContain('### specs/first.md');
    // Never truncated — no fragment of the oversized document leaked in.
    expect(specs).not.toContain('### specs/huge.md');
    expect(specs).not.toContain('xxxx');
  });

  it('uses the 32 000-token default when the workspace sets no ceiling (AC-28)', async () => {
    expect(DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING).toBe(32_000);
    await attach(['specs/huge.md']);
    const trace = await runAndReadTrace();
    // ~1000 tokens against the default ceiling: it fits.
    expect(trace.specs_read).toEqual(['specs/huge.md']);
    expect(trace.specs_omitted ?? []).toEqual([]);
  });

  // ---- AC-20, AC-34, AC-40: inheritance ------------------------------------

  it('a document attached to the agent AND an enabled skill is sent once (AC-20, AC-34)', async () => {
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order: 0, enabled: true });
    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { repo_id: repoId, paths: ['specs/first.md', 'docs/from-skill.md'] },
    });
    await attach(['specs/first.md']);

    const trace = await runAndReadTrace();
    expect(trace.specs_read).toEqual(['specs/first.md', 'docs/from-skill.md']);
    const specs = trace.prompt_assembly.specs ?? '';
    expect(specs.match(/### specs\/first\.md/g)).toHaveLength(1);
    expect(specs).toContain('Use UTC everywhere.');
  });

  it('disabling the skill link removes only the skill’s documents (AC-40)', async () => {
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order: 0, enabled: false });
    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { repo_id: repoId, paths: ['docs/from-skill.md'] },
    });
    await attach(['specs/first.md']);

    const trace = await runAndReadTrace();
    expect(trace.specs_read).toEqual(['specs/first.md']);
    expect(trace.prompt_assembly.specs ?? '').not.toContain('docs/from-skill.md');
  });

  // ---- AC-32: nothing attached vs. attached-but-unusable -------------------

  it('sends no ## Project context section at all when nothing is attached (AC-32)', async () => {
    const trace = await runAndReadTrace();

    expect(trace.prompt_assembly.specs ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    // Both arrays empty is what "nothing attached" looks like…
    expect(trace.specs_read).toEqual([]);
    expect(trace.specs_omitted ?? []).toEqual([]);
    // …and no clone was read, so no revision is claimed.
    expect(trace.specs_revision ?? null).toBeNull();
  });

  it('an attached-but-unusable set is NOT the same state as nothing attached (AC-32)', async () => {
    await attach(['specs/gone.md']);
    await rm(join(clonePath, 'specs/gone.md'));
    try {
      const trace = await runAndReadTrace();
      expect(trace.specs_read).toEqual([]);
      // The distinguishing half: empty `specs_read`, NON-empty `specs_omitted`.
      expect(trace.specs_omitted ?? []).toEqual([
        { path: 'specs/gone.md', reason: 'unreadable' },
      ]);
      expect(trace.prompt_assembly.specs ?? null).toBeNull();
    } finally {
      await writeFile(join(clonePath, 'specs/gone.md'), '# gone\n\nDeleted before the run.');
    }
  });

  // ---- S16: the trace still lands BEFORE the status flips ------------------

  it('persists the project-context trace BEFORE the run reads as finished', async () => {
    // Same guarantee `reviews.it.test.ts` pins, re-asserted on the path that
    // now writes three more trace fields: a terminal `agent_runs.status` is a
    // promise that everything about the run — including what it read — is
    // already readable. Asserted as call ORDER, so a regression fails every
    // time instead of one run in two.
    const order: string[] = [];
    const traceSpy = vi
      .spyOn(ReviewRepository.prototype, 'saveRunTrace')
      .mockImplementation(async () => {
        order.push('trace');
      });
    const completeSpy = vi
      .spyOn(ReviewRepository.prototype, 'completeAgentRun')
      .mockImplementation(async () => {
        order.push('status');
      });

    try {
      await attach(['specs/first.md']);
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: 100 + prSeq++,
          title: 'Order',
          author: 'marisa.koch',
          branch: 'feat/order',
          base: 'main',
          headSha: 'a1b2c3d4',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'needs_review',
        })
        .returning();
      await pg.handle.db
        .insert(t.prFiles)
        .values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });

      await app.inject({
        method: 'POST',
        url: `/pulls/${pr!.id}/review`,
        payload: { agentId },
      });
      // Both spies are stubs, so no run row ever reaches a terminal status —
      // poll the recorded calls rather than the database.
      for (let i = 0; i < 200 && order.length < 2; i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(order).toEqual(['trace', 'status']);
    } finally {
      traceSpy.mockRestore();
      completeSpy.mockRestore();
    }
  });
});
