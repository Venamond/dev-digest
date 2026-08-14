/** Feature-local — stays in this folder until a second feature needs it. */
export const DIFF_ORDERS = ["smart", "original"] as const;
export type DiffOrder = (typeof DIFF_ORDERS)[number];
export const DEFAULT_DIFF_ORDER: DiffOrder = "smart";
