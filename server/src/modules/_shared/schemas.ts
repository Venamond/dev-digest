import { z } from 'zod';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/** Common mutation ack — DELETE/cancel/etc. that only report success. */
export const OkResponse = z.object({ ok: z.boolean() });

/** In-flight run row from GET /pulls/:id/runs/active (no full RunSummary yet). */
export const ActiveRunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  ran_at: z.string().nullable(),
});
