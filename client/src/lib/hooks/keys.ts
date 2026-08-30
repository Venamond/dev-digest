/* Central TanStack Query key factory — every queryKey / invalidateQueries
   site in hooks (and pages) must go through here so renames stay type-safe. */
import type { Provider } from "@devdigest/shared";

export const queryKeys = {
  settings: ["settings"] as const,
  secretsStatus: ["secrets-status"] as const,
  repos: ["repos"] as const,
  pulls: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  pull: (prId: string | number | null | undefined) => ["pull", prId] as const,
  context: (repoId: string | null | undefined) => ["context", repoId] as const,
  contextDoc: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["context-doc", repoId, path] as const,

  agents: ["agents"] as const,
  agent: (id: string | null | undefined) => ["agent", id] as const,
  agentSkills: (id: string | null | undefined) => ["agent-skills", id] as const,
  agentStats: (id: string | null | undefined) => ["agent-stats", id] as const,
  agentContext: (id: string | null | undefined, repoId: string | null | undefined) =>
    ["agent-context", id, repoId] as const,

  /* Eval pipeline (L06) — the agent's case set, its run history and the
     dashboards. Batches are keyed by run id, not by agent, because the compare
     modal reads two of them side by side. */
  evalCases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  evalRuns: (agentId: string | null | undefined) => ["eval-runs", agentId] as const,
  evalRun: (runId: string | null | undefined) => ["eval-run", runId] as const,
  evalDashboard: ["eval-dashboard"] as const,
  agentEvalDashboard: (id: string | null | undefined) => ["agent-eval-dashboard", id] as const,
  findingEvalSeed: (findingId: string | null | undefined) =>
    ["finding-eval-seed", findingId] as const,

  /* Skill evals (track F) — the same case run twice against one diff, with and
     without the skill's body. Keyed by SKILL id, not agent id: the resolved
     agent is a property of the row, not of the query. */
  skillEvalCases: (skillId: string | null | undefined) => ["skill-eval-cases", skillId] as const,
  skillEvalCase: (caseId: string | null | undefined) => ["skill-eval-case", caseId] as const,

  skills: ["skills"] as const,
  skill: (id: string | null | undefined) => ["skill", id] as const,
  skillVersions: (id: string | null | undefined) => ["skill-versions", id] as const,
  skillStats: (id: string | null | undefined) => ["skill-stats", id] as const,
  skillContext: (id: string | null | undefined, repoId: string | null | undefined) =>
    ["skill-context", id, repoId] as const,

  conventions: (repoId: string | null | undefined) => ["conventions", repoId] as const,
  conventionSkillDraft: (repoId: string | null | undefined) =>
    ["convention-skill-draft", repoId] as const,
  providerModels: (provider: Provider | null | undefined) =>
    ["provider-models", provider] as const,
  /** Prefix invalidation for every provider's model list. */
  providerModelsAll: ["provider-models"] as const,

  prActiveRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  prRuns: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  reviews: (prId: string | null | undefined) => ["reviews", prId] as const,
  prComments: (prId: string | null | undefined) => ["pr-comments", prId] as const,
  prIntent: (prId: string | null | undefined) => ["pr-intent", prId] as const,
  brief: (prId: string | null | undefined) => ["brief", prId] as const,
  smartDiff: (prId: string | null | undefined) => ["smart-diff", prId] as const,
  blast: (prId: string | null | undefined) => ["blast", prId] as const,
  blastSummary: (prId: string | null | undefined) => ["blast-summary", prId] as const,

  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
  repoIntelState: (repoId: string | null | undefined) => ["repo-intel-state", repoId] as const,
} as const;
