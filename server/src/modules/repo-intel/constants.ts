/**
 * repo-intel constants. Phase-tagged: [T1] used now; [T2]/[T3]
 * exported early so the pipeline lands against a single source of truth.
 */

// --- Job kinds (registered on JobRunner; enqueued from repos/service.ts) ----
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';

// --- Walk / parse scope -----------------------------------------------------
/** [T1] Files we parse (diff-scoped in T1; whole walk in T2). */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** [T1] Directories never walked. `.gitignore` is layered on top in T2 walk. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

// --- Read-time limits -------------------------------------------------------
/** [T1] Caller fan-out cap per changed symbol (ORDER BY rank DESC LIMIT N). */
export const MAX_CALLERS_PER_SYMBOL = 20;

/** [L04] Hard cap on reverse dependents kept per BFS level. */
export const MAX_REVERSE_DEPENDENTS = 200;

/**
 * [T1] Bumped whenever the AST extractor or symbol schema changes. A mismatch
 * with `repo_index_state.indexer_version` forces a full reindex.
 *
 * v2 (T3): graph + decl_file resolution + file_rank + repo-map landed, so every
 * T2 `partial` index must be rebuilt to gain the rank-driven data.
 *
 * v3 (L04): `extractCrons` changed shape — `file_facts.crons` now holds
 * `reset-rate-buckets (hourly)` where v2 held the raw `0 * * * *`. Mixing the
 * two would show one card half in words and half in cron syntax. The bump is
 * self-healing: `pipeline/incremental.ts:75` turns a version mismatch into a
 * full reindex, and until that runs `blast` reports `index_stale` with a
 * re-analyze CTA rather than serving the old format silently.
 */
export const INDEXER_VERSION = 3;

// --- [T2] Full-index limits (documented now, enforced in the pipeline) ------
export const MAX_INDEXED_FILES = 5000;
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
export const MAX_PARSE_MS_PER_FILE = 2000;
/** Soft self-watch budget (< JobRunner hard 120s) → finish as `partial`. */
export const INDEX_SOFT_BUDGET_MS = 110_000;

// --- [T3] Graph / hotness / repo-map ---------------------------------------
export const BFS_DEPTH = 2;
export const HOTNESS_WINDOW_DAYS = 180;
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500;
/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;

/**
 * [L04] Caller files excluded from blast radius: a test calling a changed
 * symbol is not downstream impact. Left in, they dominate the caller list of
 * anything well covered and inflate the counter with rows a reviewer cannot
 * act on. SQL patterns, applied in BOTH getResolvedCallers and
 * countResolvedCallers — filtering only one of them would make
 * `callers_total` disagree with the list and report false truncation.
 */
export const EXCLUDED_CALLER_PATTERNS = ['%.test.%', '%.spec.%', '%/__tests__/%'] as const;
