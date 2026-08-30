import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { LLMProvider } from '@devdigest/shared';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';
import type { CloneFs } from '../src/adapters/clone-fs.js';
import { nodeCloneFs } from '../src/adapters/clone-fs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

function mockLlm(structured: unknown): LLMProvider {
  return {
    id: 'openrouter',
    listModels: async () => [],
    complete: async () => {
      throw new Error('OpenRouterProvider only implements completeStructured');
    },
    completeStructured: async (req) => {
      const parsed = (req.schema as { parse: (v: unknown) => unknown }).parse(structured);
      return {
        data: parsed,
        model: req.model,
        tokensIn: 10,
        tokensOut: 20,
        costUsd: 0.001,
        raw: JSON.stringify(structured),
        attempts: 1,
      };
    },
    embed: async () => [],
  };
}

function mockRepoIntel(samples: string[], sha = 'deadbeef'): RepoIntel {
  const state: IndexState = {
    repoId: '',
    status: 'full',
    filesIndexed: samples.length,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: sha,
    indexerVersion: 1,
    updatedAt: new Date(),
  };
  return {
    indexRepo: async () => state,
    refreshIndex: async () => state,
    getIndexState: async (repoId) => ({ ...state, repoId }),
    getBlastRadius: async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      factsByFile: {},
      degraded: true,
      reason: 'no_data',
    }),
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => samples,
    getTopFilesByRank: async () => samples,
    getCriticalPaths: async () => [],
    getReverseDependents: async () => ({ dependents: [], truncated: false }),
  };
}

d('conventions extractor', () => {
  let pg: PgFixture;
  let cloneDir: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);

    cloneDir = mkdtempSync(join(tmpdir(), 'dd-conv-'));
    mkdirSync(join(cloneDir, 'src'), { recursive: true });
    writeFileSync(join(cloneDir, 'package.json'), '{"type":"module"}\n');
    writeFileSync(
      join(cloneDir, 'src', 'api.ts'),
      "import { x } from './helpers.js';\nexport async function run() { return x; }\n",
    );

    const [repo] = await pg.handle.db.select().from(t.repos).limit(1);
    repoId = repo!.id;
    await pg.handle.db.update(t.repos).set({ clonePath: cloneDir }).where(eq(t.repos.id, repoId));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { structured: unknown; indexed?: boolean; cloned?: boolean }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const samples = opts.indexed === false ? [] : ['src/api.ts'];
    const intel =
      opts.indexed === false
        ? {
            ...mockRepoIntel([]),
            getIndexState: async (id: string) => ({
              repoId: id,
              status: 'degraded' as const,
              filesIndexed: 0,
              filesSkipped: 0,
              durationMs: 0,
              lastIndexedSha: '',
              indexerVersion: 1,
              updatedAt: new Date(),
              degraded: true,
            }),
            getConventionSamples: async () => [],
          }
        : mockRepoIntel(samples);

    const fs: CloneFs = nodeCloneFs;

    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: mockLlm(opts.structured) },
        repoIntel: intel,
        fs,
      },
    });
  }

  const goodCompletion = {
    candidates: [
      {
        category: 'imports',
        rule: 'Relative imports must carry the .js extension',
        evidence: {
          path: 'src/api.ts',
          line_start: 1,
          line_end: 1,
          snippet: "import { x } from './helpers.js';",
        },
        confidence: 0.92,
      },
      {
        category: 'hallucination',
        rule: 'Never invent files',
        evidence: {
          path: 'src/missing.ts',
          line_start: 1,
          line_end: 1,
          snippet: 'fake',
        },
        confidence: 0.99,
      },
    ],
  };

  it('409 when repo is not indexed', async () => {
    const app = await makeApp({ structured: { candidates: [] }, indexed: false });
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.reason).toBe('not_indexed');
    await app.close();
  });

  it('extract grounds candidates, drops hallucinations, persists list', async () => {
    const app = await makeApp({ structured: goodCompletion });
    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(extracted.statusCode).toBe(200);
    const body = extracted.json();
    // The hallucinated candidate cites a file outside the sample — it must be
    // counted as ungrounded specifically, not as a generic "dropped".
    expect(body.dropped.ungrounded).toBeGreaterThanOrEqual(1);
    expect(body.dropped.duplicate).toBe(0);
    expect(body.dropped.truncated).toBe(0);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].rule).toMatch(/\.js/);
    // Default is accepted, not pending — review-and-deselect UX.
    expect(body.candidates[0].status).toBe('accepted');
    expect(body.candidates[0].evidence_url).toContain('deadbeef');
    expect(body.scan.sampled_file_count).toBeGreaterThan(0);

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);
    expect(list.json().candidates).toHaveLength(1);
    await app.close();
  });

  it('a scan that grounds nothing is still remembered as a scan', async () => {
    // Regression: scan metadata used to live only on candidate rows, so a
    // zero-result scan came back as scan:null and the UI showed "never
    // scanned" after a reload.
    const app = await makeApp({ structured: { candidates: [] } });
    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(extracted.statusCode).toBe(200);
    expect(extracted.json().candidates).toHaveLength(0);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list.candidates).toHaveLength(0);
    expect(list.scan).not.toBeNull();
    expect(list.scan.sampled_file_count).toBeGreaterThan(0);
    expect(list.scan.source_sha).toBe('deadbeef');
    await app.close();
  });

  it('deselect-all clears every accepted candidate in one call', async () => {
    const app = await makeApp({ structured: goodCompletion });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${list.candidates[0].id}`,
      payload: { status: 'accepted' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/deselect-all`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates.every((c: { status: string }) => c.status !== 'accepted')).toBe(
      true,
    );
    await app.close();
  });

  it('PATCH accept/reject and skill create with extracted source', async () => {
    const app = await makeApp({ structured: goodCompletion });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const id = list.candidates[0].id as string;

    // Default is accepted — reject the only candidate to exercise the
    // "no accepted conventions" 409 path.
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    const rejectedDraft = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/skill-draft`,
    });
    expect(rejectedDraft.statusCode).toBe(409);

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');

    const draft = (
      await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();
    // Named per repo so a second repo cannot upsert onto this same skill row.
    expect(draft.name).toBe('payments-api-conventions');
    // Rules are grouped under their category and listed verbatim — no slug
    // heading duplicating the rule text.
    expect(draft.body).toContain('## imports');
    expect(draft.body).toContain('- Relative imports must carry the .js extension');
    expect(draft.body).not.toContain('relative-imports-must-carry');

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: draft.name,
        description: draft.description,
        body: draft.body,
        enabled: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const createdSkill = created.json();
    expect(createdSkill).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      source: 'extracted',
      version: 1,
    });

    // Same name → update in place and bump version (no duplicate row).
    const updated = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: draft.name,
        description: draft.description,
        body: `${draft.body}\n`,
        enabled: true,
      },
    });
    expect(updated.statusCode).toBe(201);
    expect(updated.json()).toMatchObject({
      id: createdSkill.id,
      name: 'payments-api-conventions',
      version: 2,
    });
    await app.close();
  });

  it('rejected candidates are absent from the skill body', async () => {
    const app = await makeApp({
      structured: {
        candidates: [
          {
            category: 'a',
            rule: 'Keep this rule',
            evidence: {
              path: 'src/api.ts',
              line_start: 1,
              line_end: 1,
              snippet: "import { x } from './helpers.js';",
            },
            confidence: 0.9,
          },
        ],
      },
    });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    // Second extract with two grounded rules via re-scan — inject two matching snippets
    writeFileSync(
      join(cloneDir, 'src', 'api.ts'),
      "import { x } from './helpers.js';\nexport async function run() { return x; }\nconst keep = true;\n",
    );
    const two = {
      candidates: [
        {
          category: 'a',
          rule: 'Keep this rule',
          evidence: {
            path: 'src/api.ts',
            line_start: 1,
            line_end: 1,
            snippet: "import { x } from './helpers.js';",
          },
          confidence: 0.9,
        },
        {
          category: 'b',
          rule: 'Reject this rule',
          evidence: {
            path: 'src/api.ts',
            line_start: 2,
            line_end: 2,
            snippet: 'export async function run()',
          },
          confidence: 0.8,
        },
      ],
    };
    const app2 = await makeApp({ structured: two });
    const extracted = (
      await app2.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })
    ).json();
    expect(extracted.candidates.length).toBe(2);

    const keepId = extracted.candidates.find((c: { rule: string }) => c.rule.startsWith('Keep')).id;
    const rejectId = extracted.candidates.find((c: { rule: string }) =>
      c.rule.startsWith('Reject'),
    ).id;

    await app2.inject({
      method: 'PATCH',
      url: `/conventions/${keepId}`,
      payload: { status: 'accepted' },
    });
    await app2.inject({
      method: 'PATCH',
      url: `/conventions/${rejectId}`,
      payload: { status: 'rejected' },
    });

    const draft = (
      await app2.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })
    ).json();
    expect(draft.body).toContain('Keep this rule');
    expect(draft.body).not.toContain('Reject this rule');
    await app.close();
    await app2.close();
  });
});
