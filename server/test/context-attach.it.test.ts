/**
 * S7 — attach, detach and order.
 *
 * A real Postgres and a real clone directory on disk: the walk runs through the
 * default `nodeCloneFs`, so "this path is not a document of this repository"
 * is decided by the same enumeration production uses.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ContextService } from '../src/modules/context/service.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { FastifyInstance } from 'fastify';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-attach] Docker not available — skipping integration tests.');
}

d('project-context attachments', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let service: ContextService;
  let skillsService: SkillsService;
  let clonePath: string;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    clonePath = await mkdtemp(join(tmpdir(), 'context-attach-'));
    await mkdir(join(clonePath, 'specs'), { recursive: true });
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    await writeFile(join(clonePath, 'specs/one.md'), '# one');
    await writeFile(join(clonePath, 'specs/two.md'), '# two');
    await writeFile(join(clonePath, 'docs/three.md'), '# three');
    await writeFile(join(clonePath, 'docs/gone.md'), '# gone');
    await writeFile(join(clonePath, 'README.md'), '# not under a root');

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'attach',
        fullName: 'acme/attach',
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    repoId = repo!.id;

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Attach Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'review',
      })
      .returning();
    agentId = agent!.id;

    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'attach-skill',
        description: 'invariants',
        type: 'convention',
        source: 'manual',
        body: 'v1 body',
      })
      .returning();
    skillId = skill!.id;
    await pg.handle.db
      .insert(t.skillVersions)
      .values({ skillId, version: 1, body: 'v1 body', note: 'initial' });

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({ config, db: pg.handle.db });
    service = new ContextService(app.container);
    skillsService = new SkillsService(app.container);
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await pg.handle.db
      .delete(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    await pg.handle.db
      .delete(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId));
  });

  it('stores only the path, in the given order, and reordering persists (AC-11, AC-13)', async () => {
    await service.setAgentDocs(workspaceId, agentId, repoId, [
      'specs/one.md',
      'specs/two.md',
      'docs/three.md',
    ]);
    let rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    expect(rows.map((r) => [r.path, r.order]).sort()).toEqual([
      ['docs/three.md', 2],
      ['specs/one.md', 0],
      ['specs/two.md', 1],
    ]);
    // Only the path is stored: the table has no column that could hold text.
    expect(Object.keys(rows[0]!).sort()).toEqual(['agentId', 'order', 'path', 'repoId']);

    await service.setAgentDocs(workspaceId, agentId, repoId, [
      'docs/three.md',
      'specs/one.md',
      'specs/two.md',
    ]);
    rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    const order = new Map(rows.map((r) => [r.path, r.order]));
    expect(order.get('docs/three.md')).toBe(0);
    expect(order.get('specs/one.md')).toBe(1);
    expect(order.get('specs/two.md')).toBe(2);
  });

  it('writes no agent_versions row and does not bump the agent (AC-12)', async () => {
    const before = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId));
    const [agentBefore] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, agentId));

    await service.setAgentDocs(workspaceId, agentId, repoId, ['specs/one.md']);
    await service.setAgentDocs(workspaceId, agentId, repoId, []);

    const after = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId));
    const [agentAfter] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, agentId));

    expect(after).toHaveLength(before.length);
    expect(agentAfter!.version).toBe(agentBefore!.version);
  });

  it('restoring an earlier skill version leaves the attachments untouched (AC-42)', async () => {
    await service.setSkillDocs(workspaceId, skillId, repoId, [
      'specs/two.md',
      'specs/one.md',
    ]);
    const before = await pg.handle.db
      .select()
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId));
    const versionsBefore = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));

    // Attaching wrote no skill_versions row of its own…
    expect(versionsBefore).toHaveLength(1);

    // …then bump the skill's body (a real version) and restore v1 over it.
    await skillsService.update(workspaceId, skillId, { body: 'v2 body' });
    await skillsService.restoreVersion(workspaceId, skillId, 1);

    const [skill] = await pg.handle.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.id, skillId));
    expect(skill!.body).toBe('v1 body');

    const after = await pg.handle.db
      .select()
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId));
    // Byte-identical: same paths, same order, nothing added or dropped.
    expect(after).toEqual(before);
  });

  it('rejects a path outside the roots, a traversal and a repeated path with 400', async () => {
    await expect(
      service.setAgentDocs(workspaceId, agentId, repoId, ['README.md']),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.setAgentDocs(workspaceId, agentId, repoId, ['../../etc/passwd']),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.setAgentDocs(workspaceId, agentId, repoId, ['/etc/passwd']),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.setAgentDocs(workspaceId, agentId, repoId, ['specs/one.md', 'specs/one.md']),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.setAgentDocs(workspaceId, agentId, repoId, ['specs/nope.md']),
    ).rejects.toMatchObject({ statusCode: 400 });

    // A rejected request changes nothing.
    expect(
      await pg.handle.db
        .select()
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.agentId, agentId)),
    ).toHaveLength(0);
  });

  it('lets a broken attachment be re-submitted so it can be reordered away (AC-36)', async () => {
    await service.setAgentDocs(workspaceId, agentId, repoId, [
      'docs/gone.md',
      'specs/one.md',
    ]);
    await rm(join(clonePath, 'docs/gone.md'));
    try {
      // The file is gone, but the attachment is not unsubmittable: it can be
      // moved, and it can be dropped.
      const res = await service.setAgentDocs(workspaceId, agentId, repoId, [
        'specs/one.md',
        'docs/gone.md',
      ]);
      const rows = res!.rows;
      const broken = rows.find((r) => r.doc.path === 'docs/gone.md')!;
      expect(broken.attached).toBe(true);
      expect(broken.readable).toBe(false);
      expect(broken.order).toBe(1);
      expect(broken.doc.root).toBe('docs');

      const kept = rows.find((r) => r.doc.path === 'specs/one.md')!;
      expect(kept.readable).toBe(true);

      await service.setAgentDocs(workspaceId, agentId, repoId, ['specs/one.md']);
      expect(
        (
          await pg.handle.db
            .select()
            .from(t.agentContextDocs)
            .where(eq(t.agentContextDocs.agentId, agentId))
        ).map((r) => r.path),
      ).toEqual(['specs/one.md']);
    } finally {
      await writeFile(join(clonePath, 'docs/gone.md'), '# gone');
    }
  });

  it('reports 0 and [] — never null — for a document nobody uses', async () => {
    const docs = await service.listDocs(workspaceId, repoId);
    const unused = docs.find((doc) => doc.path === 'specs/two.md')!;
    expect(unused.used_by_agents).toBe(0);
    expect(unused.used_by).toEqual([]);
    expect(unused.used_by_agents).not.toBeNull();

    await service.setAgentDocs(workspaceId, agentId, repoId, ['specs/two.md']);
    const after = await service.listDocs(workspaceId, repoId);
    const used = after.find((doc) => doc.path === 'specs/two.md')!;
    expect(used.used_by_agents).toBe(1);
    expect(used.used_by[0]!.agent_name).toBe('Attach Reviewer');
    expect(used.approx_tokens).toBeGreaterThan(0);
    expect(used.root).toBe('specs');
  });

  it('404s (undefined) for an unknown agent, skill or repo rather than throwing', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    expect(await service.agentRows(workspaceId, missing, repoId)).toBeUndefined();
    expect(await service.skillRows(workspaceId, missing, repoId)).toBeUndefined();
    expect(await service.agentRows(workspaceId, agentId, missing)).toBeUndefined();
    expect(
      await service.setAgentDocs(workspaceId, missing, repoId, []),
    ).toBeUndefined();
  });
});
