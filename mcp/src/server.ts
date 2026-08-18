/**
 * Builds the `McpServer` and registers the five tools (S4). No network
 * happens here — `createMcpServer` only builds the tool registry;
 * `index.ts` performs the one `connect()` that starts I/O.
 *
 * `capabilities.tools.listChanged: false` is explicit (D10): this server's
 * tool set is static and never sends `notifications/tools/list_changed`;
 * omitting the field would make `setToolRequestHandlers()` advertise
 * `listChanged: true` by default (R10), which would be a lie.
 */
import { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from './api/client.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

export const INSTRUCTIONS = [
  'DevDigest reviews GitHub pull requests with local AI agents.',
  'Call list_agents first, then run_agent_on_pr; use get_findings to re-read a past review.',
  'repo is always "owner/name" (e.g. octocat/hello-world); pr is the PR number.',
  'Requires the DevDigest API running on localhost:3001 (./scripts/dev.sh).',
].join('\n');

export function createMcpServer(api: DevDigestApi): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '0.1.0' },
    { instructions: INSTRUCTIONS, capabilities: { tools: { listChanged: false } } },
  );

  registerListAgents(server, api);
  registerRunAgentOnPr(server, api);
  registerGetFindings(server, api);
  registerGetConventions(server, api);
  registerGetBlastRadius(server, api);

  return server;
}
