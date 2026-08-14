/** Feature-local — stays in this folder until a second feature needs it. */
export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];
export const DEFAULT_DIFF_ORDER: DiffOrder = "smart";

/** Runs created in one "Run all" share ran_at (rows are inserted up front).
 *  A later solo run is a new wave once this gap is exceeded. */
export const REVIEW_WAVE_GAP_MS = 2 * 60 * 1000;
