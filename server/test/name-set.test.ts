import { describe, it, expect } from 'vitest';
import {
  addPath,
  normaliseSpan,
  ungroundedNodes,
  ungroundedNames,
} from '../src/modules/_shared/name-set.js';

/**
 * `modules/_shared/name-set.ts` — the grounding name set, extracted from
 * `blast/summary.ts` so `modules/brief` uses the same one instead of a copy.
 *
 * Every case here is a case that has already cost a 422 on a CORRECT model
 * answer (`server/INSIGHTS.md:14-30`), plus the structured-ref check the brief
 * needs. `test/blast-summary.test.ts` is unchanged and stays green — that is
 * the proof the move altered nothing.
 */
describe('addPath', () => {
  it('adds the whole path', () => {
    const s = new Set<string>();
    addPath('src/modules/blast/summary.ts', s);
    expect(s.has('src/modules/blast/summary.ts')).toBe(true);
  });

  it('adds every segment, and each segment with its extension stripped', () => {
    const s = new Set<string>();
    addPath('client/src/app/SettingsModels/SettingsModels.tsx', s);
    // The failure this exists to prevent: the model quotes `SettingsModels`,
    // lifted out of the path the map handed it, and the guard rejects it.
    expect(s.has('SettingsModels')).toBe(true);
    expect(s.has('SettingsModels.tsx')).toBe(true);
    expect(s.has('client')).toBe(true);
    expect(s.has('app')).toBe(true);
  });

  it('drops segments of two characters or fewer — they match noise', () => {
    const s = new Set<string>();
    addPath('a/b.ts', s);
    expect(s.has('a')).toBe(false);
    // 'b' is the extension-stripped form and is one character, so it is
    // dropped; 'b.ts' is four characters and is kept, exactly as before the
    // move. The length test is applied per form, not per segment.
    expect(s.has('b')).toBe(false);
    expect(s.has('b.ts')).toBe(true);
    expect(s.has('a/b.ts')).toBe(true);
  });

  it('accumulates into a set the caller owns', () => {
    const s = new Set<string>(['rateLimit']);
    addPath('src/mw.ts', s);
    expect(s.has('rateLimit')).toBe(true);
    expect(s.has('src/mw.ts')).toBe(true);
  });
});

describe('normaliseSpan', () => {
  it('strips a trailing call suffix', () => {
    expect(normaliseSpan('rateLimit()')).toBe('rateLimit');
    expect(normaliseSpan('rateLimit( )')).toBe('rateLimit');
  });

  it('strips a trailing :line and :line-line', () => {
    expect(normaliseSpan('src/mw.ts:23')).toBe('src/mw.ts');
    expect(normaliseSpan('src/routes/pay.ts:12-18')).toBe('src/routes/pay.ts');
  });

  it('leaves a bare name alone', () => {
    expect(normaliseSpan('  src/mw.ts  ')).toBe('src/mw.ts');
  });
});

describe('ungroundedNodes', () => {
  const nodes = new Set<string>();
  addPath('src/mw.ts', nodes);
  addPath('src/routes/pay.ts', nodes);
  nodes.add('rateLimit');
  nodes.add('POST /pay');

  it('accepts spans that name something in the set', () => {
    expect(ungroundedNodes('Changing `rateLimit` in `src/mw.ts` reaches `POST /pay`.', nodes)).toEqual([]);
  });

  // The first of the two 422s server/INSIGHTS.md:14-30 records.
  it('accepts `rateLimit()` when rateLimit is in the set', () => {
    expect(ungroundedNodes('It calls `rateLimit()` first.', nodes)).toEqual([]);
  });

  // The second one.
  it('accepts `src/mw.ts:23` when src/mw.ts is in the set', () => {
    expect(ungroundedNodes('See `src/mw.ts:23`.', nodes)).toEqual([]);
    expect(ungroundedNodes('See `src/routes/pay.ts:12-18`.', nodes)).toEqual([]);
  });

  it('reports an invented name AS WRITTEN, so the error quotes the model', () => {
    expect(ungroundedNodes('It also calls `nukeEverything()`.', nodes)).toEqual(['nukeEverything()']);
  });

  it('reports each offending span once', () => {
    expect(ungroundedNodes('`nope` and `nope` again.', nodes)).toEqual(['nope']);
  });

  it('accepts prose with no backticked span at all', () => {
    expect(ungroundedNodes('This change is broad but nothing is named here.', nodes)).toEqual([]);
  });
});

describe('ungroundedNames', () => {
  const nodes = new Set<string>();
  addPath('src/a.ts', nodes);

  it('accepts a ref that is in the set', () => {
    expect(ungroundedNames(['src/a.ts'], nodes)).toEqual([]);
  });

  it('reports a ref that is not', () => {
    expect(ungroundedNames(['src/z.ts'], nodes)).toEqual(['src/z.ts']);
  });

  it('applies the same normalisation as the prose check', () => {
    expect(ungroundedNames(['src/a.ts:41'], nodes)).toEqual([]);
    expect(ungroundedNames(['src/a.ts:41-52'], nodes)).toEqual([]);
  });

  it('checks refs that carry no backticks — the whole reason it exists', () => {
    // ungroundedNodes would scan this for backticked spans, find none, and
    // pass an entirely invented reference.
    expect(ungroundedNodes('src/z.ts', nodes)).toEqual([]);
    expect(ungroundedNames(['src/z.ts'], nodes)).toEqual(['src/z.ts']);
  });

  it('ignores an empty or whitespace-only ref rather than reporting it', () => {
    expect(ungroundedNames(['', '   '], nodes)).toEqual([]);
  });

  it('reports each offending ref once', () => {
    expect(ungroundedNames(['src/z.ts', 'src/z.ts'], nodes)).toEqual(['src/z.ts']);
  });
});

/**
 * The third recorded time this check failed CLOSED on a correct answer:
 * `POST /pulls/:id/brief` on a 109-file PR returned 422 naming seven refs that
 * are all real paths in this repository (`server/INSIGHTS.md`, Recurring Errors
 * & Fixes, 2026-08-24). Two of the three causes are fixed here — a directory is
 * never in the set, and a dropped leading dot. The third (a path the budget
 * fitter cut) is deliberately still rejected: AC-15 says a name the model never
 * saw is not grounded.
 */
describe('directories and dotfiles — the 2026-08-24 live 422', () => {
  const nodes = new Set<string>();
  addPath('mcp/src/tools/agents.ts', nodes);
  addPath('server/.dependency-cruiser.cjs', nodes);
  addPath('.claude/skills/zod/SKILL.md', nodes);

  it('accepts a directory that prefixes a real path, with a trailing slash', () => {
    expect(ungroundedNames(['mcp/src/tools/', '.claude/'], nodes)).toEqual([]);
  });

  it('accepts the same directory written without the trailing slash', () => {
    expect(ungroundedNames(['mcp/src/tools', '.claude'], nodes)).toEqual([]);
  });

  it('still rejects a directory that prefixes nothing in the set', () => {
    expect(ungroundedNames(['mcp/src/nope/'], nodes)).toEqual(['mcp/src/nope/']);
    expect(ungroundedNames(['invented/'], nodes)).toEqual(['invented/']);
  });

  it('does not accept a prefix that stops mid-segment', () => {
    // `mcp/src/too` is a prefix of the string, not of the path — a real
    // directory boundary is required, or the check degrades into startsWith.
    expect(ungroundedNames(['mcp/src/too/'], nodes)).toEqual(['mcp/src/too/']);
  });

  it('accepts `dependency-cruiser.cjs` when the set holds the dotted name', () => {
    expect(ungroundedNames(['dependency-cruiser.cjs'], nodes)).toEqual([]);
    expect(ungroundedNames(['server/dependency-cruiser.cjs'], nodes)).toEqual([]);
  });

  it('still rejects a dotless spelling whose dotted form is absent', () => {
    expect(ungroundedNames(['eslintrc.json'], nodes)).toEqual(['eslintrc.json']);
    expect(ungroundedNames(['mcp/src/tools/nope.ts'], nodes)).toEqual(['mcp/src/tools/nope.ts']);
  });

  // The same loosening reaches blast-summary grounding, because both callers
  // share this module. Prose, backticked, is the blast side.
  it('applies to the prose check too, since blast/summary.ts shares it', () => {
    expect(ungroundedNodes('Most of it lands in `mcp/src/tools/` and `.claude/`.', nodes)).toEqual([]);
    expect(ungroundedNodes('It also edits `dependency-cruiser.cjs`.', nodes)).toEqual([]);
    expect(ungroundedNodes('And `mcp/src/nope/`.', nodes)).toEqual(['mcp/src/nope/']);
  });
});
