/**
 * `get_blast_radius` — the downstream impact map of a pull request, read from
 * `GET /pulls/:id/blast` (`server/src/modules/blast/routes.ts`). Zero LLM
 * calls by default: the route only reads DevDigest's persistent code index.
 *
 * `summary: true` additionally posts to `/pulls/:id/blast/summary`, which
 * spends one real LLM call. That is why this tool carries no `readOnlyHint`
 * — the annotation is per tool, not per call, and a tool with a paid code
 * path must not be auto-approved as a read (`AGENTS.md`, annotations). The
 * paragraph is generated from the map's node list alone and is never
 * persisted server-side, so it exists only inside this response.
 *
 * The payload is trimmed to what a model can act on (D21 of
 * docs/plans/2026-08-19-blast-radius.md): state, totals, and per changed
 * symbol its callers, endpoints and crons. `prior_pulls`, `link` and the
 * per-caller `rank` are studio affordances and stay in the studio.
 *
 * An unindexed or stale repository is a SUCCESS payload carrying `hint`, not
 * an `isError`: the API answered, the map is simply empty, and the caveat
 * belongs in the response where it is paid once — never in the `description`,
 * which every chat pays at startup.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import { requiredArg } from '../args.js';
import type { BlastResponse, BlastSummaryResponse } from '../api/types.js';
import {
  errorContent,
  jsonContent,
  MAX_BLAST_CALLERS_PER_SYMBOL,
  MAX_BLAST_SYMBOLS,
} from '../format.js';

export const GET_BLAST_RADIUS_DESCRIPTION =
  'Maps which files and symbols a pull request impacts, and who calls them. Requires the repository to be indexed by DevDigest first.';

/**
 * The one caveat the caller cannot infer from the numbers. `index_stale`
 * outranks the state: an index written by an older indexer reports
 * `status: full` while its caller data is missing entirely, so "no callers"
 * there is a false negative, not a fact.
 */
function blastHint(blast: BlastResponse): string | undefined {
  if (blast.reason === 'index_stale') {
    return 'This repository was indexed by an older DevDigest indexer, so callers and endpoints are missing rather than absent. Re-analyze the repo in the studio at http://localhost:3000 before treating this map as complete.';
  }
  if (blast.state === 'degraded') {
    return 'DevDigest has not indexed this repository yet. Open it in the studio at http://localhost:3000 and run "Re-analyze", then retry.';
  }
  if (blast.state === 'partial') {
    return 'The repository index is incomplete; some callers may be missing.';
  }
  return undefined;
}

export function registerGetBlastRadius(server: McpServer, api: DevDigestApi): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: GET_BLAST_RADIUS_DESCRIPTION,
      inputSchema: z.object({
        pr_id: z.string().describe('pull request uuid, from the studio URL'),
        summary: z
          .boolean()
          .optional()
          .describe('also explain the map in one paragraph; costs one LLM call (default false)'),
      }),
    },
    async ({ pr_id, summary: wantSummary }) => {
      try {
        const prId = requiredArg('pr_id', pr_id, "Copy the uuid from the studio URL.");
        const blast = await api.get<BlastResponse>(`/pulls/${encodeURIComponent(prId)}/blast`);

        const hint = blastHint(blast);

        if (blast.state === 'degraded') {
          return jsonContent({
            state: blast.state,
            ...(blast.reason ? { reason: blast.reason } : {}),
            totals: blast.totals,
            symbols: [],
            // The server answers a summary request on a degraded map with a
            // 409. Saying so here costs nothing and skips a round trip that
            // can only fail.
            ...(wantSummary ? { summary_skipped: 'the repository is not indexed, so there is no map to explain' } : {}),
            ...(hint ? { hint } : {}),
          });
        }

        const kept = blast.symbols.slice(0, MAX_BLAST_SYMBOLS);
        const symbols = kept.map((s) => ({
          file: s.file,
          name: s.name,
          kind: s.kind,
          callers: s.callers.slice(0, MAX_BLAST_CALLERS_PER_SYMBOL).map((c) => ({
            file: c.file,
            symbol: c.symbol,
            line: c.line,
          })),
          callers_total: s.callers_total,
          // The server capped per symbol too; either cap having bitten means
          // the rendered list is not everything that was found.
          callers_truncated: s.callers_truncated || s.callers.length > MAX_BLAST_CALLERS_PER_SYMBOL,
          endpoints: s.endpoints,
          crons: s.crons,
        }));

        const truncated =
          kept.length < blast.symbols.length ||
          kept.some((s) => s.callers.length > MAX_BLAST_CALLERS_PER_SYMBOL);

        // Requested but pointless: an empty map is the server's other 409.
        const summarySkipped =
          wantSummary && symbols.length === 0
            ? 'this pull request has no mapped impact to explain'
            : undefined;

        let paragraph: BlastSummaryResponse | undefined;
        let summaryError: string | undefined;
        if (wantSummary && !summarySkipped) {
          try {
            paragraph = await api.post<BlastSummaryResponse>(
              `/pulls/${encodeURIComponent(prId)}/blast/summary`,
              {},
            );
          } catch (err) {
            // The map is the answer; the paragraph is a garnish. A rate limit
            // (10/min) or an unconfigured provider must not discard work the
            // caller already paid a round trip for — the same partial-failure
            // shape `list_agents` uses for its skills fan-out.
            summaryError = err instanceof Error ? err.message : String(err);
          }
        }

        return jsonContent({
          state: blast.state,
          ...(blast.reason ? { reason: blast.reason } : {}),
          totals: blast.totals,
          symbols,
          downstream_truncated: blast.downstream_truncated,
          ...(truncated ? { truncated: true } : {}),
          ...(paragraph ? { summary: paragraph.summary, summary_model: paragraph.model } : {}),
          ...(summarySkipped ? { summary_skipped: summarySkipped } : {}),
          ...(summaryError ? { summary_error: summaryError } : {}),
          ...(hint ? { hint } : {}),
        });
      } catch (err) {
        return errorContent(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
