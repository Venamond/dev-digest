import { reviewPullRequest } from '@devdigest/reviewer-core';
import type {
  EvalSkillActualOutput,
  EvalSkillRunSide,
  Finding,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { aggregateRun, type AggregatedCase } from './pure/aggregate.js';
import { scoreCase } from './pure/scoring.js';
import { skillCaseRecall, skillCaseVerdict } from './pure/skill-scoring.js';
import { readExpected, type CaseOutcome, type CaseScore } from './pure/types.js';
import type { EvalCaseRow, EvalRepository } from './repository.js';

/**
 * Ring 1 — the background eval runner. Orchestrates the engine and the
 * repository through ports; knows nothing of HTTP.
 *
 * The scorer it calls (`./pure/`) makes no model call: a case is judged by
 * comparing locations (AC-13). One LLM call happens per case, on the agent's
 * OWN provider and model (AC-10).
 */

/** The subset of a Fastify/pino logger this module uses. */
export interface EvalLogger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** What one executed case contributes, plus what was persisted for it. */
export interface CaseExecution {
  caseId: string;
  caseName: string;
  /** `null` when not even the error row could be persisted — see `executeBatch`. */
  runId: string | null;
  outcome: CaseOutcome;
  score: CaseScore;
  costUsd: number | null;
  failureReason: string | null;
}

/** The provider's message is persisted, but never unbounded. */
const FAILURE_REASON_MAX = 500;

/**
 * The score of a case that produced no output at all. `aggregateRun` excludes
 * an `errored` case from every numerator and denominator (AC-49), so these
 * zeroes are never read as a result — they only satisfy the shape.
 */
const EMPTY_SCORE: CaseScore = {
  passed: false,
  tp: 0,
  fn: 0,
  fp: 0,
  kept: 0,
  dropped: 0,
  expected_count: 0,
  actual_count: 0,
};

/**
 * Wall-clock cap on ONE engine call.
 *
 * There was none, and nothing below imposes one either: OpenRouter allows 90s
 * per HTTP request with `maxRetries: 2` (`reviewer-core/src/llm/openrouter.ts`)
 * and `completeStructured` retries an invalid structure up to twice more, so a
 * single case could legitimately sit for a quarter of an hour with the screen
 * showing nothing but "running". Measured 2026-08-29: a case ran ~5 minutes.
 *
 * A case that exceeds this is recorded `errored` — an ABSENT measurement, not
 * a negative one — and the batch continues, which is the behaviour the spec
 * already defines for a case that could not run.
 */
const CASE_TIMEOUT_MS = 120_000;

/** Rejects with a readable reason if `p` outruns the cap; never leaks the timer. */
async function withCaseTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${CASE_TIMEOUT_MS / 1000}s and was abandoned`)),
          CASE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function truncate(message: string): string {
  return message.slice(0, FAILURE_REASON_MAX);
}

/**
 * A case's `input_meta` reaches the prompt through the EXISTING `prDescription`
 * slot, which `assemblePrompt` already delimiter-wraps — no new prompt slot is
 * introduced for evals, so a case's input sits in exactly the trust position a
 * real PR description occupies.
 */
function prDescriptionFrom(inputMeta: unknown): string | undefined {
  if (!inputMeta || typeof inputMeta !== 'object') return undefined;
  const meta = inputMeta as { title?: unknown; body?: unknown };
  const parts = [meta.title, meta.body].filter((v): v is string => typeof v === 'string' && v.length > 0);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

/** One of a skill case's two runs, before it is scored. */
interface SideResult {
  findings: Finding[];
  dropped: number;
  costUsd: number | null;
  error: string | null;
}

/** One half of `eval_runs.actual_output` for a skill case, as screen B draws it. */
function sideDto(side: SideResult, recall: number | null): EvalSkillRunSide {
  return {
    recall,
    findings: side.findings,
    cost_usd: side.costUsd,
    error: side.error,
  };
}

export class EvalRunner {
  constructor(
    private container: Container,
    private repo: EvalRepository,
  ) {}

  /**
   * Execute every case of a set run, one at a time, then aggregate and close
   * the batch. Fire-and-forget from the service's point of view: the HTTP
   * response has already returned by the time this starts (AC-41).
   */
  async executeBatch(
    workspaceId: string,
    agent: AgentRow,
    cases: EvalCaseRow[],
    batchId: string,
    logger?: EvalLogger,
  ): Promise<void> {
    const startedAt = Date.now();
    const executions: CaseExecution[] = [];
    try {
      // Resolved ONCE before the loop — `container.llm` is a method and async
      // (`platform/container.ts:179`), mirroring `run-executor.ts:311`.
      const llm = await this.container.llm(agent.provider as Provider);
      const skills = await this.skillBodies(agent.id);

      for (const [i, c] of cases.entries()) {
        /* A thrown case never aborts the batch (AC-43). `executeOneCase` has
           its own try/catch, but that catch PERSISTS an errored row — and the
           insert can itself throw, which then escaped to the outer catch and
           killed the whole run. Observed 2026-08-29: a case was deleted while
           its batch was in flight, so the error row hit
           `eval_runs_case_id_eval_cases_id_fk` and five healthy cases were
           lost with it. The batch must survive anything one case can do,
           including failing to record its own failure. */
        let execution: CaseExecution;
        try {
          execution = await this.executeOneCase(workspaceId, agent, c, llm, skills, batchId);
        } catch (err) {
          const reason = truncate((err as Error).message ?? 'unknown error');
          logger?.error({ batchId, caseId: c.id, err: reason }, 'eval: case could not be recorded');
          execution = {
            caseId: c.id,
            caseName: c.name,
            runId: null,
            outcome: 'errored',
            score: EMPTY_SCORE,
            costUsd: null,
            failureReason: reason,
          };
        }
        executions.push(execution);

        // `msg` is human-readable prose; `data` carries the position the
        // progress bar reads (AC-38).
        this.container.runBus.publish(
          batchId,
          execution.outcome === 'errored' ? 'error' : 'result',
          `Case ${i + 1} of ${cases.length}: ${c.name} — ${execution.outcome}`,
          { index: i + 1, total: cases.length },
        );
        // Persisted too, so a client that arrives late reads the position from
        // the row rather than from a stream it already missed.
        await this.repo.updateBatchProgress(batchId, i + 1);
      }

      const metrics = aggregateRun(
        executions.map(
          (e): AggregatedCase => ({ ...e.score, outcome: e.outcome }),
        ),
        cases.length,
      );
      await this.repo.completeBatch(batchId, {
        // A batch in which any case errored is `partial`, not `complete` — the
        // UI says `7 of 8 ran` rather than implying a full result (AC-45).
        state: executions.some((e) => e.outcome === 'errored') ? 'partial' : 'complete',
        recall: metrics.recall,
        precision: metrics.precision,
        citationAccuracy: metrics.citation_accuracy,
        tracesPassed: metrics.traces_passed,
        tracesProduced: metrics.traces_produced,
        costUsd: sumCosts(executions.map((e) => e.costUsd)),
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      logger?.error({ batchId, err: (err as Error).message }, 'eval: batch execution crashed');
      // Never leave a batch sitting at `running` forever.
      await this.repo.failBatch(batchId).catch(() => undefined);
    } finally {
      // In a `finally` so a crash still closes every SSE subscriber.
      this.container.runBus.complete(batchId);
    }
  }

  /**
   * One case: parse the stored diff, run the engine, score mechanically,
   * persist. `batchId` is `null` for a single-case trial (AC-62).
   */
  async executeOneCase(
    workspaceId: string,
    agent: AgentRow,
    c: EvalCaseRow,
    llm: LLMProvider,
    skills: string[],
    batchId: string | null,
  ): Promise<CaseExecution> {
    const startedAt = Date.now();
    const expected = readExpected(c.expectedOutput);
    const emptyScore: CaseScore = {
      passed: false,
      tp: 0,
      fn: 0,
      fp: 0,
      kept: 0,
      dropped: 0,
      expected_count: expected.length,
      actual_count: 0,
    };

    try {
      const diff = parseUnifiedDiff(c.inputDiff ?? '');
      // A diff that yields no files is a case failure, not a throw (AC-43).
      if (diff.files.length === 0) {
        throw new Error('stored diff could not be parsed');
      }

      const prDescription = prDescriptionFrom(c.inputMeta);
      const outcome = await withCaseTimeout(
        reviewPullRequest({
        // The agent's own prompt, provider and model — never a feature-model
        // override (AC-10).
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        strategy: agent.strategy ?? undefined,
        ...(skills.length > 0 ? { skills } : {}),
        ...(prDescription ? { prDescription } : {}),
        sessionId: batchId ?? c.id,
        correlationId: batchId ?? c.id,
        }),
        `case "${c.name}"`,
      );

      // Downstream of the engine's grounding transform: `outcome.review.findings`
      // is ALREADY the kept set (`reviewer-core/src/review/run.ts:238`), so the
      // runner never re-runs the citation gate itself.
      const actual: Finding[] = outcome.review.findings;
      const score = scoreCase({
        expectation: c.expectation,
        expected,
        actual,
        kept: actual.length,
        dropped: outcome.dropped.length,
      });
      const caseOutcome: CaseOutcome = score.passed ? 'passed' : 'failed';
      const perCase = aggregateRun([{ ...score, outcome: caseOutcome }], 1);

      const run = await this.repo.insertCaseRun({
        caseId: c.id,
        batchId,
        actualOutput: actual,
        pass: score.passed,
        recall: perCase.recall,
        precision: perCase.precision,
        citationAccuracy: perCase.citation_accuracy,
        durationMs: Date.now() - startedAt,
        costUsd: outcome.costUsd,
        outcome: caseOutcome,
        failureReason: null,
      });

      return {
        caseId: c.id,
        caseName: c.name,
        runId: run.id,
        outcome: caseOutcome,
        score,
        costUsd: outcome.costUsd,
        failureReason: null,
      };
    } catch (err) {
      const failureReason = truncate((err as Error).message ?? 'unknown error');
      const run = await this.repo.insertCaseRun({
        caseId: c.id,
        batchId,
        actualOutput: null,
        pass: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs: Date.now() - startedAt,
        costUsd: null,
        outcome: 'errored',
        failureReason,
      });
      return {
        caseId: c.id,
        caseName: c.name,
        runId: run.id,
        outcome: 'errored',
        score: emptyScore,
        costUsd: null,
        failureReason,
      };
    }
  }

  /**
   * One SKILL case: the same diff reviewed twice by the same agent, once with
   * the skill's body in the prompt and once without, scored as one row.
   *
   * The two calls are identical in every respect but the presence of `skills`.
   * Under the pass rule a `MUST FIND` case is marked by the DIFFERENCE between
   * them, so any second difference would make the mark measure something other
   * than the skill. That is also why `body` is read once, by the caller, before
   * either call: a skill edited between them would make the comparison
   * meaningless.
   *
   * No `reviewer-core` change is involved and none is permitted —
   * `ReviewInput.skills` is documented as "Resolved skill bodies (NOT slugs)"
   * (`reviewer-core/src/review/run.ts:57-58`), so the caller builds the array
   * and the engine never queries anything.
   */
  async executeSkillCase(
    workspaceId: string,
    agent: AgentRow,
    c: EvalCaseRow,
    llm: LLMProvider,
    skillBody: string,
  ): Promise<CaseExecution> {
    void workspaceId;
    const startedAt = Date.now();
    const expected = readExpected(c.expectedOutput);
    const diff = parseUnifiedDiff(c.inputDiff ?? '');
    const prDescription = prDescriptionFrom(c.inputMeta);

    /**
     * One side of the case. Each call is wrapped separately: a side that throws
     * records its error in its own half of `actual_output` and leaves the other
     * half intact, because one side failing must not lose the other.
     */
    const runSide = async (skills: string[]): Promise<SideResult> => {
      try {
        // A diff that yields no files is a case failure, not a throw.
        if (diff.files.length === 0) throw new Error('stored diff could not be parsed');
        // Capped per SIDE, not per case: a skill case makes two calls, so a
        // single cap over both would let one slow side eat the other's budget
        // and report the wrong half as the failure.
        const outcome = await withCaseTimeout(
          reviewPullRequest({
            systemPrompt: agent.systemPrompt,
            model: agent.model,
            diff,
            llm,
            strategy: agent.strategy ?? undefined,
            // The without-run passes NO `skills` key at all, exactly as the
            // shipped runner omits it for an agent with no enabled skills.
            ...(skills.length > 0 ? { skills } : {}),
            ...(prDescription ? { prDescription } : {}),
            sessionId: c.id,
            // Distinct per side: both halves used to log under the same id, so
            // the prompt-assembly record could not say which run was which —
            // exactly the comparison this feature exists to make.
            correlationId: `${c.id}:${skills.length > 0 ? 'with' : 'without'}`,
          }),
          `case "${c.name}" (${skills.length > 0 ? 'with skill' : 'without skill'})`,
        );
        return {
          // Already the kept set — the engine ran its grounding gate
          // (`reviewer-core/src/review/run.ts:238`); the runner never re-runs it.
          findings: outcome.review.findings,
          dropped: outcome.dropped.length,
          costUsd: outcome.costUsd,
          error: null,
        };
      } catch (err) {
        return {
          findings: [],
          dropped: 0,
          costUsd: null,
          error: truncate((err as Error).message ?? 'unknown error'),
        };
      }
    };

    const withRun = await runSide([skillBody]);
    const withoutRun = await runSide([]);

    const scoreOf = (side: SideResult): CaseScore | null =>
      side.error !== null
        ? null
        : scoreCase({
            expectation: c.expectation,
            expected,
            actual: side.findings,
            kept: side.findings.length,
            dropped: side.dropped,
          });

    const withScore = scoreOf(withRun);
    const withoutScore = scoreOf(withoutRun);
    const withRecall = withScore ? skillCaseRecall(withScore, c.expectation) : null;
    const withoutRecall = withoutScore ? skillCaseRecall(withoutScore, c.expectation) : null;

    const verdict =
      withScore === null
        ? null
        : skillCaseVerdict({ expectation: c.expectation, withScore, withoutScore });

    /**
     * Three branches, and the middle one is the one that is easy to get wrong:
     *  - the WITH side failed → `errored`, whatever the expectation. Nothing
     *    can be marked without it.
     *  - the WITHOUT side failed on a `must_find` case → `errored`, NOT
     *    `failed`. The pass rule needs both sides to mark such a case, so a
     *    missing without-result is an ABSENT measurement, not a negative one,
     *    and `errored` is the outcome that leaves every metric denominator.
     *  - the WITHOUT side failed on a `must_not_flag` case → the mark stands,
     *    because that expectation never consults the without side; only
     *    `Without skill` renders an em dash.
     */
    const outcome: CaseOutcome =
      verdict === null
        ? 'errored'
        : verdict.reason === 'no_without_result'
          ? 'errored'
          : verdict.passed
            ? 'passed'
            : 'failed';

    // On `failed` the row is red for a RULE reason, not an error, and the
    // screen has to be able to say which — a `must find` case at
    // `100% / 100%` is the common outcome (server/INSIGHTS.md:210-233) and
    // reads as a fault unless the reason is rendered. `verdict.reason` is the
    // only place that judgement exists; recomputing it in the browser would be
    // a second derivation of one predicate (client/INSIGHTS.md:440).
    const failureReason =
      withRun.error ??
      (outcome === 'errored' ? withoutRun.error : null) ??
      // `failed` implies a non-null verdict by the ternary above, but that is
      // not narrowable — the guard is for the compiler, not for a real case.
      (outcome === 'failed' && verdict ? verdict.reason : null);

    const actualOutput: EvalSkillActualOutput = {
      with: sideDto(withRun, withRecall),
      without: sideDto(withoutRun, withoutRecall),
    };

    const costUsd = sumCosts([withRun.costUsd, withoutRun.costUsd]);
    const run = await this.repo.insertCaseRun({
      caseId: c.id,
      // A skill eval creates no batch row: `eval_run_batches` requires an
      // agent version and a system prompt a skill run does not have, and the
      // skill screen shows no run history at all.
      batchId: null,
      actualOutput,
      pass: outcome === 'errored' ? null : (verdict?.passed ?? null),
      recall: withRecall,
      recallWithout: withoutRecall,
      // A skill case is not aggregated into a batch and its screen renders no
      // metric strip, so there is no precision or citation accuracy to state.
      precision: null,
      citationAccuracy: null,
      durationMs: Date.now() - startedAt,
      costUsd,
      outcome,
      failureReason,
    });

    return {
      caseId: c.id,
      caseName: c.name,
      runId: run.id,
      outcome,
      score: withScore ?? {
        passed: false,
        tp: 0,
        fn: 0,
        fp: 0,
        kept: 0,
        dropped: 0,
        expected_count: expected.length,
        actual_count: 0,
      },
      costUsd,
      failureReason,
    };
  }

  /** Resolve an LLM provider for a one-off trial. */
  llmFor(agent: AgentRow): Promise<LLMProvider> {
    return this.container.llm(agent.provider as Provider);
  }

  /**
   * Skill bodies for the agent as configured, so a case exercises the same
   * prompt a real review would (`run-executor.ts:340`). A skill reaches the
   * prompt only when BOTH the link and the skill itself are enabled.
   */
  async skillBodies(agentId: string): Promise<string[]> {
    const linked = await this.container.agentsRepo.linkedSkills(agentId);
    return linked.filter((l) => l.enabled && l.skill.enabled).map((l) => l.skill.body);
  }
}

/** The sum of the non-null case costs; `null` when every case cost is null. */
export function sumCosts(costs: (number | null)[]): number | null {
  const known = costs.filter((c): c is number => c !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}
