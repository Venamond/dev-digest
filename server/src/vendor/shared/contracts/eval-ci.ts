import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalRun,
  EvalCase,
  EvalOwnerKind,
  EvalExpectation,
  EvalCaseSeededFrom,
  Conformance,
  Provider,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  expectation: EvalExpectation,
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  seeded_from: EvalCaseSeededFrom.nullish(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  /**
   * Skill evals only — the same case's recall recomputed from the run WITHOUT
   * the skill body in the prompt (`null` when that side never produced one).
   * `.nullish()` rather than `.default()`: the field is added to a contract
   * that already has construction sites, and in Zod 3 a `.default()` is
   * required on the OUTPUT type, which `z.infer` is (`server/INSIGHTS.md:719`).
   */
  recall_without: z.number().nullish(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  /** `null` for a single-case trial — a trial never enters run history. */
  batch_id: z.string().nullish(),
  outcome: z.enum(['passed', 'failed', 'errored']).nullish(),
  failure_reason: z.string().nullish(),
  expected_count: z.number().int().nullish(),
  actual_count: z.number().int().nullish(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/**
 * A case row as `GET /agents/:id/eval-cases` serves it: the case plus the last
 * execution that touched it, set run OR single-case trial (AC-63). Nullish
 * rather than required — create and update answer with the plain `EvalCase`,
 * and a case that has never run carries no record.
 */
export const EvalCaseWithLastRun = EvalCase.extend({
  last_run: EvalRunRecord.nullish(),
});
export type EvalCaseWithLastRun = z.infer<typeof EvalCaseWithLastRun>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Eval pipeline (L06) — batches, seeds, dashboards
//
// Added rather than folded into EvalRun / EvalRunResult / EvalDashboard above:
// those are unused scaffolding whose non-nullable metrics cannot express the
// "no denominator" case the UI renders as an em dash.
// ===========================================================================

/**
 * One set run: every case of an agent executed against ONE prompt, captured on
 * the batch when it was created so a later prompt edit cannot rewrite history.
 */
export const EvalRunBatch = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  system_prompt: z.string(),
  state: z.enum(['running', 'complete', 'partial']),
  progress_index: z.number().int(),
  progress_total: z.number().int(),
  started_at: z.string(),
  ran_at: z.string().nullable(),
  /** `null` when the denominator is zero — the client renders an em dash. */
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  traces_passed: z.number().int().nullable(),
  traces_produced: z.number().int().nullable(),
  cases_total: z.number().int(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
});
export type EvalRunBatch = z.infer<typeof EvalRunBatch>;

/**
 * An unsaved case built server-side from a real finding
 * (`GET /findings/:id/eval-seed`). `existing_case_id` is set when this finding
 * already produced a case, so the UI can say so before creating a second.
 */
export const EvalCaseSeed = z.object({
  owner_id: z.string(),
  name: z.string(),
  expectation: EvalExpectation,
  /** Human-readable statement of what the case asserts. */
  assertion: z.string(),
  input_diff: z.string(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  seeded_from: EvalCaseSeededFrom,
  existing_case_id: z.string().nullish(),
});
export type EvalCaseSeed = z.infer<typeof EvalCaseSeed>;

/** One agent's row on the all-agents eval overview. */
export const EvalOverviewRow = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  /** `null` for an agent that has never been run. */
  latest: EvalRunBatch.nullable(),
  /**
   * Every case the agent owns, whether or not it has ever been run — the
   * batch's own `cases_total` is zero until a first run exists, and the spend
   * estimate on `Run all agents` has to state the calls it will make (AC-64).
   */
  cases_total: z.number().int().nullish(),
  recall_trend: z.array(z.number()),
});
export type EvalOverviewRow = z.infer<typeof EvalOverviewRow>;

/** `GET /eval-dashboard` — every agent plus the cross-agent run feed. */
/**
 * One line of the cross-agent feed. It covers BOTH kinds of execution, because
 * the reference dashboard lists them together: a set run appears as `All (N)`
 * and a single-case trial under its own case name. `agent_version` is null for
 * a trial — only a batch records the version it ran under.
 */
export const EvalFeedRow = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  /** `All (4)` for a set run, the case's name for a trial. */
  case_label: z.string(),
  ran_at: z.string().nullable(),
  agent_version: z.number().int().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  passed: z.number().int().nullable(),
  total: z.number().int().nullable(),
});
export type EvalFeedRow = z.infer<typeof EvalFeedRow>;

export const EvalOverview = z.object({
  agents: z.array(EvalOverviewRow),
  recent_runs: z.array(EvalFeedRow),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

/** `GET /agents/:id/eval-dashboard` — one agent's metrics, trend and history. */
export const EvalAgentMetrics = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalAgentMetrics = z.infer<typeof EvalAgentMetrics>;

export const EvalAgentDashboard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  current: EvalAgentMetrics,
  delta: EvalAgentMetrics,
  trend: z.array(EvalTrendPoint),
  runs: z.array(EvalRunBatch),
  alert: z.string().nullable(),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;

// ===========================================================================
// Skill evals (track F) — the SAME case run twice against the same diff, once
// with the skill's body in the prompt and once without.
//
// Added beside the agent-eval contracts above rather than folded into them:
// a skill eval creates no `eval_run_batches` row (a batch's `agent_id`,
// `agent_version` and `system_prompt` are NOT NULL and a skill run has none of
// them), so every shape here hangs off the single `eval_runs` row a skill case
// writes, with `batch_id NULL`.
// ===========================================================================

/**
 * What a skill case's `input_files` holds, and the input the server-side diff
 * builder consumes: the case's diff is AUTHORED as Before/After and generated,
 * never pasted, so one builder produces both the preview and the stored bytes.
 */
export const EvalSkillCaseFiles = z.object({
  path: z.string().min(1),
  mode: z.enum(['new', 'modified']),
  before: z.string(),
  after: z.string(),
});
export type EvalSkillCaseFiles = z.infer<typeof EvalSkillCaseFiles>;

/** One of the two runs of a skill case — `error` set when that side failed. */
export const EvalSkillRunSide = z.object({
  recall: z.number().nullable(),
  findings: z.array(Finding),
  cost_usd: z.number().nullable(),
  error: z.string().nullish(),
});
export type EvalSkillRunSide = z.infer<typeof EvalSkillRunSide>;

/**
 * What a skill case stores in `eval_runs.actual_output`, and what the case
 * editor's `Actual output` panel renders once the case has run.
 */
export const EvalSkillActualOutput = z.object({
  with: EvalSkillRunSide,
  without: EvalSkillRunSide,
});
export type EvalSkillActualOutput = z.infer<typeof EvalSkillActualOutput>;

/**
 * A row of `GET /skills/:id/eval-cases`. `agent_id`/`agent_name` are nullable
 * because a skill may be linked to no enabled agent — the tab has to state
 * that rather than hide it, since there is then nothing to run the case on.
 */
export const EvalSkillCaseRow = EvalCaseWithLastRun.extend({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  severity: z.string().nullish(),
  category: z.string().nullish(),
});
export type EvalSkillCaseRow = z.infer<typeof EvalSkillCaseRow>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
