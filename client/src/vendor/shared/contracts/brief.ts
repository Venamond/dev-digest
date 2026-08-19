import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

// ---- Intent ----
export const IntentRiskArea = z.object({
  title: z.string(),
  severity: RiskSeverity,
  explanation: z.string().default(''),
  file_ref: z.string().default(''),
});
export type IntentRiskArea = z.infer<typeof IntentRiskArea>;

export const IntentMissingContext = z.object({
  kind: z.string(),
  ref: z.string(),
  reason: z.string(),
});
export type IntentMissingContext = z.infer<typeof IntentMissingContext>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(IntentRiskArea).default([]),
  confidence: z.number().min(0).max(1).default(0),
  sources: z.array(z.string()).default([]),
  missing_context: z.array(IntentMissingContext).default([]),
});
export type Intent = z.infer<typeof Intent>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Blast Radius API (L04) — distinct from the older BlastRadius above,
// which is the PrBrief building block and keeps its shape. ----
export const BlastState = z.enum(['ok', 'partial', 'degraded']);
export type BlastState = z.infer<typeof BlastState>;

export const BlastReason = z.enum([
  'index_partial',
  'no_data',
  'flag_off',
  'index_failed',
  'repo_too_large',
  // The index row says `full`, but it was written by an older indexer:
  // `file_rank` / resolved `decl_file` may not exist, so the caller query
  // would return nothing and the card would claim "no downstream callers".
  // Report a stale index instead of lying.
  'index_stale',
]);
export type BlastReason = z.infer<typeof BlastReason>;

export const BlastIndexInfo = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  last_indexed_sha: z.string(),
  updated_at: z.string(),
});
export type BlastIndexInfo = z.infer<typeof BlastIndexInfo>;

/**
 * `callers` counts the call sites actually rendered (post-cap). `callers_found`
 * is the sum of the per-symbol `callers_total`, i.e. DISTINCT CALLER FILES
 * found before capping — a different unit on purpose, because it is the only
 * count SQL can produce that never exceeds what the in-JS dedup by
 * (file, enclosing symbol) can yield. The stat row renders "N of M" only when
 * something was really dropped; a headline number that silently showed the
 * capped count alone would under-report impact with no signal.
 */
export const BlastTotals = z.object({
  symbols: z.number().int(),
  callers: z.number().int(),
  callers_found: z.number().int(),
  endpoints: z.number().int(),
  crons: z.number().int(),
});
export type BlastTotals = z.infer<typeof BlastTotals>;

export const BlastCallerRef = z.object({
  file: z.string(),
  symbol: z.string(),
  line: z.number().int(),
  rank: z.number(),
});
export type BlastCallerRef = z.infer<typeof BlastCallerRef>;

/**
 * `callers` is deduplicated by (file, enclosing symbol) and capped at
 * MAX_CALLERS_PER_SYMBOL.
 *
 * `callers_total` is the number of DISTINCT FILES that reference this symbol,
 * counted before the cap. It is deliberately NOT a count of `references` rows:
 * a function calling the symbol twice is two rows and one caller, and
 * comparing rows against callers made `callers_truncated` fire when nothing
 * had been dropped. `callers.length` can therefore exceed `callers_total`
 * (two functions in one file are two call sites in one file) — do not present
 * the two as "N of M call sites".
 *
 * `callers_truncated` is true only when caller files were actually dropped.
 */
export const BlastSymbolImpact = z.object({
  file: z.string(),
  name: z.string(),
  kind: z.string(),
  callers: z.array(BlastCallerRef),
  callers_total: z.number().int(),
  callers_truncated: z.boolean(),
  /**
   * Files that IMPORT this symbol's declaring file (reverse-import graph,
   * depth 1) — including those that import it without calling any detected
   * symbol, which is why this is not a subset of `callers`. Distinct from
   * `callers`, which comes from `references`.
   */
  importers: z.array(z.object({ file: z.string(), depth: z.number().int() })),
  endpoints: z.array(z.string()),
  crons: z.array(z.string()),
});
export type BlastSymbolImpact = z.infer<typeof BlastSymbolImpact>;

/** `updated_at` is nullable: pull_requests.updated_at is a nullable column
 *  and there is no merged_at column on that table. */
export const BlastPriorPull = z.object({
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  status: z.string(),
  updated_at: z.string().nullable(),
});
export type BlastPriorPull = z.infer<typeof BlastPriorPull>;

/**
 * The ref every `file:line` in this response is relative to. It is the
 * INDEXED commit, NOT the PR head: symbols/references line numbers come from
 * `repo_index_state.last_indexed_sha`, which the indexer records from the
 * clone's HEAD — i.e. the repo's default branch, never the PR branch.
 * Linking to `head_sha` points a main-relative line number at a different
 * commit. `head_sha` is kept alongside it only so the card can label the PR;
 * it must never be used to build a blob URL.
 */
export const BlastLink = z.object({
  repo_full_name: z.string(),
  indexed_sha: z.string(),
  head_sha: z.string(),
});
export type BlastLink = z.infer<typeof BlastLink>;

export const BlastResponse = z.object({
  state: BlastState,
  /** Absent when state is 'ok'. `.nullish()` so the key may be omitted. */
  reason: BlastReason.nullish(),
  index: BlastIndexInfo,
  totals: BlastTotals,
  symbols: z.array(BlastSymbolImpact),
  /**
   * True when the reverse-dependency walk hit MAX_REVERSE_DEPENDENTS, so
   * `endpoints` / `crons` are a subset of what the index holds. Per-symbol
   * caller truncation is reported separately by `callers_truncated`.
   */
  downstream_truncated: z.boolean(),
  prior_pulls: z.array(BlastPriorPull),
  link: BlastLink,
});
export type BlastResponse = z.infer<typeof BlastResponse>;

/** POST /pulls/:id/blast/summary — never persisted (no table, no migration). */
export const BlastSummaryResponse = z.object({
  summary: z.string(),
  model: z.string(),
  nodes: z.number().int(),
});
export type BlastSummaryResponse = z.infer<typeof BlastSummaryResponse>;
