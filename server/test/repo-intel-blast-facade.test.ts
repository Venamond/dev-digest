import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { FullSymbolRow, ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import {
  MAX_CALLERS_PER_SYMBOL,
  MAX_REVERSE_DEPENDENTS,
} from '../src/modules/repo-intel/constants.js';

/**
 * L04 — the facade work the Blast Radius endpoint stands on: the per-symbol
 * caller cap, honest truncation reporting, the clone-free `persistentOnly`
 * path, and the bounded reverse-dependency walk.
 *
 * No Postgres, no clone: `RepoIntelService`'s private `repo` is replaced with
 * a stub, exactly as `repo-intel-facade-degraded.test.ts` does.
 */

type RepoStub = Record<string, unknown>;

const FULL_STATE: IndexState = {
  repoId: 'r1',
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'sha1',
  indexerVersion: 2,
  updatedAt: new Date(),
};

function buildService(opts: {
  flag?: boolean;
  repo?: RepoStub;
  codeIndex?: unknown;
  fs?: unknown;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.flag ?? true },
    db: {} as never,
    codeIndex: opts.codeIndex ?? { symbols: async () => [], references: async () => [] },
    fs: opts.fs ?? { readFile: async () => null },
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: RepoStub }).repo = {
    getRepoBasics: async () => null,
    tryGetIndexState: async () => FULL_STATE,
    getSymbolRows: async () => [],
    getResolvedCallers: async () => [],
    countResolvedCallers: async () => [],
    getReverseEdges: async () => [],
    getFileFacts: async () => [],
    ...(opts.repo ?? {}),
  };
  return svc;
}

function declRows(...names: string[]): FullSymbolRow[] {
  return names.map((name) => ({
    path: 'src/lib/target.ts',
    name,
    kind: 'function',
    line: 1,
    endLine: 2,
    exported: true,
    signature: null,
  }));
}

/** N callers of `symbol`, ranked N, N-1, … so `caller1.ts` is the top one. */
function callersFor(symbol: string, n: number): ResolvedCallerRow[] {
  return Array.from({ length: n }, (_, i) => ({
    fromPath: `src/callers/${symbol}-${i + 1}.ts`,
    toSymbol: symbol,
    line: 10 + i,
    rank: n - i,
  }));
}

describe('RepoIntel.getBlastRadius — per-symbol caller cap', () => {
  it('keeps MAX_CALLERS_PER_SYMBOL callers PER symbol, not in total', async () => {
    const rows = [...callersFor('alpha', 25), ...callersFor('beta', 25)];
    const svc = buildService({
      repo: {
        getSymbolRows: async (_r: string, files: string[]) =>
          files.includes('src/lib/target.ts') ? declRows('alpha', 'beta') : [],
        // The SQL cap is stubbed out here on purpose: this asserts the JS half.
        getResolvedCallers: async () => rows,
        countResolvedCallers: async () => [
          { toSymbol: 'alpha', total: 25 },
          { toSymbol: 'beta', total: 25 },
        ],
      },
    });

    const blast = await svc.getBlastRadius('r1', ['src/lib/target.ts']);
    const alpha = blast.callers.filter((c) => c.viaSymbol === 'alpha');
    const beta = blast.callers.filter((c) => c.viaSymbol === 'beta');
    expect(alpha).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(beta).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(blast.callers).toHaveLength(2 * MAX_CALLERS_PER_SYMBOL);
    // Ordered by rank DESC within each symbol.
    expect(alpha.map((c) => c.rank)).toEqual([...alpha.map((c) => c.rank)].sort((a, b) => b - a));
    expect(alpha[0].file).toBe('src/callers/alpha-1.ts');
  });

  it('reports honest per-symbol truncation from the pre-cap counts', async () => {
    const svc = buildService({
      repo: {
        getSymbolRows: async (_r: string, files: string[]) =>
          files.includes('src/lib/target.ts') ? declRows('alpha', 'beta') : [],
        getResolvedCallers: async () => [...callersFor('alpha', 25), ...callersFor('beta', 2)],
        countResolvedCallers: async () => [
          { toSymbol: 'alpha', total: 25 },
          { toSymbol: 'beta', total: 2 },
        ],
      },
    });

    const blast = await svc.getBlastRadius('r1', ['src/lib/target.ts']);
    expect(blast.callerStatsBySymbol?.alpha).toEqual({ total: 25, truncated: true });
    expect(blast.callerStatsBySymbol?.beta).toEqual({ total: 2, truncated: false });
  });

  it('does not report truncation when the list merely deduplicated', async () => {
    // Regression: two references from the SAME file collapse to one caller in
    // the dedup by (file, enclosing symbol). Comparing a raw reference count
    // against the kept ROW count made `truncated` fire with nothing dropped —
    // the card then read "showing 1 of 2 callers" about a single caller.
    // Both sides now count DISTINCT CALLER FILES, so this is `false`.
    const svc = buildService({
      repo: {
        getSymbolRows: async (_r: string, files: string[]) =>
          files.includes('src/lib/target.ts') ? declRows('alpha') : [],
        getResolvedCallers: async () => [
          { fromPath: 'src/callers/alpha-1.ts', toSymbol: 'alpha', line: 4, rank: 5 },
          { fromPath: 'src/callers/alpha-1.ts', toSymbol: 'alpha', line: 9, rank: 5 },
        ],
        // count(distinct from_path) — one file, however many references.
        countResolvedCallers: async () => [{ toSymbol: 'alpha', total: 1 }],
      },
    });

    const blast = await svc.getBlastRadius('r1', ['src/lib/target.ts']);
    expect(blast.callerStatsBySymbol?.alpha).toEqual({ total: 1, truncated: false });
  });

  it('never returns the declaring file as one of its own callers', async () => {
    const svc = buildService({
      repo: {
        getSymbolRows: async (_r: string, files: string[]) =>
          files.includes('src/lib/target.ts') ? declRows('alpha') : [],
        getResolvedCallers: async () => [
          { fromPath: 'src/lib/target.ts', toSymbol: 'alpha', line: 3, rank: 9 },
          { fromPath: 'src/callers/alpha-1.ts', toSymbol: 'alpha', line: 4, rank: 1 },
        ],
        countResolvedCallers: async () => [{ toSymbol: 'alpha', total: 2 }],
      },
    });

    const blast = await svc.getBlastRadius('r1', ['src/lib/target.ts']);
    expect(blast.callers.map((c) => c.file)).toEqual(['src/callers/alpha-1.ts']);
  });

  it('attributes endpoints from the CAPPED caller list only', async () => {
    // The 21st-ranked caller of `alpha` owns a unique endpoint. It is dropped
    // by the cap, so its endpoint must not be claimed as impacted.
    const rows = callersFor('alpha', 21);
    const dropped = rows[rows.length - 1].fromPath;
    const svc = buildService({
      repo: {
        getSymbolRows: async (_r: string, files: string[]) =>
          files.includes('src/lib/target.ts') ? declRows('alpha') : [],
        getResolvedCallers: async () => rows,
        countResolvedCallers: async () => [{ toSymbol: 'alpha', total: 21 }],
        getFileFacts: async (_r: string, files: string[]) =>
          files.map((filePath) => ({
            filePath,
            endpoints: [`GET /${filePath}`],
            crons: [],
          })),
      },
    });

    const blast = await svc.getBlastRadius('r1', ['src/lib/target.ts']);
    expect(blast.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(blast.impactedEndpoints).not.toContain(`GET /${dropped}`);
    expect(blast.factsByFile?.[dropped]).toBeUndefined();
    expect(blast.impactedEndpoints).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });
});

describe('RepoIntel.getBlastRadius — persistentOnly never touches the clone', () => {
  /** The trap: the index-state gate passes on the row, but the flag is off. */
  function buildTrapService() {
    const symbols = vi.fn(async () => {
      throw new Error('clone read on the request path');
    });
    const references = vi.fn(async () => {
      throw new Error('clone read on the request path');
    });
    const svc = buildService({
      flag: false,
      codeIndex: { symbols, references },
      repo: {
        // An existing index row — getIndexState would happily report `full`.
        tryGetIndexState: async () => FULL_STATE,
        getRepoBasics: async () => ({
          owner: 'acme',
          name: 'api',
          clonePath: '/tmp/clone',
        }),
      },
    });
    return { svc, symbols, references };
  }

  it('returns degraded flag_off without calling codeIndex', async () => {
    const { svc, symbols, references } = buildTrapService();
    const blast = await svc.getBlastRadius('r1', ['a.ts'], { persistentOnly: true });
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('flag_off');
    expect(symbols).not.toHaveBeenCalled();
    expect(references).not.toHaveBeenCalled();
  });

  it('WITHOUT persistentOnly the same call does reach the ripgrep path', async () => {
    const { svc, symbols } = buildTrapService();
    await svc.getBlastRadius('r1', ['a.ts']);
    expect(symbols).toHaveBeenCalled();
  });
});

describe('RepoIntel.getReverseDependents', () => {
  it('issues at most BFS_DEPTH reverse-edge queries and honours a lower depth', async () => {
    // Each call must return a PREVIOUSLY UNSEEN file, or the frontier empties
    // and the test would measure deduplication rather than the depth clamp.
    function freshEdgeStub() {
      let call = 0;
      return vi.fn(async () => {
        call += 1;
        return [{ fromFile: `l${call}.ts`, toFile: call === 1 ? 'a.ts' : `l${call - 1}.ts` }];
      });
    }

    const deep = freshEdgeStub();
    await buildService({ repo: { getReverseEdges: deep } }).getReverseDependents(
      'r1',
      ['a.ts'],
      5,
    );
    expect(deep).toHaveBeenCalledTimes(2); // clamped to BFS_DEPTH

    const shallow = freshEdgeStub();
    await buildService({ repo: { getReverseEdges: shallow } }).getReverseDependents(
      'r1',
      ['a.ts'],
      1,
    );
    expect(shallow).toHaveBeenCalledTimes(1);

    const noSeeds = freshEdgeStub();
    await buildService({ repo: { getReverseEdges: noSeeds } }).getReverseDependents('r1', []);
    expect(noSeeds).not.toHaveBeenCalled();

    const noEdges = vi.fn(async () => []);
    await buildService({ repo: { getReverseEdges: noEdges } }).getReverseDependents('r1', [
      'a.ts',
    ]);
    expect(noEdges).toHaveBeenCalledTimes(1);
  });

  it('collects EVERY seed that reaches a file, in either row order', async () => {
    const level1 = [
      { fromFile: 'x.ts', toFile: 'a.ts' },
      { fromFile: 'x.ts', toFile: 'b.ts' },
    ];
    const level2 = [
      { fromFile: 'y.ts', toFile: 'x.ts' },
      // A cycle back to a seed must not create a duplicate row.
      { fromFile: 'a.ts', toFile: 'x.ts' },
    ];

    for (const first of [level1, [...level1].reverse()]) {
      let call = 0;
      const svc = buildService({
        repo: {
          getReverseEdges: async () => {
            call += 1;
            return call === 1 ? first : level2;
          },
        },
      });
      const { dependents } = await svc.getReverseDependents('r1', ['a.ts', 'b.ts']);
      const x = dependents.filter((d) => d.file === 'x.ts');
      expect(x).toHaveLength(1);
      expect(x[0].via).toEqual(['a.ts', 'b.ts']);
      expect(x[0].depth).toBe(1);

      const y = dependents.filter((d) => d.file === 'y.ts');
      expect(y).toHaveLength(1);
      expect(y[0].via).toEqual(['a.ts', 'b.ts']);
      expect(y[0].depth).toBe(2);

      // A seed is never its own dependent.
      expect(dependents.map((d) => d.file)).not.toContain('a.ts');
    }
  });

  it('returns the empty result when the flag is off, the index is absent, or files is []', async () => {
    const empty = { dependents: [], truncated: false };
    const edges = vi.fn(async () => [{ fromFile: 'x.ts', toFile: 'a.ts' }]);

    await expect(
      buildService({ flag: false, repo: { getReverseEdges: edges } }).getReverseDependents('r1', [
        'a.ts',
      ]),
    ).resolves.toEqual(empty);

    await expect(
      buildService({
        repo: { getReverseEdges: edges, tryGetIndexState: async () => null },
      }).getReverseDependents('r1', ['a.ts']),
    ).resolves.toEqual(empty);

    await expect(
      buildService({ repo: { getReverseEdges: edges } }).getReverseDependents('r1', []),
    ).resolves.toEqual(empty);

    expect(edges).not.toHaveBeenCalled();
  });

  it('reports truncation when a level comes back at the cap', async () => {
    const level = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ fromFile: `d${i}.ts`, toFile: 'a.ts' }));

    const capped = await buildService({
      repo: { getReverseEdges: async () => level(MAX_REVERSE_DEPENDENTS) },
    }).getReverseDependents('r1', ['a.ts'], 1);
    expect(capped.truncated).toBe(true);

    const notCapped = await buildService({
      repo: { getReverseEdges: async () => level(MAX_REVERSE_DEPENDENTS - 1) },
    }).getReverseDependents('r1', ['a.ts'], 1);
    expect(notCapped.truncated).toBe(false);
  });

  it('enriches dependents with their precomputed file facts', async () => {
    const svc = buildService({
      repo: {
        getReverseEdges: async () => [{ fromFile: 'x.ts', toFile: 'a.ts' }],
        getFileFacts: async () => [
          { filePath: 'x.ts', endpoints: ['GET /x'], crons: ['nightly'] },
        ],
      },
    });
    const { dependents } = await svc.getReverseDependents('r1', ['a.ts'], 1);
    expect(dependents).toEqual([
      { file: 'x.ts', via: ['a.ts'], depth: 1, endpoints: ['GET /x'], crons: ['nightly'] },
    ]);
  });
});
