/**
 * S9 — the Project Context routes, end to end.
 *
 * A real Postgres, a real clone on disk, and the REAL `SimpleGitClient`: the
 * save path's whole point is that it writes bytes into the working tree and
 * makes no commit, and a mock git client cannot prove either half.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ContextDocsResponse, SpecFile } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-routes] Docker not available — skipping integration tests.');
}

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

d('Project Context routes', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let cloneDir: string;
  let clonePath: string;
  let workspaceId: string;
  let repoId: string;
  let uncloned: string;
  let agentId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // `SimpleGitClient.clonePathFor` is `<cloneDir>/<owner>/<name>`, so the
    // repo row's clone_path and the adapter's own base must be the same dir.
    cloneDir = await mkdtemp(join(tmpdir(), 'context-routes-'));
    clonePath = join(cloneDir, 'acme', 'routes');
    await mkdir(join(clonePath, 'specs'), { recursive: true });
    await mkdir(join(clonePath, 'docs'), { recursive: true });
    await writeFile(join(clonePath, 'specs/api.md'), '# specs api\n\nInvariant: never log secrets.');
    await writeFile(join(clonePath, 'docs/api.md'), '# docs api');
    await writeFile(join(clonePath, 'README.md'), '# outside every root');

    const git = simpleGit(clonePath);
    await git.init();
    await git.addConfig('user.email', 'test@devdigest.local');
    await git.addConfig('user.name', 'DevDigest Test');
    await git.add('.');
    await git.commit('initial');

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'routes',
        fullName: 'acme/routes',
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    repoId = repo!.id;

    const [never] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'never-cloned',
        fullName: 'acme/never-cloned',
        defaultBranch: 'main',
        clonePath: null,
      })
      .returning();
    uncloned = never!.id;

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Routes Reviewer',
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
        name: 'routes-skill',
        description: 'invariants',
        type: 'convention',
        source: 'manual',
        body: 'body',
      })
      .returning();
    skillId = skill!.id;

    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DEVDIGEST_CLONE_DIR: cloneDir,
    } as NodeJS.ProcessEnv);
    app = await buildApp({ config, db: pg.handle.db });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await pg.handle.db
      .delete(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    await pg.handle.db
      .delete(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId));
  });

  it('GET /repos/:id/context returns 200 [] for a repo that was never cloned', async () => {
    const res = await app.inject({ method: 'GET', url: `/repos/${uncloned}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('GET /repos/:id/context lists the clone’s markdown with root and tokens (AC-1, AC-3)', async () => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    const docs = res.json() as SpecFile[];

    expect(docs.map((doc) => doc.path).sort()).toEqual(['docs/api.md', 'specs/api.md']);
    const spec = docs.find((doc) => doc.path === 'specs/api.md')!;
    expect(spec.root).toBe('specs');
    expect(spec.approx_tokens).toBeGreaterThan(0);
    expect(spec.used_by_agents).toBe(0);
    expect(spec.used_by).toEqual([]);
    // README.md is real markdown but sits under no configured root.
    expect(docs.some((doc) => doc.path === 'README.md')).toBe(false);
  });

  it('GET /repos/:id/context/doc returns the text, 404s an unknown one', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=${encodeURIComponent('specs/api.md')}`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'specs/api.md' });
    expect(ok.json().content).toContain('never log secrets');

    const missing = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=${encodeURIComponent('specs/nope.md')}`,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('rejects a traversal with 400 on GET and on PUT alike', async () => {
    for (const path of ['../../etc/passwd', '/etc/passwd', 'README.md']) {
      const get = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/doc?path=${encodeURIComponent(path)}`,
      });
      expect(get.statusCode, `GET ${path}`).toBe(400);

      const put = await app.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/doc`,
        payload: { path, content: 'pwned' },
      });
      expect(put.statusCode, `PUT ${path}`).toBe(400);
    }
    // Nothing was written anywhere: the file outside the roots is untouched.
    expect(await readFile(join(clonePath, 'README.md'), 'utf8')).toBe('# outside every root');
  });

  it('PUT changes the bytes on disk and makes no commit (AC-6)', async () => {
    const git = simpleGit(clonePath);
    const before = await git.log();

    const res = await app.inject({
      method: 'PUT',
      url: `/repos/${repoId}/context/doc`,
      payload: { path: 'docs/api.md', content: '# docs api\n\nEdited locally.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      path: 'docs/api.md',
      content: '# docs api\n\nEdited locally.',
    });

    expect(await readFile(join(clonePath, 'docs/api.md'), 'utf8')).toBe(
      '# docs api\n\nEdited locally.',
    );
    const after = await git.log();
    expect(after.total).toBe(before.total);
    expect(after.latest?.hash).toBe(before.latest?.hash);
    // The edit lives in the working tree, uncommitted — exactly what "lost on
    // the next resync, never reaches GitHub" means.
    expect((await git.status()).modified).toContain('docs/api.md');

    await git.checkout(['--', 'docs/api.md']);
  });

  it('attaches, reorders and reports the rows over HTTP (AC-9, AC-13)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths: ['docs/api.md', 'specs/api.md'] },
    });
    expect(res.statusCode).toBe(200);
    const { rows } = res.json() as ContextDocsResponse;
    const attached = rows.filter((r) => r.attached);
    expect(attached.map((r) => [r.doc.path, r.order])).toEqual([
      ['docs/api.md', 0],
      ['specs/api.md', 1],
    ]);
    expect(rows.every((r) => r.readable)).toBe(true);

    const listed = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
    });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as ContextDocsResponse).rows.filter((r) => r.attached)).toHaveLength(2);

    // The repository list now reports who uses the document (AC-8, AC-35).
    const docs = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })
    ).json() as SpecFile[];
    const spec = docs.find((doc) => doc.path === 'specs/api.md')!;
    expect(spec.used_by_agents).toBe(1);
    expect(spec.used_by[0]).toMatchObject({ agent_name: 'Routes Reviewer', via: 'agent' });
  });

  it('serves the tab the ceiling the RUN caps against, not the default (AC-24, AC-28)', async () => {
    // Whatever the workspace sets is what a run skips against, so it is what
    // the tab must warn against too — a hardcoded 32 000 on the client is a
    // number this response contradicts the moment the setting exists.
    const byDefault = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
    });
    expect((byDefault.json() as ContextDocsResponse).token_ceiling).toBe(32_000);

    await pg.handle.db
      .insert(t.settings)
      .values({ workspaceId, key: 'context.token_ceiling', value: 4_000 });

    for (const url of [
      `/agents/${agentId}/context?repo_id=${repoId}`,
      `/skills/${skillId}/context?repo_id=${repoId}`,
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect((res.json() as ContextDocsResponse).token_ceiling).toBe(4_000);
    }

    await pg.handle.db.delete(t.settings).where(eq(t.settings.key, 'context.token_ceiling'));
  });

  it('rejects a bad attachment request with 400 and an unknown owner with 404', async () => {
    const outside = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths: ['../../etc/passwd'] },
    });
    expect(outside.statusCode).toBe(400);

    const repeated = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths: ['specs/api.md', 'specs/api.md'] },
    });
    expect(repeated.statusCode).toBe(400);

    const unknownAgent = await app.inject({
      method: 'POST',
      url: `/agents/${MISSING_ID}/context`,
      payload: { repo_id: repoId, paths: [] },
    });
    expect(unknownAgent.statusCode).toBe(404);

    const unknownSkill = await app.inject({
      method: 'GET',
      url: `/skills/${MISSING_ID}/context?repo_id=${repoId}`,
    });
    expect(unknownSkill.statusCode).toBe(404);
  });

  it('a skill’s documents reach the agent’s tab as inherited, once (AC-34)', async () => {
    await pg.handle.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order: 0, enabled: true })
      .onConflictDoNothing();

    const setSkill = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { repo_id: repoId, paths: ['specs/api.md', 'docs/api.md'] },
    });
    expect(setSkill.statusCode).toBe(200);
    // A skill's own tab never shows inheritance.
    expect(
      (setSkill.json() as ContextDocsResponse).rows.every((r) => r.inherited_from.length === 0),
    ).toBe(true);

    // The agent attaches ONE of them directly; it must still be a single row.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths: ['specs/api.md'] },
    });

    const { rows } = (
      await app.inject({
        method: 'GET',
        url: `/agents/${agentId}/context?repo_id=${repoId}`,
      })
    ).json() as ContextDocsResponse;

    expect(rows.filter((r) => r.doc.path === 'specs/api.md')).toHaveLength(1);
    const shared = rows.find((r) => r.doc.path === 'specs/api.md')!;
    expect(shared.attached).toBe(true);
    expect(shared.order).toBe(0);
    expect(shared.inherited_from.map((s) => s.skill_name)).toEqual(['routes-skill']);

    const inheritedOnly = rows.find((r) => r.doc.path === 'docs/api.md')!;
    expect(inheritedOnly.attached).toBe(false);
    expect(inheritedOnly.inherited_from.map((s) => s.skill_name)).toEqual(['routes-skill']);

    await pg.handle.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
  });
});
