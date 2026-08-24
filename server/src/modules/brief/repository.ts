import { and, desc, eq } from 'drizzle-orm';
import type {
  BlastState,
  BriefCut,
  BriefInputId,
  BriefOverBudget,
  PrBrief,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PrBriefRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';

/**
 * Ring 2 — the ONLY file in modules/brief/ allowed to import drizzle-orm and
 * db/schema. Everything else in the module names the row shape via
 * `db/rows.ts` (`PrBriefRow`).
 *
 * It reads `repo_index_state` and `agent_runs` directly: a module's own
 * repository may query any table, and only another MODULE's repository is off
 * limits. Recomputing the blast component through `BlastService.getBlast`
 * instead would run the whole reverse-dependency walk on every page open,
 * which is exactly the cost AC-20's cache exists to avoid.
 */

/**
 * What the `inputs` jsonb column holds — written here, read by the service.
 *
 * `blast_state` rides along in this untyped jsonb column rather than in a
 * column of its own: `PrBriefRecord.blast_state` is a contract field the card
 * needs in order to state the limitation of AC-32, and `0018_pr_brief_cache`
 * added no column for it. Additive inside jsonb, so a pre-0018 row (whose
 * `inputs` is NULL) still reads back as "unknown".
 */
export interface BriefInputsColumn {
  included: BriefInputId[];
  cut: BriefCut[];
  missing: BriefInputId[];
  /**
   * Set when the fitter could not get under the cap even after every cut.
   * Rides in this same jsonb column for the same reason `blast_state` does —
   * additive, no migration, and a row written before it existed reads back as
   * `null` (see `StoredInputs` in `service.ts`).
   */
  over_budget: BriefOverBudget | null;
  blast_state: BlastState | null;
}

/**
 * The four AC-19 cache-key components plus their join.
 *
 * They are stored as four separate columns AND joined, on purpose: when a
 * cached brief goes stale the row says WHICH input moved, and a wrong key is
 * readable by eye in `psql` against `pr_intent.head_sha`. Plain text, never
 * hashed.
 */
export interface BriefStateKey {
  head_sha: string;
  intent_key: string;
  blast_key: string;
  run_key: string;
  state_key: string;
}

/** The value bag `upsertBrief` writes. Column names, not contract names. */
export interface BriefUpsert {
  json: PrBrief;
  headSha: string;
  intentKey: string;
  blastKey: string;
  runKey: string;
  stateKey: string;
  model: string;
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  builtAt: Date;
  inputs: BriefInputsColumn;
}

/** The literal every optional cache-key component uses when its row is absent. */
const NONE = 'none';

export class BriefRepository {
  constructor(private db: Db) {}

  /** The cached brief for a PR, or `undefined` — an unknown prId is not an error. */
  async getBrief(prId: string): Promise<PrBriefRow | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row;
  }

  /** Upsert on the primary key: one brief per pull request, always the latest. */
  async upsertBrief(prId: string, values: BriefUpsert): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { ...values } });
  }

  /**
   * The current value of the cache key, recomputed from the live tables.
   *
   * A missing pull request yields all-`'none'` rather than throwing: the
   * service has already answered `404` in that case, and a repository that
   * throws would make `get()` fail where it should report "no brief".
   */
  async currentStateKey(workspaceId: string, prId: string): Promise<BriefStateKey> {
    const [pull] = await this.db
      .select({ headSha: t.pullRequests.headSha, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return join({ head_sha: '', intent_key: NONE, blast_key: NONE, run_key: NONE });

    const [intent, blast, run] = await Promise.all([
      this.intentKey(prId),
      this.blastKey(pull.repoId),
      this.runKey(prId),
    ]);
    return join({
      head_sha: pull.headSha,
      intent_key: intent,
      blast_key: blast,
      run_key: run,
    });
  }

  /**
   * `head_sha|classified_at` of the derived intent.
   *
   * `classified_at` is what makes the Intent card's Recompute move the key
   * while the PR head stands still — the case AC-19 exists for.
   */
  private async intentKey(prId: string): Promise<string> {
    const [row] = await this.db
      .select({ headSha: t.prIntent.headSha, classifiedAt: t.prIntent.classifiedAt })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    if (!row) return NONE;
    return `${row.headSha ?? ''}|${row.classifiedAt?.toISOString() ?? ''}`;
  }

  /** `status|last_indexed_sha|updated_at` of the repo's code index. */
  private async blastKey(repoId: string): Promise<string> {
    const [row] = await this.db
      .select({
        status: t.repoIndexState.status,
        lastIndexedSha: t.repoIndexState.lastIndexedSha,
        updatedAt: t.repoIndexState.updatedAt,
      })
      .from(t.repoIndexState)
      .where(eq(t.repoIndexState.repoId, repoId));
    if (!row) return NONE;
    return `${row.status}|${row.lastIndexedSha}|${row.updatedAt.toISOString()}`;
  }

  /** `id|ran_at` of the newest FINISHED review run this brief could have seen. */
  private async runKey(prId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: t.agentRuns.id, ranAt: t.agentRuns.ranAt })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.prId, prId), eq(t.agentRuns.status, 'done')))
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(1);
    if (!row) return NONE;
    return `${row.id}|${row.ranAt.toISOString()}`;
  }
}

/** The four components joined with `|` — the single value a cache hit compares. */
function join(parts: Omit<BriefStateKey, 'state_key'>): BriefStateKey {
  return {
    ...parts,
    state_key: [parts.head_sha, parts.intent_key, parts.blast_key, parts.run_key].join('|'),
  };
}
