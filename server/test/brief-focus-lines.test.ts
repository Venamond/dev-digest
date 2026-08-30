import { describe, it, expect } from 'vitest';
import type { ReviewFocusItem } from '@devdigest/shared';
import { attachFocusLines, dedupeFocus } from '../src/modules/brief/focus-lines.js';
import { firstChangedLine } from '../src/modules/brief/patch-line.js';
import type { BriefFinding } from '../src/modules/brief/gather.js';

/**
 * AC-40 (SPEC-2026-08-23-pr-why-risk-brief): the review-focus line comes from a
 * finding of the finished run — highest severity first, lowest line breaking a
 * tie — or from nowhere at all.
 */
function finding(part: Partial<BriefFinding>): BriefFinding {
  return { severity: 'WARNING', title: 'A finding', file: 'src/a.ts', start_line: 1, ...part };
}

const FOCUS: ReviewFocusItem[] = [
  { file_ref: 'src/a.ts', reason: 'The limiter runs before the auth check.' },
];

describe('attachFocusLines (AC-40)', () => {
  it('takes the line of the HIGHEST-severity finding, not the earliest one', () => {
    const out = attachFocusLines(FOCUS, [
      finding({ severity: 'SUGGESTION', start_line: 4 }),
      finding({ severity: 'CRITICAL', start_line: 90 }),
      finding({ severity: 'WARNING', start_line: 12 }),
    ]);
    // 90, not 4: severity decides before position.
    expect(out[0]?.line).toBe(90);
  });

  it('breaks a severity tie on the LOWEST line number', () => {
    const out = attachFocusLines(FOCUS, [
      finding({ severity: 'CRITICAL', start_line: 200 }),
      finding({ severity: 'CRITICAL', start_line: 44 }),
      finding({ severity: 'CRITICAL', start_line: 77 }),
    ]);
    expect(out[0]?.line).toBe(44);
  });

  it('leaves the entry with NO line key when no finding names its file', () => {
    const out = attachFocusLines(FOCUS, [finding({ file: 'src/other.ts', start_line: 7 })]);
    expect(out[0]).not.toHaveProperty('line');
    // The rest of the entry is untouched — the row still renders and still links.
    expect(out[0]?.file_ref).toBe('src/a.ts');
    expect(out[0]?.reason).toContain('auth check');
  });

  it('attaches nothing when the run produced no findings at all', () => {
    const out = attachFocusLines(FOCUS, []);
    expect(out[0]).not.toHaveProperty('line');
  });

  it('attaches per entry: one file with a finding, one without, in one list', () => {
    const out = attachFocusLines(
      [
        { file_ref: 'src/a.ts', reason: 'r1' },
        { file_ref: 'src/b.ts', reason: 'r2' },
      ],
      [finding({ file: 'src/a.ts', severity: 'CRITICAL', start_line: 31 })],
    );
    expect(out[0]?.line).toBe(31);
    expect(out[1]).not.toHaveProperty('line');
  });

  it('matches a file_ref that carries its own line suffix against the finding path', () => {
    const out = attachFocusLines(
      [{ file_ref: 'src/a.ts:5-9', reason: 'r' }],
      [finding({ file: 'src/a.ts', severity: 'CRITICAL', start_line: 31 })],
    );
    expect(out[0]?.line).toBe(31);
  });

  it('ranks a severity outside the enum below every one it can classify', () => {
    const out = attachFocusLines(FOCUS, [
      finding({ severity: 'MYSTERY', start_line: 2 }),
      finding({ severity: 'SUGGESTION', start_line: 60 }),
    ]);
    expect(out[0]?.line).toBe(60);
  });
});

/**
 * AC-40, revised 2026-08-24: a finding is the FIRST source of the line, no
 * longer the only one. `pr_files.patch` holds the unified diff per file, and
 * the `+c` of its first hunk header is a head-relative line — the same side
 * the Files changed tab renders. It is read server-side only; nothing about it
 * reaches the model (AC-2 restricts what is SENT, not what is read).
 */
describe('attachFocusLines — the changed-file fallback (AC-40)', () => {
  it('prefers the finding over the patch when the file has both', () => {
    const out = attachFocusLines(FOCUS, [finding({ severity: 'CRITICAL', start_line: 31 })], {
      'src/a.ts': 12,
    });
    expect(out[0]?.line).toBe(31);
  });

  it('falls back to the first changed line when no finding names the file', () => {
    const out = attachFocusLines(FOCUS, [], { 'src/a.ts': 12 });
    expect(out[0]?.line).toBe(12);
  });

  it('falls back per entry: the finding file keeps its finding, the other takes its patch line', () => {
    const out = attachFocusLines(
      [
        { file_ref: 'src/a.ts', reason: 'r1' },
        { file_ref: 'src/b.ts', reason: 'r2' },
      ],
      [finding({ file: 'src/a.ts', severity: 'CRITICAL', start_line: 31 })],
      { 'src/a.ts': 2, 'src/b.ts': 88 },
    );
    expect(out[0]?.line).toBe(31);
    expect(out[1]?.line).toBe(88);
  });

  it('matches a file_ref carrying its own line suffix against the changed-file map', () => {
    const out = attachFocusLines([{ file_ref: 'src/a.ts:5-9', reason: 'r' }], [], {
      'src/a.ts': 12,
    });
    expect(out[0]?.line).toBe(12);
  });

  it('leaves NO line when the file has neither a finding nor a changed-file line', () => {
    const out = attachFocusLines(FOCUS, [], { 'src/other.ts': 12 });
    expect(out[0]).not.toHaveProperty('line');
    expect(out[0]?.file_ref).toBe('src/a.ts');
  });
});

/**
 * The parser behind that fallback. A patch column is free text written by
 * GitHub or by a seed script, so every shape it can hold must resolve to a
 * number or to `null` — never to a throw, and never to a line the file does
 * not have.
 */
describe('firstChangedLine', () => {
  it('reads the new-side start of the first hunk header', () => {
    const patch = ['@@ -10,3 +12,4 @@', '   port: 3000,', '+  stripeKey: "x",'].join('\n');
    expect(firstChangedLine(patch)).toBe(12);
  });

  it('takes the FIRST hunk, not a later one', () => {
    const patch = ['@@ -1,2 +1,3 @@', '+a', '@@ -40,2 +41,3 @@', '+b'].join('\n');
    expect(firstChangedLine(patch)).toBe(1);
  });

  it('reads a single-line hunk header with no count', () => {
    expect(firstChangedLine('@@ -7 +9 @@\n+a')).toBe(9);
  });

  it('skips the file header lines of a full unified diff', () => {
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -4,2 +6,3 @@',
      '+a',
    ].join('\n');
    expect(firstChangedLine(patch)).toBe(6);
  });

  it('returns null for an absent, empty or malformed patch instead of throwing', () => {
    expect(firstChangedLine(null)).toBeNull();
    expect(firstChangedLine(undefined)).toBeNull();
    expect(firstChangedLine('')).toBeNull();
    expect(firstChangedLine('Binary files differ')).toBeNull();
    expect(firstChangedLine('@@ not a header @@')).toBeNull();
    // A new-side start of 0 is not a line any file has.
    expect(firstChangedLine('@@ -0,0 +0,0 @@')).toBeNull();
  });
});

describe('dedupeFocus (AC-11)', () => {
  const item = (file_ref: string, reason: string): ReviewFocusItem => ({ file_ref, reason });

  it('keeps the first mention of a file and drops the later one', () => {
    const out = dedupeFocus([
      item('a.ts', 'the important reason'),
      item('b.ts', 'another file'),
      item('a.ts', 'a second, lower-priority reason'),
    ]);
    expect(out.map((i) => i.file_ref)).toEqual(['a.ts', 'b.ts']);
    // The FIRST reason survives: the list is ordered most important first.
    expect(out[0]!.reason).toBe('the important reason');
  });

  it('leaves a list with no repeats exactly as it was', () => {
    const input = [item('a.ts', 'one'), item('b.ts', 'two')];
    expect(dedupeFocus(input)).toEqual(input);
  });

  it('treats two spellings of one path as two entries', () => {
    const out = dedupeFocus([item('./a.ts', 'one'), item('a.ts', 'two')]);
    expect(out).toHaveLength(2);
  });
});
