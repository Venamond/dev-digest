import { z } from 'zod';
import { Severity } from './findings.js';

/** Weekly report DTOs — the Monday summary the studio mails out. */

export const WeeklyBucket = z.object({
  severity: Severity,
  count: z.number().int(),
});
export type WeeklyBucket = z.infer<typeof WeeklyBucket>;

export const WeeklyReport = z.object({
  workspace_id: z.string().uuid(),
  week_start: z.string(),
  buckets: z.array(WeeklyBucket),
  reviews_run: z.number().int(),
  cost_usd: z.number().nullish(),
});
export type WeeklyReport = z.infer<typeof WeeklyReport>;
