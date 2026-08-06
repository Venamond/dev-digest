/** Conventions Extractor constants. */

/** Top-N ranked source files (excluding configs/tests) via repo-intel. */
export const SAMPLE_FILE_COUNT = 12;

/** Cap on candidates kept after grounding + dedupe. */
export const MAX_CANDIDATES = 12;

/**
 * Lines of file context padded above/below a grounded match for the UI card.
 * Skill body still uses only rule + path:line — not this excerpt.
 */
export const EVIDENCE_CONTEXT_PAD = 3;

/** Hard cap on stored evidence excerpt length (pad + match). */
export const EVIDENCE_MAX_LINES = 12;

/** Per-file character budget when building the LLM prompt. */
export const PER_FILE_CHAR_BUDGET = 6_000;

/** Default skill name for an extracted conventions skill. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/**
 * Config filenames probed at the clone root. Presence is checked with CloneFs;
 * missing names are skipped — the model only sees files that exist.
 */
export const CONFIG_FILENAMES = [
  'package.json',
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
] as const;
