import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import {
  EvalExpectation,
  type EvalCaseSeededFrom,
  type EvalOwnerKind,
} from '@devdigest/shared';

/**
 * Eval data-access (ring 2). The ONLY file in `modules/eval/` that may import
 * `db/schema` or `drizzle-orm` — `no-app-to-schema` in
 * `server/.dependency-cruiser.cjs` bans the rest of the directory and carves
 * out `repository.ts` alone.
 *
 * Every read takes a `workspaceId`. `getRepo` exists in this codebase in both a
 * scoped and an unscoped form and copying the wrong one into a URL-facing route
 * is a cross-tenant read (`server/INSIGHTS.md:554`) — there is no unscoped
 * spelling here to copy.
 *
 * `eval_runs` carries no `workspace_id` of its own; it is scoped through its
 * case (`eval_cases.workspace_id`), which is why the run reads below either
 * take case ids the caller already resolved inside a workspace, or join.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalBatchRow = typeof t.evalRunBatches.$inferSelect;
export type EvalCaseRunRow = typeof t.evalRuns.$inferSelect;

/** A batch plus the agent name every screen renders beside it. */
export type EvalBatchWithAgent = EvalBatchRow & { agentName: string };

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  expectation: string;
  inputDiff: string;
  inputFiles: unknown;
  inputMeta: unknown;
  expectedOutput: unknown;
  seededFrom: EvalCaseSeededFrom | null;
  notes: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  expectation?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  seededFrom?: EvalCaseSeededFrom | null;
  notes?: string | null;
}

export interface CreateBatch {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  systemPrompt: string;
  progressTotal: number;
}

export interface CompleteBatch {
  state: 'complete' | 'partial';
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  tracesPassed: number | null;
  tracesProduced: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export interface InsertCaseRun {
  caseId: string;
  /** `null` for a single-case trial — a trial never enters run history (AC-62). */
  batchId: string | null;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  /**
   * Skill evals only — the same case's recall from the run WITHOUT the skill.
   * Optional so every shipped agent call site is untouched; a run that never
   * had a second side stores `null`, which the client renders as an em dash.
   */
  recallWithout?: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  outcome: 'passed' | 'failed' | 'errored';
  failureReason: string | null;
}

/** The provider's error message is stored, but never unbounded. */
const FAILURE_REASON_MAX = 500;

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases --------------------------------------------------------------

  async listCases(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      )
      .orderBy(t.evalCases.name);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  /**
   * `expectation` is a `text` column: Postgres will accept any string Drizzle
   * hands it, and the read schema's `z.enum` will then reject the row forever.
   * `server/INSIGHTS.md:426` measured exactly that on `findings.category` —
   * one route returned `internal_error` permanently while its siblings were
   * fine, invisible to `typecheck` and to every test. So the enum is parsed
   * HERE, on the write path, before the Drizzle call.
   */
  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const expectation = EvalExpectation.parse(values.expectation);
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        expectation,
        inputDiff: values.inputDiff,
        inputFiles: values.inputFiles ?? null,
        inputMeta: values.inputMeta ?? null,
        expectedOutput: values.expectedOutput ?? null,
        seededFrom: values.seededFrom ?? null,
        notes: values.notes,
      })
      .returning();
    return row!;
  }

  /** Same write-path parse as `insertCase` — see its docstring. */
  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const expectation =
      patch.expectation === undefined ? undefined : EvalExpectation.parse(patch.expectation);
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(expectation !== undefined ? { expectation } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles ?? null } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta ?? null } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput ?? null }
          : {}),
        ...(patch.seededFrom !== undefined ? { seededFrom: patch.seededFrom ?? null } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  /**
   * The case's `eval_runs` rows go with it through the EXISTING
   * `onDelete: 'cascade'` on `eval_runs.case_id` (`db/schema/eval.ts:26`) —
   * AC-36 needs no second DELETE here.
   */
  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Cases of an agent already seeded from a given finding (AC-65/AC-66). */
  async caseSeededFrom(
    workspaceId: string,
    ownerId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerId, ownerId),
          sql`${t.evalCases.seededFrom} ->> 'finding_id' = ${findingId}`,
        ),
      );
    return row;
  }

  /** Which agents in the workspace own at least one case (AC-48). */
  async agentIdsWithCases(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ ownerId: t.evalCases.ownerId })
      .from(t.evalCases)
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')),
      );
    return rows.map((r) => r.ownerId);
  }

  /**
   * Which skills in the workspace own at least one case. A sibling of
   * `agentIdsWithCases` rather than a widened version of it: the agent path is
   * shipped and green, and skill evals are a second kind of eval, not a
   * generalisation of the first.
   */
  async skillIdsWithCases(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ ownerId: t.evalCases.ownerId })
      .from(t.evalCases)
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'skill')),
      );
    return rows.map((r) => r.ownerId);
  }

  /** How many cases each agent owns — the caption's real count (AC-59). */
  async caseCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ ownerId: t.evalCases.ownerId, count: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.ownerId, Number(r.count)]));
  }

  // ---- batches ------------------------------------------------------------

  async createBatch(values: CreateBatch): Promise<string> {
    const [row] = await this.db
      .insert(t.evalRunBatches)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.agentVersion,
        // Copied at run start so a later prompt edit cannot rewrite what this
        // run was measuring (AC-11, AC-12, AC-32).
        systemPrompt: values.systemPrompt,
        progressTotal: values.progressTotal,
      })
      .returning({ id: t.evalRunBatches.id });
    return row!.id;
  }

  async updateBatchProgress(batchId: string, index: number): Promise<void> {
    await this.db
      .update(t.evalRunBatches)
      .set({ progressIndex: index })
      .where(eq(t.evalRunBatches.id, batchId));
  }

  async completeBatch(batchId: string, values: CompleteBatch): Promise<void> {
    await this.db
      .update(t.evalRunBatches)
      .set({
        state: values.state,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        tracesPassed: values.tracesPassed,
        tracesProduced: values.tracesProduced,
        costUsd: values.costUsd,
        durationMs: values.durationMs,
        ranAt: new Date(),
      })
      .where(eq(t.evalRunBatches.id, batchId));
  }

  /** Mark a batch that died outright, so it can never sit at `running` forever. */
  async failBatch(batchId: string): Promise<void> {
    await this.db
      .update(t.evalRunBatches)
      .set({ state: 'partial', ranAt: new Date() })
      .where(and(eq(t.evalRunBatches.id, batchId), eq(t.evalRunBatches.state, 'running')));
  }

  private batchSelect() {
    return this.db
      .select({
        batch: t.evalRunBatches,
        agentName: t.agents.name,
      })
      .from(t.evalRunBatches)
      .innerJoin(t.agents, eq(t.agents.id, t.evalRunBatches.agentId));
  }

  /** One agent's batches, newest first — what the runs table and trend read. */
  async listBatches(workspaceId: string, agentId: string): Promise<EvalBatchWithAgent[]> {
    const rows = await this.batchSelect()
      .where(
        and(
          eq(t.evalRunBatches.workspaceId, workspaceId),
          eq(t.evalRunBatches.agentId, agentId),
        ),
      )
      .orderBy(desc(t.evalRunBatches.startedAt));
    return rows.map((r) => ({ ...r.batch, agentName: r.agentName }));
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalBatchWithAgent | undefined> {
    const [row] = await this.batchSelect().where(
      and(eq(t.evalRunBatches.workspaceId, workspaceId), eq(t.evalRunBatches.id, batchId)),
    );
    return row ? { ...row.batch, agentName: row.agentName } : undefined;
  }

  /** The AC-42 guard: one batch in flight per agent, at most. */
  async runningBatchForAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<EvalBatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRunBatches)
      .where(
        and(
          eq(t.evalRunBatches.workspaceId, workspaceId),
          eq(t.evalRunBatches.agentId, agentId),
          eq(t.evalRunBatches.state, 'running'),
        ),
      );
    return row;
  }

  /** The cross-agent feed on the overview, newest first (AC-25). */
  async listBatchesForWorkspace(
    workspaceId: string,
    limit: number,
  ): Promise<EvalBatchWithAgent[]> {
    const rows = await this.batchSelect()
      .where(eq(t.evalRunBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalRunBatches.startedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r.batch, agentName: r.agentName }));
  }

  /**
   * Single-case TRIALS for the whole workspace — `eval_runs` rows with no
   * batch. The dashboard feed lists them beside set runs, as the reference
   * does, so a dashboard is useful from the first case a human runs rather
   * than only after a full set.
   *
   * A trial records no agent version: only a batch snapshots one. The caller
   * therefore reports `null` rather than guessing the agent's version today.
   */
  async listTrialsForWorkspace(
    workspaceId: string,
    limit: number,
  ): Promise<
    {
      id: string;
      agentId: string;
      caseName: string;
      ranAt: Date | null;
      recall: number | null;
      precision: number | null;
      citationAccuracy: number | null;
      pass: boolean | null;
      outcome: string | null;
    }[]
  > {
    const rows = await this.db
      .select({
        id: t.evalRuns.id,
        agentId: t.evalCases.ownerId,
        caseName: t.evalCases.name,
        ranAt: t.evalRuns.ranAt,
        recall: t.evalRuns.recall,
        precision: t.evalRuns.precision,
        citationAccuracy: t.evalRuns.citationAccuracy,
        pass: t.evalRuns.pass,
        outcome: t.evalRuns.outcome,
      })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          isNull(t.evalRuns.batchId),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
    return rows;
  }

  // ---- case runs ----------------------------------------------------------

  async insertCaseRun(values: InsertCaseRun): Promise<EvalCaseRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        batchId: values.batchId,
        actualOutput: values.actualOutput ?? null,
        pass: values.pass,
        recall: values.recall,
        recallWithout: values.recallWithout ?? null,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        outcome: values.outcome,
        failureReason:
          values.failureReason === null
            ? null
            : values.failureReason.slice(0, FAILURE_REASON_MAX),
      })
      .returning();
    return row!;
  }

  /** Every case result of one batch, with the case name each row belongs to. */
  async resultsForBatch(batchId: string): Promise<(EvalCaseRunRow & { caseName: string })[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
      .where(and(eq(t.evalRuns.batchId, batchId), isNotNull(t.evalRuns.batchId)))
      .orderBy(t.evalCases.name);
    return rows.map((r) => ({ ...r.run, caseName: r.caseName }));
  }

  /**
   * The last execution that touched each case — deliberately UNFILTERED by
   * `batch_id`, so a single-case trial run after a set run is the result the
   * case row shows (AC-63).
   */
  /** One run row by id — the row a just-finished execution actually wrote. */
  async getCaseRun(runId: string): Promise<EvalCaseRunRow | null> {
    const [row] = await this.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, runId));
    return row ?? null;
  }

  async latestRunPerCase(caseIds: string[]): Promise<Map<string, EvalCaseRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
    const latest = new Map<string, EvalCaseRunRow>();
    for (const row of rows) if (!latest.has(row.caseId)) latest.set(row.caseId, row);
    return latest;
  }

  /** Trial runs of a case (`batch_id IS NULL`) — used by the tests that prove AC-62. */
  async trialRunsForCase(caseId: string): Promise<EvalCaseRunRow[]> {
    return this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.caseId, caseId), isNull(t.evalRuns.batchId)))
      .orderBy(desc(t.evalRuns.ranAt));
  }
}
