import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + version history — create snapshots v1, content edit bumps
 * version, enabled-only does not, restore creates a new current version.
 */
d('skills CRUD + versions', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
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

  const createBody = {
    name: 'corner-case-checklist',
    description: 'Require boundary / error coverage.',
    type: 'rubric' as const,
    body: '# v1 body\nCheck empty input.\n',
  };

  it('POST creates a skill with version 1 and lists it with agent_count', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'corner-case-checklist',
      type: 'rubric',
      source: 'manual',
      version: 1,
      enabled: true,
    });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    const items = list.json() as Array<{ id: string; agent_count: number }>;
    const row = items.find((i) => i.id === skill.id);
    expect(row).toBeTruthy();
    expect(row!.agent_count).toBe(0);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      skill_id: skill.id,
      version: 1,
      body: createBody.body,
    });
    await app.close();
  });

  it('PUT body change bumps version; enabled-only does not', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, body: 'line-a' },
      })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'line-a\nline-b' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toBe('line-a\nline-b');

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });

    const afterToggle = await app.inject({ method: 'GET', url: `/skills/${skillId}` });
    expect(afterToggle.json().enabled).toBe(false);
    expect(afterToggle.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].note).toBe('Body +1/-0 lines');
    await app.close();
  });

  it('restore writes a new current version from a historical body', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2\nchanged\n' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().version).toBe(3);
    expect(restored.json().body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe(createBody.body);
    expect(versions[0].note).toBe('Restored from v1');
    await app.close();
  });

  it('diff compares a snapshot body to current (or ?against=)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, body: 'line-a\n' },
      })
    ).json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'line-b\n' },
    });

    const vsCurrent = await app.inject({
      method: 'GET',
      url: `/skills/${skillId}/versions/1/diff`,
    });
    expect(vsCurrent.statusCode).toBe(200);
    const diff = vsCurrent.json();
    expect(diff.version).toBe(1);
    expect(diff.against).toBe(2);
    expect(diff.diff).toContain('-line-a');
    expect(diff.diff).toContain('+line-b');

    const vsSelf = await app.inject({
      method: 'GET',
      url: `/skills/${skillId}/versions/1/diff?against=1`,
    });
    expect(vsSelf.statusCode).toBe(200);
    expect(vsSelf.json().against).toBe(1);
    expect(vsSelf.json().diff).toContain(' line-a');
    await app.close();
  });

  it('import confirm persists a manual skill from draft fields', async () => {
    const app = await makeApp();
    const confirmed = await app.inject({
      method: 'POST',
      url: '/skills/import/confirm',
      payload: {
        name: 'imported-skill',
        description: 'From confirm',
        type: 'custom',
        body: '# imported\n',
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({
      name: 'imported-skill',
      source: 'manual',
      version: 1,
    });
    await app.close();
  });

  it('DELETE removes the skill; GET returns 404', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('404s for unknown skill / version', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);

    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });
});
