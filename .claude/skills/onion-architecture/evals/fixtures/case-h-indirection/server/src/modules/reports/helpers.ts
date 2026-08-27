import type { ReportBucket, ReportRow, Severity } from '@devdigest/shared';
import type { ReportReviewRow } from './aggregate.js';

/**
 * A15 — pure shapers for the report card. No I/O: every function takes rows the
 * aggregation already fetched.
 */

const BANDS: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

export function toReportRow(row: ReportReviewRow, needsAttention: boolean): ReportRow {
  return {
    review_id: row.id,
    score: row.score,
    verdict: row.verdict,
    needs_attention: needsAttention,
  };
}

export function bucketBySeverity(rows: ReportRow[]): ReportBucket[] {
  return BANDS.map((severity) => ({
    severity,
    count: rows.filter((r) => bandFor(r.score ?? 100) === severity).length,
  }));
}

/** Score bands mirror the studio's card colours: 0-29 red, 30-59 amber, 60+ grey. */
export function bandFor(score: number): Severity {
  if (score < 30) return 'CRITICAL';
  if (score < 60) return 'WARNING';
  return 'SUGGESTION';
}
