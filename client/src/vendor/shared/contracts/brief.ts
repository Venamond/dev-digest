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

/**
 * One risk the brief raises. Distinct from `Risk` above: no `kind`, and its
 * `file_refs` are grounded against the deterministic name set before the
 * brief is ever persisted.
 */
export const BriefRisk = z.object({
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type BriefRisk = z.infer<typeof BriefRisk>;

export const ReviewFocusItem = z.object({
  file_ref: z.string(),
  reason: z.string(),
  /**
   * The line to open the file at (AC-40), attached by the SERVER after the
   * model's answer is accepted. Three sources, first one that yields a line:
   *
   *  1. the highest-severity finding of this pull request's finished run
   *     naming the same file, the lowest line number breaking a tie — it
   *     points at the problem itself;
   *  2. otherwise that file's first changed line from its stored patch, as
   *     the HEAD numbers it — the diff can only point at where the file's
   *     edits begin, which is why it loses to a finding;
   *  3. otherwise none. Absent is a NORMAL value; the row still links to the
   *     file.
   *
   * Never from the model, which is neither asked for a line nor told one
   * exists. **`AC-2` does not forbid source 2**: it bounds what the model is
   * SHOWN, not what the server may read, and a patch read to compute a line
   * number is sent nowhere. This comment previously named the finding as the
   * only source — an exclusion asserted without checking, which left every row
   * lineless on any pull request that had never been reviewed.
   *
   * Never from the blast map either: a `BlastLink`'s `file:line` is relative
   * to the INDEXED commit, not to this pull request's head.
   *
   * `.nullish()`, not `.nullable()`: `.nullable()` is required at the TS level
   * and would break every existing literal of this shape, and a `pr_brief.json`
   * row written before this field existed has no key here — a parse that fails
   * on it would take the whole brief with it
   * (`server/INSIGHTS.md:695-720`).
   */
  line: z.number().int().nullish(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/**
 * What the brief carries. Every field is the model's, EXCEPT where the server
 * completes or corrects it after the answer is accepted — two places today:
 *
 *  - `review_focus[].line` is set by the server and never asked of the model
 *    (AC-40);
 *  - `risk_level` is raised to the most severe entry in `risks` when the model
 *    put it lower (AC-42). Raising only — a level ABOVE the listed risks is
 *    the model's judgement that small risks compound, and is kept.
 *
 * Both happen before the brief is persisted, so a cached read serves the
 * corrected values rather than the raw answer. Everything the server knows
 * ABOUT the call — model id, cost, cache key, what was cut — lives on
 * `PrBriefRecord` instead, not here.
 *
 * `risk_level` reuses `RiskSeverity`: high | medium | low, with no fourth
 * value. No field here uses `.default()` — in Zod 3 a default is required on
 * the OUTPUT type, so it breaks every hand-written literal annotated with
 * this type.
 */
export const PrBrief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskSeverity,
  risks: z.array(BriefRisk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBrief = z.infer<typeof PrBrief>;

/** The inputs a brief can be assembled from — the vocabulary of both the
 * "included" list and the "cut"/"missing" lists the UI renders. */
export const BriefInputId = z.enum([
  'pr_meta',
  'intent',
  'blast_map',
  'blast_summary',
  'issue',
  'documents',
  'findings',
  'changed_files',
]);
export type BriefInputId = z.infer<typeof BriefInputId>;

/**
 * One input the budget fitter removed, with a short deterministic phrase
 * saying what went — e.g. 'caller tails', '3rd fragment of docs/x.md',
 * 'issue body', 'findings below high', '412 of 530 changed files'.
 * Built by the server, never by the model.
 */
export const BriefCut = z.object({
  input: BriefInputId,
  detail: z.string(),
});
export type BriefCut = z.infer<typeof BriefCut>;

/**
 * Present only when the fitter ran EVERY cut it is allowed to make and the
 * request still exceeded the budget — an input nothing on AC-13's list can
 * shrink far enough (a very wide pull request, or a blast map whose never-cut
 * names of AC-14 alone are larger than the cap).
 *
 * It exists because the alternative is silence: before it, `fitToBudget`
 * returned an oversized input with no signal, and a live build of 2026-08-24
 * cut all 100 changed files and still sent 35 299 tokens against a 16 000
 * budget while the card reported an ordinary brief. `measured` is the same
 * quantity `BRIEF_TOKEN_BUDGET` bounds (system prompt + JSON schema + user
 * text), counted with `cl100k_base` on the FITTED input.
 */
export const BriefOverBudget = z.object({
  measured: z.number().int(),
  budget: z.number().int(),
});
export type BriefOverBudget = z.infer<typeof BriefOverBudget>;

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

/**
 * A prior PR that touched at least one of this PR's changed files.
 *
 * `shared_files` and `unresolved_findings` are what make the row answer "why
 * should I care": which file it has in common, and whether it left a concern
 * on that file that someone chose not to act on. Both are FACTS from the
 * database — deliberately not a model's opinion about how the two PRs relate.
 * The feature's rule is that the model never invents links, and "this old
 * finding relates to your new one" is exactly such an invented link; the
 * reviewer draws it.
 *
 * `updated_at` is nullable: pull_requests.updated_at is a nullable column and
 * there is no merged_at column on that table.
 */
export const BlastPriorPull = z.object({
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  status: z.string(),
  updated_at: z.string().nullable(),
  /**
   * What that PR set out to do, in one line — its derived intent, or the
   * first paragraph of its description, trimmed. `null` when it has neither.
   * A fact about that PR; never a claim about how it relates to this one.
   */
  description: z.string().nullable(),
  /** Paths this PR and that one both touch. Never empty — it is the join. */
  shared_files: z.array(z.string()),
  /** Findings raised on that PR and dismissed. Capped per PR. */
  unresolved_findings: z.array(z.object({ severity: z.string(), title: z.string() })),
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

/**
 * A persisted brief plus its provenance: which model wrote it, what it cost,
 * the cache key it was built under, and which inputs went in, were cut or
 * were missing.
 *
 * Declared HERE rather than beside `PrBrief` above only because it references
 * `BlastState`, and a `const` is in its temporal dead zone until the line that
 * defines it has run. Moving it up would throw at module evaluation.
 *
 * `stale` is computed per request by comparing `state_key` against the
 * current one — it is never stored.
 */
export const PrBriefRecord = z.object({
  pr_id: z.string(),
  brief: PrBrief,
  model: z.string(),
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  built_at: z.string(),
  state_key: z.string(),
  head_sha: z.string(),
  stale: z.boolean(),
  inputs_included: z.array(BriefInputId),
  inputs_cut: z.array(BriefCut),
  inputs_missing: z.array(BriefInputId),
  /**
   * Non-null when the brief was built from an input that STILL exceeded the
   * budget after every cut. Nullable rather than optional: a brief that does
   * not say so must say so explicitly, and a reader who forgets the key reads
   * `null`, never `undefined`.
   */
  inputs_over_budget: BriefOverBudget.nullable(),
  blast_state: BlastState.nullable(),
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;
