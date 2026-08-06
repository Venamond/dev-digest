import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

d('Agent skills bind + prompt wiring', () => {
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
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('seed links four skills to Test Quality Reviewer', async () => {
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Test Quality Reviewer'));
    expect(agent).toBeTruthy();
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agent!.id));
    expect(links).toHaveLength(4);
    expect(links.every((l) => l.enabled)).toBe(true);
  });

  it('GET /agents/:id/skills returns editor rows (N of M pool)', async () => {
    const app = await makeApp();
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'Test Quality Reviewer'));

    const res = await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ linked: boolean; enabled: boolean; skill: { name: string } }>;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const linked = rows.filter((r) => r.linked);
    expect(linked).toHaveLength(4);
    expect(linked.every((r) => r.enabled)).toBe(true);
    expect(linked.map((r) => r.skill.name).sort()).toEqual(
      [
        'corner-case-checklist',
        'flaky-test-patterns',
        'happy-path-coverage-gap',
        'over-mocking-smell',
      ].sort(),
    );
    await app.close();
  });

  it('POST links with enabled=false; run trace omits that skill body', async () => {
    const app = await makeApp();

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `Skills Wire ${Date.now()}`,
        description: 'wiring test',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        enabled: true,
        version: 1,
      })
      .returning();

    const [onSkill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `on-skill-${Date.now()}`,
        description: 'enabled',
        type: 'rubric',
        source: 'manual',
        body: 'UNIQUE_SKILL_BODY_INCLUDED',
        enabled: true,
        version: 1,
      })
      .returning();
    const [offSkill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `off-skill-${Date.now()}`,
        description: 'disabled per-agent',
        type: 'rubric',
        source: 'manual',
        body: 'UNIQUE_SKILL_BODY_EXCLUDED',
        enabled: true,
        version: 1,
      })
      .returning();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent!.id}/skills`,
      payload: {
        links: [
          { skill_id: onSkill!.id, order: 0, enabled: true },
          { skill_id: offSkill!.id, order: 1, enabled: false },
        ],
      },
    });
    expect(set.statusCode).toBe(200);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `skills-wire-${Date.now()}`,
        fullName: `acme/skills-wire-${Date.now()}`,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Wire skills',
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
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent!.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const skillsBlock = trace.prompt_assembly?.skills as string | null;
    expect(skillsBlock).toBeTruthy();
    expect(skillsBlock).toContain('UNIQUE_SKILL_BODY_INCLUDED');
    expect(skillsBlock).not.toContain('UNIQUE_SKILL_BODY_EXCLUDED');

    await app.close();
  });

  it('global skills.enabled=false omits body even when link enabled', async () => {
    const app = await makeApp();

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `Skills Global Off ${Date.now()}`,
        description: 'wiring test',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        enabled: true,
        version: 1,
      })
      .returning();

    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `global-off-${Date.now()}`,
        description: 'global off',
        type: 'rubric',
        source: 'manual',
        body: 'UNIQUE_GLOBAL_OFF_BODY',
        enabled: false,
        version: 1,
      })
      .returning();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent!.id}/skills`,
      payload: { links: [{ skill_id: skill!.id, order: 0, enabled: true }] },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `global-off-${Date.now()}`,
        fullName: `acme/global-off-${Date.now()}`,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 2,
        title: 'Global off',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: 'def',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent!.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly?.skills).toBeNull();

    await app.close();
  });
});
