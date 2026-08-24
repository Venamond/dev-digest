import type { FastifyBaseLogger } from 'fastify';
import type { BriefInputId, PrBriefRecord } from '@devdigest/shared';
import {
  BlastState,
  BriefCut,
  BriefInputId as BriefInputIdSchema,
  BriefOverBudget,
  PrBrief,
} from '@devdigest/shared';
import { z } from 'zod';
import type { PrBriefRow } from '../../db/rows.js';
import { ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { ungroundedNames } from '../_shared/name-set.js';
import { fitToBudget } from './budget.js';
import type { BriefDeps } from './deps.js';
import { attachFocusLines, dedupeFocus } from './focus-lines.js';
import { gather, type RawBriefInputs } from './gather.js';
import {
  addNamesFromSentText,
  BRIEF_SCHEMA_NAME,
  BRIEF_SYSTEM_PROMPT,
  BriefLlmSchema,
  buildBriefPrompt,
  collectAllowedNames,
} from './prompt.js';
import { BriefRepository, type BriefInputsColumn, type BriefStateKey } from './repository.js';
import { floorRiskLevel } from './risk-level.js';

/**
 * The brief's application layer: one model call, a deterministic grounding
 * check, the cache and single-flight.
 *
 * Single-flight is an in-process `Map<prId, Promise>` held on the instance, and
 * the instance is created once per plugin registration in `routes.ts` — the
 * shape `blast/routes.ts:19-24` uses. There is one API process per
 * `./scripts/dev.sh`, so a lock column would buy nothing but a stale-lock
 * reaper this product has nowhere else.
 */

/**
 * The `inputs` jsonb column, read back defensively: a row written before
 * `0018_pr_brief_cache` has `NULL` there, and a row is not worth a 500.
 */
const StoredInputs = z.object({
  included: z.array(BriefInputIdSchema),
  cut: z.array(BriefCut),
  missing: z.array(BriefInputIdSchema),
  // `.nullish().default(null)`, not `.nullable()`: every row written before
  // this field existed has no key there, and failing the whole parse over it
  // would drop that row's cut list back to EMPTY_INPUTS — losing the very
  // statement this object exists to carry.
  over_budget: BriefOverBudget.nullish().default(null),
  blast_state: BlastState.nullable(),
});

const EMPTY_INPUTS: BriefInputsColumn = {
  included: [],
  cut: [],
  missing: [],
  over_budget: null,
  blast_state: null,
};

export class BriefService {
  private repo: BriefRepository;
  private inFlight = new Map<string, Promise<PrBriefRecord>>();

  constructor(private deps: BriefDeps) {
    this.repo = new BriefRepository(deps.db);
  }

  /**
   * The cached brief, or `null`. NEVER a model call — this is the read every
   * page open makes, and AC-20's cost argument is why it must stay cheap.
   */
  async get(workspaceId: string, prId: string): Promise<PrBriefRecord | null> {
    // Workspace-scoped FIRST, and not merely for the 404: `pr_brief` is keyed
    // by pr_id alone, so reading it without this check would serve a brief
    // across workspaces. An unknown PR is a 404; a known PR with no brief yet
    // is a 200 with `null`, which is a different answer.
    const pull = await this.deps.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const row = await this.repo.getBrief(prId);
    if (!row) return null;
    const current = await this.repo.currentStateKey(workspaceId, prId);
    return toRecord(row, row.stateKey !== current.state_key);
  }

  /**
   * Build a brief, or return the cached one when nothing it was built from has
   * moved.
   *
   * The single-flight entry is registered BEFORE the first `await` of the work
   * it guards, so a second request arriving in the same tick joins this build
   * rather than starting a second one (AC-23).
   */
  async build(
    workspaceId: string,
    prId: string,
    opts: { force?: boolean },
    log?: FastifyBaseLogger,
  ): Promise<PrBriefRecord> {
    const running = this.inFlight.get(prId);
    if (running) return running;

    const promise = this.buildOnce(workspaceId, prId, opts, log).finally(() => {
      this.inFlight.delete(prId);
    });
    this.inFlight.set(prId, promise);
    return promise;
  }

  private async buildOnce(
    workspaceId: string,
    prId: string,
    opts: { force?: boolean },
    log?: FastifyBaseLogger,
  ): Promise<PrBriefRecord> {
    const pull = await this.deps.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    if (!opts.force) {
      const cached = await this.repo.getBrief(prId);
      if (cached?.stateKey) {
        const current = await this.repo.currentStateKey(workspaceId, prId);
        // AC-20: nothing the brief was built from has moved, so no model call.
        if (cached.stateKey === current.state_key) return toRecord(cached, false);
      }
    }

    const raw = await gather(this.deps, { workspaceId, pull, repo, log });
    // The allowed-name set comes from the COMPLETE inputs, BEFORE the fitter
    // runs: trimming shrinks the prompt, never the set. A changed file the
    // fitter cut is not invented — see `collectAllowedNames` for the live 422
    // that this ordering fixes.
    const names = collectAllowedNames(raw);
    const { fitted, cut, overBudget } = fitToBudget(raw, this.deps.countTokens, (inputs) =>
      buildBriefPrompt(inputs).userText,
    );
    const { userText } = buildBriefPrompt(fitted);
    // ...and the second half of the same set: every path-like token of the text
    // the model is ACTUALLY shown. A document is selected because it names a
    // changed file (AC-3), and such a document names its sibling paths in the
    // same prose — on 2026-08-24 a brief was rejected for
    // `client/src/vendor/shared/contracts/platform.ts`, a path WE had put in
    // the user text and the structural set alone did not hold. Built here
    // because this is the only point where "what the model was shown" exists as
    // a string; the union with the line above is what keeps AC-15 intact.
    addNamesFromSentText(userText, names);

    const feature = await this.deps.featureModel(workspaceId, 'risk_brief');
    const llm = await this.deps.llm(feature.provider);
    // Verbatim from blast/service.ts:177-179 — without it a developer machine
    // with a real key makes a live call from the suite.
    if (process.env.VITEST && llm.id === 'openrouter') {
      throw new ConfigError('OPENROUTER_API_KEY is not configured');
    }

    // Exactly one structured call per brief built (AC-8). No fork, no chain.
    const out = await llm.completeStructured({
      model: feature.model,
      schema: BriefLlmSchema,
      schemaName: BRIEF_SCHEMA_NAME,
      messages: [
        { role: 'system', content: BRIEF_SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      maxRetries: 2,
    });

    // AC-9/AC-10: deterministic, no second model call — and nothing is
    // persisted, because a rejected response is not a brief.
    const refs = [
      ...out.data.risks.flatMap((r) => r.file_refs),
      ...out.data.review_focus.map((f) => f.file_ref),
    ];
    const bad = ungroundedNames(refs, names);
    if (bad.length > 0) {
      throw new ValidationError('Brief named references that are not in its input', { refs: bad });
    }

    // AC-35's enum is enforced here as well as by the LLM schema. The
    // review-focus lines are attached HERE and not one line earlier: AC-40's
    // line belongs to a response that has already passed the grounding check,
    // and the two sources it reads — the run's findings first, then the first
    // changed line of the file — are the COMPLETE sets `gather` returned, not
    // the budget-fitted ones: trimming shrinks what the model saw, never what
    // the server knows. Neither source having a line for a file is a normal
    // outcome: that entry keeps no line and its row still links to the file.

    // The deterministic risk-level floor, applied HERE for the same reason the
    // focus lines are: it belongs to a response that has already passed the
    // grounding check, and it is the server's own correction rather than
    // something the prompt can be trusted to have got right. The model may sit
    // ABOVE its own listed risks; it may never sit below them (`risk-level.ts`).
    const riskLevel = floorRiskLevel(out.data.risk_level, out.data.risks);
    if (riskLevel !== out.data.risk_level) {
      // The model disagreeing with itself is worth seeing, and it is invisible
      // on the card once the floor has corrected it. Both values, no prose.
      log?.warn(
        { prId, modelRiskLevel: out.data.risk_level, riskLevel },
        'pr_brief_risk_level_raised',
      );
    }

    const brief = PrBrief.parse({
      ...out.data,
      risk_level: riskLevel,
      review_focus: dedupeFocus(
        attachFocusLines(out.data.review_focus, raw.findings, raw.changedFileLines),
      ),
    });
    const cost = this.deps.estimateCost(feature.model, out.tokensIn, out.tokensOut);
    const inputs: BriefInputsColumn = {
      included: includedInputs(fitted),
      cut,
      // Persisted with the brief, not merely logged: the reader of a CACHED
      // brief must be told just as plainly as the reader of a fresh one that
      // the input it came from never fitted.
      over_budget: overBudget,
      missing: raw.missing,
      blast_state: raw.blastState,
    };

    // Recomputed HERE, immediately before the write, not from the check above:
    // the head commit may have moved while the model was thinking, and AC-22 is
    // the reader's only protection against reading a stale brief as current.
    const key = await this.repo.currentStateKey(workspaceId, prId);
    const builtAt = new Date();
    await this.repo.upsertBrief(prId, {
      json: brief,
      headSha: key.head_sha,
      intentKey: key.intent_key,
      blastKey: key.blast_key,
      runKey: key.run_key,
      stateKey: key.state_key,
      model: feature.model,
      costUsd: cost,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
      builtAt,
      inputs,
    });

    // Counts and ids only: never userText, never a fragment, never the issue
    // body, never `what` or `why`.
    log?.info(
      {
        prId,
        model: feature.model,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        // How many requests this ONE call actually took: `completeStructured`
        // reprompts on a schema failure, and `tokensIn` above is the SUM over
        // those attempts, not the size of one request (AC-12 bounds the
        // request, not the sum). Invisible until logged — the live call of
        // 2026-08-24 cost three prompts and read as one.
        attempts: out.attempts,
        names: names.size,
        cut: cut.map((c) => c.input),
        // Numbers only, and only when it happened: an over-budget request is
        // the one case where the fitter did not do its job and the operator
        // needs to see it in the log as well as on the card.
        overBudget,
        missing: raw.missing,
      },
      'pr_brief',
    );

    return {
      pr_id: prId,
      brief,
      model: feature.model,
      cost_usd: cost,
      tokens_in: out.tokensIn,
      tokens_out: out.tokensOut,
      built_at: builtAt.toISOString(),
      state_key: key.state_key,
      head_sha: key.head_sha,
      stale: false,
      inputs_included: inputs.included,
      inputs_cut: inputs.cut,
      inputs_missing: inputs.missing,
      inputs_over_budget: inputs.over_budget,
      blast_state: inputs.blast_state,
    };
  }
}

/** Which inputs the model actually saw — computed from the FITTED set. */
function includedInputs(fitted: RawBriefInputs): BriefInputId[] {
  const included: BriefInputId[] = ['pr_meta'];
  if (fitted.changedFiles.length > 0) included.push('changed_files');
  if (fitted.intent) included.push('intent');
  // An EMPTY map is not an input the model saw anything in — the same rule
  // `gather` uses when it decides whether the map counts as missing.
  if (fitted.blastMap && fitted.blastMap.symbols.length > 0) included.push('blast_map');
  if (fitted.blastSummary) included.push('blast_summary');
  if (fitted.issue) included.push('issue');
  if (fitted.documents.length > 0) included.push('documents');
  if (fitted.findings.length > 0) included.push('findings');
  return included;
}

/**
 * A persisted row plus the `stale` flag the caller computed. `stale` is never
 * stored — it is a comparison against the CURRENT key, made per request.
 */
function toRecord(row: PrBriefRow, stale: boolean): PrBriefRecord {
  const parsed = StoredInputs.safeParse(row.inputs);
  const inputs = parsed.success ? parsed.data : EMPTY_INPUTS;
  return {
    pr_id: row.prId,
    brief: row.json,
    model: row.model ?? '',
    cost_usd: row.costUsd,
    tokens_in: row.tokensIn ?? 0,
    tokens_out: row.tokensOut ?? 0,
    built_at: row.builtAt?.toISOString() ?? '',
    state_key: row.stateKey ?? '',
    head_sha: row.headSha ?? '',
    stale,
    inputs_included: inputs.included,
    inputs_cut: inputs.cut,
    inputs_missing: inputs.missing,
    inputs_over_budget: inputs.over_budget,
    blast_state: inputs.blast_state,
  };
}
