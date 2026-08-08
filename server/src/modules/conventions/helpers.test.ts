import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  composeDraftMeta,
  composeSkillBody,
  dedupeCandidates,
  dedupeUniqueCount,
  defaultSkillName,
  evidenceUrl,
  expandEvidenceRange,
  ExtractionResponseSchema,
  formatEvidenceRef,
  groundCandidate,
  normalizeWs,
  selectSamplePaths,
  type GroundedCandidate,
  type RawCandidate,
} from './helpers.js';
import {
  EVIDENCE_CONTEXT_PAD,
  EVIDENCE_MAX_LINES,
  FALLBACK_SKILL_NAME,
  MAX_CANDIDATES,
  SKILL_NAME_SLUG_MAX,
  SKILL_NAME_SUFFIX,
} from './constants.js';

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

// This is the real extraction path: the service calls `completeStructured`
// with this schema, so validation happens here rather than in a text parser.
describe('ExtractionResponseSchema', () => {
  const candidate = {
    category: 'imports',
    rule: 'Use .js extensions',
    evidence: { path: 'a.ts', line_start: 2, line_end: 4, snippet: 'import x' },
    confidence: 0.8,
  };

  it('accepts a well-formed response', () => {
    const r = ExtractionResponseSchema.safeParse({ candidates: [candidate] });
    expect(r.success).toBe(true);
  });

  it('coerces numeric strings the model may emit', () => {
    const r = ExtractionResponseSchema.safeParse({
      candidates: [
        { ...candidate, confidence: '0.8', evidence: { ...candidate.evidence, line_start: '2' } },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.candidates[0]!.confidence).toBe(0.8);
    expect(r.success && r.data.candidates[0]!.evidence.line_start).toBe(2);
  });

  it('rejects a candidate missing evidence', () => {
    const { evidence: _omitted, ...noEvidence } = candidate;
    expect(ExtractionResponseSchema.safeParse({ candidates: [noEvidence] }).success).toBe(false);
  });

  it('rejects confidence outside 0..1 and non-positive line numbers', () => {
    expect(
      ExtractionResponseSchema.safeParse({ candidates: [{ ...candidate, confidence: 1.5 }] })
        .success,
    ).toBe(false);
    expect(
      ExtractionResponseSchema.safeParse({
        candidates: [{ ...candidate, evidence: { ...candidate.evidence, line_start: 0 } }],
      }).success,
    ).toBe(false);
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

describe('dedupeUniqueCount', () => {
  const base: GroundedCandidate = {
    category: 'c',
    rule: 'Always await',
    evidence_path: 'a.ts',
    evidence_snippet: 'x',
    evidence_line_start: 1,
    evidence_line_end: 1,
    confidence: 0.5,
  };

  it('counts distinct rules, ignoring case and whitespace', () => {
    const same = { ...base, rule: '  always   AWAIT ' };
    const other = { ...base, rule: 'Never use any' };
    expect(dedupeUniqueCount([base, same, other])).toBe(2);
  });

  // The point of this helper: it lets the caller separate "lost to duplicates"
  // from "lost to the MAX_CANDIDATES cap" instead of reporting one total.
  it('reports uniques before the cap, so cap losses stay distinguishable', () => {
    const many = Array.from({ length: MAX_CANDIDATES + 4 }, (_, i) => ({
      ...base,
      rule: `Rule number ${i}`,
    }));
    const withDupes = [...many, { ...base, rule: 'Rule number 0' }];

    const unique = dedupeUniqueCount(withDupes);
    const kept = dedupeCandidates(withDupes);

    expect(withDupes.length - unique).toBe(1); // duplicate
    expect(unique - kept.length).toBe(4); // truncated by the cap
  });
});

describe('defaultSkillName', () => {
  it('derives the name from the repo so two repos never collide', () => {
    expect(defaultSkillName('payments-api')).toBe('payments-api-conventions');
    expect(defaultSkillName('billing-worker')).toBe('billing-worker-conventions');
    expect(defaultSkillName('payments-api')).not.toBe(defaultSkillName('billing-worker'));
  });

  it('slugifies names that are not already slug-shaped', () => {
    expect(defaultSkillName('Payments API')).toBe('payments-api-conventions');
    expect(defaultSkillName('acme/payments_api')).toBe('acme-payments-api-conventions');
  });

  it('falls back when the repo name slugifies to nothing', () => {
    expect(defaultSkillName('///')).toBe(FALLBACK_SKILL_NAME);
    expect(defaultSkillName('')).toBe(FALLBACK_SKILL_NAME);
  });

  it('caps the prefix and never leaves a trailing hyphen before the suffix', () => {
    const long = 'a'.repeat(SKILL_NAME_SLUG_MAX + 20);
    const name = defaultSkillName(long);
    expect(name.endsWith(`-${SKILL_NAME_SUFFIX}`)).toBe(true);
    expect(name).not.toContain('--');

    // A name whose cap boundary lands on a separator must not yield `x--conventions`.
    const boundary = `${'b'.repeat(SKILL_NAME_SLUG_MAX - 1)} tail`;
    expect(defaultSkillName(boundary)).not.toContain('--');
  });
});

describe('composeSkillBody / evidenceUrl', () => {
  it('composes rule + path only when there is no snippet — no line range either', () => {
    const body = composeSkillBody('payments-api-conventions', 'payments-api', [
      {
        rule: 'Always use async/await instead of .then() chains',
        evidence_path: 'src/api/users.ts',
        category: 'async',
        confidence: 0.9,
        evidence_line_start: 23,
        evidence_line_end: 31,
      },
    ]);
    expect(body).toContain('# Skill: payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('## async');
    expect(body).toContain('- Always use async/await instead of .then() chains (seen in `src/api/users.ts`)');
    // Stored ranges are padded UI windows — they would misdirect the agent.
    expect(body).not.toContain('23-31');
  });

  it('renders the already-grounded snippet as a fenced example under the rule', () => {
    const body = composeSkillBody('s', 'r', [
      {
        rule: 'Repositories own their table',
        evidence_path: 'src/modules/repos/repository.ts',
        category: 'layering',
        confidence: 0.9,
        evidence_snippet: 'export class ReposRepository {\n  constructor(private db: Db) {}\n}',
      },
    ]);
    expect(body).toContain('- Repositories own their table');
    expect(body).toContain('  Detected in `src/modules/repos/repository.ts`:');
    // Nested under the bullet (2-space indent) so it stays part of the list item.
    expect(body).toContain(
      '  ```\n  export class ReposRepository {\n    constructor(private db: Db) {}\n  }\n  ```',
    );
    // No duplicate "(seen in ...)" once there's a fenced example.
    expect(body).not.toContain('seen in');
  });

  it('widens the fence when the snippet itself contains a code fence', () => {
    const snippet = 'Use ```ts blocks in docs, never ~~~ or other markers.';
    const body = composeSkillBody('s', 'r', [
      { rule: 'x', evidence_path: 'a.md', category: 'docs', evidence_snippet: snippet },
    ]);
    expect(body).toContain(`  \`\`\`\`\n  ${snippet}\n  \`\`\`\``);
  });

  it('falls back to (seen in path) when a candidate has no snippet', () => {
    const body = composeSkillBody('s', 'r', [
      { rule: 'no snippet here', evidence_path: 'a.ts', category: 'x', evidence_snippet: null },
    ]);
    expect(body).toContain('- no snippet here (seen in `a.ts`)');
    expect(body).not.toContain('```');
  });

  // The old format printed a slug heading followed by the same sentence in
  // prose, doubling the tokens of every rule in every prompt.
  it('does not repeat the rule text as a heading', () => {
    const rule = 'Always use async/await instead of .then() chains';
    const body = composeSkillBody('s', 'r', [
      { rule, evidence_path: 'a.ts', category: 'async', confidence: 0.9 },
    ]);
    expect(body).not.toContain('always-use-async-await');
    expect(body.match(/Always use async\/await/g)).toHaveLength(1);
  });

  it('groups rules by category, one heading per category', () => {
    const body = composeSkillBody('s', 'payments-api', [
      { rule: 'Always await', evidence_path: 'a.ts', category: 'async', confidence: 0.9 },
      { rule: 'Prefer named exports', evidence_path: 'b.ts', category: 'imports', confidence: 0.8 },
      { rule: 'Keep handlers thin', evidence_path: 'c.ts', category: 'async', confidence: 0.7 },
    ]);
    expect(body.match(/^## /gm)).toHaveLength(2);
    expect(body).toContain('## async');
    expect(body).toContain('## imports');
    expect(body).toContain('- Always await (seen in `a.ts`)');
    expect(body).toContain('- Keep handlers thin (seen in `c.ts`)');
  });

  it('orders categories by their strongest rule and rules by confidence', () => {
    const body = composeSkillBody('s', 'r', [
      { rule: 'weak rule', evidence_path: 'a.ts', category: 'naming', confidence: 0.4 },
      { rule: 'strong rule', evidence_path: 'b.ts', category: 'layering', confidence: 0.95 },
      { rule: 'mid rule', evidence_path: 'c.ts', category: 'layering', confidence: 0.6 },
    ]);
    expect(body.indexOf('## layering')).toBeLessThan(body.indexOf('## naming'));
    expect(body.indexOf('strong rule')).toBeLessThan(body.indexOf('mid rule'));
  });

  it("buckets uncategorised rules under 'other' and puts them last", () => {
    const body = composeSkillBody('s', 'r', [
      { rule: 'no category', evidence_path: 'a.ts', category: null, confidence: 0.99 },
      { rule: 'has category', evidence_path: 'b.ts', category: 'imports', confidence: 0.1 },
    ]);
    expect(body).toContain('## other');
    // Highest confidence, but `other` is a fallback bucket — still last.
    expect(body.indexOf('## imports')).toBeLessThan(body.indexOf('## other'));
  });

  it('omits the source suffix when a rule has no evidence path', () => {
    const body = composeSkillBody('s', 'r', [
      { rule: 'bare rule', evidence_path: '  ', category: 'misc', confidence: 0.5 },
    ]);
    expect(body).toContain('- bare rule');
    expect(body).not.toContain('seen in');
  });

  it('builds a pinned GitHub blob URL', () => {
    expect(evidenceUrl('acme/payments-api', 'abc123', 'src/a.ts', 2, 4)).toBe(
      'https://github.com/acme/payments-api/blob/abc123/src/a.ts#L2-L4',
    );
    expect(formatEvidenceRef('src/a.ts', 2, 2)).toBe('src/a.ts:2');
  });

  it('composeDraftMeta uses the repo-scoped name + count description', () => {
    const draft = composeDraftMeta('payments-api', [
      {
        rule: 'x',
        evidence_path: 'a.ts',
        evidence_line_start: 1,
        evidence_line_end: 1,
      },
    ]);
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.description).toBe('1 house convention extracted from payments-api');
    // The body's H1 must match the name the skill is saved under.
    expect(draft.body).toContain('# Skill: payments-api-conventions');
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
