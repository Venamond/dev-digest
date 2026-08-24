import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-stats] Docker not available — skipping integration tests.');
}

/**
 * Skill stats: pull/accept rates over linked-agent runs ∪ run_skills, findings
 * windowed to 30 days, cascade delete of run_skills, workspace scoping.
 */
d('skills stats', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function fixtureAgentAndSkill(suffix: string) {
    const db = pg.handle.db;
    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `Stats Agent ${suffix}`,
        description: 'stats it',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
        enabled: true,
        version: 1,
      })
      .returning();
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `stats-skill-${suffix}`,
        description: 'for stats',
        type: 'rubric',
        source: 'manual',
        body: '# body\n',
        enabled: true,
        version: 1,
      })
      .returning();
    await db.insert(t.agentSkills).values({
      agentId: agent!.id,
      skillId: skill!.id,
      order: 0,
      enabled: true,
    });
    return { agent: agent!, skill: skill! };
  }

  it('aggregates pull_rate, accept_rate, agents, and findings_window_days', async () => {
    const db = pg.handle.db;
    const { agent, skill } = await fixtureAgentAndSkill(`main-${Date.now()}`);

    const [runPulled, runNotPulled] = await db
      .insert(t.agentRuns)
      .values([
        {
          workspaceId,
          agentId: agent.id,
          prId,
          status: 'completed',
          source: 'local',
          findingsCount: 2,
        },
        {
          workspaceId,
          agentId: agent.id,
          prId,
          status: 'completed',
          source: 'local',
          findingsCount: 0,
        },
      ])
      .returning();

    await db.insert(t.runSkills).values({
      runId: runPulled!.id,
      skillId: skill.id,
      skillVersion: 1,
    });

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: agent.id,
        runId: runPulled!.id,
        kind: 'review',
        verdict: 'comment',
        summary: 'stats fixture',
        score: 70,
        model: 'test',
      })
      .returning();

    const now = new Date();
    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'coverage',
        title: 'accepted finding',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: now,
      },
      {
        reviewId: review!.id,
        file: 'b.ts',
        startLine: 2,
        endLine: 2,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'dismissed finding',
        rationale: 'r',
        confidence: 0.8,
        dismissedAt: now,
      },
    ]);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toMatchObject({
      skill_id: skill.id,
      skill_name: skill.name,
      findings_window_days: 30,
      agent_count: 1,
      runs_total: 2,
      runs_pulled: 1,
      pull_rate: 0.5,
      accept_rate: 0.5,
      accepted: 1,
      dismissed: 1,
      pending: 0,
      findings_total: 2,
    });
    expect(stats.agents[0].name).toBe(agent.name);
    expect(runNotPulled).toBeTruthy();

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    const item = (list.json() as Array<{ id: string; pull_rate: number; accept_rate: number }>).find(
      (i) => i.id === skill.id,
    );
    expect(item).toMatchObject({ pull_rate: 0.5, accept_rate: 0.5 });
    await app.close();
  });

  it('excludes out-of-window findings but still counts the run toward pull_rate', async () => {
    const db = pg.handle.db;
    const { agent, skill } = await fixtureAgentAndSkill(`window-${Date.now()}`);

    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId,
        status: 'completed',
        source: 'local',
        findingsCount: 1,
      })
      .returning();

    await db.insert(t.runSkills).values({
      runId: run!.id,
      skillId: skill.id,
      skillVersion: 1,
    });

    const oldCreatedAt = new Date();
    oldCreatedAt.setUTCDate(oldCreatedAt.getUTCDate() - 45);

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId,
        agentId: agent.id,
        runId: run!.id,
        kind: 'review',
        verdict: 'comment',
        summary: 'old review',
        score: 50,
        model: 'test',
        createdAt: oldCreatedAt,
      })
      .returning();

    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'old.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'coverage',
      title: 'out of window',
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: oldCreatedAt,
    });

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.runs_total).toBe(1);
    expect(stats.runs_pulled).toBe(1);
    expect(stats.pull_rate).toBe(1);
    expect(stats.findings_total).toBe(0);
    expect(stats.accept_rate).toBeNull();
    await app.close();
  });

  it('404s for a skill in another workspace', async () => {
    const db = pg.handle.db;
    const [otherWs] = await db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: `foreign-skill-${Date.now()}`,
        description: 'other tenant',
        type: 'custom',
        source: 'manual',
        body: '# x\n',
        enabled: true,
        version: 1,
      })
      .returning();

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/skills/${foreign!.id}/stats` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'not_found', message: 'Skill not found' },
    });
    await app.close();
  });

  it('DELETE /skills/:id leaves no run_skills rows', async () => {
    const db = pg.handle.db;
    const { agent, skill } = await fixtureAgentAndSkill(`delete-${Date.now()}`);

    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId,
        status: 'completed',
        source: 'local',
      })
      .returning();

    await db.insert(t.runSkills).values({
      runId: run!.id,
      skillId: skill.id,
      skillVersion: 1,
    });

    const before = await db
      .select()
      .from(t.runSkills)
      .where(eq(t.runSkills.skillId, skill.id));
    expect(before).toHaveLength(1);

    const app = await makeApp();
    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);

    const after = await db
      .select()
      .from(t.runSkills)
      .where(eq(t.runSkills.skillId, skill.id));
    expect(after).toHaveLength(0);

    // Orphaned run remains; only the skill link is gone.
    const [stillRun] = await db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, run!.id));
    expect(stillRun).toBeTruthy();

    // Link cascade: agent_skills for this skill should be gone too.
    const links = await db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.skillId, skill.id)));
    expect(links).toHaveLength(0);
    await app.close();
  });
});
