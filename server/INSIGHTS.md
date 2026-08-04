# `server` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

- The onion-architecture baseline's "monotonic decrease" policy
  (`.dependency-cruiser-known-violations.json` may only shrink) was broken
  once (peaked at 16). Burn-down 2026-08-04: pulls/polling then
  settings/workspace extracted → **0 `no-route-to-db`**; agents
  helpers↔repository cycle fixed via `db/rows.ts`; run-executor /
  diff-loader / repos/helpers now use `RepoRow` from `db/rows.ts` →
  **0 `no-app-to-schema`**. Baseline is **4** (repo-intel↔container
  circular type edges only). Never grow the baseline; `pnpm arch:check`
  in CI uses `--ignore-known`.

## Codebase Patterns

- All F1 routes are thin as of 2026-08-04: `pulls`/`polling` via
  `PullsService` + `pulls/facade.ts` (polling must not import
  `pulls/service.ts` — `no-cross-module-internals`); `settings` via
  `SettingsService`/`SettingsRepository` (feature-models reads settings
  through the repository too); `workspace` via `WorkspaceService`.
  Application-layer code names row shapes via `db/rows.ts` only. When
  adding a NEW route, follow routes → service → repository.

- `server/src/modules/pulls/status.ts`'s `rollupSeverities()` was already
  written, exported, and unit-tested (`server/test/pulls-status.test.ts`)
  before it was ever wired into a route — the file's own docstring says the
  PR list should show a findings breakdown, but `pulls/routes.ts` had a
  comment claiming that was "intentionally not surfaced." The comment was
  stale, not a real product decision. When a route's comment says a field is
  deliberately omitted, check whether a pure helper for exactly that field
  already exists elsewhere in the same module before assuming it needs to be
  built — this codebase accumulates ready-to-wire helpers that outlive the
  routes that were supposed to use them. (2026-07-31, PR-list Findings
  column)

- `GET /repos/:id/pulls`'s findings badge originally summed only the PR's
  single newest `reviews` row (picked via `orderBy(desc(createdAt))`, first
  seen per PR). A review run fans out to one `reviews` row PER REVIEWER AGENT
  (General/Security/Performance/…) created within moments of each other —
  "newest" just means "whichever agent's row got its `createdAt` timestamp
  last", not "the review". That silently dropped every other agent's
  findings from the list badge, while the PR-detail page's
  `SeverityCounters` sums findings across ALL of the PR's reviews and so
  showed a higher, correct-looking total — a mismatch that reads as "PR list
  findings count doesn't match the detail page." Fixed by summing findings
  across every `reviews` row for the PR (join `findings`→`reviews`, group by
  `reviews.pr_id`), matching the detail page's definition — same fix shape as
  the earlier `SeverityCounters` design already used. NOTE: `score` and
  `cost_usd` on this same list endpoint still use "latest review"/"latest
  run" semantics (`latestReviewByPr`, `latestCostByPr`) and were NOT touched
  by this fix — they weren't reported as wrong, but the same
  one-review-picked-arbitrarily caveat applies if a future report shows a PR
  with the "wrong" agent's score displayed. Regression test:
  `server/test/reviews.it.test.ts` — "PR-list findings badge sums every
  reviewer's findings, not just the latest review" (runs 2 agents against one
  PR, asserts the list endpoint's `findings` counts both). (2026-07-31,
  PR-list Findings column / severity-counters merge)

## Tool & Library Notes

- Running `dependency-cruiser` against a package via a relative target path
  from a DIFFERENT cwd (e.g. `server/package.json`'s `arch:check:core`:
  `depcruise ../reviewer-core/src --config ../reviewer-core/.dependency-cruiser.cjs`,
  invoked from `server/`) makes every reported module `source`/resolved path
  come out prefixed with that relative segment —
  `../reviewer-core/src/prompt.ts`, not `src/prompt.ts`. A rule's `from:
  { path: '^src/' }` or `to: { pathNot: '^node_modules/...' }` written
  assuming cwd == the target package's root will silently match nothing (0
  violations, no error) when invoked this way. Write such regexes unanchored
  — `(^|/)src/`, `(^|/)node_modules/...` — so they work regardless of the
  invoking cwd. Also hit dependency-cruiser's regex-safety linter ("has an
  unsafe regular expression. Bailing out.") on `^node_modules/(\.pnpm/[^/]+
  /node_modules/)?(pkg1|pkg2)(/|$)` — an optional group nested next to
  alternation; splitting into two non-nested alternatives
  (`^node_modules/(pkg1|pkg2)(/|$)|^node_modules/\.pnpm/[^/]+/node_modules/
  (pkg1|pkg2)(/|$)`) fixed it. (2026-08-04, Onion Architecture skill
  implementation, Task 6)

- A `dependency-cruiser` `forbidden` rule's `to.path` regex written as
  `node_modules/<pkg-name>` will silently never match in this repo, because
  `server`'s pnpm install resolves packages through a nested store —
  `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...` — not
  `node_modules/<pkg>/...` directly. This is not a resolution failure
  (`couldNotResolve` stays `false`), so `--output-type err-long` gives no
  clue; the rule just reports zero violations for a package that is in
  fact imported. Verified by temporarily importing each of
  `@fastify/cors`, `postgres`, `fastify`, `drizzle-orm`, `simple-git` into a
  ring-0 file and confirming a naive regex missed all five while a
  `src/db/`-style relative-path alternative in the same rule worked fine.
  Fix: match both forms, e.g. `^(node_modules/\.pnpm/[^/]+/node_modules/
  (pkg1|pkg2)|node_modules/(pkg1|pkg2)|...)`. Separately, `octokit`
  specifically never resolves to a `node_modules/...` path at all under
  this repo's `moduleResolution: Bundler` + `enhancedResolveOptions` setup
  (pre-existing, unrelated to pnpm's store layout — same behavior for
  `octokit` was seen with plain `doNotFollow` from Task 1) — a rule meant
  to catch an `octokit` import needs a bare `octokit$` alternative in the
  `to.path` regex, not just the `node_modules/octokit` form. (2026-08-03,
  Onion Architecture skill implementation, Task 2)

- In a `dependency-cruiser` config's `options`, `exclude: { path: ... }` and
  `doNotFollow: { path: ... }` are NOT interchangeable, even though both are
  commonly set to `node_modules`. `doNotFollow` stops recursion INTO a
  matched module but still records the edge FROM the importing file to it —
  that edge is exactly what a `forbidden` rule like "route must not import
  drizzle-orm" needs to see. `exclude` drops the matched module, and every
  edge to it, from the graph entirely. With both set (as a first draft of
  `server/.dependency-cruiser.cjs` had), every rule targeting a real,
  resolvable `node_modules` package (`fastify`, `drizzle-orm`) silently
  matched zero violations — while unresolvable bare specifiers (`octokit`,
  `p-queue`, due to their ESM export-map conditions) still showed up, because
  failed resolutions bypass the `exclude` filter. That asymmetry is what
  makes the bug look like a resolver problem when it's actually a
  graph-filtering one: `--output-type err-long` shows zero violations either
  way, so diagnosing it requires dumping the raw dependency graph
  (`depcruise <target> --output-type json`) and checking whether the
  suspect module appears in any `dependencies` array at all. Fix: set only
  `doNotFollow`, never `exclude`, for `node_modules`. (2026-08-03, Onion
  Architecture skill implementation, Task 1)

- `dependency-cruiser` (17.4.3) is ALREADY a runtime dependency of `server` —
  but only as a library, for `repo-intel`'s import graph
  (`adapters/depgraph/index.ts` → `DepCruiseGraph`). Its CLI (`pnpm exec
  depcruise`) is fully available with zero new installs, and supports
  `--ignore-known [file]` (default
  `.dependency-cruiser-known-violations.json`), which grandfathers existing
  violations while failing the build on new ones. There is no
  `.dependency-cruiser.cjs` in the repo as of 2026-08-03 — nothing enforces
  import boundaries today. If asked to enforce layering/architecture rules
  here, do NOT propose adding eslint-plugin-boundaries or a new tool; write a
  `.dependency-cruiser.cjs` and a `depcruise --ignore-known` script instead.
  (2026-08-03, Onion Architecture skill research)

- A `z.object({ field: z.number().nullable() })` field is REQUIRED at the TS
  level, not optional — `.nullable()` only unions in `null`, it does not add
  `?`. Adding such a field to a shared contract (`vendor/shared/contracts`)
  breaks `tsc --noEmit` at every existing object-literal construction site of
  that shape (route handlers, `run-executor.ts`'s `trace.stats`, test
  fixtures), even though the underlying nullable DB column needs no such
  field everywhere. Before adding a `.nullable()` field to a contract, grep
  for every existing literal of that type across `server/`, `client/`, and
  both packages' tests — they all need the field added in the same change,
  or `pnpm typecheck` fails in files the PR didn't intend to touch. Use
  `.nullish()` instead when the field should also be omittable (e.g.
  `PrMeta.score`, `PrMeta.cost_usd` — absent until first computed);
  `.nullable()` when it must always be present with `null` as a valid value
  (e.g. `RunStats.cost_usd`, `RunSummary.cost_usd` — always set, sometimes to
  null). (2026-07-31, run-cost-ui feature)

- `PriceBook.estimate(model, tokensIn, tokensOut)`
  (`server/src/platform/price-book.ts`) keys the live map by OpenRouter
  namespaced IDs (e.g. `"openai/gpt-4.1"`). Bare ids from openai/anthropic
  providers are resolved via known provider prefixes then a unique
  provider/bare suffix match; ambiguous matches fall through to the static
  `estimateCost` table. See `server/test/price-book.test.ts`.

## Recurring Errors & Fixes

- Deleting a run (timeline trash icon → `deleteAgentRun`) while its LLM call
  is still in flight orphans a `reviews`/`findings` row: `runOneAgent`
  (`run-executor.ts`) writes `reviews`/`findings` (then updates `agent_runs`)
  only AFTER the LLM responds, but `deleteAgentRun` deletes `reviews` by
  `run_id` BEFORE that row exists if the user deletes mid-flight — so its
  `DELETE FROM reviews` matches nothing, then the still-running job inserts a
  review anyway once the LLM returns (`reviews.run_id` has no FK to
  `agent_runs.id`, so nothing rejects it). The orphan has no `agent_runs` row
  so it never appears in the Timeline, but its findings still get summed by
  `SeverityCounters` (`page.tsx`'s `allFindings`, which tallies every
  `reviews` row for the PR) — the PR detail's severity total (e.g. "1
  CRITICAL · 5 WARNING · 1 SUGGESTION") silently exceeds the sum of the
  finding counts shown on each visible timeline run. Fixed by having
  `runOneAgent` check `repo.agentRunExists(runId)` right after the LLM call
  returns and before persisting, throwing `RunCancelledError` (existing
  cancellation path) if the run was deleted out from under it. Regression
  test: `server/test/reviews.it.test.ts` — "deleting a run while its review
  is still in flight does not orphan a review/findings" (uses
  `MockLLMProvider`'s new `delayMs` option to hold the mock call open long
  enough to delete the run mid-flight). (2026-07-31, PR-list Findings
  column / severity-counters merge)

- Deleting an `agent_runs` row or a `reviews` row (`deleteAgentRun`,
  `server/src/modules/reviews/repository/run.repo.ts`) does NOT clear
  `pull_requests.last_reviewed_sha`. Only `markReviewed()`
  (`server/src/modules/reviews/repository/pull.repo.ts`) ever writes that
  column, and nothing resets it. So once a PR's review status flips to
  `reviewed` (per `deriveReviewStatus` in `status.ts`), deleting its runs
  from the UI does NOT move it back to `needs_review` — it stays `reviewed`
  until a new commit changes `head_sha`. There is no app action that resets
  this; to force a PR back to `needs_review` for testing/demo purposes, null
  `last_reviewed_sha` directly: `UPDATE pull_requests SET
  last_reviewed_sha = NULL WHERE id = '<pr-id>';` — this does not touch
  `agent_runs`/`reviews`/`findings`. (2026-07-31)

## Session Notes

## Open Questions
