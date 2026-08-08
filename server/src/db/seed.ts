import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { SEED_SKILLS, API_CONTRACT_SEED_SKILLS } from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, five built-in agents (General + Security + Performance +
 * Test Quality + API Contract), Test Quality skills, three API Contract skills
 * (import \`deprecation-policy\` from docs/skills/ separately), and demo
 * Test Quality agent_runs / run_skills / findings for skill Stats cards.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (starter presets + Test Quality) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Reviews test diffs for coverage gaps, over-mocking, corner cases, and flaky patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description:
        'Finds breaking API changes, response-schema drift, semver gaps, and silent deprecations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- Test Quality skills (idempotent by name) + link to Test Quality agent ----
  const skillIds: string[] = [];
  for (const def of SEED_SKILLS) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, def.name)));
    if (existing) {
      skillIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: def.name,
        description: def.description,
        type: def.type,
        source: 'manual',
        body: def.body,
        enabled: true,
        version: 1,
      })
      .returning();
    skillIds.push(row!.id);
    await db
      .insert(t.skillVersions)
      .values({ skillId: row!.id, version: 1, body: def.body })
      .onConflictDoNothing();
  }

  const [testQuality] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (testQuality) {
    for (let order = 0; order < skillIds.length; order++) {
      await db
        .insert(t.agentSkills)
        .values({
          agentId: testQuality.id,
          skillId: skillIds[order]!,
          order,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order, enabled: true },
        });
    }
  }

  // ---- API Contract skills (3 seeded; import deprecation-policy from docs/skills/) ----
  const apiSkillIds: string[] = [];
  for (const def of API_CONTRACT_SEED_SKILLS) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, def.name)));
    if (existing) {
      apiSkillIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: def.name,
        description: def.description,
        type: def.type,
        source: 'manual',
        body: def.body,
        enabled: true,
        version: 1,
      })
      .returning();
    apiSkillIds.push(row!.id);
    await db
      .insert(t.skillVersions)
      .values({ skillId: row!.id, version: 1, body: def.body })
      .onConflictDoNothing();
  }

  const [apiContract] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'API Contract Reviewer')));
  if (apiContract) {
    for (let order = 0; order < apiSkillIds.length; order++) {
      await db
        .insert(t.agentSkills)
        .values({
          agentId: apiContract.id,
          skillId: apiSkillIds[order]!,
          order,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order, enabled: true },
        });
    }
  }

  // ---- Demo skill-stats runs (idempotent: skip when a seed run_skills row exists) ----
  await seedSkillStatsDemo(db, {
    workspaceId,
    prId: pr!.id,
    testQualityAgentId: testQuality?.id,
    skillIds,
  });

  return { workspaceId, userId };
}

/**
 * Seed a handful of completed Test Quality runs + run_skills + findings so the
 * Skills Lab Stats tab and list-card pull/accept rates are non-empty. Pull
 * frequency is intentionally < 100% (skills recorded on a subset of runs).
 * Skips when any of the Test Quality seed skills already has a run_skills row.
 */
async function seedSkillStatsDemo(
  db: Db,
  args: {
    workspaceId: string;
    prId: string;
    testQualityAgentId: string | undefined;
    skillIds: string[];
  },
): Promise<void> {
  const { workspaceId, prId, testQualityAgentId, skillIds } = args;
  if (!testQualityAgentId || skillIds.length === 0) return;

  const [already] = await db
    .select({ runId: t.runSkills.runId })
    .from(t.runSkills)
    .where(eq(t.runSkills.skillId, skillIds[0]!))
    .limit(1);
  if (already) return;

  const [happyPath, cornerCase, overMocking, flaky] = skillIds;
  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - offset);
    return d;
  };

  const runRows = await db
    .insert(t.agentRuns)
    .values([
      {
        workspaceId,
        agentId: testQualityAgentId,
        prId,
        ranAt: day(1),
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        durationMs: 4200,
        tokensIn: 1800,
        tokensOut: 400,
        status: 'completed',
        source: 'local',
        findingsCount: 3,
        score: 72,
        costUsd: 0.012,
      },
      {
        workspaceId,
        agentId: testQualityAgentId,
        prId,
        ranAt: day(3),
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        durationMs: 3900,
        tokensIn: 1600,
        tokensOut: 350,
        status: 'completed',
        source: 'local',
        findingsCount: 2,
        score: 78,
        costUsd: 0.01,
      },
      {
        workspaceId,
        agentId: testQualityAgentId,
        prId,
        ranAt: day(5),
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        durationMs: 3100,
        tokensIn: 1400,
        tokensOut: 280,
        status: 'completed',
        source: 'local',
        findingsCount: 1,
        score: 85,
        costUsd: 0.008,
      },
      {
        workspaceId,
        agentId: testQualityAgentId,
        prId,
        ranAt: day(7),
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        durationMs: 2800,
        tokensIn: 1200,
        tokensOut: 200,
        status: 'completed',
        source: 'local',
        findingsCount: 0,
        score: 90,
        costUsd: 0.006,
      },
    ])
    .returning();

  // Subset of runs pull skills → pull frequency < 100% on list cards.
  // run0: happy-path + corner-case; run1: happy-path + flaky; run2: over-mocking; run3: none
  const pullPlan: Array<{ runIdx: number; skillId: string | undefined }> = [
    { runIdx: 0, skillId: happyPath },
    { runIdx: 0, skillId: cornerCase },
    { runIdx: 1, skillId: happyPath },
    { runIdx: 1, skillId: flaky },
    { runIdx: 2, skillId: overMocking },
  ];
  await db.insert(t.runSkills).values(
    pullPlan
      .filter((p): p is { runIdx: number; skillId: string } => !!p.skillId)
      .map((p) => ({
        runId: runRows[p.runIdx]!.id,
        skillId: p.skillId,
        skillVersion: 1,
      })),
  );

  const [review0] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId: testQualityAgentId,
      runId: runRows[0]!.id,
      kind: 'review',
      verdict: 'comment',
      summary: 'Seeded Test Quality review with mixed finding dispositions.',
      score: 72,
      model: DEFAULT_MODEL,
      createdAt: day(1),
    })
    .returning();
  const [review1] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId: testQualityAgentId,
      runId: runRows[1]!.id,
      kind: 'review',
      verdict: 'comment',
      summary: 'Seeded follow-up Test Quality review.',
      score: 78,
      model: DEFAULT_MODEL,
      createdAt: day(3),
    })
    .returning();

  await db.insert(t.findings).values([
    {
      reviewId: review0!.id,
      file: 'src/api/users.test.ts',
      startLine: 40,
      endLine: 55,
      severity: 'WARNING',
      category: 'coverage',
      title: 'Happy-path-only coverage for error branch',
      rationale: 'Reject path in handler is never asserted.',
      suggestion: 'Add a test that expects 4xx when validation fails.',
      confidence: 0.91,
      acceptedAt: day(1),
    },
    {
      reviewId: review0!.id,
      file: 'src/api/webhooks.test.ts',
      startLine: 12,
      endLine: 20,
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Missing empty-input case',
      rationale: 'New parser accepts empty body but tests omit it.',
      suggestion: 'Cover empty and whitespace-only bodies.',
      confidence: 0.8,
      dismissedAt: day(0),
    },
    {
      reviewId: review0!.id,
      file: 'src/middleware/ratelimit.test.ts',
      startLine: 88,
      endLine: 100,
      severity: 'WARNING',
      category: 'flaky',
      title: 'Bare setTimeout wait in new test',
      rationale: 'Sleep-based wait is order-sensitive under load.',
      suggestion: 'Wait on a condition or use fake timers.',
      confidence: 0.88,
      // pending — neither accepted nor dismissed
    },
    {
      reviewId: review1!.id,
      file: 'src/api/users.test.ts',
      startLine: 70,
      endLine: 90,
      severity: 'WARNING',
      category: 'over-mocking',
      title: 'Mock hides real Zod contract',
      rationale: 'Stub return shape drifts from schema.',
      suggestion: 'Assert against parsed schema output.',
      confidence: 0.87,
      acceptedAt: day(2),
    },
    {
      reviewId: review1!.id,
      file: 'src/api/public/webhooks.test.ts',
      startLine: 33,
      endLine: 40,
      severity: 'SUGGESTION',
      category: 'coverage',
      title: 'Boundary off-by-one on rate limit',
      rationale: 'Max-bucket case untested.',
      suggestion: 'Add a case at the exact limit.',
      confidence: 0.75,
      dismissedAt: day(2),
    },
  ]);
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
