import type {
  EvalAgentDashboard,
  EvalCase,
  EvalCaseInput,
  EvalCaseSeed,
  EvalCaseWithLastRun,
  EvalOverview,
  EvalFeedRow,
  EvalOverviewRow,
  EvalRunBatch,
  EvalRunRecord,
  EvalSkillCaseRow,
  EvalTrendPoint,
} from '@devdigest/shared';
import { EvalSkillCaseFiles } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import {
  EvalRepository,
  type EvalBatchWithAgent,
  type EvalCaseRow,
  type EvalCaseRunRow,
  type UpdateEvalCase,
} from './repository.js';
import { EvalRunner, type EvalLogger } from './runner.js';
import { buildUnifiedDiff } from './pure/diff-builder.js';
import { latestScored, previousScored } from './pure/latest-scored.js';
import { readExpected } from './pure/types.js';

/**
 * Eval service (ring 1). Orchestrates the runner and the repository; knows
 * nothing of HTTP. The metrics it serves are read back from the batch row, not
 * recomputed — a run is a historical record, and re-deriving it after a prompt
 * edit is exactly what AC-12 forbids.
 */

/** The number of cross-agent runs the overview feed shows. */
const OVERVIEW_FEED_LIMIT = 20;
/** How many past runs the overview sparkline draws. */
const SPARKLINE_POINTS = 10;

export interface EvalRunStarted {
  run_id: string;
  cases_total: number;
}

/**
 * Agents with a skill-eval run in flight.
 *
 * The batch guard alone is ONE-DIRECTIONAL: it asks whether an
 * `eval_run_batches` row is `running`, and a skill run deliberately creates no
 * batch. So it blocked a skill run during a set run, but let a set run start
 * during a skill run, and let two skill runs race each other on one agent —
 * three directions, one covered. A guard has to key on something BOTH paths
 * write, so the skill path writes here.
 *
 * In-process on purpose: `EvalService` is constructed once when the routes are
 * registered (`routes.ts:102`), and this app runs a single API process. If it
 * ever runs more than one, this has to become a row.
 */
const SKILL_RUNS_IN_FLIGHT = new Set<string>();

function lockKey(workspaceId: string, agentId: string): string {
  return `${workspaceId}:${agentId}`;
}

export class EvalService {
  private repo: EvalRepository;
  private runner: EvalRunner;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
    this.runner = new EvalRunner(container, this.repo);
  }

  // ===========================================================================
  // Cases
  // ===========================================================================

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseWithLastRun[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const latest = await this.repo.latestRunPerCase(cases.map((c) => c.id));
    return cases.map((c) => ({
      ...caseToDto(c),
      last_run: runToDto(latest.get(c.id), c),
    }));
  }

  async createCase(
    workspaceId: string,
    agentId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      // The owner is the agent from the URL, never the body: a client that
      // posts someone else's owner_id must not be able to plant a case there.
      ownerId: agentId,
      name: input.name,
      expectation: input.expectation,
      inputDiff: input.input_diff ?? '',
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output ?? null,
      seededFrom: input.seeded_from ?? null,
      notes: input.notes ?? null,
    });
    return caseToDto(row);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase> {
    // `PUT /eval-cases/:id` is one route for both owners. A SKILL case's
    // `input_diff` is generated from its Before/After files rather than typed,
    // so an edit that changes those files has to rebuild it — which is the one
    // thing the agent path must not do. The owner kind decides, here, so the
    // route stays exactly as it shipped.
    const existing = await this.repo.getCase(workspaceId, caseId);
    if (!existing) throw new NotFoundError('Eval case not found');
    if (existing.ownerKind === 'skill') return this.updateSkillCase(workspaceId, caseId, patch);

    const row = await this.repo.updateCase(workspaceId, caseId, toUpdatePatch(patch));
    if (!row) throw new NotFoundError('Eval case not found');
    return caseToDto(row);
  }

  /** The case's run history goes with it, through the FK cascade (AC-36). */
  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const deleted = await this.repo.deleteCase(workspaceId, caseId);
    if (!deleted) throw new NotFoundError('Eval case not found');
  }

  // ===========================================================================
  // Running
  // ===========================================================================

  /**
   * Start a set run. Returns as soon as the batch row exists — before any case
   * has finished (AC-37) — and the run outlives the request (AC-41).
   */
  async startSetRun(
    workspaceId: string,
    agentId: string,
    logger?: EvalLogger,
  ): Promise<EvalRunStarted> {
    const agent = await this.requireAgent(workspaceId, agentId);
    await this.assertNoRunInFlight(workspaceId, agentId);

    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    // An empty set is not a conflict and not a crash — it is a stated reason.
    if (cases.length === 0) {
      throw new ValidationError(
        'This agent has no eval cases yet — add a case before running the set.',
      );
    }

    const batchId = await this.repo.createBatch({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      // Copied HERE, at run start. Never re-read at display time and never
      // joined to `agent_versions`: a seeded agent sits at version 1 with zero
      // version rows (`server/INSIGHTS.md:14`), so a join reconstructs nothing
      // for exactly the agent this feature is demonstrated on.
      systemPrompt: agent.systemPrompt,
      progressTotal: cases.length,
    });

    void this.runner.executeBatch(workspaceId, agent, cases, batchId, logger).catch((err) => {
      logger?.error(
        { agentId, batchId, err: (err as Error).message },
        'eval: background batch crashed',
      );
    });

    return { run_id: batchId, cases_total: cases.length };
  }

  /**
   * A single-case trial (AC-62). Awaited — a trial is one call and the caller
   * wants its result. It never creates a batch, so it can never appear in the
   * runs table, on the trend chart, or in a comparison.
   */
  async runSingleCase(workspaceId: string, caseId: string): Promise<EvalRunRecord> {
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    // Explicit, not incidental. A skill case's `ownerId` is a SKILL's uuid, so
    // `requireAgent` below would fail to find an agent and 404 — the right
    // outcome by accident. Saying it here means the agent route keeps refusing
    // skill cases even if the two id spaces ever overlap, and the message names
    // the real reason.
    if (c.ownerKind !== 'agent') {
      throw new NotFoundError('Eval case not found');
    }
    const agent = await this.requireAgent(workspaceId, c.ownerId);
    // The same guard a set run gets: a trial while the set is in flight would
    // spend money the author did not ask for and confuse the case's last result.
    await this.assertNoRunInFlight(workspaceId, agent.id);

    const llm = await this.runner.llmFor(agent);
    const skills = await this.runner.skillBodies(agent.id);
    const execution = await this.runner.executeOneCase(
      workspaceId,
      agent,
      c,
      llm,
      skills,
      null,
    );
    const run = await this.repo.latestRunPerCase([c.id]);
    const row = run.get(c.id);
    if (!row) throw new NotFoundError('Eval run not found');
    return { ...runToDto(row, c)!, case_name: execution.caseName };
  }

  /**
   * `Run all agents` (AC-48). An agent already running is skipped with its
   * reason rather than failing the whole call.
   */
  async startAllAgentRuns(
    workspaceId: string,
    logger?: EvalLogger,
  ): Promise<{
    runs: (EvalRunStarted & { agent_id: string })[];
    skipped: { agent_id: string; reason: string }[];
  }> {
    const enabled = await this.container.agentsRepo.listEnabled(workspaceId);
    const withCases = new Set(await this.repo.agentIdsWithCases(workspaceId));
    const runs: (EvalRunStarted & { agent_id: string })[] = [];
    const skipped: { agent_id: string; reason: string }[] = [];

    for (const agent of enabled) {
      if (!withCases.has(agent.id)) {
        skipped.push({ agent_id: agent.id, reason: 'No eval cases' });
        continue;
      }
      try {
        const started = await this.startSetRun(workspaceId, agent.id, logger);
        runs.push({ agent_id: agent.id, ...started });
      } catch (err) {
        skipped.push({ agent_id: agent.id, reason: (err as Error).message });
      }
    }
    return { runs, skipped };
  }

  // ===========================================================================
  // Skill evals — the SAME case run twice, with and without the skill's body
  //
  // Siblings of the agent methods above, never widenings of them: the agent
  // paths are shipped and green, and a signature change there would re-open
  // work this track does not own. What is shared is the repository beneath.
  // ===========================================================================

  /** The skill's case set, each row with its last result and the agent it runs on. */
  async listSkillCases(workspaceId: string, skillId: string): Promise<EvalSkillCaseRow[]> {
    await this.requireSkill(workspaceId, skillId);
    const agent = await this.resolveAgentForSkill(workspaceId, skillId);
    const cases = await this.repo.listCases(workspaceId, 'skill', skillId);
    const latest = await this.repo.latestRunPerCase(cases.map((c) => c.id));
    return cases.map((c) => ({
      ...caseToDto(c),
      last_run: runToDto(latest.get(c.id), c),
      // `null` when the skill is linked to no enabled agent — the tab states
      // that rather than hiding it, because there is then nothing to run on.
      agent_id: agent?.id ?? null,
      agent_name: agent?.name ?? null,
      ...expectedMeta(c.expectedOutput),
    }));
  }

  async createSkillCase(
    workspaceId: string,
    skillId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase> {
    await this.requireSkill(workspaceId, skillId);
    const files = parseSkillFiles(input.input_files);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'skill',
      // The owner is the skill from the URL, never the body.
      ownerId: skillId,
      name: input.name,
      expectation: input.expectation,
      // Generated, not pasted: one builder produces both the editor's preview
      // and the stored bytes, so the two can never disagree.
      inputDiff: buildOrRefuse(files),
      inputFiles: files,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output ?? null,
      seededFrom: input.seeded_from ?? null,
      notes: input.notes ?? null,
    });
    return caseToDto(row);
  }

  async updateSkillCase(
    workspaceId: string,
    caseId: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase> {
    const next: UpdateEvalCase = toUpdatePatch(patch);
    if (patch.input_files !== undefined) {
      const files = parseSkillFiles(patch.input_files);
      next.inputFiles = files;
      next.inputDiff = buildOrRefuse(files);
    }
    const row = await this.repo.updateCase(workspaceId, caseId, next);
    if (!row) throw new NotFoundError('Eval case not found');
    return caseToDto(row);
  }

  /** `› Preview generated diff` — the same builder, without saving anything. */
  previewSkillDiff(input: unknown): string {
    return buildOrRefuse(parseSkillFiles(input));
  }

  /**
   * Run one skill case: twice against the same diff, once with the skill's body
   * in the prompt and once without. Awaited — it is two calls and the caller
   * wants the result — and it creates no batch, so it never enters run history.
   */
  async runSkillCase(workspaceId: string, caseId: string): Promise<EvalRunRecord> {
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    if (c.ownerKind !== 'skill') throw new NotFoundError('This is not a skill eval case');

    const skill = await this.requireSkill(workspaceId, c.ownerId);
    const agent = await this.resolveAgentForSkill(workspaceId, c.ownerId);
    // 422 and not 404, and not an empty 200: the tab has to be able to say why
    // the run control is unavailable instead of offering a dead one.
    if (!agent) {
      throw new ValidationError(
        'This skill is not linked to any enabled agent, so there is no agent to run its eval cases on.',
      );
    }
    // The same guard a set run gets, through a door AC-42 does not cover: a
    // skill run creates no batch, so without this it would run the same agent
    // concurrently with that agent's own set run.
    await this.assertNoRunInFlight(workspaceId, agent.id);

    const key = lockKey(workspaceId, agent.id);
    SKILL_RUNS_IN_FLIGHT.add(key);
    let execution;
    try {
      const llm = await this.runner.llmFor(agent);
      execution = await this.runner.executeSkillCase(workspaceId, agent, c, llm, skill.body);
    } finally {
      // `finally`, so a throw cannot leave the agent locked for the process's
      // lifetime — a stuck lock would refuse every later run with a 409.
      SKILL_RUNS_IN_FLIGHT.delete(key);
    }

    // Read the row the run actually wrote, by id. Re-reading "the latest run
    // for this case" returned whatever finished last, which is a different row
    // whenever anything else touched the case in between.
    const row = execution.runId ? await this.repo.getCaseRun(execution.runId) : null;
    if (!row) throw new NotFoundError('Eval run not found');
    return runToDto(row, c)!;
  }

  /**
   * The agent a skill's cases run on: the first enabled agent the skill is
   * linked to, where BOTH the link and the agent are enabled — the same
   * two-sided test a real review applies (`modules/agents/helpers.ts:76-80`).
   * Resolving to an agent whose link is disabled would measure a prompt no
   * review would ever send.
   *
   * `listLinkedAgents` (`modules/skills/repository.ts:222`) orders by agent
   * NAME ascending and does not project `agent_skills.order`; "first" is
   * therefore that ordering. Widening the projection would mean editing
   * another module's repository, which this track does not own.
   */
  async resolveAgentForSkill(workspaceId: string, skillId: string): Promise<AgentRow | null> {
    const linked = await this.container.skillsRepo.listLinkedAgents(skillId);
    const first = linked.find((l) => l.linkEnabled && l.enabled);
    if (!first) return null;
    return (await this.container.agentsRepo.getById(workspaceId, first.id)) ?? null;
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<SkillRow> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  // ===========================================================================
  // Seeding a case from a real finding
  // ===========================================================================

  /**
   * Build (but do not save) a case from a finding. The diff is the reviewed
   * diff of the finding's OWN file and no other file of that PR (AC-5), which
   * is why this is built server-side: `pr_files` is not in the browser.
   *
   * Reached through `container.reviewRepo` — the documented seam
   * (`platform/container.ts:77`) — rather than by importing
   * `modules/reviews/diff-loader.ts`, which `no-cross-module-internals` would
   * not catch and which would still be a reach into another module's
   * application layer. The eight lines that rebuild a unified diff are
   * duplicated here on purpose.
   */
  async seedFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseSeed> {
    const finding = await this.container.reviewRepo.getFinding(findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    const review = await this.container.reviewRepo.getReview(finding.reviewId);
    if (!review || review.workspaceId !== workspaceId) throw new NotFoundError('Review not found');
    if (!review.agentId) throw new NotFoundError('This finding has no agent to own a case');

    const files = await this.container.reviewRepo.getPrFiles(review.prId);
    const own = files.filter((f) => f.path === finding.file);
    const inputDiff = own
      .map((f) =>
        [
          `diff --git a/${f.path} b/${f.path}`,
          `--- a/${f.path}`,
          `+++ b/${f.path}`,
          f.patch ?? '',
        ].join('\n'),
      )
      .join('\n');

    // A still-undecided finding seeds a `must_find` case: only an explicit
    // dismissal states that the agent should have stayed silent (AC-3).
    const disposition = finding.dismissedAt != null
      ? 'dismissed'
      : finding.acceptedAt != null
        ? 'accepted'
        : 'open';
    const dismissed = disposition === 'dismissed';
    const startLine = finding.startLine ?? 0;
    const endLine = finding.endLine ?? startLine;
    const lineRange = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
    const slug = (finding.title || 'finding')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 34);

    const existing = await this.repo.caseSeededFrom(workspaceId, review.agentId, findingId);

    return {
      owner_id: review.agentId,
      name: (dismissed ? 'no-' : 'must-find-') + slug,
      expectation: dismissed ? 'must_not_flag' : 'must_find',
      assertion: dismissed
        ? `MUST NOT comment on ${finding.file}:${lineRange} (${finding.title})`
        : `MUST find “${finding.title}” at ${finding.file}:${lineRange}`,
      input_diff: inputDiff,
      input_files: own.map((f) => f.path),
      input_meta: null,
      // Both expectations carry the SAME location, and the `expectation` field
      // is what flips its meaning: for `must_find` it is the finding that has
      // to appear, for `must_not_flag` the range that has to stay unflagged.
      // A `must_not_flag` case with no location could never be violated.
      expected_output: [
        {
          severity: finding.severity,
          category: finding.category,
          title: finding.title,
          file: finding.file,
          start_line: startLine,
          end_line: endLine,
        },
      ],
      seeded_from: { finding_id: findingId, disposition },
      existing_case_id: existing?.id ?? null,
    };
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async listRuns(workspaceId: string, agentId: string): Promise<EvalRunBatch[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listBatches(workspaceId, agentId);
    return rows.map(batchToDto);
  }

  async getRun(
    workspaceId: string,
    batchId: string,
  ): Promise<{ batch: EvalRunBatch; results: EvalRunRecord[] }> {
    const row = await this.repo.getBatch(workspaceId, batchId);
    if (!row) throw new NotFoundError('Eval run not found');
    const results = await this.repo.resultsForBatch(batchId);
    return {
      batch: batchToDto(row),
      results: results.map((r) => ({
        ...runToDto(r, undefined)!,
        case_name: r.caseName,
      })),
    };
  }

  /** `GET /eval-dashboard` — every agent plus the cross-agent run feed. */
  async overview(workspaceId: string): Promise<EvalOverview> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const feed = await this.repo.listBatchesForWorkspace(workspaceId, OVERVIEW_FEED_LIMIT);

    // The agent's own case count, not the latest batch's: an agent whose set
    // has just been authored has no batch yet, and the spend estimate on
    // `Run all agents` still has to state the calls it will make (AC-64).
    const caseCounts = await this.repo.caseCountsByAgent(workspaceId);

    const rows: EvalOverviewRow[] = await Promise.all(
      agents.map(async (agent): Promise<EvalOverviewRow> => {
        const batches = await this.repo.listBatches(workspaceId, agent.id);
        return {
          agent_id: agent.id,
          agent_name: agent.name,
          model: agent.model,
          // The last batch that produced numbers, not the newest row: a run in
          // flight carries nulls and would blank this agent's whole line on the
          // overview the moment it started. `null` only when the agent has
          // never completed a run — the client then renders "No eval runs yet"
          // and three em dashes (AC-24).
          latest: (() => {
            const scored = latestScored(batches);
            return scored ? batchToDto(scored) : null;
          })(),
          cases_total: caseCounts.get(agent.id) ?? 0,
          recall_trend: batches
            .slice(0, SPARKLINE_POINTS)
            .reverse()
            .map((b) => b.recall)
            .filter((r): r is number => r !== null),
        };
      }),
    );

    /* The feed lists BOTH kinds of execution, as the reference dashboard does:
       a set run as `All (N)`, a single-case trial under its own case name.
       Listing only batches left the dashboard empty until someone ran a whole
       set, which is what made it read as broken. */
    const trials = await this.repo.listTrialsForWorkspace(workspaceId, OVERVIEW_FEED_LIMIT);
    const agentName = new Map(agents.map((a) => [a.id, a.name]));

    const batchLines: EvalFeedRow[] = feed.map((b) => ({
      id: b.id,
      agent_id: b.agentId,
      agent_name: b.agentName,
      case_label: `All (${b.progressTotal})`,
      ran_at: b.ranAt ? b.ranAt.toISOString() : null,
      agent_version: b.agentVersion,
      recall: b.recall,
      precision: b.precision,
      citation_accuracy: b.citationAccuracy,
      passed: b.tracesPassed,
      total: b.tracesProduced,
    }));

    const trialLines: EvalFeedRow[] = trials.map((r) => ({
      id: r.id,
      agent_id: r.agentId,
      agent_name: agentName.get(r.agentId) ?? r.agentId,
      case_label: r.caseName,
      ran_at: r.ranAt ? r.ranAt.toISOString() : null,
      // Only a batch snapshots the version it ran under; a trial does not, and
      // guessing today's version would date the row wrongly.
      agent_version: null,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      passed: r.outcome === 'errored' ? null : r.pass ? 1 : 0,
      total: r.outcome === 'errored' ? null : 1,
    }));

    const recent = [...batchLines, ...trialLines]
      .sort((a, b) => (b.ran_at ?? '').localeCompare(a.ran_at ?? ''))
      .slice(0, OVERVIEW_FEED_LIMIT);

    return { agents: rows, recent_runs: recent };
  }

  /** `GET /agents/:id/eval-dashboard` — one agent's metrics, trend and history. */
  async agentDashboard(workspaceId: string, agentId: string): Promise<EvalAgentDashboard> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const batches = await this.repo.listBatches(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    /* The metric strip must survive a run STARTING. A batch is inserted in
       state `running` with every metric null, so taking `batches[0]` blanked
       the whole strip the moment `Run all evals` was pressed — the numbers
       vanished exactly when the author was watching. The strip reports the
       last batch that actually produced numbers; the in-flight one is
       represented by the progress state, not by four em dashes. */
    const latest = latestScored(batches);
    const previous = previousScored(batches);

    return {
      agent_id: agent.id,
      agent_name: agent.name,
      model: agent.model,
      // The caption reads the real case count, never a hard-coded number (AC-59).
      cases_total: cases.length,
      current: {
        recall: latest?.recall ?? null,
        precision: latest?.precision ?? null,
        citation_accuracy: latest?.citationAccuracy ?? null,
      },
      delta: {
        recall: delta(latest?.recall, previous?.recall),
        precision: delta(latest?.precision, previous?.precision),
        citation_accuracy: delta(latest?.citationAccuracy, previous?.citationAccuracy),
      },
      // Oldest first, and only runs that produced a full set of metrics: a run
      // with a null denominator has no point to plot (AC-47).
      trend: [...batches].reverse().flatMap(trendPoint),
      runs: batches.map(batchToDto),
      alert: precisionAlert(latest, previous),
    };
  }

  // ===========================================================================
  // Guards
  // ===========================================================================

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  /**
   * AC-42 — the 409 carries the sentence itself, because the client renders the
   * server's message rather than inventing its own.
   */
  private async assertNoRunInFlight(workspaceId: string, agentId: string): Promise<void> {
    const running = await this.repo.runningBatchForAgent(workspaceId, agentId);
    if (running || SKILL_RUNS_IN_FLIGHT.has(lockKey(workspaceId, agentId))) {
      throw new ConflictError('A run is already in progress for this agent.');
    }
  }
}

// ===========================================================================
// DTO mapping
// ===========================================================================

/**
 * The one place `EvalCaseInput` becomes a repository patch. Shared by the agent
 * and the skill update paths so the two cannot drift on which fields are
 * writable; the skill path then overwrites `inputFiles`/`inputDiff` with the
 * generated pair.
 */
function toUpdatePatch(patch: Partial<EvalCaseInput>): UpdateEvalCase {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
    ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
    ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
    ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
    ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
    ...(patch.seeded_from !== undefined ? { seededFrom: patch.seeded_from ?? null } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
  };
}

/** A skill case's `input_files` — a 400 with the reason, never a stored blob nobody can run. */
function parseSkillFiles(value: unknown): EvalSkillCaseFiles {
  const parsed = EvalSkillCaseFiles.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      'validation_error',
      `input_files is not a valid skill case file: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      400,
    );
  }
  return parsed.data;
}

/**
 * Build the case's diff, and refuse the save when it parses back to nothing.
 * Identical `Before` and `After` is a case that can never run: rejecting it at
 * save time costs one request, letting it through costs a paid run per attempt.
 */
function buildOrRefuse(files: EvalSkillCaseFiles): string {
  const diff = buildUnifiedDiff(files);
  if (parseUnifiedDiff(diff).files.length === 0) {
    throw new AppError(
      'validation_error',
      'Before and After are identical — this case has no diff to review.',
      400,
    );
  }
  return diff;
}

/**
 * The severity and category screen A renders right-aligned on a case row. They
 * live in the case's first expected finding, which is also why a MUST NOT FLAG
 * row can legitimately have neither.
 */
function expectedMeta(expectedOutput: unknown): {
  severity: string | null;
  category: string | null;
} {
  const first = Array.isArray(expectedOutput) ? expectedOutput[0] : null;
  if (!first || typeof first !== 'object') return { severity: null, category: null };
  const o = first as { severity?: unknown; category?: unknown };
  return {
    severity: typeof o.severity === 'string' ? o.severity : null,
    category: typeof o.category === 'string' ? o.category : null,
  };
}

function caseToDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    expectation: row.expectation,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    seeded_from: row.seededFrom as EvalCase['seeded_from'],
    notes: row.notes,
  };
}

function runToDto(
  row: EvalCaseRunRow | undefined,
  c: EvalCaseRow | undefined,
): EvalRunRecord | null {
  if (!row) return null;
  const actual = Array.isArray(row.actualOutput) ? row.actualOutput : [];
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: c?.name ?? null,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    recall_without: row.recallWithout,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    batch_id: row.batchId,
    outcome: row.outcome,
    failure_reason: row.failureReason,
    expected_count: c ? readExpected(c.expectedOutput).length : null,
    actual_count: actual.length,
  };
}

function batchToDto(row: EvalBatchWithAgent): EvalRunBatch {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: row.agentName,
    agent_version: row.agentVersion,
    system_prompt: row.systemPrompt,
    state: row.state,
    progress_index: row.progressIndex,
    progress_total: row.progressTotal,
    started_at: row.startedAt.toISOString(),
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    traces_passed: row.tracesPassed,
    traces_produced: row.tracesProduced,
    cases_total: row.progressTotal,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
  };
}

/** `null` unless BOTH runs have the metric — a delta against nothing is not zero. */
function delta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}

function trendPoint(row: EvalBatchWithAgent): EvalTrendPoint[] {
  if (row.recall === null || row.precision === null || row.citationAccuracy === null) return [];
  const produced = row.tracesProduced ?? 0;
  return [
    {
      ran_at: (row.ranAt ?? row.startedAt).toISOString(),
      recall: row.recall,
      precision: row.precision,
      citation_accuracy: row.citationAccuracy,
      pass_rate: produced === 0 ? 0 : (row.tracesPassed ?? 0) / produced,
      cost_usd: row.costUsd,
    },
  ];
}

/** AC-27 — a precision drop names the size of the drop in pp and the version. */
function precisionAlert(
  latest: EvalBatchWithAgent | undefined,
  previous: EvalBatchWithAgent | undefined,
): string | null {
  if (!latest || !previous) return null;
  if (latest.precision === null || previous.precision === null) return null;
  if (latest.precision >= previous.precision) return null;
  const pp = (previous.precision - latest.precision) * 100;
  return `Precision dropped ${pp.toFixed(1)} pp on version ${latest.agentVersion} (was ${(previous.precision * 100).toFixed(1)}% on version ${previous.agentVersion}).`;
}
