/**
 * S6 — `ContextRepository.usedByAgents`, the EFFECTIVE agent set per document.
 *
 * A real Postgres, because the whole point is the join across
 * `agent_context_docs` / `skill_context_docs` / `agent_skills` / `skills` and
 * the two enable switches — none of which a mock would prove.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ContextRepository } from '../src/modules/context/repository.js';
import {
  DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING,
  DEFAULT_ROOTS,
  SETTINGS_KEY_SEARCH_ROOTS,
  SETTINGS_KEY_TOKEN_CEILING,
} from '../src/modules/context/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-used-by] Docker not available — skipping integration tests.');
}

const DOC = 'specs/invariants.md';
const OTHER = 'docs/nobody.md';

d('ContextRepository', () => {
  let pg: PgFixture;
  let repo: ContextRepository;
  let workspaceId: string;
  let repoId: string;
  let agentX: string;
  let agentY: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new ContextRepository(pg.handle.db);

    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'used-by',
        fullName: 'acme/used-by',
        defaultBranch: 'main',
        clonePath: '/tmp/acme-used-by',
      })
      .returning();
    repoId = r!.id;

    const agentValues = {
      workspaceId,
      provider: 'openai' as const,
      model: 'gpt-4.1',
      systemPrompt: 'review',
    };
    const [x] = await pg.handle.db
      .insert(t.agents)
      .values({ ...agentValues, name: 'Used-By X' })
      .returning();
    const [y] = await pg.handle.db
      .insert(t.agents)
      .values({ ...agentValues, name: 'Used-By Y' })
      .returning();
    agentX = x!.id;
    agentY = y!.id;

    const [s] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'used-by-skill',
        description: 'shared invariants',
        type: 'convention',
        source: 'manual',
        body: 'body',
      })
      .returning();
    skillId = s!.id;

    // The document is attached to X directly AND to the skill, which is linked
    // to both X and Y. X therefore reaches it twice — it must still appear once.
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values({ agentId: agentX, repoId, path: DOC, order: 0 });
    await pg.handle.db
      .insert(t.skillContextDocs)
      .values({ skillId, repoId, path: DOC, order: 0 });
    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: agentX, skillId, order: 0, enabled: true },
      { agentId: agentY, skillId, order: 0, enabled: true },
    ]);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    // Both switches back on before each case.
    await pg.handle.db
      .update(t.agentSkills)
      .set({ enabled: true })
      .where(eq(t.agentSkills.skillId, skillId));
    await pg.handle.db
      .update(t.skills)
      .set({ enabled: true })
      .where(eq(t.skills.id, skillId));
  });

  it('counts an agent reached both ways once, with via:"agent" winning (AC-8, AC-35)', async () => {
    const map = await repo.usedByAgents(workspaceId, repoId, [DOC]);
    const users = map.get(DOC) ?? [];

    expect(users).toHaveLength(2);
    expect(new Set(users.map((u) => u.agent_id)).size).toBe(2);

    const x = users.find((u) => u.agent_id === agentX)!;
    expect(x.via).toBe('agent');
    expect(x.skill_id ?? null).toBeNull();

    const y = users.find((u) => u.agent_id === agentY)!;
    expect(y.via).toBe('skill');
    expect(y.skill_id).toBe(skillId);
    expect(y.skill_name).toBe('used-by-skill');
  });

  it('drops the inherited agent when the agent_skills link is disabled', async () => {
    await pg.handle.db
      .update(t.agentSkills)
      .set({ enabled: false })
      .where(and(eq(t.agentSkills.agentId, agentY), eq(t.agentSkills.skillId, skillId)));

    const users = (await repo.usedByAgents(workspaceId, repoId, [DOC])).get(DOC) ?? [];
    expect(users.map((u) => u.agent_id)).toEqual([agentX]);
    // X keeps it: its own direct attachment is not a skill inheritance.
    expect(users[0]!.via).toBe('agent');
  });

  it('drops it again when skills.enabled is off instead of the link', async () => {
    await pg.handle.db
      .update(t.skills)
      .set({ enabled: false })
      .where(eq(t.skills.id, skillId));

    const users = (await repo.usedByAgents(workspaceId, repoId, [DOC])).get(DOC) ?? [];
    expect(users.map((u) => u.agent_id)).toEqual([agentX]);
  });

  it('has NO entry for a document nobody uses — the caller must default it', async () => {
    const map = await repo.usedByAgents(workspaceId, repoId, [DOC, OTHER]);

    // The trap this test exists for: a Map has no key for an unused document,
    // so `map.get(OTHER)` is undefined, NOT []. Defaulting belongs in the
    // service, before the DTO mapper — `?? null` inside the mapper is what once
    // reported `null` where a list response promised a number.
    expect(map.has(OTHER)).toBe(false);
    expect(map.get(OTHER)).toBeUndefined();
    expect(map.get(OTHER) ?? []).toEqual([]);
    expect((map.get(OTHER) ?? []).length).toBe(0);
  });

  it('returns an empty map for an empty path list without querying', async () => {
    expect((await repo.usedByAgents(workspaceId, repoId, [])).size).toBe(0);
  });

  it('does not leak attachments from another workspace', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-used-by' })
      .returning();
    expect((await repo.usedByAgents(otherWs!.id, repoId, [DOC])).size).toBe(0);
    expect(await repo.getRepo(otherWs!.id, repoId)).toBeUndefined();
    await pg.handle.db.delete(t.workspaces).where(eq(t.workspaces.id, otherWs!.id));
  });

  it('getRepo is workspace-scoped and carries clone_path', async () => {
    const row = await repo.getRepo(workspaceId, repoId);
    expect(row?.clonePath).toBe('/tmp/acme-used-by');
  });

  it('falls back to the defaults, then honours a settings override', async () => {
    expect(await repo.readRoots(workspaceId)).toEqual([...DEFAULT_ROOTS]);
    expect(await repo.readCeiling(workspaceId)).toBe(DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING);

    await pg.handle.db.insert(t.settings).values([
      { workspaceId, key: SETTINGS_KEY_SEARCH_ROOTS, value: ['adr', 'rfc'] },
      { workspaceId, key: SETTINGS_KEY_TOKEN_CEILING, value: 4000 },
    ]);
    expect(await repo.readRoots(workspaceId)).toEqual(['adr', 'rfc']);
    expect(await repo.readCeiling(workspaceId)).toBe(4000);

    // A malformed value must not take the feature down — fall back, don't throw.
    await pg.handle.db
      .update(t.settings)
      .set({ value: 'specs' })
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, SETTINGS_KEY_SEARCH_ROOTS),
        ),
      );
    await pg.handle.db
      .update(t.settings)
      .set({ value: -1 })
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, SETTINGS_KEY_TOKEN_CEILING),
        ),
      );
    expect(await repo.readRoots(workspaceId)).toEqual([...DEFAULT_ROOTS]);
    expect(await repo.readCeiling(workspaceId)).toBe(DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING);

    await pg.handle.db
      .delete(t.settings)
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, SETTINGS_KEY_SEARCH_ROOTS),
        ),
      );
    await pg.handle.db
      .delete(t.settings)
      .where(
        and(
          eq(t.settings.workspaceId, workspaceId),
          eq(t.settings.key, SETTINGS_KEY_TOKEN_CEILING),
        ),
      );
  });
});
