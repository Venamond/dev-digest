import type { Agent, PrMeta, Repo } from './types.js';
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
 * PR number → pr id, scoped to a repo already resolved to its id. Skips any
 * `PrMeta` row whose `id` is `null` — `PrMeta.id` is `z.string().nullish()`,
 * and such a row cannot address any downstream endpoint.
 *
 * `repoLabel` is the human-readable `owner/name` to name in the error
 * message — callers already have it from `resolveRepoId`'s input, so they
 * should pass it through. It defaults to `repoId` only so existing 3-arg
 * call sites (and tests) keep compiling; a caller that omits it gets a uuid
 * in the message instead of a name, which is strictly worse but not wrong.
 */
export async function resolvePullId(
  api: DevDigestApi,
  repoId: string,
  pr: number,
  repoLabel: string = repoId,
): Promise<string> {
  const pulls = await api.get<PrMeta[]>(`/repos/${encodeURIComponent(repoId)}/pulls`);
  const match = pulls.find((p) => p.number === pr && p.id != null);
  if (match) {
    return match.id as string;
  }

  const known = pulls
    .map((p) => p.number)
    .slice(0, MAX_LISTED)
    .join(', ');
  throw new ToolError(`PR #${pr} was not found in ${repoLabel}. Known PR numbers: ${known}.`);
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

/**
 * Either route to a pull request id: the uuid straight from the studio URL, or
 * `owner/name` plus the PR number.
 *
 * The uuid path exists because that is what a person copies out of the browser
 * — it is the id the studio shows, and asking them to translate it back into a
 * repo name and a number to use a tool would be busywork. The name+number path
 * exists because a model in conversation has "PR 8 in dev-digest" and no uuid
 * anywhere.
 *
 * A supplied `prId` is NOT verified here: the endpoints it feeds answer 404 on
 * their own, and a pre-flight lookup would add a round trip to every call to
 * save a slightly nicer message on a typo.
 */
export async function resolvePullTarget(
  api: DevDigestApi,
  input: { pr_id?: string; repo?: string; pr?: number },
): Promise<{ prId: string; label: string }> {
  if (input.pr_id) return { prId: input.pr_id, label: input.pr_id };
  if (input.repo && input.pr !== undefined) {
    const { repoId, fullName } = await resolveRepoId(api, input.repo);
    const prId = await resolvePullId(api, repoId, input.pr, fullName);
    return { prId, label: `${fullName}#${input.pr}` };
  }
  throw new ToolError(
    'Identify the pull request either by pr_id (the uuid in the studio URL) or by repo and pr together, e.g. repo: "octocat/hello-world", pr: 8.',
  );
}
