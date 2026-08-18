/**
 * `get_blast_radius` — a deliberate, honest stub (D15). Its `description`
 * describes a working tool on purpose: the model is meant to call it,
 * receive this forward-leading `isError`, and follow the alternative it
 * names — the live *errors lead forward* demonstration. No network is ever
 * made here.
 *
 * The facade method this points at — `repoIntel.getBlastRadius(repoId,
 * changedFiles): Promise<BlastResult>` (`server/src/modules/repo-intel/
 * service.ts:214`, interface at `types.ts:147`) — exists, but
 * `server/src/modules/repo-intel/routes.ts` exposes no route for it.
 * Wiring the route is a later lesson (L04); that pointer belongs here and
 * in `mcp/AGENTS.md`, never in the user-facing text.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import { errorContent } from '../format.js';

export const GET_BLAST_RADIUS_DESCRIPTION =
  'Maps which files and symbols a pull request impacts, and who calls them.';

export function registerGetBlastRadius(server: McpServer, _api: DevDigestApi): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: GET_BLAST_RADIUS_DESCRIPTION,
      inputSchema: z.object({
        repo: z.string().describe('owner/name'),
        pr: z.number().int().positive().describe('pull request number'),
      }),
      annotations: { readOnlyHint: true },
    },
    async () =>
      errorContent(
        `get_blast_radius is not implemented yet (planned for a later lesson). Instead: call get_conventions(repo) for this repo's rules, or read the "file" field of each finding from run_agent_on_pr / get_findings to see what this PR touches.`,
      ),
  );
}
