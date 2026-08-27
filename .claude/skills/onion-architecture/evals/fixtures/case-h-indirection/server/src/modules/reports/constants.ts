/** A15 — reports module tuning values. Leaf file: no imports, no behaviour. */

export const REPORT_WINDOWS = ['7d', '30d', '90d'] as const;

/** Rows per page in the reports table view. */
export const REPORT_PAGE_SIZE = 50;

/** A report older than this is regenerated rather than served from cache. */
export const REPORT_TTL_MS = 6 * 60 * 60 * 1000;

/** Reviews below this score are counted as "needs attention" in the rollup. */
export const ATTENTION_SCORE = 60;
