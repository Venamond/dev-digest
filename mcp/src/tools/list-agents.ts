/**
 * `list_agents` — the only tool with no `inputSchema` (S4). Per §2c's call
 * sequence: `GET /agents`, then `GET /agents/:id/skills` per agent (D7 —
 * ruled on and kept: the tool exists to help a model pick the right agent,
 * so it returns skill *names*, not a bare count).
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from '../api/client.js';
import type { Agent, AgentSkillEditorRow } from '../api/types.js';
import { errorContent, jsonContent, MAX_AGENTS } from '../format.js';

export const LIST_AGENTS_DESCRIPTION =
  'Lists the review agents configured in DevDigest, with their model and skills. Call this first to get a valid agent name for run_agent_on_pr.';

export function registerListAgents(server: McpServer, api: DevDigestApi): void {
  server.registerTool(
    'list_agents',
    {
      description: LIST_AGENTS_DESCRIPTION,
      annotations: { readOnlyHint: true },
    },
    async (_ctx) => {
      try {
        const agents = await api.get<Agent[]>('/agents');

        if (agents.length === 0) {
          return jsonContent({
            agents: [],
            total: 0,
            hint: 'No agents configured. Create one in the studio at http://localhost:3000/agents.',
          });
        }

        // Localhost-only fan-out (D7) — only `skill.name` ever reaches the model.
        // `allSettled`, not `all`: every call is independent, so one agent's
        // skills fetch failing must not discard every other agent's data —
        // that agent's `skills` degrades to `[]` with a marker instead.
        const skillsResults = await Promise.allSettled(
          agents.map((a) => api.get<AgentSkillEditorRow[]>(`/agents/${encodeURIComponent(a.id)}/skills`)),
        );

        const withSkills = agents.map((agent, i) => {
          const result = skillsResults[i];
          if (result?.status === 'rejected') {
            return { id: agent.id, name: agent.name, model: agent.model, skills: [], skills_unavailable: true };
          }
          const rows = result?.status === 'fulfilled' ? result.value : [];
          const skills = rows
            .filter((r) => r.linked && r.enabled)
            .sort((a, b) => a.order - b.order)
            .map((r) => r.skill.name);
          return { id: agent.id, name: agent.name, model: agent.model, skills };
        });

        const capped = withSkills.slice(0, MAX_AGENTS);
        return jsonContent({
          agents: capped,
          total: withSkills.length,
          ...(capped.length < withSkills.length ? { truncated: true } : {}),
        });
      } catch (err) {
        return errorContent(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
