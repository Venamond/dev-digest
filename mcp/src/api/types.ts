/**
 * Local narrow DTO shapes for the DevDigest REST API.
 *
 * Written by hand instead of importing `@devdigest/shared` type-only, per
 * docs/plans/2026-08-18-mcp-server.md, S0, Branch B: `cd mcp && npm run
 * typecheck` failed with the Zod-4 package compiling the Zod-3-authored
 * contracts at `server/src/vendor/shared/contracts/platform.ts` — concretely,
 * `SettingsKnown.feature_models` (`platform.ts:94`,
 * `z.record(FeatureModelId, FeatureModelChoice).default({})`), where Zod 4's
 * exhaustive `z.record(<enum>, …)` inference rejects the empty-object
 * default that Zod 3 accepted.
 *
 * No Zod, no runtime code — plain `interface`s, one per shape this package
 * actually reads (§2c, "Data sources" in the plan above). A field the plan's
 * field table does not list is not declared here. Each interface is headed
 * with the source contract file/export it mirrors, so drift is traceable by
 * hand; these are NOT re-validated against the live response (see D1 in the
 * plan — `mcp/` never re-validates a `FindingCategory`-shaped field either).
 */

/** Mirrors `Repo` in `server/src/vendor/shared/contracts/platform.ts`. */
export interface Repo {
  id: string;
  full_name: string;
}

/** Mirrors `PrMeta` in `server/src/vendor/shared/contracts/platform.ts`. */
export interface PrMeta {
  id?: string | null;
  number: number;
}

/** Mirrors `Agent` in `server/src/vendor/shared/contracts/knowledge.ts`. */
export interface Agent {
  id: string;
  name: string;
  model: string;
}

/** Mirrors `AgentSkillEditorRow` in `server/src/vendor/shared/contracts/knowledge.ts`. */
export interface AgentSkillEditorRow {
  skill: {
    name: string;
  };
  linked: boolean;
  enabled: boolean;
  order: number;
}

/** Mirrors `ReviewRunResponse` in `server/src/vendor/shared/contracts/review-api.ts`. */
export interface ReviewRunResponse {
  runs: Array<{
    run_id: string;
  }>;
}

/** Mirrors `RunSummary` in `server/src/vendor/shared/contracts/trace.ts`. */
export interface RunSummary {
  run_id: string;
  status: string | null;
  error: string | null;
}

/** Mirrors `ReviewRecord` in `server/src/vendor/shared/contracts/review-api.ts`. */
export interface ReviewRecord {
  run_id: string | null;
  agent_id: string | null;
  agent_name?: string | null;
  verdict: 'request_changes' | 'approve' | 'comment' | null;
  summary: string | null;
  findings: FindingRecord[];
}

/** Mirrors `FindingRecord` in `server/src/vendor/shared/contracts/review-api.ts`. */
export interface FindingRecord {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  // Passed through as a raw string, never re-validated against
  // `FindingCategory` — the seed writes out-of-enum values (D1, §2c).
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
}

/** Mirrors `ConventionsList` in `server/src/vendor/shared/contracts/knowledge.ts`. */
export interface ConventionsList {
  candidates: Array<{
    rule: string;
    category: string | null;
    status: string;
  }>;
  scan: {
    scanned_at: string;
  } | null;
}

/** Mirrors `ApiErrorBody` in `server/src/vendor/shared/contracts/platform.ts`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
