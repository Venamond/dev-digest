import type { Severity } from '@devdigest/shared';
import type { DigestEntry } from '@devdigest/shared';
import type { DigestRow } from './repository.js';

/**
 * A11 — pure shapers for the digest card. No I/O: every function takes rows the
 * repository already fetched.
 */

const RANK: Record<string, number> = { SUGGESTION: 0, WARNING: 1, CRITICAL: 2 };

export function worstSeverity(rows: DigestRow[]): Severity {
  let worst: Severity = 'SUGGESTION';
  for (const row of rows) {
    const v = row.verdict === 'request_changes' ? 'CRITICAL' : 'WARNING';
    if (RANK[v] > RANK[worst]) worst = v as Severity;
  }
  return worst;
}

export function buildEntries(rows: DigestRow[]): DigestEntry[] {
  return rows.map((row) => ({
    review_id: row.id,
    pr_number: 0,
    worst_severity: worstSeverity([row]),
    finding_count: row.score === null ? 0 : Math.max(0, 100 - row.score),
  }));
}
