import { describe, it, expect } from 'vitest';
import type { EvalSkillCaseFiles } from '@devdigest/shared';
import { buildUnifiedDiff } from './diff-builder.js';
import { parseUnifiedDiff } from '../../../adapters/git/diff-parser.js';

/**
 * The round trip IS the test. A builder whose output `parseUnifiedDiff` reads
 * back as nothing produces a case that fails on every run for a reason no
 * screen can explain, and nothing else in the pipeline would notice.
 */

const PATH = 'snippet.ts';

const files = (over: Partial<EvalSkillCaseFiles>): EvalSkillCaseFiles => ({
  path: PATH,
  mode: 'modified',
  before: '',
  after: '',
  ...over,
});

const USER_RESPONSE_BEFORE = [
  'export type UserResponse = {',
  '  id: string;',
  '  legacyId: string;',
  '  name: string;',
  '};',
  '',
].join('\n');

describe('buildUnifiedDiff — round trip through parseUnifiedDiff', () => {
  it('a modified file keeps its path and covers the changed line', () => {
    const after = USER_RESPONSE_BEFORE.replace('  legacyId: string;', '  legacy_id: string;');
    const built = buildUnifiedDiff(files({ before: USER_RESPONSE_BEFORE, after }));

    // Without a `@@` header the parser ignores every line and the diff reads as
    // nothing at all — assert the header exists before asserting on the parse.
    expect(built).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    expect(built).toContain(`--- a/${PATH}`);
    expect(built).toContain(`+++ b/${PATH}`);

    const parsed = parseUnifiedDiff(built);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe(PATH);
    expect(parsed.files[0]!.additions).toBe(1);
    expect(parsed.files[0]!.deletions).toBe(1);
    // Line 3 on the NEW side is the rewritten field — a finding cited there has
    // to ground, which is the only reason the numbering matters.
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toContain(3);
  });

  it('a removed field parses back as one deletion on the file it was removed from', () => {
    const after = USER_RESPONSE_BEFORE.replace('  legacyId: string;\n', '');
    const parsed = parseUnifiedDiff(
      buildUnifiedDiff(files({ before: USER_RESPONSE_BEFORE, after })),
    );

    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe(PATH);
    expect(parsed.files[0]!.deletions).toBe(1);
    expect(parsed.files[0]!.additions).toBe(0);
  });

  it('a new file uses /dev/null on the --- line and still names the path on +++', () => {
    const built = buildUnifiedDiff(
      files({ mode: 'new', before: '', after: 'export const x = 1;\nexport const y = 2;\n' }),
    );

    expect(built).toContain('--- /dev/null');
    expect(built).toContain(`+++ b/${PATH}`);
    expect(built).toContain('@@ -0,0 +1,2 @@');

    const parsed = parseUnifiedDiff(built);
    // The parser takes the path from `+++` and drops any file whose path is
    // empty — `/dev/null` on that line would silently lose the whole case.
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe(PATH);
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('mode "new" ignores whatever Before holds — a new file has no old side', () => {
    const built = buildUnifiedDiff(
      files({ mode: 'new', before: 'leftover from the other tab\n', after: 'const x = 1;\n' }),
    );

    expect(built).not.toContain('-leftover from the other tab');
    expect(parseUnifiedDiff(built).files[0]!.deletions).toBe(0);
  });

  it('identical Before and After build nothing, which parses to zero files', () => {
    const same = 'const a = 1;\nconst b = 2;\n';
    const built = buildUnifiedDiff(files({ before: same, after: same }));

    expect(built).toBe('');
    // This is the shape the service refuses to save: a case that can never run.
    expect(parseUnifiedDiff(built).files).toHaveLength(0);
  });

  it('a change on the last line with no trailing newline still grounds', () => {
    const built = buildUnifiedDiff(files({ before: 'a\nb\nc', after: 'a\nb\nd' }));

    // No `\ No newline at end of file` marker: the parser would read it as a
    // context line and let it consume a new-side number that does not exist.
    expect(built).not.toContain('\\ No newline');

    const parsed = parseUnifiedDiff(built);
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toContain(3);
    expect(parsed.files[0]!.additions).toBe(1);
  });

  it('content lines starting with -- or @@ are not mistaken for headers', () => {
    const built = buildUnifiedDiff(
      files({
        before: 'const a = 1;\n',
        after: 'const a = 1;\n-- a sql comment\n@@ not a hunk header\n',
      }),
    );

    const parsed = parseUnifiedDiff(built);
    expect(parsed.files).toHaveLength(1);
    // Both lines counted as additions: neither `+-- …` nor `+@@ …` matches the
    // `---`/`@@` header branches, which test the line START, not its content.
    expect(parsed.files[0]!.additions).toBe(2);
    expect(parsed.files[0]!.hunks).toHaveLength(1);
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2, 3]);
  });

  it('a DELETED line starting with -- leaves the new-side numbering intact', () => {
    const built = buildUnifiedDiff(
      files({ before: '-- a sql comment\nconst a = 1;\n', after: 'const a = 1;\n' }),
    );

    const parsed = parseUnifiedDiff(built);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.path).toBe(PATH);
    // Known parser limitation, asserted rather than hidden: `-` + `-- …` spells
    // `--- …`, which `parseUnifiedDiff` skips as a header line, so this one
    // deletion is not counted. Nothing a finding cites depends on it — the
    // new-side numbering, which grounding actually reads, is unaffected.
    expect(parsed.files[0]!.hunks[0]!.newLineNumbers).toEqual([1]);
  });

  it('changes far apart become two hunks, each with its own header', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const after = before.replace('line 2', 'line 2 edited').replace('line 18', 'line 18 edited');
    const built = buildUnifiedDiff(files({ before, after }));

    expect(built.match(/^@@ /gm)).toHaveLength(2);
    const parsed = parseUnifiedDiff(built);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.hunks).toHaveLength(2);
    expect(parsed.files[0]!.additions).toBe(2);
    expect(parsed.files[0]!.deletions).toBe(2);
  });
});
