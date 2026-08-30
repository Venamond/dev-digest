import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

/**
 * What a case asserts about the review it triggers: `must_find` — every
 * expected finding has to appear; `must_not_flag` — the forbidden range has to
 * stay unflagged. Compared by code only; it never reaches a prompt.
 */
export const EvalExpectation = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** Provenance of a case seeded from a real finding (`Turn into eval case`). */
export const EvalCaseSeededFrom = z.object({
  finding_id: z.string(),
  disposition: z.enum(['accepted', 'dismissed', 'open']),
});
export type EvalCaseSeededFrom = z.infer<typeof EvalCaseSeededFrom>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  expectation: EvalExpectation,
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  seeded_from: EvalCaseSeededFrom.nullish(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** List-card enrichment — how many agents currently link this skill. */
export const SkillListItem = Skill.extend({
  agent_count: z.number().int().nonnegative(),
  /** All-time share of eligible runs that pulled this skill; null when never ran. */
  pull_rate: z.number().nullable(),
  /** All-time accept/(accept+dismiss) over findings from pulled runs; null when none acted. */
  accept_rate: z.number().nullable(),
});
export type SkillListItem = z.infer<typeof SkillListItem>;

/** Immutable body snapshot in `skill_versions`. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** Server-generated English summary; null on pre-migration rows. */
  note: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Parsed import draft before confirm (not persisted). */
export const SkillImportDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  trust_note: z.string().optional(),
});
export type SkillImportDraft = z.infer<typeof SkillImportDraft>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  rule: z.string(),
  category: z.string().nullable(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  evidence_line_start: z.number().int().nullable(),
  evidence_line_end: z.number().int().nullable(),
  evidence_url: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScan = z.object({
  sampled_file_count: z.number().int(),
  scanned_at: z.string(),
  source_sha: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionsList = z.object({
  candidates: z.array(ConventionCandidate),
  scan: ConventionScan.nullable(),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/**
 * Why a model candidate did not survive. Kept as three counters rather than
 * one `dropped` total: "no evidence in the repo" is the signal that proves
 * grounding worked, while duplicate/truncated are housekeeping.
 */
export const ConventionDropped = z.object({
  /** Evidence check failed — path outside the sample, or snippet not in the file. */
  ungrounded: z.number().int(),
  /** Same rule proposed more than once; the lower-confidence copy was discarded. */
  duplicate: z.number().int(),
  /** Grounded and unique, but beyond the per-scan candidate cap. */
  truncated: z.number().int(),
});
export type ConventionDropped = z.infer<typeof ConventionDropped>;

export const ConventionsExtractResult = z.object({
  candidates: z.array(ConventionCandidate),
  scan: ConventionScan,
  dropped: ConventionDropped,
});
export type ConventionsExtractResult = z.infer<typeof ConventionsExtractResult>;

export const ConventionUpdate = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
});
export type ConventionUpdate = z.infer<typeof ConventionUpdate>;

/** Pre-filled skill draft from accepted conventions — type/source are server-set. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** Persist an edited draft as an extracted skill — type/source are server-set. */
export const ConventionSkillCreate = z.object({
  name: z.string().min(1),
  description: z.string(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});
export type ConventionSkillCreate = z.infer<typeof ConventionSkillCreate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /** Present on list responses — count of linked skills for card footers. */
  skill_count: z.number().int().nonnegative().nullish(),
  /** Present on list responses — run count in the last 7 days, for card footers. */
  runs_7d: z.number().int().nonnegative().nullish(),
  /** Present on list responses — accept rate (0-1) over the last 7 days. */
  accept_rate_7d: z.number().min(0).max(1).nullish(),
  /** Present on list responses — average run cost (USD) over the last 7 days. */
  avg_cost_usd_7d: z.number().nonnegative().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

/** Agent → Skills editor row: full pool with link state for “N of M enabled”. */
export const AgentSkillEditorRow = z.object({
  skill: Skill,
  linked: z.boolean(),
  enabled: z.boolean(),
  order: z.number().int(),
});
export type AgentSkillEditorRow = z.infer<typeof AgentSkillEditorRow>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
