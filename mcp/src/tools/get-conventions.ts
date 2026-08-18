/**
 * `get_conventions` — reads the conventions DevDigest already extracted for
 * a repo (§2c, Call sequence). `evidence_snippet`/`evidence_url` are never
 * included — they are verbatim third-party repo text and the largest
 * injection surface (§2c, "What is never sent to a model").
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import { resolveRepoId } from '../api/resolve.js';
import type { ConventionsList } from '../api/types.js';
import { errorContent, jsonContent, MAX_CONVENTIONS } from '../format.js';

export const GET_CONVENTIONS_DESCRIPTION = 'Returns the coding conventions DevDigest extracted for a repository.';

export function registerGetConventions(server: McpServer, api: DevDigestApi): void {
  server.registerTool(
    'get_conventions',
    {
      description: GET_CONVENTIONS_DESCRIPTION,
      inputSchema: z.object({
        repo: z.string().describe('owner/name'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ repo }) => {
      try {
        const { repoId } = await resolveRepoId(api, repo);
        const list = await api.get<ConventionsList>(`/repos/${encodeURIComponent(repoId)}/conventions`);

        const kept = list.candidates.filter((c) => c.status !== 'rejected');
        if (kept.length === 0) {
          return jsonContent({
            conventions: [],
            total: 0,
            hint: 'No conventions extracted yet. Run the Conventions Extractor for this repo in the studio.',
          });
        }

        const capped = kept.slice(0, MAX_CONVENTIONS);
        const conventions = capped.map((c) => ({
          rule: c.rule,
          status: c.status,
          ...(c.category !== null ? { category: c.category } : {}),
        }));

        return jsonContent({
          conventions,
          total: kept.length,
          ...(capped.length < kept.length ? { truncated: true } : {}),
          ...(list.scan !== null ? { scanned_at: list.scan.scanned_at } : {}),
        });
      } catch (err) {
        return errorContent(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
