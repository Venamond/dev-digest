/**
 * Safe prompt-assembly stats: section name, source, length — never the bodies.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';
import { summarizePromptAssembly } from '../src/prompt-log.js';

const PLANTED_SECRET = 'sk_live_PLANTED_SECRET_DO_NOT_LOG';
const PLANTED_DIFF = 'diff --git a/secret.ts b/secret.ts\n+PLANTED_DIFF_BODY_UNIQUE';
const PLANTED_SPEC = 'PLANTED_PRIVATE_SPEC_CONTENTS unique';
const PLANTED_INTENT = 'PLANTED_INTENT_JSON_PRIVATE';

describe('summarizePromptAssembly', () => {
  const assembled = assemblePrompt({
    system: `agent prompt ${PLANTED_SECRET}`,
    skills: ['Flag X when Y'],
    memory: ['remember this'],
    specs: [PLANTED_SPEC],
    repoMap: 'src/index.ts — main',
    callers: 'foo() called from bar.ts',
    prDescription: 'Adds a thing',
    intent: PLANTED_INTENT,
    task: 'Review PR #1',
    diff: PLANTED_DIFF,
  });

  const summary = summarizePromptAssembly(assembled.assembly, {
    diffChars: PLANTED_DIFF.length,
    taskChars: 'Review PR #1'.length,
  });

  it('reports name, source, chars, and approx tokens for each present section', () => {
    const names = summary.sections.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'system',
        'skills',
        'memory',
        'specs',
        'repo_map',
        'callers',
        'pr_description',
        'intent',
        'diff',
        'task',
        'user',
      ]),
    );
    for (const section of summary.sections) {
      expect(section.source.length).toBeGreaterThan(0);
      expect(section.chars).toBeGreaterThan(0);
      expect(section.tokensApprox).toBe(Math.ceil(section.chars / 4));
    }
    expect(summary.totalChars).toBe(
      assembled.assembly.system.length + assembled.assembly.user.length,
    );
  });

  it('omits empty optional slots', () => {
    const { assembly } = assemblePrompt({ system: 'sys', diff: 'D' });
    const names = summarizePromptAssembly(assembly, { diffChars: 1 }).sections.map((s) => s.name);
    expect(names).not.toContain('skills');
    expect(names).not.toContain('specs');
    expect(names).not.toContain('intent');
    expect(names).toContain('system');
    expect(names).toContain('diff');
    expect(names).toContain('user');
  });

  it('never serializes secrets, the full diff, or private spec/intent bodies', () => {
    const dumped = JSON.stringify(summary);
    expect(dumped).not.toContain(PLANTED_SECRET);
    expect(dumped).not.toContain(PLANTED_DIFF);
    expect(dumped).not.toContain('PLANTED_DIFF_BODY_UNIQUE');
    expect(dumped).not.toContain(PLANTED_SPEC);
    expect(dumped).not.toContain(PLANTED_INTENT);
    expect(dumped).not.toContain('sk_live');
  });

  it('diff chars match the input length without copying the diff', () => {
    const diff = summary.sections.find((s) => s.name === 'diff');
    expect(diff?.chars).toBe(PLANTED_DIFF.length);
    expect(diff?.source).toBe('pr.diff');
  });
});
