import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROOTS,
  MARKDOWN_EXTENSION,
  DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING,
  SETTINGS_KEY_SEARCH_ROOTS,
  SETTINGS_KEY_TOKEN_CEILING,
  approxTokens,
} from '../src/modules/context/constants.js';

describe('project-context constants', () => {
  it('AC-2 — the search roots are exactly specs, docs and insights', () => {
    expect([...DEFAULT_ROOTS]).toEqual(['specs', 'docs', 'insights']);
    expect(MARKDOWN_EXTENSION).toBe('.md');
  });

  it('AC-28 — the default token ceiling is 32 000', () => {
    expect(DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING).toBe(32_000);
  });

  it('the two overrides are namespaced settings keys', () => {
    expect(SETTINGS_KEY_SEARCH_ROOTS).toBe('context.search_roots');
    expect(SETTINGS_KEY_TOKEN_CEILING).toBe('context.token_ceiling');
  });

  it('re-exports the one estimator, which takes a CHARACTER COUNT', () => {
    // chars/4, rounded up — the same heuristic the prompt log and the tabs use.
    expect(approxTokens(4)).toBe(1);
    expect(approxTokens('hello world'.length)).toBe(3);
    expect(approxTokens(0)).toBe(0);
  });
});
