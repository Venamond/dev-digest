import type { FastifyBaseLogger } from 'fastify';
import type {
  BlastResponse,
  BlastState,
  BriefInputId,
  PrIntentRecord,
} from '@devdigest/shared';
import type { PullRow, RepoRow } from '../../db/rows.js';
import { toPrIntentRecord } from '../reviews/intent/record.js';
import type { BriefDeps } from './deps.js';
import { selectDocuments, type SelectedDocument } from './documents.js';
import { firstChangedLine } from './patch-line.js';

/**
 * Every input the brief is assembled from, read once, with no boundary failure
 * allowed to propagate.
 *
 * Ring 1. The rule this file exists to enforce is the spec's Note over A,G: a
 * GitHub outage, an unindexed repository or a missing intent must each cost the
 * brief that ONE input and nothing else. Each read is wrapped; what could not
 * be read lands in `missing` and the build continues (AC-5, AC-6, AC-7, AC-32).
 */

/**
 * The PR's own facts. Diff STATS only — `additions`/`deletions`/`filesCount`
 * are counts the database already stores, never diff text.
 */
export interface BriefPrMeta {
  number: number;
  title: string;
  /** `pull_requests.body` is nullable; `null` renders as an empty block, never "null". */
  body: string | null;
  author: string;
  branch: string;
  base: string;
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface BriefFinding {
  severity: string;
  title: string;
  file: string;
  start_line: number;
}

export interface BriefIssue {
  number: number;
  title: string;
  body: string;
}

/**
 * AC-2 is STRUCTURAL here: there is no field on this interface capable of
 * holding a patch. `getPrFiles` returns `PrFileRow[]`, whose `patch` column
 * holds the unified diff — `gather` projects to paths and one line NUMBER per
 * path, and never carries the rows forward "for later".
 */
export interface RawBriefInputs {
  prMeta: BriefPrMeta;
  /**
   * Changed paths, most-changed first (`additions + deletions` descending, then
   * path). The order is the rank the wide-PR trim in `budget.ts` keeps the head
   * of, and it is computed here because this is the only place the per-file
   * stats exist — they are deliberately not carried any further.
   */
  changedFiles: string[];
  /**
   * AC-40's second source of a review-focus line: changed path → the first
   * changed line on the HEAD side, parsed from the `+c` of that file's first
   * hunk header. Numbers only — the patch itself stops here (see AC-2 above).
   *
   * SERVER-SIDE ONLY. `prompt.ts` never reads this field, so it costs the
   * budget fitter nothing and the model cannot learn that a line exists. A
   * file whose patch is absent or unparseable simply has no key here.
   */
  changedFileLines: Record<string, number>;
  intent: PrIntentRecord | null;
  blastMap: BlastResponse | null;
  blastSummary: string | null;
  issue: BriefIssue | null;
  documents: SelectedDocument[];
  findings: BriefFinding[];
  missing: BriefInputId[];
  blastState: BlastState | null;
}

/**
 * The issue reference in a PR title or body. Same shape as the one
 * `modules/reviews/intent/gather.ts:7` uses; it is a module-local const there,
 * so it is restated rather than imported. The FIRST match wins.
 */
const ISSUE_HASH = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

export async function gather(
  deps: BriefDeps,
  args: {
    workspaceId: string;
    pull: PullRow;
    repo: RepoRow;
    log?: FastifyBaseLogger;
  },
): Promise<RawBriefInputs> {
  const { workspaceId, pull, repo, log } = args;
  const missing: BriefInputId[] = [];

  const { paths: changedFiles, lines: changedFileLines } = await gatherChangedFiles(deps, pull.id);
  const intent = await gatherIntent(deps, pull, missing);
  const findings = await gatherFindings(deps, pull.id, missing);
  const blast = await gatherBlast(deps, workspaceId, pull.id, missing, log);
  const issue = await gatherIssue(deps, repo, pull, missing);
  const documents = await gatherDocuments(deps, workspaceId, repo.id, changedFiles, missing);

  const raw: RawBriefInputs = {
    prMeta: {
      number: pull.number,
      title: pull.title,
      body: pull.body,
      author: pull.author,
      branch: pull.branch,
      base: pull.base,
      additions: pull.additions,
      deletions: pull.deletions,
      filesCount: pull.filesCount,
    },
    changedFiles,
    changedFileLines,
    intent,
    blastMap: blast.map,
    blastSummary: blast.summary,
    issue,
    documents,
    findings,
    missing,
    blastState: blast.state,
  };

  // Counts and ids only — never a body, never a fragment, never a title.
  log?.info(
    {
      prId: pull.id,
      changedFiles: changedFiles.length,
      intent: intent !== null,
      blastState: blast.state,
      blastSummary: blast.summary !== null,
      issue: issue !== null,
      documents: documents.length,
      findings: findings.length,
      missing,
    },
    'pr_brief_gather',
  );

  return raw;
}

/**
 * Paths, plus one line number per path. The per-file `additions`/`deletions`
 * are read here to rank the list and are then dropped: they exist to make the
 * wide-PR trim deterministic, not to travel to the model.
 *
 * `patch` is read here and NOWHERE else in this module: `firstChangedLine`
 * (`patch-line.ts`) reduces it to the `+c` of its first hunk header, and the
 * string is discarded with the row. That is the whole of AC-40's second source
 * — see `focus-lines.ts` for why AC-2 does not reach it.
 */
async function gatherChangedFiles(
  deps: BriefDeps,
  prId: string,
): Promise<{ paths: string[]; lines: Record<string, number> }> {
  const files = await deps.reviewRepo.getPrFiles(prId);
  const lines: Record<string, number> = {};
  for (const f of files) {
    const line = firstChangedLine(f.patch);
    if (line !== null) lines[f.path] = line;
  }
  const paths = files
    .map((f) => ({ path: f.path, size: f.additions + f.deletions }))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .map((f) => f.path);
  return { paths, lines };
}

/** AC-7: no derived intent is an input the brief does without, not a failure. */
async function gatherIntent(
  deps: BriefDeps,
  pull: PullRow,
  missing: BriefInputId[],
): Promise<PrIntentRecord | null> {
  try {
    const row = await deps.reviewRepo.getIntent(pull.id);
    if (!row) {
      missing.push('intent');
      return null;
    }
    return toPrIntentRecord(row, pull);
  } catch {
    missing.push('intent');
    return null;
  }
}

/** AC-5: the findings of the most recent finished run, or none. */
async function gatherFindings(
  deps: BriefDeps,
  prId: string,
  missing: BriefInputId[],
): Promise<BriefFinding[]> {
  try {
    const reviews = await deps.reviewRepo.reviewsForPull(prId);
    const latest = reviews[0]?.findings ?? [];
    if (latest.length === 0) {
      missing.push('findings');
      return [];
    }
    return latest.map((f) => ({
      severity: f.severity,
      title: f.title,
      file: f.file,
      start_line: f.startLine,
    }));
  } catch {
    missing.push('findings');
    return [];
  }
}

/**
 * AC-32: the map and the paragraph fail independently, and neither failure
 * stops the brief. `summarize` throws `ConflictError` for a degraded state
 * (`blast/service.ts:161-163`) and for an empty map (`:166-170`) — both are
 * ordinary outcomes here, so they are caught rather than classified.
 */
async function gatherBlast(
  deps: BriefDeps,
  workspaceId: string,
  prId: string,
  missing: BriefInputId[],
  log?: FastifyBaseLogger,
): Promise<{ map: BlastResponse | null; summary: string | null; state: BlastState | null }> {
  let map: BlastResponse | null = null;
  let state: BlastState | null = null;
  try {
    const blast = deps.blast();
    const res = await blast.getBlast(workspaceId, prId, log);
    map = res;
    state = res.state;
    // A usable map is a usable map: only an EMPTY one that is also not `ok`
    // counts as an input the brief did without.
    if (res.state !== 'ok' && res.symbols.length === 0) missing.push('blast_map');
  } catch {
    missing.push('blast_map');
    return { map: null, summary: null, state: null };
  }

  try {
    const summary = await deps.blast().summarize(workspaceId, prId, log);
    return { map, summary: summary.summary, state };
  } catch {
    missing.push('blast_summary');
    return { map, summary: null, state };
  }
}

/**
 * AC-6: an unconfigured or failing GitHub is one missing input.
 *
 * `resolveLinkedIssue` on the octokit adapter is private and is not on the
 * `GitHubClient` port (`vendor/shared/adapters.ts:164` offers `getIssue` only),
 * so the number is resolved here from the PR's own title and body. The issue is
 * never persisted.
 */
async function gatherIssue(
  deps: BriefDeps,
  repo: RepoRow,
  pull: PullRow,
  missing: BriefInputId[],
): Promise<BriefIssue | null> {
  const match = ISSUE_HASH.exec(`${pull.title}\n${pull.body ?? ''}`);
  const number = match?.[1] ? Number(match[1]) : NaN;
  if (!Number.isFinite(number) || number <= 0) {
    missing.push('issue');
    return null;
  }
  try {
    // `deps.github()` rejects with ConfigError when no token is configured —
    // the pattern at reviews/intent/classify.ts:105-110.
    const github = await deps.github();
    const issue = await github.getIssue({ owner: repo.owner, name: repo.name }, number);
    return { number, title: issue.title, body: issue.body ?? '' };
  } catch {
    missing.push('issue');
    return null;
  }
}

/** AC-33: no clone, no configured roots or no relevant document is not an error. */
async function gatherDocuments(
  deps: BriefDeps,
  workspaceId: string,
  repoId: string,
  changedFiles: string[],
  missing: BriefInputId[],
): Promise<SelectedDocument[]> {
  try {
    const ctx = deps.context();
    // `listDocs` returns [] when the repository was never cloned
    // (context/service.ts:44-45), which is the normal empty state.
    const docs = await ctx.listDocs(workspaceId, repoId);
    const selected = await selectDocuments(docs, changedFiles, (p) =>
      ctx.readDoc(workspaceId, repoId, p).then((d) => d?.content),
    );
    if (selected.length === 0) missing.push('documents');
    return selected;
  } catch {
    missing.push('documents');
    return [];
  }
}
