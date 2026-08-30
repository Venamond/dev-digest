import type { PrIntentRecord } from '@devdigest/shared';
import { IntentRiskArea } from '@devdigest/shared';
import type { PrIntentRow, PullRow } from '../../../db/rows.js';

/**
 * The pure row → record mapper, kept out of `classify.ts` on purpose: that file
 * imports the container and the review repository, so any module that only
 * wants this mapping would drag both in transitively.
 */
export function toPrIntentRecord(row: PrIntentRow, pull: PullRow): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: (row.riskAreas ?? []).map((r) => IntentRiskArea.parse(r)),
    confidence: row.confidence ?? 0,
    sources: row.sources ?? [],
    missing_context: row.missingContext ?? [],
    pr_id: pull.id,
    head_sha: row.headSha ?? '',
    model: row.model ?? '',
    classified_at: row.classifiedAt?.toISOString() ?? '',
    stale: !row.headSha || row.headSha !== pull.headSha,
  };
}
