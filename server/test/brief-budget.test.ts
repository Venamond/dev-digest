/**
 * S9 — fitting the assembled input to the budget.
 *
 * The allowed-name set is NOT fitted with it: it is built from the complete
 * inputs by `collectAllowedNames`, and the cases below pin that the fitter
 * shrinks the prompt without shrinking the set.
 *
 * Hermetic, with a SYNTHETIC counter (`text.length`) so every case is exact:
 * the real `cl100k_base` encoder is asserted to be the wired counter in the
 * integration test, not here.
 */
import { describe, it, expect } from 'vitest';
import type { BlastResponse, BlastSymbolImpact } from '@devdigest/shared';
import { ungroundedNames } from '../src/modules/_shared/name-set.js';
import {
  BRIEF_TOKEN_BUDGET,
  fitToBudget,
  measureRequestTokens,
} from '../src/modules/brief/budget.js';
import type { RawBriefInputs } from '../src/modules/brief/gather.js';
import { buildBriefPrompt, collectAllowedNames } from '../src/modules/brief/prompt.js';

/** One "token" per character — exact, and monotone in what the cuts remove. */
const count = (text: string) => text.length;
const render = (inputs: RawBriefInputs) => buildBriefPrompt(inputs).userText;
const fit = (raw: RawBriefInputs) => fitToBudget(raw, count, render);
/**
 * What AC-12 bounds: the system prompt + the JSON schema + the user text, not
 * the user text alone. Every "does it fit" assertion below goes through this,
 * so none of them can pass on a request that is over the cap.
 */
const request = (inputs: RawBriefInputs) => measureRequestTokens(inputs, count, render);

function symbol(name: string, callers: number): BlastSymbolImpact {
  return {
    file: `src/${name}.ts`,
    name,
    kind: 'function',
    callers: Array.from({ length: callers }, (_, i) => ({
      file: `src/callers/${name}-${i}-${'x'.repeat(40)}.ts`,
      symbol: `caller_${i}`,
      line: i + 1,
      rank: 1,
    })),
    callers_total: callers,
    callers_truncated: false,
    importers: [],
    endpoints: [`POST /${name}`],
    crons: [`cron-${name}`],
  };
}

function map(symbols: BlastSymbolImpact[]): BlastResponse {
  return {
    state: 'ok',
    index: { status: 'full', last_indexed_sha: 'idx1', updated_at: '2026-08-22T09:00:00.000Z' },
    totals: {
      symbols: symbols.length,
      callers: symbols.reduce((n, s) => n + s.callers.length, 0),
      callers_found: 0,
      endpoints: symbols.length,
      crons: symbols.length,
    },
    symbols,
    downstream_truncated: false,
    prior_pulls: [],
    link: { repo_full_name: 'acme/x', indexed_sha: 'idx1', head_sha: 'head1' },
  };
}

function doc(path: string, fragments: number, size: number) {
  return {
    path,
    title: path,
    fragments: Array.from({ length: fragments }, (_, i) => ({
      path,
      title: path,
      lines: [`fragment-${i} of ${path}`, 'y'.repeat(size)],
    })),
  };
}

function base(over: Partial<RawBriefInputs> = {}): RawBriefInputs {
  return {
    prMeta: {
      number: 1,
      title: 'Rework the money path',
      body: 'Short body.',
      author: 'octocat',
      branch: 'feat/money',
      base: 'main',
      additions: 12,
      deletions: 3,
      filesCount: 1,
    },
    changedFiles: ['src/a.ts'],
    changedFileLines: { 'src/a.ts': 1 },
    intent: {
      intent: 'INTENT_KEPT rework the money path',
      in_scope: [],
      out_of_scope: [],
      risk_areas: [],
      confidence: 0.8,
      sources: [],
      missing_context: [],
      pr_id: 'pr-1',
      head_sha: 'head1',
      model: 'gpt-4.1',
      classified_at: '2026-08-23T10:00:00.000Z',
      stale: false,
    },
    blastMap: null,
    blastSummary: 'SUMMARY_KEPT the change reaches the payment route.',
    issue: null,
    documents: [],
    findings: [],
    missing: [],
    blastState: null,
    ...over,
  };
}

/** Big enough that every one of the five cuts has to fire. */
function oversized(): RawBriefInputs {
  return base({
    blastMap: map([symbol('alpha', 12), symbol('beta', 9), symbol('gamma', 1)]),
    documents: [doc('docs/a.md', 3, 900), doc('docs/b.md', 3, 900), doc('docs/c.md', 3, 900)],
    issue: { number: 42, title: 'Issue title', body: 'z'.repeat(3000) },
    findings: [
      { severity: 'CRITICAL', title: 'Kept finding', file: 'src/a.ts', start_line: 1 },
      { severity: 'WARNING', title: 'Dropped warning', file: 'src/a.ts', start_line: 2 },
      { severity: 'SUGGESTION', title: 'Dropped suggestion', file: 'src/a.ts', start_line: 3 },
    ],
    changedFiles: Array.from({ length: 600 }, (_, i) => `src/generated/file-${i}.ts`),
  });
}

/**
 * An input NOTHING is allowed to shrink below the cap. Its blast map alone —
 * 400 symbol names, their endpoints, their crons and the one caller each keeps
 * under AC-14 — is far larger than the budget, and every one of those is on the
 * never-cut list. The five cuts fire, remove everything they may, and the
 * request is still over.
 */
function unfittable(): RawBriefInputs {
  return base({
    blastMap: map(Array.from({ length: 400 }, (_, i) => symbol(`sym${i}`, 3))),
    documents: [doc('docs/a.md', 3, 900)],
    issue: { number: 42, title: 'Issue title', body: 'z'.repeat(3000) },
    findings: [{ severity: 'WARNING', title: 'Dropped warning', file: 'src/a.ts', start_line: 2 }],
    changedFiles: Array.from({ length: 200 }, (_, i) => `src/generated/file-${i}.ts`),
  });
}

describe('fitToBudget', () => {
  it('returns an input that already fits untouched, with nothing cut', () => {
    const raw = base();
    const { fitted, cut } = fit(raw);

    expect(cut).toEqual([]);
    expect(fitted).toEqual(raw);
    expect(request(fitted)).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('fires the five cuts in order', () => {
    const { cut } = fit(oversized());

    expect(cut.map((c) => c.input)).toEqual([
      'blast_map',
      'documents',
      'issue',
      'findings',
      'changed_files',
    ]);
    expect(cut[0]!.detail).toMatch(/caller tails/);
    expect(cut[2]!.detail).toBe('issue body');
    expect(cut[3]!.detail).toMatch(/below high/);
    expect(cut[4]!.detail).toMatch(/of 600 changed files/);
  });

  it('brings the input inside the budget', () => {
    const { fitted } = fit(oversized());
    expect(request(fitted)).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('leaves every symbol at least one caller, including one that started with exactly one', () => {
    const { fitted } = fit(oversized());

    for (const s of fitted.blastMap!.symbols) {
      expect(s.callers.length).toBeGreaterThanOrEqual(1);
    }
    expect(fitted.blastMap!.symbols.find((s) => s.name === 'gamma')!.callers).toHaveLength(1);
  });

  it("AC-14: the never-cut set survives the whole chain", () => {
    const { fitted } = fit(oversized());
    const text = render(fitted);

    // PR metadata and diff stats.
    expect(text).toContain('+12 -3 across 1 files');
    // The whole of the intent, and the blast summary paragraph.
    expect(text).toContain('INTENT_KEPT');
    expect(text).toContain('SUMMARY_KEPT');
    // Every symbol, endpoint and cron NAME of the map.
    for (const name of ['alpha', 'beta', 'gamma']) {
      expect(text).toContain(name);
      expect(text).toContain(`POST /${name}`);
      expect(text).toContain(`cron-${name}`);
    }
    // The issue keeps its title even though its body went.
    expect(text).toContain('Issue title');
    // And the top-severity finding is still there.
    expect(text).toContain('Kept finding');
    expect(text).not.toContain('Dropped warning');
  });

  // Trimming shrinks the PROMPT, never the SET (2026-08-24): the set is built
  // from the COMPLETE inputs, so a document the fitter dropped is still a
  // document this pull request selected, and naming it is not an invention.
  it('a document dropped by cut 2 stays in the allowed-name set', () => {
    const raw = oversized();
    const droppedPath = raw.documents[raw.documents.length - 1]!.path;
    const names = collectAllowedNames(raw);
    const { fitted, cut } = fit(raw);

    expect(fitted.documents.some((d) => d.path === droppedPath)).toBe(false);
    expect(names.has(droppedPath)).toBe(true);
    expect(ungroundedNames([droppedPath], names)).toEqual([]);
    expect(cut.some((c) => c.input === 'documents')).toBe(true);
  });

  // AC-12 as revised 2026-08-24: a request is the system prompt PLUS the JSON
  // schema PLUS the user text. The premise below is the whole point — the user
  // text alone is inside the cap, so the measurement this replaces (which
  // counted only `buildBriefPrompt().userText`) would have sent this untouched
  // and over budget.
  it('cuts an input whose user text fits alone but not once the system prompt and schema are counted', () => {
    const raw = base({
      changedFiles: Array.from({ length: 570 }, (_, i) => `src/generated/file-${i}.ts`),
    });

    expect(count(render(raw))).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
    expect(request(raw)).toBeGreaterThan(BRIEF_TOKEN_BUDGET);

    const { fitted, cut } = fit(raw);

    expect(cut.map((c) => c.input)).toEqual(['changed_files']);
    expect(fitted.changedFiles.length).toBeLessThan(raw.changedFiles.length);
    expect(request(fitted)).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('the wide-PR trap: 600 changed files and nothing else cuttable still fits', () => {
    const raw = base({
      changedFiles: Array.from({ length: 600 }, (_, i) => `src/generated/file-${i}.ts`),
    });
    const { fitted, cut } = fit(raw);

    expect(request(fitted)).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
    expect(cut).toHaveLength(1);
    expect(cut[0]!.input).toBe('changed_files');
    expect(cut[0]!.detail).toMatch(/^\d+ of 600 changed files$/);

    // The head of the ranked list is kept and the tail is gone from the PROMPT —
    // but every one of those cut paths is still an allowed name. This is the
    // shape of the live 422 of 2026-08-24: the model named `mcp/src/args.ts`,
    // a real changed file the fitter had cut, and the brief was rejected.
    const names = collectAllowedNames(raw);
    const dropped = raw.changedFiles.filter((p) => !fitted.changedFiles.includes(p));
    expect(dropped.length).toBeGreaterThan(0);
    expect(fitted.changedFiles[0]).toBe('src/generated/file-0.ts');
    expect(render(fitted)).not.toContain(dropped[0]!);
    for (const path of dropped.slice(0, 20)) {
      expect(names.has(path)).toBe(true);
    }
    expect(ungroundedNames(dropped.slice(0, 20), names)).toEqual([]);

    // The mirror: a path that is in NO input at all is still rejected.
    expect(ungroundedNames(['src/generated/file-99999.ts'], names)).toEqual([
      'src/generated/file-99999.ts',
    ]);
  });

  /**
   * The whole point of `overBudget`: an unachievable budget must not read the
   * same as a satisfied one. Before this flag existed the case below returned
   * `{ fitted, cut }` unconditionally — every changed file deleted and the
   * request still more than twice the cap, with nothing said anywhere
   * (measured live 2026-08-24 at 35 299 tokens against 16 000).
   */
  it('reports the overrun when the five cuts cannot bring the input under the cap', () => {
    const { fitted, cut, overBudget } = fit(unfittable());

    // The premise: it really does not fit, even after everything below.
    expect(request(fitted)).toBeGreaterThan(BRIEF_TOKEN_BUDGET);
    expect(overBudget).not.toBeNull();
    expect(overBudget!.budget).toBe(BRIEF_TOKEN_BUDGET);
    expect(overBudget!.measured).toBe(request(fitted));
    // And it did cut everything it was allowed to cut first.
    expect(cut.map((c) => c.input)).toEqual([
      'blast_map',
      'documents',
      'issue',
      'findings',
      'changed_files',
    ]);
    expect(fitted.changedFiles).toEqual([]);
  });

  it('reports no overrun when the input fits, cut or untouched', () => {
    expect(fit(base()).overBudget).toBeNull();
    expect(fit(oversized()).overBudget).toBeNull();
  });
});
