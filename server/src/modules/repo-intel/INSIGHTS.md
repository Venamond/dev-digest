# `repo-intel` — insights

Append-only. `repo-intel` is a semi-independent subsystem inside `server`
(its own README, its own pipeline) — it gets its own insights file at this
finer granularity instead of sharing `server/INSIGHTS.md`. Same rules apply:
cold-test every entry, append-only, treat as a draft to spot-check.

## What Works

## What Doesn't Work

- **In a graph walk seeded from MANY files, a set of seeds plus one scalar
  depth is not enough — the depth must be per seed.** `getReverseDependents`
  starts from every changed file at once. When two seeds sit on the same
  import chain, a dependent is a different number of hops from each: with
  `FindingsPanel.tsx` and `lib/hooks/reviews.ts` both changed, the barrel
  `FindingsPanel/index.ts` is ONE hop from the first and TWO from the second.
  Carrying `via: string[]` beside a single `depth: 1` let `blast/shape.ts`
  filter `depth === 1` per symbol and print that barrel as a direct importer
  of `reviews.ts` — a file it does not import at all. `via` is now
  `{ seed, depth }[]`; the row-level `depth` (shortest to any seed) is for
  ordering only.
  **Do:** whenever a traversal here fans out from a set, ask whether each
  derived number is per-source or per-row before storing it. And verify the
  claim against `file_edges` rather than reading the walk: the walk looked
  right, the index was right, and only
  `select from_file, to_file from file_edges where from_file like '%…'`
  showed that the edge being asserted did not exist.

- **A `count(*)` in SQL beside a list this module deduplicates in JS produces
  a FALSE "truncated" flag.** `getBlastRadius`'s callers are deduplicated by
  `(file, enclosing symbol)` in `service.ts` before the per-symbol cap, so a
  function that calls the changed symbol twice is two `references` rows and
  **one** caller. `countResolvedCallers` originally returned `count(*)`, and
  comparing that against the kept row count reported `truncated: true` with
  nothing truncated — the UI then said "showing 1 of 2 callers" about a single
  caller. Shipped and only caught in review.
  **Do:** when adding any `*_total` beside a list this module returns, count
  the SAME unit the dedup produces. SQL cannot see `enclosing symbol` (it comes
  from a `symbols` lookup), so the coarsest safe unit is
  `count(distinct from_path)` — distinct caller FILES — compared against the
  distinct files kept. State the unit in the contract JSDoc, because
  `callers.length` (call sites) can then legitimately exceed `callers_total`
  (files), and a consumer that renders "N of M" across those two lies again.
  Guarded for the caller case by `server/test/repo-intel-blast-facade.test.ts`
  "does not report truncation when the list merely deduplicated"; a new
  `importers_total` / `endpoints_total` would need its own.
  **The same applies to every FILTER, not just the unit.** When test files were
  excluded from callers (`EXCLUDED_CALLER_PATTERNS`, `constants.ts`) the
  predicate had to go into `getResolvedCallers` *and* `countResolvedCallers`;
  adding it to one would have made the total count rows the list can never
  contain, and the truncation flag lie again — the same bug in a new disguise.
  Treat the two queries as one thing with two projections: any `where` added to
  either belongs in both.

- **Gating on `getIndexState().status === 'full' | 'partial'` does NOT mean
  the rank/resolved-reference data exists.** `RepoIntelRepository.
  tryGetIndexState` (`repository.ts:205-238`) projects the persisted row and
  never compares `repo_index_state.indexer_version` against
  `constants.INDEXER_VERSION` (currently 2). A repo last indexed by v1
  therefore reports `status: 'full'` while `file_rank` is empty and
  `references.decl_file` is unresolved. `getResolvedCallers`
  (`repository.ts:503`) **INNER JOINs `file_rank`**, so such a repo returns
  **zero callers** with no error and no degraded flag — a consumer prints
  "no downstream callers" as if it were a fact. `constants.ts:35-41` states
  outright that every pre-v2 index must be rebuilt to gain the rank data, so
  this state is reachable, not theoretical.
  **Do:** any consumer that needs rank or `decl_file` must additionally check
  `state.indexerVersion === INDEXER_VERSION` and treat a mismatch as
  degraded (remedy: `POST /repos/:id/resync`). Checking `status` alone is the
  bug.

## Codebase Patterns

- **Every line number this subsystem stores is relative to the repo's DEFAULT
  BRANCH, never to a pull request.** The indexer stamps
  `repo_index_state.last_indexed_sha` from `git.currentHead(ref)`
  (`pipeline/full.ts:94`, `pipeline/incremental.ts:82`), and the clone tracks
  `repos.default_branch` (`db/schema/repos.ts:15`, default `main`) — no PR ref
  is ever checked out. So `symbols.line` and `references.line` describe the
  indexed commit, which is a *different commit* from any
  `pull_requests.head_sha`.
  **Do:** when turning an indexed `file:line` into a permalink or correlating
  it with a PR diff, use `state.lastIndexedSha` — building a GitHub blob URL
  from `head_sha` yields a well-formed link to the wrong line (and a 404 for a
  file added to the default branch after the PR branched). The URL looks
  correct, so a test that only asserts URL construction will not catch it;
  assert the ref itself, with a fixture where the two SHAs differ.

- Application code (`service.ts`, `pipeline/*`) takes `RepoIntelDeps`
  (`deps.ts`), not `Container`. The composition root still passes the
  Container instance structurally. Importing `container.ts` from this
  module recreates the `no-circular` cycle that was burned down to
  baseline 0 on 2026-08-04 — don't reintroduce it.

- Clone I/O and AST parse go through injected ports on `RepoIntelDeps`:
  `fs` (`adapters/clone-fs.ts`) and `codeAnalysis`
  (`adapters/code-analysis.ts`). Application code must not import
  `node:fs` or `adapters/astgrep` / `adapters/codeindex/extract` directly
  — that was burned down 2026-08-04 (architecture plan F18).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
