import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-attachments] Docker not available — skipping integration tests.');
}

/**
 * AC-31 — deleting a repository removes every project-context attachment that
 * pointed at it, and re-adding a repository with the SAME `full_name` (a new
 * uuid) does not resurrect them. The proof that the hand-written migration
 * `0017_project_context_attachments.sql` runs at all is that this file's
 * queries resolve: testcontainers applies the whole chain to a fresh Postgres.
 */
d('project-context attachments cascade with the repo', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    agentId = agent!.id;
    const [skill] = await pg.handle.db.select().from(t.skills).limit(1);
    skillId = skill!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function addRepo(): Promise<string> {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'context-cascade',
        fullName: 'acme/context-cascade',
        defaultBranch: 'main',
        clonePath: '/tmp/acme-context-cascade',
      })
      .returning();
    return repo!.id;
  }

  it('drops both tables’ rows when the repo goes, and a same-name repo starts empty', async () => {
    const repoId = await addRepo();

    await pg.handle.db.insert(t.agentContextDocs).values([
      { agentId, repoId, path: 'specs/api.md', order: 0 },
      { agentId, repoId, path: 'docs/api.md', order: 1 },
    ]);
    await pg.handle.db
      .insert(t.skillContextDocs)
      .values([{ skillId, repoId, path: 'insights/perf.md', order: 0 }]);

    const attached = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.repoId, repoId));
    expect(attached).toHaveLength(2);
    // The composite PK stores the human's order, and only the path — never text.
    expect(attached.map((r) => r.path).sort()).toEqual(['docs/api.md', 'specs/api.md']);

    // A path repeated in the same list is unrepresentable, not merely rejected.
    await expect(
      pg.handle.db
        .insert(t.agentContextDocs)
        .values({ agentId, repoId, path: 'specs/api.md', order: 5 }),
    ).rejects.toThrow();

    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));

    expect(
      await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.repoId, repoId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db
        .select()
        .from(t.skillContextDocs)
        .where(eq(t.skillContextDocs.repoId, repoId)),
    ).toHaveLength(0);

    // Same full_name, new row: the attachments must NOT come back with it.
    const reAddedId = await addRepo();
    expect(reAddedId).not.toBe(repoId);
    expect(
      await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.repoId, reAddedId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db
        .select()
        .from(t.skillContextDocs)
        .where(eq(t.skillContextDocs.repoId, reAddedId)),
    ).toHaveLength(0);

    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, reAddedId));
  });

  it('cascades from the owning agent and skill too', async () => {
    const repoId = await addRepo();
    await pg.handle.db
      .insert(t.agentContextDocs)
      .values({ agentId, repoId, path: 'specs/owner.md', order: 0 });
    await pg.handle.db
      .insert(t.skillContextDocs)
      .values({ skillId, repoId, path: 'specs/owner.md', order: 0 });

    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skillId));
    expect(
      await pg.handle.db
        .select()
        .from(t.skillContextDocs)
        .where(eq(t.skillContextDocs.skillId, skillId)),
    ).toHaveLength(0);
    // The agent's own attachment is untouched by the skill going away.
    expect(
      await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId))),
    ).toHaveLength(1);

    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agentId));
    expect(
      await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.agentId, agentId)),
    ).toHaveLength(0);

    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));
  });
});
