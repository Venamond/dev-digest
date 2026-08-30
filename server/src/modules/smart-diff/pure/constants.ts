import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Deterministic thresholds and path patterns for the Smart Diff classifier
 * and split-suggestion rule (L03). Deliberately duplicated from, not
 * imported from, `repo-intel/constants.ts` / `reviews/intent/gather.ts` —
 * see docs/plans/2026-08-14-smart-diff.md §2b: those lists serve a different
 * purpose and contain entries (e.g. `vendor` in `EXCLUDED_DIRS`) that would
 * be actively wrong here.
 */

export const BOILERPLATE_FILENAMES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'go.sum',
  'poetry.lock',
  'composer.lock',
  'gemfile.lock',
  'podfile.lock',
]);

// Deliberately excludes `vendor` and `out` (§2b) — `server/src/vendor/shared`
// and `client/src/vendor/shared` are this repo's own Zod contracts.
export const BOILERPLATE_DIR_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '__snapshots__',
  '__generated__',
  'generated',
]);

export const BOILERPLATE_SUFFIXES: readonly string[] = [
  '.lock',
  '.snap',
  '.min.js',
  '.min.css',
  '.map',
  '.generated.ts',
  '.pb.go',
];

export const WIRING_FILENAMES: ReadonlySet<string> = new Set([
  'package.json',
  'tsconfig.json',
  'index.ts',
  'index.tsx',
  'index.js',
  'dockerfile',
  'docker-compose.yml',
  '.env.example',
]);

export const WIRING_DIR_SEGMENTS: ReadonlySet<string> = new Set([
  '.github',
  'config',
  'migrations',
  'scripts',
]);

export const WIRING_SUFFIXES: readonly string[] = [
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.config.ts',
  '.config.js',
  '.config.mjs',
  '.d.ts',
];

export const SPLIT_TOO_BIG_TOTAL_LINES = 400;
export const SPLIT_MIN_FILES_PER_GROUP = 2;
export const MAX_PROPOSED_SPLITS = 3;
export const ROOT_SPLIT_NAME = '(root)';
export const MAX_SUMMARY_SYMBOLS = 5;

export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];
