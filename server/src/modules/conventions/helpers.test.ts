import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  composeDraftMeta,
  composeSkillBody,
  dedupeCandidates,
  evidenceUrl,
  expandEvidenceRange,
  formatEvidenceRef,
  groundCandidate,
  normalizeWs,
  parseCandidates,
  ruleSlug,
  selectSamplePaths,
  type GroundedCandidate,
  type RawCandidate,
} from './helpers.js';
import { EVIDENCE_CONTEXT_PAD, EVIDENCE_MAX_LINES } from './constants.js';

function raw(partial: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: partial.category ?? 'imports',
    rule: partial.rule ?? 'Use .js extensions',
    confidence: partial.confidence ?? 0.9,
    evidence: {
      path: 'src/a.ts',
      line_start: 1,
      line_end: 1,
      snippet: "import { x } from './y.js';",
      ...partial.evidence,
    },
  };
}

describe('selectSamplePaths', () => {
  it('puts configs first and dedupes', () => {
    expect(selectSamplePaths(['package.json', 'src/a.ts'], ['src/a.ts', 'src/b.ts'])).toEqual([
      'package.json',
      'src/a.ts',
      'src/b.ts',
    ]);
  });
});

describe('parseCandidates', () => {
  it('parses a wrapped candidates object', () => {
    const text = JSON.stringify({
      candidates: [
        {
          category: 'imports',
          rule: 'Use .js extensions',
          evidence: { path: 'a.ts', line_start: 2, line_end: 2, snippet: 'import x' },
          confidence: 0.8,
        },
      ],
    });
    expect(parseCandidates(text)).toHaveLength(1);
  });

  it('drops malformed items and accepts fenced JSON', () => {
    const text = '```json\n{"candidates":[{"rule":"ok","category":"c","evidence":{"path":"a","line_start":1,"line_end":1,"snippet":"x"},"confidence":0.5},{"bad":true}]}\n```';
    expect(parseCandidates(text)).toHaveLength(1);
  });

  it('returns [] on garbage', () => {
    expect(parseCandidates('not json')).toEqual([]);
  });
});

describe('expandEvidenceRange', () => {
  it('pads the match and clamps to file bounds', () => {
    expect(expandEvidenceRange(10, 5, 5, 3, 12)).toEqual({ start: 2, end: 8 });
    expect(expandEvidenceRange(5, 1, 1, 3, 12)).toEqual({ start: 1, end: 4 });
    expect(expandEvidenceRange(5, 5, 5, 3, 12)).toEqual({ start: 2, end: 5 });
  });

  it('keeps the matched core when trimming to maxLines', () => {
    expect(expandEvidenceRange(40, 20, 22, 3, 8)).toEqual({ start: 18, end: 25 });
  });
});

describe('groundCandidate', () => {
  const content = ['line0', "import { x } from './y.js';", 'line2'].join('\n');
  const files = new Map([['src/a.ts', content]]);
  const sampled = new Set(['src/a.ts']);

  it('keeps a candidate when the snippet matches the claimed line', () => {
    const g = groundCandidate(raw({ evidence: { path: 'src/a.ts', line_start: 2, line_end: 2, snippet: "import { x } from './y.js';" } }), sampled, files);
    // Match on line 2 → pad to full 3-line file for UI context.
    expect(g).toMatchObject({
      evidence_line_start: 1,
      evidence_line_end: 3,
      evidence_snippet: content,
    });
  });

  it('corrects line numbers when the snippet is elsewhere', () => {
    const g = groundCandidate(raw({ evidence: { path: 'src/a.ts', line_start: 99, line_end: 99, snippet: "import { x } from './y.js';" } }), sampled, files);
    expect(g?.evidence_line_start).toBe(1);
    expect(g?.evidence_line_end).toBe(3);
  });

  it('stores the file excerpt with original newlines, indentation, and context pad', () => {
    const file = ["export async function f() {", "  const user = await fetchUser(id);", "  return user;", "}"].join('\n');
    const multi = new Map([['src/a.ts', file]]);
    const g = groundCandidate(
      raw({
        evidence: {
          path: 'src/a.ts',
          line_start: 2,
          line_end: 3,
          // Flattened model output — grounding must replace with real lines.
          snippet: 'const user = await fetchUser(id); return user;',
        },
      }),
      new Set(['src/a.ts']),
      multi,
    );
    expect(g?.evidence_snippet).toBe(file);
    expect(g).toMatchObject({ evidence_line_start: 1, evidence_line_end: 4 });
  });

  it('expands a too-narrow line claim when the flattened snippet spans multiple lines', () => {
    const file = ["export async function f() {", "  const user = await fetchUser(id);", "  return user;", "}"].join('\n');
    const multi = new Map([['src/a.ts', file]]);
    const g = groundCandidate(
      raw({
        evidence: {
          path: 'src/a.ts',
          // Model pointed at one line only, but snippet text covers two.
          line_start: 2,
          line_end: 2,
          snippet: 'const user = await fetchUser(id); return user;',
        },
      }),
      new Set(['src/a.ts']),
      multi,
    );
    expect(g).toMatchObject({
      evidence_line_start: 1,
      evidence_line_end: 4,
      evidence_snippet: file,
    });
  });

  it('drops paths outside the sample and missing snippets', () => {
    expect(groundCandidate(raw({ evidence: { path: 'other.ts', line_start: 1, line_end: 1, snippet: 'x' } }), sampled, files)).toBeNull();
    expect(groundCandidate(raw({ evidence: { path: 'src/a.ts', line_start: 1, line_end: 1, snippet: 'NOPE' } }), sampled, files)).toBeNull();
  });
});

describe('dedupeCandidates', () => {
  it('keeps the higher-confidence duplicate', () => {
    const a: GroundedCandidate = {
      category: 'c',
      rule: 'Always await',
      evidence_path: 'a.ts',
      evidence_snippet: 'x',
      evidence_line_start: 1,
      evidence_line_end: 1,
      confidence: 0.5,
    };
    const b = { ...a, confidence: 0.9, evidence_path: 'b.ts' };
    expect(dedupeCandidates([a, b])).toEqual([b]);
  });
});

describe('ruleSlug / composeSkillBody / evidenceUrl', () => {
  it('slugs rules like the mockup', () => {
    expect(ruleSlug('Always use async/await instead of .then() chains')).toBe(
      'always-use-async-await-instead-of-then-chains',
    );
  });

  it('does not leave a trailing hyphen when truncating long rules', () => {
    const long =
      'Domain tables must carry a workspace_id foreign key referencing workspaces.id and never omit it';
    expect(ruleSlug(long).endsWith('-')).toBe(false);
    expect(ruleSlug(long).length).toBeLessThanOrEqual(64);
  });

  it('composes a skill body with rule + path only (no code, no line range)', () => {
    const body = composeSkillBody('repo-conventions', 'payments-api', [
      {
        rule: 'Always use async/await instead of .then() chains',
        evidence_path: 'src/api/users.ts',
        evidence_line_start: 23,
        evidence_line_end: 31,
      },
    ]);
    expect(body).toContain('# repo-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('## always-use-async-await-instead-of-then-chains');
    expect(body).toContain('Source: `src/api/users.ts`');
    expect(body).not.toContain('23-31');
    expect(body).not.toContain('Detected in');
    expect(body).not.toContain('await fetchUser');
  });

  it('merges every accepted convention into the skill body', () => {
    const body = composeSkillBody('repo-conventions', 'payments-api', [
      { rule: 'Always await', evidence_path: 'a.ts' },
      { rule: 'Prefer named exports', evidence_path: 'b.ts' },
      { rule: 'Keep handlers thin', evidence_path: 'c.ts' },
    ]);
    expect(body).toContain('## always-await');
    expect(body).toContain('## prefer-named-exports');
    expect(body).toContain('## keep-handlers-thin');
    expect(body).toContain('Source: `a.ts`');
    expect(body).toContain('Source: `b.ts`');
    expect(body).toContain('Source: `c.ts`');
    expect(body.match(/^## /gm)?.length).toBe(3);
  });

  it('builds a pinned GitHub blob URL', () => {
    expect(evidenceUrl('acme/payments-api', 'abc123', 'src/a.ts', 2, 4)).toBe(
      'https://github.com/acme/payments-api/blob/abc123/src/a.ts#L2-L4',
    );
    expect(formatEvidenceRef('src/a.ts', 2, 2)).toBe('src/a.ts:2');
  });

  it('composeDraftMeta uses repo-conventions + count description', () => {
    const draft = composeDraftMeta('payments-api', [
      {
        rule: 'x',
        evidence_path: 'a.ts',
        evidence_line_start: 1,
        evidence_line_end: 1,
      },
    ]);
    expect(draft.name).toBe('repo-conventions');
    expect(draft.description).toBe('1 house convention extracted from payments-api');
  });
});

describe('normalizeWs', () => {
  it('collapses whitespace', () => {
    expect(normalizeWs('  a \n b  ')).toBe('a b');
  });
});

describe('buildPrompt', () => {
  it('includes file paths, the JSON contract, and multi-line snippet guidance', () => {
    const p = buildPrompt([{ path: 'package.json', content: '{"type":"module"}' }]);
    expect(p).toContain('### package.json');
    expect(p).toContain('"candidates"');
    expect(p).toContain('{"type":"module"}');
    expect(p).toContain(`${EVIDENCE_CONTEXT_PAD}–${EVIDENCE_MAX_LINES} lines`);
  });
});
