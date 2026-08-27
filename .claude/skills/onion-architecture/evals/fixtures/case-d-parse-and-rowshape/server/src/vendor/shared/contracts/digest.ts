import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * Weekly digest DTOs. A digest rolls a workspace's reviews for a period into
 * one card: counts by severity, the worst offenders, and when it last ran.
 */

export const DigestWindow = z.enum(['7d', '30d']);
export type DigestWindow = z.infer<typeof DigestWindow>;

export const DigestEntry = z.object({
  review_id: z.string().uuid(),
  pr_number: z.number().int(),
  worst_severity: Severity,
  finding_count: z.number().int(),
});
export type DigestEntry = z.infer<typeof DigestEntry>;

export const Digest = z.object({
  window: DigestWindow,
  generated_at: z.string(),
  last_run_at: z.string().nullable(),
  total_findings: z.number().int(),
  entries: z.array(DigestEntry),
});
export type Digest = z.infer<typeof Digest>;

export const CreateDigest = z.object({
  window: DigestWindow,
  include_dismissed: z.boolean().optional(),
});
export type CreateDigest = z.infer<typeof CreateDigest>;
