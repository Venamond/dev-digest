/**
 * `get_findings` — reads persisted reviews, never starts a run (D8's
 * counterpart to `run_agent_on_pr`). D5 is the whole point of this file:
 * with no `agent` argument, "newest" means "newest per agent", unioned —
 * never `reviews[0]` (§2c). `GET /pulls/:id/reviews` is already newest-first
 * (`reviewsForPull` orders `desc(t.reviews.createdAt)`), so keeping the
 * first row seen per `agent_id` keeps the newest one.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import { optionalArg, requiredArg } from '../args.js';
import { resolveAgentId } from '../api/resolve.js';
import type { ReviewRecord } from '../api/types.js';
import {
  errorContent,
  jsonContent,
  MAX_FINDINGS_FULL,
  MAX_FINDINGS_SUMMARY,
  selectFindings,
  type Severity,
} from '../format.js';

export const GET_FINDINGS_DESCRIPTION =
  'Returns the verdict and findings from reviews already done for a pull request, without starting a new run.';

type Verdict = ReviewRecord['verdict'];

/** `request_changes > comment > approve`; `null` ranks lowest (§2c, D5). */
const VERDICT_RANK: Record<'request_changes' | 'comment' | 'approve', number> = {
  request_changes: 0,
  comment: 1,
  approve: 2,
};

/** The worst verdict across the kept reviews. `null` wins only when it is the only value. */
function worstVerdict(verdicts: Verdict[]): Verdict {
  let best: Verdict = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const v of verdicts) {
    if (v === null) continue;
    const rank = VERDICT_RANK[v];
    if (rank < bestRank) {
      bestRank = rank;
      best = v;
    }
  }
  return best;
}

export function registerGetFindings(server: McpServer, api: DevDigestApi): void {
  server.registerTool(
    'get_findings',
    {
      description: GET_FINDINGS_DESCRIPTION,
      inputSchema: z.object({
        pr_id: z.string().describe('pull request uuid, from the studio URL'),
        agent: z.string().optional().describe('name or id from list_agents; omit to union every agent'),
        severity_min: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']).optional().describe('lowest severity to keep'),
        detail: z
          .enum(['summary', 'full'])
          .default('summary')
          .optional()
          .describe('full adds rationale and id but caps at 20 findings; summary caps at 50'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ pr_id, agent, severity_min, detail }) => {
      try {
        const prId = requiredArg('pr_id', pr_id, "Copy the uuid from the studio URL.");
        // A cleared field means "every agent", which is this tool's default —
        // not a lookup for an agent named "".
        const agentArg = optionalArg(agent);

        let agentId: string | undefined;
        if (agentArg !== undefined) {
          agentId = (await resolveAgentId(api, agentArg)).agentId;
        }

        const reviews = await api.get<ReviewRecord[]>(`/pulls/${encodeURIComponent(prId)}/reviews`);
        const scoped = agentId === undefined ? reviews : reviews.filter((r) => r.agent_id === agentId);

        if (scoped.length === 0) {
          return jsonContent({
            verdict: null,
            summary: null,
            findings: [],
            total: 0,
            hint: 'No review yet for this PR. Call run_agent_on_pr.',
          });
        }

        // D5: keep the first (newest) review per agent_id — reviews is
        // already newest-first.
        const seenAgents = new Set<string | null>();
        const kept: ReviewRecord[] = [];
        for (const review of scoped) {
          if (seenAgents.has(review.agent_id)) continue;
          seenAgents.add(review.agent_id);
          kept.push(review);
        }

        const allFindings = kept.flatMap((r) => r.findings);
        const detailUsed = detail ?? 'summary';
        const selected = selectFindings(allFindings, {
          ...(severity_min !== undefined ? { severityMin: severity_min as Severity } : {}),
          detail: detailUsed,
        });

        const verdict = worstVerdict(kept.map((r) => r.verdict));
        const first = kept[0] as ReviewRecord;
        const summary =
          kept.length === 1 ? first.summary : kept.map((r) => `${r.agent_name ?? r.agent_id}: ${r.summary}`).join('\n');

        // Both caveats below are emitted only when they apply, and are joined
        // rather than picked between: a truncated payload from a PR that also
        // has superseded reviews needs to say both things, and silently
        // dropping one because the field holds a single string is the bug
        // this shape avoids.
        const hints: string[] = [];

        // `detail: 'full'` caps lower than `'summary'` (20 vs 50) because each
        // finding carries `rationale`. Asking for more detail therefore returns
        // fewer findings — the opposite of what a caller expects — so say so in
        // the payload rather than in the tool description, which is token-capped.
        if (selected.truncated && detailUsed === 'full') {
          hints.push(
            `Showing ${selected.findings.length} of ${selected.total} findings: detail "full" caps at ${MAX_FINDINGS_FULL}. Call again with detail "summary" for up to ${MAX_FINDINGS_SUMMARY}.`,
          );
        }

        // D5 keeps one review per agent, so a re-run silently replaces that
        // agent's earlier opinion. That is the right answer — an older run's
        // finding may already be fixed, and reporting it would send the caller
        // to repair nothing — but a bare total reads as "everything this PR
        // has". Say what was set aside, and where the full history lives.
        const superseded = scoped.length - kept.length;
        if (superseded > 0) {
          const names = [...new Set(scoped.filter((r) => !kept.includes(r)).map((r) => r.agent_name ?? r.agent_id ?? 'unknown'))];
          hints.push(
            `${superseded} older review${superseded === 1 ? '' : 's'} from ${names.join(', ')} ${superseded === 1 ? 'is' : 'are'} superseded by a newer run of the same agent and not counted here. The studio timeline lists every run.`,
          );
        }

        const hint = hints.length > 0 ? hints.join(' ') : undefined;

        return jsonContent({
          verdict,
          summary,
          findings: selected.findings,
          total: selected.total,
          ...(selected.truncated ? { truncated: true } : {}),
          ...(hint !== undefined ? { hint } : {}),
        });
      } catch (err) {
        return errorContent(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
