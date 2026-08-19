import type { Agent, Repo } from './types.js';
import type { DevDigestApi } from './client.js';
import { ToolError } from '../errors.js';

/** The number of names/ids listed in a "here is what does exist" hint. */
const MAX_LISTED = 20;
const MAX_LISTED_AMBIGUOUS = 10;

/**
 * `owner/name` → repo id. There is no lookup by `owner/name` on the API
 * (§2c, Data sources) — this fetches every repo and matches client-side.
 */
export async function resolveRepoId(
  api: DevDigestApi,
  repo: string,
): Promise<{ repoId: string; fullName: string }> {
  const repos = await api.get<Repo[]>('/repos');
  const target = repo.trim().toLowerCase();
  const match = repos.find((r) => r.full_name.toLowerCase() === target);
  if (match) {
    return { repoId: match.id, fullName: match.full_name };
  }

  if (repos.length === 0) {
    throw new ToolError(
      `Repo "${repo}" is not imported into DevDigest. No repos are imported yet. Add it in the studio at http://localhost:3000 first.`,
    );
  }
  const known = repos
    .map((r) => r.full_name)
    .slice(0, MAX_LISTED)
    .join(', ');
  throw new ToolError(
    `Repo "${repo}" is not imported into DevDigest. Imported repos: ${known}. Add it in the studio at http://localhost:3000 first.`,
  );
}

/**
 * Agent uuid-or-name → agent id. An exact id match wins outright over any
 * name match. A name match must collect ALL matches and fail loudly when
 * more than one agent shares the name — never `[0]` (§2c, S2: `agents.name`
 * has no unique constraint, so two agents named "Security Reviewer" is a
 * legal, UI-reachable state; taking the first would start a paid LLM run
 * against the wrong reviewer and report success).
 */
export async function resolveAgentId(api: DevDigestApi, agent: string): Promise<{ agentId: string; name: string }> {
  const agents = await api.get<Agent[]>('/agents');

  const idMatch = agents.find((a) => a.id === agent);
  if (idMatch) {
    return { agentId: idMatch.id, name: idMatch.name };
  }

  const target = agent.trim().toLowerCase();
  const nameMatches = agents.filter((a) => a.name.toLowerCase() === target);

  if (nameMatches.length > 1) {
    const ids = nameMatches
      .map((a) => a.id)
      .slice(0, MAX_LISTED_AMBIGUOUS)
      .join(', ');
    throw new ToolError(`Two agents are named "${agent}". Pass the id instead: ${ids}.`);
  }
  if (nameMatches.length === 1) {
    const only = nameMatches[0] as Agent;
    return { agentId: only.id, name: only.name };
  }

  throw new ToolError(`Agent "${agent}" not found. Call list_agents to see the available agents.`);
}
