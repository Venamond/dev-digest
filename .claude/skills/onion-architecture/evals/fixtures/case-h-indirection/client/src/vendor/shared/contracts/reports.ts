import { z } from 'zod';
import { Severity } from './findings.js';
import { REPORT_WINDOWS } from '../../modules/reports/constants.js';

/**
 * Report DTOs. A report rolls a workspace's reviews for a window into counts
 * by severity plus the reviews that need attention.
 */

export const ReportWindow = z.enum(REPORT_WINDOWS);
export type ReportWindow = z.infer<typeof ReportWindow>;

export const ReportBucket = z.object({
  severity: Severity,
  count: z.number().int(),
});
export type ReportBucket = z.infer<typeof ReportBucket>;

export const ReportRow = z.object({
  review_id: z.string().uuid(),
  score: z.number().int().nullish(),
  verdict: z.string().nullish(),
  needs_attention: z.boolean(),
});
export type ReportRow = z.infer<typeof ReportRow>;

export const Report = z.object({
  window: ReportWindow,
  generated_at: z.string(),
  buckets: z.array(ReportBucket),
  rows: z.array(ReportRow),
});
export type Report = z.infer<typeof Report>;
