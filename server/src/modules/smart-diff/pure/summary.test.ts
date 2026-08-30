import { describe, it, expect } from 'vitest';
import { summarizePatch } from './summary.js';
import { MAX_SUMMARY_SYMBOLS } from './constants.js';

describe('summarizePatch', () => {
  it('happy path: two exported symbols on added lines', () => {
    const patch = ['+export const createThing = () => {};', '+export type Thing = { id: string };'].join('\n');
    expect(summarizePatch(patch)).toBe('+2/−0 · new exports: createThing, Thing');
  });

  it('returns null for null', () => {
    expect(summarizePatch(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(summarizePatch('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(summarizePatch(undefined)).toBeNull();
  });

  it('does not count +++ / --- diff header lines as added/removed', () => {
    const patch = ['+++ b/file.ts', '--- a/file.ts', '+const x = 1;', '-const y = 2;'].join('\n');
    // Only the real +/- content lines count: 1 added, 1 removed.
    expect(summarizePatch(patch)).toBe('+1/−1');
  });

  it('truncates exported names to exactly MAX_SUMMARY_SYMBOLS', () => {
    const lines = Array.from({ length: MAX_SUMMARY_SYMBOLS + 3 }, (_, i) => `+export const fn${i} = () => {};`);
    const result = summarizePatch(lines.join('\n'))!;
    const namesPart = result.split('new exports: ')[1]!;
    const names = namesPart.split(', ');
    expect(names).toHaveLength(MAX_SUMMARY_SYMBOLS);
    expect(names).toEqual(Array.from({ length: MAX_SUMMARY_SYMBOLS }, (_, i) => `fn${i}`));
  });

  it('never leaks raw patch text of a non-export added line — planted secret does not appear', () => {
    const patch = ['+export const createThing = () => {};', '+const key = "sk_live_totally_fake_secret";'].join(
      '\n',
    );
    const result = summarizePatch(patch)!;
    expect(result).not.toContain('sk_live');
    expect(result).not.toContain('key');
    expect(result).toBe('+2/−0 · new exports: createThing');
  });
});
