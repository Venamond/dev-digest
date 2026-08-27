import type { Severity } from './contracts/findings.js';

/**
 * Weekly rollup arithmetic. Shared by the server's weekly module and the
 * client's report view, so it lives next to the contracts.
 */

export interface RollupInput {
  severity: Severity;
  count: number;
}

/** The transaction handle the caller is already inside, so the rollup and the
 *  write it produces land atomically. */
export interface TxLike {
  update(table: unknown): {
    set(values: Record<string, unknown>): Promise<void>;
  };
}

export function totalFindings(rows: RollupInput[]): number {
  return rows.reduce((n, r) => n + r.count, 0);
}

export function severityShare(rows: RollupInput[], severity: Severity): number {
  const total = totalFindings(rows);
  if (total === 0) return 0;
  const hit = rows.find((r) => r.severity === severity);
  return hit ? hit.count / total : 0;
}

export async function persistWeeklyRollup(
  tx: TxLike,
  table: unknown,
  rows: RollupInput[],
): Promise<number> {
  const total = totalFindings(rows);
  await tx.update(table).set({ totalFindings: total, criticalShare: severityShare(rows, 'CRITICAL') });
  return total;
}
