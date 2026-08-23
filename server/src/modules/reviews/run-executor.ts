import type { Container } from '../../platform/container.js';
import type { PrIntentRecord, Provider, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import {
  reviewPullRequest,
  countBlockers,
  scoreFromFindings,
  summarizePromptAssembly,
} from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import {
  emitPromptAssemblyLog,
  omittedPromptSlots,
  promptAssemblyFingerprints,
} from '../../platform/prompt-log.js';
import type { AgentRow, RepoRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import { promptSkillBodies, promptSkillRefs } from '../agents/helpers.js';
import { classify, type ClassifyResult } from './intent/classify.js';
import { scopeFilter } from './intent/scope-filter.js';
import { createContextService, rootOf } from '../context/facade.js';
import { approxTokens } from '../context/constants.js';

/**
 * "1 spec, 2 docs" — the attached documents counted per search root, in the
 * order the roots are configured, so a log line says what kind of context went
 * in and not only how much. A root contributing nothing is left out entirely;
 * a document under no known root is counted as `other`.
 *
 * The root names are already plural (`specs`, `docs`), so ONE document drops the
 * trailing `s` — "1 spec, 2 docs". Naive on purpose: these are folder names, not
 * prose, and a reader matches them against the rail's own labels.
 */
export function describeByRoot(
  docs: ReadonlyArray<{ path: string }>,
  roots: readonly string[],
): string {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const root = rootOf(doc.path, roots) ?? 'other';
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }
  const ordered = [...roots, 'other'].filter((r) => counts.has(r));
  if (ordered.length === 0) return `${docs.length} document(s)`;
  return ordered
    .map((root) => {
      const n = counts.get(root)!;
      const label = n === 1 && root.endsWith('s') ? root.slice(0, -1) : root;
      return `${n} ${label}`;
    })
    .join(', ');
}

/**
 * "2 via skill lethal-trifecta" / "3 via 2 skills" — how the inherited part of
 * the project context arrived. One skill is named, because naming it is what
 * lets a reader go and change it; several are counted, because a log line is
 * not a list.
 */
export function describeInherited(
  inherited: ReadonlyArray<{ skills: string[] }>,
): string {
  const names = new Set<string>();
  for (const src of inherited) for (const name of src.skills) names.add(name);
  if (names.size === 1) return `${inherited.length} via skill ${[...names][0]}`;
  if (names.size === 0) return `${inherited.length} inherited`;
  return `${inherited.length} via ${names.size} skills`;
}

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * The project-context documents one run resolved, read and capped, plus what it
 * had to leave out and the clone revision it read at. Everything here goes on
 * to the trace (S16), so a run's own record explains its `## Project context`
 * block without re-reading the clone.
 */
export type ProjectContext = {
  /** Survivors, in the resolver's order — passed straight to `specs`. */
  docs: Array<{ path: string; text: string }>;
  /**
   * Where each survivor came from, same order as `docs`. A document inherited
   * from a skill is injected exactly like one attached to the agent, so without
   * this the log and the trace cannot tell the reader which is which.
   */
  sources: Array<{ path: string; via: 'agent' | 'skill'; skills: string[] }>;
  /** Attached documents that did NOT reach the prompt, with why (AC-25). */
  omitted: Array<{ path: string; reason: 'unreadable' | 'over_ceiling' }>;
  /** Clone HEAD the documents were read at (AC-33); null when unknown. */
  revision: string | null;
};

/**
 * Nothing attached, or the clone could not be read at all. Both arrays empty is
 * how AC-32 tells "nothing attached" from "attached but unusable", which shows
 * up as an empty `docs` with a NON-empty `omitted`.
 */
const NO_PROJECT_CONTEXT: ProjectContext = { docs: [], sources: [], omitted: [], revision: null };

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        // Trace before status, as in the two paths below: a terminal status is
        // what consumers poll to know the run is over, and it must not arrive
        // before the log that explains the failure.
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    let intentResult: ClassifyResult | null = null;
    try {
      intentResult = await runLog.step(
        'Classifying PR intent',
        () =>
          classify({
            container: this.container,
            reviews: this.repo,
            workspaceId,
            pull,
            repo,
            force: false,
          }),
        { kind: 'tool' },
      );
      if (intentResult.reused) {
        runLog.info(`Reusing intent for head_sha ${pull.headSha}`);
      } else {
        runLog.info('PR intent classified', {
          model: intentResult.model,
          sources: intentResult.record.sources,
          tokensIn: intentResult.tokensIn,
          tokensOut: intentResult.tokensOut,
        });
        if (intentResult.promptStats) {
          emitPromptAssemblyLog({
            mode: this.container.config.promptLog,
            runLog,
            logger,
            payload: {
              correlationId: `intent:${pull.id}`,
              model: intentResult.model,
              prompt: 'intent',
              summary: intentResult.promptStats,
            },
            fingerprints: intentResult.promptFingerprints,
          });
        }
      }
    } catch (err) {
      runLog.info(`intent: skipped — ${(err as Error).message}`);
      intentResult = null;
    }

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(
          workspaceId,
          pull,
          repo,
          diff,
          agent,
          runId,
          runLog,
          intentResult,
          logger,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    intentResult: ClassifyResult | null,
    logger?: Logger,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    // Declared OUTSIDE the try: the failure path's trace has to say what this
    // run read too, and by then the try block's scope is gone.
    let projectContext: ProjectContext = NO_PROJECT_CONTEXT;

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const record: PrIntentRecord | null = intentResult?.record ?? null;
      const task = taskLine(pull, record ?? undefined) + rankNote;

      // Skills: bodies where skills.enabled AND agent_skills.enabled, order ASC.
      // Empty → assemblePrompt omits the Skills section (trace skills = null).
      const linked = await this.agents.linkedSkills(agent.id);
      const skillBodies = promptSkillBodies(linked);
      if (skillBodies.length > 0) {
        runLog.info(`Skills: ${skillBodies.length} body(ies) attached to prompt`);
      }

      const skillRefs = promptSkillRefs(linked);
      try {
        await this.repo.recordRunSkills(runId, skillRefs);
      } catch (err) {
        runLog.info(`run_skills recording failed (non-fatal): ${(err as Error).message}`);
      }

      // ---- Project context: the agent's attached documents ------------------
      // Resolved through context/facade.ts, read in order, capped whole-or-
      // nothing against the workspace ceiling. Best-effort by contract: no
      // failure in this path may fail a review (AC-22).
      projectContext = await this.loadProjectContext(workspaceId, repo, agent, runLog);

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // Project context — nothing readable means no `## Project context`
        // section at all, not an empty one (AC-32).
        ...(projectContext.docs.length > 0 ? { specs: projectContext.docs } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        ...(record ? { intent: record } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        correlationId: runId,
        onEvent: (e) => {
          if (e.msg === 'Prompt assembled' && this.container.config.promptLog === 'off') return;
          runLog.event(e.kind, e.msg, e.data);
        },
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, grounding, costUsd } = outcome;

      if (this.container.config.promptLog === 'verbose') {
        emitPromptAssemblyLog({
          mode: 'verbose',
          logger,
          payload: {
            correlationId: runId,
            model: agent.model,
            prompt: 'review',
            summary: summarizePromptAssembly(outcome.assembly, { diffChars: diff.raw.length }),
          },
          fingerprints: promptAssemblyFingerprints(outcome.assembly),
          omitted: omittedPromptSlots(outcome.assembly),
          skipSummary: true,
        });
      }

      const kept = scopeFilter(outcome.review.findings, record?.out_of_scope ?? []);
      const score = scoreFromFindings(kept);

      // The user may have deleted this run (timeline trash icon) while the LLM
      // call above was still in flight — `deleteAgentRun` only removes a
      // `reviews` row that already exists, so it can't catch a review that
      // hasn't been written yet. Treat a missing agent_runs row as a
      // cancellation: persisting a review now would orphan it (and its
      // findings) with no run to show it against in the timeline, while the
      // PR-wide severity counters would still tally them — a source of the
      // total/timeline mismatch.
      if (!(await this.repo.agentRunExists(runId))) {
        throw new RunCancelledError();
      }

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, kept);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(kept, agent.ciFailOn);

      // ---- Observability: ONE run_traces document, THEN agent_runs ---------
      // Order is load-bearing. A terminal `agent_runs.status` is the signal
      // every consumer polls to mean "this run is finished" — and then reads
      // the trace. Flipping the status first opens a window where the run
      // reads as done and `GET /runs/:id/trace` has nothing to return. It is
      // narrow on an idle machine and wide under load, which is exactly the
      // shape of a flaky integration suite: `intent.it.test.ts` and
      // `agents-skills.it.test.ts` each failed ~1 full-suite run in 2 while
      // passing in isolation, reading `undefined` where the trace should be.
      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: outcome.assembly,
        tool_calls: [
          ...(intentResult && !intentResult.reused
            ? [
                {
                  tool: 'intent_classifier',
                  args: intentResult.model,
                  meta: 'PrIntent',
                  ms: Math.round(intentResult.durationMs),
                },
              ]
            : []),
          ...outcome.chunks.map((c) => ({
            tool: 'review_file',
            args: c.label,
            meta: outcome.mode,
            ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
          })),
        ],
        raw_output: outcome.raw,
        memory_pulled: [],
        // What the `## Project context` block actually contains, what was left
        // out and why, and the clone revision it was read at (AC-25, AC-33).
        // Empty `specs_read` WITH empty `specs_omitted` = nothing attached;
        // empty `specs_read` with a non-empty `specs_omitted` = attached but
        // unusable (AC-32).
        specs_read: projectContext.docs.map((doc) => doc.path),
        specs_sources: projectContext.sources,
        specs_omitted: projectContext.omitted,
        specs_revision: projectContext.revision,
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        findingsCount: findingRows.length,
        grounding,
        score,
        blockers,
        costUsd,
        error: null,
      });
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      // Same order as the success path: the trace lands before the status
      // says the run is over, so "failed" never means "failed, and the log
      // explaining why is not there yet".
      await this.repo
        .saveRunTrace(
          runId,
          // A run that failed still says what it read — the read happens before
          // the LLM call, so by the time most failures land the answer exists.
          this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start, projectContext),
        )
        .catch(() => undefined);
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: 0,
          tokensOut: 0,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Resolve, read and cap this agent's project-context documents (AC-19, AC-22,
   * AC-23, AC-28, AC-39, AC-40).
   *
   * Best-effort by contract. An unreadable document is skipped and recorded; a
   * clone that cannot be read at all yields no project context and a completed
   * run. NOTHING here may fail a review — a repository document is an input to
   * the review, never a precondition of it.
   *
   * Reading goes through `ContextService.readDoc`, not a raw `git.readFile`:
   * `resolveInsideClone` is lexical only (it cannot resolve symlinks — `CloneFs`
   * has no `realpath`), so containment actually comes from `walkMarkdown`, which
   * never emits a symlink, and `readDoc` checks membership of that walked set.
   * A raw read would bypass the only check there is.
   */
  private async loadProjectContext(
    workspaceId: string,
    repo: RepoRow,
    agent: AgentRow,
    runLog: RunLogger,
  ): Promise<ProjectContext> {
    try {
      const context = createContextService(this.container);
      // The SAME resolver the editor tabs render, so the tab cannot promise a
      // set or an order the run does not honour (AC-20, AC-34, AC-39, AC-40).
      const effective = await context.effectiveDocsForAgent(agent.id, repo.id);
      if (effective.length === 0) return NO_PROJECT_CONTEXT;

      const ceiling = await context.tokenCeiling(workspaceId);
      const roots = await context.searchRoots(workspaceId);
      const docs: ProjectContext['docs'] = [];
      const sources: ProjectContext['sources'] = [];
      const omitted: ProjectContext['omitted'] = [];
      let usedTokens = 0;

      for (const doc of effective) {
        const text = await this.readContextDoc(context, workspaceId, repo.id, doc.path);
        if (text === undefined) {
          omitted.push({ path: doc.path, reason: 'unreadable' });
          continue;
        }
        // Whole or not at all, and skip-and-continue: a document that does not
        // fit in what REMAINS is left out, and the documents after it are still
        // considered — a small one behind a huge one still gets in. Never
        // truncated: half an invariant is worse than none (AC-23).
        //
        // `approxTokens` is the ONE estimator this feature uses; the tab's
        // over-ceiling warning calls the same function, so the warning and the
        // actual skipping cannot disagree.
        const cost = approxTokens(text.length);
        if (usedTokens + cost > ceiling) {
          omitted.push({ path: doc.path, reason: 'over_ceiling' });
          continue;
        }
        usedTokens += cost;
        docs.push({ path: doc.path, text });
        // `own` wins when a document arrives BOTH ways (AC-20): it holds the
        // agent's position, so that is the provenance a reader should see.
        sources.push({
          path: doc.path,
          via: doc.own ? 'agent' : 'skill',
          skills: doc.skills.map((sk) => sk.skill_name),
        });
      }

      const revision = await this.container.git
        .currentHead({ owner: repo.owner, name: repo.name })
        .catch(() => null);

      if (docs.length > 0 || omitted.length > 0) {
        // Break the count down by search root, so the log says WHAT went in and
        // not merely how much: "1 spec, 2 docs" answers the question a reader
        // actually has. Roots are configurable, so the labels come from the
        // paths themselves rather than from a fixed list.
        const inherited = sources.filter((src) => src.via === 'skill');
        runLog.info(
          `Project context: ${describeByRoot(docs, roots)} attached to prompt` +
            // A document inherited from a skill is injected exactly like the
            // agent's own, so the log has to say which — otherwise a reader
            // cannot tell why a document they never attached to this agent is
            // in the prompt.
            (inherited.length > 0 ? ` (${describeInherited(inherited)})` : '') +
            (omitted.length > 0 ? `, ${omitted.length} omitted` : ''),
        );
      }
      return { docs, sources, omitted, revision };
    } catch (err) {
      // A repo with no clone, an unreadable clone, a database hiccup — the run
      // goes on without project context rather than failing.
      runLog.info(`Project context unavailable (non-fatal): ${(err as Error).message}`);
      return NO_PROJECT_CONTEXT;
    }
  }

  /**
   * One document's text, or `undefined` when it must be recorded `unreadable`:
   * missing, deleted since it was attached, outside the configured roots
   * (`readDoc` throws a 400 for that), empty, or not text at all.
   *
   * Note `readFile(..., 'utf8')` does NOT throw on invalid UTF-8 — Node decodes
   * lossily to U+FFFD. The NUL-byte check is what catches a file that is not
   * text; a stray replacement character in otherwise valid markdown is left
   * alone rather than costing the human a document.
   */
  private async readContextDoc(
    context: ReturnType<typeof createContextService>,
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<string | undefined> {
    try {
      const doc = await context.readDoc(workspaceId, repoId, path);
      if (!doc) return undefined;
      if (doc.content.trim().length === 0) return undefined;
      if (doc.content.includes('\u0000')) return undefined;
      return doc.content;
    } catch {
      return undefined;
    }
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    projectContext: ProjectContext = NO_PROJECT_CONTEXT,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: projectContext.docs.map((doc) => doc.path),
      specs_sources: projectContext.sources,
      specs_omitted: projectContext.omitted,
      specs_revision: projectContext.revision,
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
