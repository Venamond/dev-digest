import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, type SmartDiffFileInput } from './assemble.js';

function file(overrides: Partial<SmartDiffFileInput> & { path: string }): SmartDiffFileInput {
  return { additions: 0, deletions: 0, patch: null, ...overrides };
}

describe('buildSmartDiff', () => {
  it('SmartDiff.parse does not throw for the empty-files fixture', () => {
    const result = buildSmartDiff({ files: [], findingLinesByFile: new Map() });
    expect(() => SmartDiff.parse(result)).not.toThrow();
    expect(result).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
  });

  it('groups in ROLE_ORDER: core, wiring, boilerplate — and SmartDiff.parse does not throw', () => {
    const result = buildSmartDiff({
      files: [
        file({ path: 'src/service.ts', additions: 5, deletions: 0 }),
        file({ path: 'package.json', additions: 1, deletions: 0 }),
        file({ path: 'pnpm-lock.yaml', additions: 100, deletions: 0 }),
      ],
      findingLinesByFile: new Map(),
    });
    expect(() => SmartDiff.parse(result)).not.toThrow();
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('boilerplate-exclusion trap: total_lines and too_big ignore the boilerplate bucket', () => {
    const result = buildSmartDiff({
      files: [
        file({ path: 'src/service.ts', additions: 5, deletions: 5 }),
        file({ path: 'pnpm-lock.yaml', additions: 5000, deletions: 4000 }),
      ],
      findingLinesByFile: new Map(),
    });
    expect(result.split_suggestion.total_lines).toBe(10);
    expect(result.split_suggestion.too_big).toBe(false);
  });

  it('too_big true: proposed_splits groups core files by first segment, >=2 members, sorted by count desc', () => {
    const alpha = Array.from({ length: 5 }, (_, i) => file({ path: `alpha/f${i}.ts`, additions: 20, deletions: 20 }));
    const beta = Array.from({ length: 7 }, (_, i) => file({ path: `beta/f${i}.ts`, additions: 20, deletions: 20 }));
    const result = buildSmartDiff({ files: [...alpha, ...beta], findingLinesByFile: new Map() });

    expect(result.split_suggestion.total_lines).toBe(480);
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits.length).toBeLessThanOrEqual(3);
    for (const split of result.split_suggestion.proposed_splits) {
      expect(split.files.length).toBeGreaterThanOrEqual(2);
    }
    expect(result.split_suggestion.proposed_splits.map((s) => s.name)).toEqual(['beta', 'alpha']);
    expect(result.split_suggestion.proposed_splits[0]!.files).toHaveLength(7);
  });

  it('too_big true but every top-level dir has exactly one file: proposed_splits is []', () => {
    const files = Array.from({ length: 12 }, (_, i) =>
      file({ path: `dir${i}/only.ts`, additions: 20, deletions: 20 }),
    );
    const result = buildSmartDiff({ files, findingLinesByFile: new Map() });
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('finding_lines: duplicates across reviews collapse and sort; a file with no findings gets []; an unmatched key produces no extra file', () => {
    const result = buildSmartDiff({
      files: [file({ path: 'src/a.ts' }), file({ path: 'src/b.ts' })],
      findingLinesByFile: new Map([
        ['src/a.ts', [52, 28, 52]],
        ['src/nonexistent.ts', [1, 2]],
      ]),
    });
    const core = result.groups.find((g) => g.role === 'core')!;
    const a = core.files.find((f) => f.path === 'src/a.ts')!;
    const b = core.files.find((f) => f.path === 'src/b.ts')!;
    expect(a.finding_lines).toEqual([28, 52]);
    expect(b.finding_lines).toEqual([]);
    expect(core.files).toHaveLength(2);
    expect(core.files.some((f) => f.path === 'src/nonexistent.ts')).toBe(false);
  });

  it('a file with a null patch still appears, with pseudocode_summary null', () => {
    const result = buildSmartDiff({
      files: [file({ path: 'src/a.ts', patch: null, additions: 1, deletions: 0 })],
      findingLinesByFile: new Map(),
    });
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.pseudocode_summary).toBeNull();
  });
});
