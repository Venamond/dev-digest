# `server` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

- **A grounding check that whitelists exact strings against model output will
  reject correct answers, and it fails CLOSED — the feature looks broken, not
  lenient.** `modules/blast/summary.ts` rejects a summary naming anything
  outside the map it was given. Twice that check was stricter than the prompt
  it enforces: the prompt says "backtick every name", so the model writes
  `rateLimit()` and `src/mw.ts:23` (fixed by normalising call parens and a
  `:line` suffix), and it quotes `SettingsModels` out of the path
  `.../SettingsModels/SettingsModels.tsx` that the map contains (fixed by
  adding every path SEGMENT and its extension-stripped form to the node set).
  Each time a whole correct paragraph became a 422, and the UI's only symptom
  was a button that appeared not to work.
  **Do:** when whitelisting model output, enumerate what a model writing
  naturally will produce from the data you handed it — inflections, call
  parens, `path:line`, a directory lifted out of a path — and admit those, or
  the guard spends its life rejecting truth. Test the endpoint against the
  real LLM once (`curl` the route); the hermetic tests use a mock whose output
  you wrote, so they can only confirm the shapes you already thought of.

- The onion-architecture baseline's "monotonic decrease" policy
  (`.dependency-cruiser-known-violations.json` may only shrink) was broken
  once (peaked at 16). Burn-down 2026-08-04: pulls/polling then
  settings/workspace extracted → **0 `no-route-to-db`**; agents
  helpers↔repository cycle fixed via `db/rows.ts`; run-executor /
  diff-loader / repos/helpers now use `RepoRow` from `db/rows.ts` →
  **0 `no-app-to-schema`**. repo-intel takes `RepoIntelDeps`
  (`modules/repo-intel/deps.ts`) instead of importing `Container` →
  **0 circular**. Baseline is **0**. Never grow the baseline; `pnpm
  arch:check` in CI uses `--ignore-known`.

## Codebase Patterns

- **`agents.name` has no unique constraint, and the create path does not
  check for one — so resolving an agent *by name* can silently pick the
  wrong row.** `db/schema/agents.ts:13` is a bare `text('name').notNull()`
  with no unique index anywhere in the file, and `POST /agents`
  (`modules/agents/routes.ts:101`) goes straight through
  `AgentService.create` (`service.ts:90`) to `AgentRepository.insert`
  (`repository.ts:87`) — a plain INSERT with no name lookup. Two agents
  named `Security Reviewer` in one workspace is a legal, reachable state
  via the normal Agents UI.

  This is the sibling of the recorded `skills.name` entry below, but with a
  worse blast radius: a duplicate *skill* produces indistinguishable labels
  in a picker, while a duplicate *agent* hit by a first-match-wins lookup
  starts a **paid LLM review run against the wrong reviewer** and reports
  success. Any code that accepts an agent name instead of a uuid must
  therefore collect **all** matches and fail loudly when there is more than
  one — `Two agents are named "X". Pass the id instead: <id1>, <id2>` —
  rather than taking `[0]`. Resolving by `agents.id` avoids the class
  entirely.

  Check before debugging a "wrong agent ran" report:
  `SELECT name, count(*) FROM agents GROUP BY workspace_id, name
  HAVING count(*) > 1;`

  Not yet a machine check: the natural enforcement is a per-workspace
  unique index on `(workspace_id, name)`, which needs a migration and a
  decision about existing duplicate rows. The first consumer to hit this is
  the planned MCP server's `resolveAgentId`
  (`docs/plans/2026-08-18-mcp-server.md`, S2), where it is handled
  defensively in that package instead. (2026-08-18)

- **`reviews.kind` is an enum of `'summary' | 'review'`
  (`db/schema/reviews.ts:21`), but no *production* path ever writes
  `'summary'`.** The only creation site is `run-executor.ts:342`, which
  hardcodes `kind: 'review'`; `db/seed.ts` does the same (`:143`, `:493`,
  `:508`). The sole `'summary'` insert in the repo is a deliberate test
  fixture — `server/test/smart-diff.it.test.ts:172`, which exists precisely
  to prove that `smart-diff`'s `kind='review'` filter excludes it
  (`:198-202`).

  Consequence for anyone reasoning about review sets: queries that filter
  `eq(t.reviews.kind, 'review')` (`smart-diff/repository.ts`'s
  `findingLinesByFile`, `pulls/repository.ts:128`) and ones that do not
  (`reviews/repository/review.repo.ts:58-74` `reviewsForPull` — no `kind`
  predicate at all) return **identical rows against real data**, and diverge
  **only under that one test fixture**. The relationship is
  `filtered ⊆ unfiltered`, never the reverse — so a finding reachable
  through a `kind='review'` query always has a rendered card, while the
  inverse can fail in tests only. Check which direction actually applies
  before designing around it: a plan in this repo once inverted it and
  invented a user-facing failure mode that cannot occur.
  (2026-08-15, Smart Diff acceptance-gap planning)

- **Prompt-assembly logs are metadata-only.** `summarizePromptAssembly` /
  `toPromptLogPayload` (`platform/prompt-log.ts`) record section name, source,
  char/token length, model, and correlation id — never API keys, the diff,
  spec bodies, PR description, or intent JSON. `DEVDIGEST_PROMPT_LOG=verbose`
  adds sha256-12 fingerprints of those bodies to **pino only** (not the SSE
  Live Log / persisted `run_traces.log`); it is clamped to `summary` when
  `NODE_ENV=production` even if the env var is set. Default is `summary`;
  `off` disables the extra events. Do not log `PromptAssembly` fields
  directly. (2026-08-13)

- **If an agent's system prompt enumerates the same detection rules its skills
  carry, the skills become decorative — they can only reword findings, never
  add a detection.** Diagnosed 2026-08-08 on `API Contract Reviewer`: its
  prompt had a `# What counts as a problem` catalogue whose three items mapped
  1:1 onto the four attached skills (item 1 = `breaking-change`, item 2 =
  `response-schema`, item 3 = `semver-discipline` + `deprecation-policy`), so
  the agent already detected everything with skills OFF and the skills could
  only sharpen the wording — which reads to a user as "the skills do nothing".
  The shipped prompt in `docs/agent-prompts/api-contract-reviewer.md` (seeded
  via `db/seed-prompts.ts`) has the same shape: its "What to look for
  (priority order)" section duplicates those same four skills. Note this is
  the *documented* checklist pushing you there —
  `docs/agent-prompts/README.md` requires "Role + concrete 'what to look for',
  in priority order" in every prompt, which is right for an agent with NO
  skills and wrong for one whose skills own those rules. When an agent is
  meant to be skill-driven, keep the prompt to role + scope + analysis method
  + the three mandatory blocks (severity rubric, verdict mapping, findings
  discipline) and move every detection rule into the skills; state explicitly
  what to do when no skills are attached (report only demonstrable defects,
  cap severity) so the unskilled path degrades honestly instead of silently
  duplicating the skills. **But verified the same day that trimming the
  catalogue is NOT sufficient**, for two separate reasons: (a) residual
  detection rules hide in other sections — a parenthetical left in `# Scope`
  ("look for duplicated contract files — a change on one side without the
  matching change on the other is itself a defect") kept handing the agent the
  finding for free, because the test diff was exactly a one-sided
  `vendor/shared` edit; (b) more fundamentally, a **structurally** self-evident
  defect cannot be made skill-dependent at all — a field rename is
  demonstrable beyond argument, which the prompt's own "report only what you
  can demonstrate" fallback then *licenses* rather than suppresses. So to show
  a skill earning its keep (or to build an eval that measures skills), pick a
  defect whose breaking-ness is a matter of **policy, not structure**:
  tightened request validation (adding `.regex()`/`.min()` to an existing
  field) is *additive* in code shape and reads as hardening, so only
  `breaking-change`'s "a request the API used to accept is now rejected …
  stricter format" clause surfaces it. Keep both `vendor/shared` copies in
  sync in such a diff, or the one-sidedness itself becomes the tell.
  (2026-08-08)

- **Linked skills change a finding's CONTENT, not the finding COUNT — a
  one-defect diff yields one finding no matter how many skills are attached.**
  Every reviewer prompt (`db/seed-prompts.ts`, `docs/agent-prompts/*`) carries
  a mandatory findings-discipline rule — "report only DISTINCT issues, never
  list the same problem twice, never pad toward a number" — so N skills all
  describing one underlying defect correctly collapse into one finding, with
  each skill's reasoning folded into its title/rationale/suggestion rather than
  emitted separately. Observed 2026-08-08 on a 2-file diff renaming one
  response field: with 4 API-contract skills and without, both runs returned
  exactly 1 finding, which reads as "the skills did nothing". They had: the
  skilled run's title followed the skill's prescribed
  `Breaking change: <what changed>` format, named the concrete failure mode
  ("receives `undefined`"), listed the skill's three escape hatches
  ("dual-write, alias, or versioned path"), and proposed the two remediations
  the skill bodies define — none of which the unskilled run produced. **To
  evaluate skills, compare finding text, not counts; to demonstrate K skills
  firing separately you need K independent defects in the diff.** Two skills
  also correctly declined via their own "do not apply" clauses (semver
  stood down because this API exposes no `/v1/`-style version scheme at all).
  **Verify which skills actually reached a run's prompt** — don't assume from
  the UI toggle state:
  `SELECT s.name, rs.skill_version FROM run_skills rs JOIN skills s ON
  s.id=rs.skill_id WHERE rs.run_id='<run>'` (empty ⇒ none were injected;
  `agent_runs.cost_usd` also rises visibly when they are). (2026-08-08)

- **To manually test a reviewer agent against a chosen diff without a real
  GitHub PR: insert `pull_requests` + `pr_files` rows directly (with a real
  unified-diff string in `pr_files.patch`), no repo clone required.**
  `GET /repos/:id/pulls` and `GET /pulls/:id` (`modules/pulls/service.ts`)
  only sync from a real GitHub repo/token; there is no "create PR with an
  arbitrary diff" endpoint. But `modules/reviews/diff-loader.ts`'s
  `loadDiff()` tries `container.git.diff(base, headSha)` first and falls
  back to `diffFromPrFiles()` (reconstructs a unified diff from persisted
  `pr_files.patch`) when the clone/diff isn't available — exactly the path
  the seed's `acme/payments-api` repo already takes (`clonePath: null`).
  Insert via a one-off `tsx` script mirroring `db/seed.ts`'s pattern
  (`createDb(DATABASE_URL)` → `db.insert(t.pullRequests)...` →
  `db.insert(t.prFiles).values({ ..., patch: '<diff text>' })`), then open
  `/repos/:repoId/pulls/:number` in the UI and click "Run Review" — the
  diff renders and reviews exactly like a real PR. Same mechanism
  `server/test/reviews.it.test.ts` uses for its fixtures. Delete the
  one-off script after running it; do not commit it. (2026-08-08,
  API Contract Reviewer experiment)

- **`skills.name` has no unique constraint, and `db/seed.ts` pre-seeds
  `breaking-change` / `response-schema` / `semver-discipline` for the
  "API Contract Reviewer" course lab (`API_CONTRACT_SEED_SKILLS`,
  `db/seed-skills.ts`).** Only the Conventions Extractor's
  `upsertExtractedSkill` is name-aware (upserts in place, see the pattern
  below). The plain `POST /skills` create path used by the Skills Lab UI is
  a bare INSERT — it does not check for an existing skill with the same
  name. If this same lab's instructions are followed literally (create
  skills named exactly `breaking-change`/`response-schema`/
  `semver-discipline` by hand), the result is a SECOND row per name sitting
  next to the seeded one, both visible and both selectable in the Agent →
  Skills tab with identical labels — indistinguishable in the UI, and
  whichever one you just checked "jumps" to the linked section while its
  same-named twin doesn't, which reads as random reordering. Two separate
  things were going on: the indistinguishable labels (this entry) **and** a
  real row-reordering bug in the Skills tab, fixed 2026-08-08 by freezing the
  display order — see `client/INSIGHTS.md` ("Agent → Skills row order is
  frozen"). Do not re-derive the sort per render there.
  Before re-running this lab, check `SELECT name, count(*) FROM skills
  GROUP BY name HAVING count(*) > 1;` and delete the stale seed row (or
  rename) rather than assuming the new UI-created skill replaced it.
  (2026-08-08)

- Conventions → skill persist is upsert-by-name
  (`modules/conventions/repository.ts` `upsertExtractedSkill`): same
  workspace + name updates the existing skill and bumps `version` (plus a
  `skill_versions` row) when description/body change. A plain INSERT per
  "Create skill" produced duplicate `repo-conventions` rows all stuck at
  `v1`. Enabled-only toggles must not bump. (2026-08-06)

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

- Per-skill stats attribute findings through `run_skills` (run → skill version
  at prompt assembly), not through a finding→skill foreign key — reviewer-core
  has no per-rule skill id. `run-executor` records refs via `promptSkillRefs` +
  `recordRunSkills` inside try/catch so a stats write never fails a review
  (`RunLogger` has `info` only — use that, not `warn`). Pull/accept rates are
  all-time; only findings use `SKILL_FINDINGS_WINDOW_DAYS` (30). List cards get
  rates from `listUsageInputs` + `buildSkillUsageRates`; detail from
  `GET /skills/:id/stats`. Do not backfill historical `run_skills`. Demo
  numbers come from idempotent seed in `db/seed.ts`. (2026-08-06, Skills Lab
  redesign)

## Tool & Library Notes

- A route `response` schema field typed `X.nullable()` is REQUIRED for the
  handler to actually return `null` — dropping `.nullable()` from a
  `response: { 200: X.nullable() }` schema makes `fastify-type-provider-zod`
  serialize a `null` return value as a `500`, not a `200`. Proven by
  red-proof mutation in `server/test/intent.it.test.ts` (removed
  `.nullable()` from the `/pulls/:id/intent` GET response schema; the "no
  row exists" test failed with `expected 500 to be 200`). Any `GET` route
  that can legitimately return "no record yet" needs this on the response
  schema, and a test that asserts the `200 null` case is the only thing that
  catches it — `pnpm typecheck` does not, since the handler's return type is
  still valid without it. (2026-08-14, intent-layer test-writer run)

- A JSDoc/block comment that contains the two-character sequence star-slash
  (e.g. documenting a glob like "star-slash + bare") terminates the comment
  early; esbuild then fails with a cryptic "Expected ';' but found …" on a
  later line. Spell such patterns in words inside block comments — never
  write that terminator sequence literally. (2026-08-04, PriceBook)

- **NOT FIXED — and the obvious fix has a trap worth knowing before you try
  it.** Serving from the DB and refreshing GitHub in the background
  (`void this.refreshFromGitHub(...)`) does work and is dramatic: measured
  list 30 021 ms → 17-44 ms, detail 30 026 ms → 5-46 ms, with the *first*
  view of a PR still awaiting GitHub because there is nothing persisted to
  show yet.

  But un-awaited work escapes the request **and the test lifecycle**. With
  that change the `.it.test` suite went flaky: `agents-skills.it.test.ts`
  failed in 2 of 4 full-suite runs while passing 3/3 in isolation, and 3/3
  in the full suite once the change was stashed. The background writes from
  one test file land while a later file is asserting against the same
  container. Any retry of this needs the in-flight promises tracked and
  drained on app close (or otherwise bounded), not just fired with `void`.

  The diagnosis of the slowness itself, unchanged:
  `pulls/service.ts` (`listForRepo`) did
  `gh.listPullRequests(...)` and then `await this.repo.upsertFromGhList(...)`
  **inside a `for` loop**, sequentially, before returning anything. Measured
  on an 8-PR repo with a valid token: 0.43–0.55 s warm, 4.7 s on the first
  call, 7.8 s from the browser, and **30.0 s** on a later load in the same
  session — the spread is GitHub's latency, so it degrades without warning
  and without any local change. The page HTML itself serves in ~50 ms, so a
  slow PR list is always this endpoint, never Next.

  Worse path, currently dormant: `:63-83` backfills diff stats for rows where
  `additions/deletions/filesCount` are all 0, calling `gh.getPullRequest()`
  **per PR**, sequentially, up to `BACKFILL_LIMIT = 10` — and each of those
  itself issues `listFiles` + `listCommits` (see the `per_page` entry below).
  That is up to ~30 serial GitHub round-trips in one HTTP request. It is
  invisible today only because every seeded PR already has stats; a freshly
  imported PR re-arms it.

  So: when the PR list feels slow, measure this one endpoint before
  suspecting the client. And treat "add a PR" as a performance event, not
  just a data one.

  **This one endpoint gates the whole PR detail screen, not just the list.**
  `PrDetailView` has no prId of its own — it derives it by finding the PR
  inside `usePulls(repoId)`'s response (`PrDetailView.tsx`), so *every* query
  on the detail page (reviews, runs, intent, smart-diff) waits behind this
  call. Measured: the Agent-runs accordions took **7.5 s** to appear, while
  `GET /pulls/:id/reviews` itself serves in **17-24 ms**. The reviews
  endpoint is not slow; it simply cannot start until the PR list resolves.

  Corollary for triage: a slow *detail* screen is not evidence about the
  detail endpoints. Time `/repos/:id/pulls` first — it is upstream of
  everything on that page. (Recorded after briefly blaming `reviewsForPull`'s
  per-agent `getById` loop for the 7.5 s; direct measurement showed that
  endpoint is fast and the loop only runs once per *distinct* agent — 5, not
  12, on the PR in question.) (2026-08-15)

- **`getPullRequest` fetches PR files and commits with `per_page: 100` and no
  pagination — a PR with more than 100 changed files is silently truncated.**
  `adapters/github/octokit.ts:79-90` calls `pulls.listFiles` and
  `pulls.listCommits` with a bare `per_page: 100`, never `octokit.paginate`.
  Confirmed live: `Venamond/dev-digest#5` returns exactly 100 files from
  `GET /pulls/:id/smart-diff`, a suspiciously round number that is the cap,
  not the real count.

  Consequences for anything built on `PrDetail.files`: Smart Diff classifies
  only the first 100 paths, and any per-file total re-derived by summing
  `files` disagrees with `pr.files_count` / `pr.additions` / `pr.deletions`,
  which GitHub reports for the whole PR. Prefer the PR-level totals already
  on `PrDetail` over summing `files`; treat `files` as "up to 100 files"
  until the adapter paginates. Nothing errors, nothing logs — the list just
  ends. (2026-08-15)

- **Enum columns are `text` with no constraint, and the insert path does not
  Zod-parse — so a value the read path's `z.enum` rejects can be written and
  then permanently 500s that route.** Found live: `GET /pulls/:id/reviews`
  returned `internal_error` for PR #482 while `/pulls/:id` and
  `/pulls/:id/smart-diff` were fine. Cause: `findings.category` is
  `text('category').notNull()` (`db/schema/reviews.ts:38`), `insertFindings`
  (`repository/review.repo.ts`) writes `f.category` straight through, and the
  response schema validates against
  `FindingCategory = z.enum(['bug','security','perf','style','test'])`. The
  offending rows came from **our own seed** — `db/seed.ts:524,550,563,576`
  writes `coverage`, `flaky`, `over-mocking` for the Test Quality Reviewer,
  none of which are in the enum.

  Why it hides: `pnpm typecheck` sees only the DTO type, and every test
  fixture uses valid categories, so unit and integration suites stay green.
  It surfaces only against seeded or production data, one route at a time —
  whichever response schema happens to include the field. When triaging a
  500 on one endpoint while its siblings work, diff the response schemas for
  a validated field the others omit, then check the actual column values
  (`select category, count(*) … group by 1`) rather than assuming the code
  is wrong. Same failure class as the `.nullable()` serializer trap, but
  data-driven rather than shape-driven. (2026-08-15)

- Adding Fastify `schema.response` via ZodTypeProvider tightens the handler
  return type to `z.infer`. A DTO field typed `string | null` will fail
  `tsc` against an enum/`z.enum` field even when runtime values are valid —
  narrow at the DTO boundary (e.g. `verdict as Verdict | null` in
  `reviewToDto`) when wiring response schemas. Hot paths already covered:
  repos list/add/refresh/delete, pulls list/detail/comments, reviews
  run/list/runs/trace/findings actions. (2026-08-04)

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

- **`pnpm db:generate` works — but only because `0015_snapshot_baseline`
  repaired a snapshot drift; don't delete that migration.** Migrations
  `0011`–`0014` were hand-written, so drizzle-kit's snapshots in
  `src/db/migrations/meta/` stopped at `0010` and every `db:generate` re-emitted
  *everything* added since (`CREATE TABLE run_skills`, the `conventions`
  columns, …) — SQL that fails with `column ... already exists` on any
  already-migrated database, in a file that looks perfectly plausible. The fix
  pattern, should this ever recur: run `db:generate`, keep the produced
  `meta/NNNN_snapshot.json` (it captures the real current schema and becomes
  the new diff baseline), and replace the produced `.sql` with a no-op
  (`SELECT 1;`) since those statements are already applied. Confirm with a
  second `db:generate` — it must print "No schema changes, nothing to
  migrate". A hand-written migration still needs its own `meta/_journal.json`
  entry (copy the previous entry's `version`, bump `idx`/`tag`, keep `when`
  monotonically increasing) and should be idempotent (`IF NOT EXISTS`, inline
  `REFERENCES`, no `--> statement-breakpoint`). Verify any migration with
  `pnpm exec vitest run <name>.it.test`: testcontainers applies the whole
  chain to a fresh Postgres, which is the only cheap proof it actually runs.
  (2026-08-07, conventions extractor review)

- **A per-workspace batch aggregate returned as `Map<id, Stats>` has no entry
  for an entity with zero activity — `map.get(id)` is `undefined`, not a
  zero-valued `Stats`.** Piping that straight into a DTO field written as
  `agg?.field ?? null` (the existing pattern for `Agent.skill_count`) then
  reports `null` for an idle entity on a LIST response, not `0` — even though
  the field is documented/expected to always be a number there. `skill_count`
  avoids this because `AgentsService.list()` explicitly does
  `counts.get(r.id) ?? 0` before calling `toAgentDto`; the new
  `runs_7d`/`accept_rate_7d`/`avg_cost_usd_7d` fields (added wiring
  `AgentCard`'s stats footer to real data, `stats-helpers.ts`
  `buildCardStats`) needed the identical `cardStats.get(r.id) ?? { runs: 0,
  accept: 0, cost: 0 }` default in `AgentsService.list()` for the same
  reason — caught by an integration test asserting an idle agent's list
  response is `{ runs_7d: 0, accept_rate_7d: 0, avg_cost_usd_7d: 0 }`, not
  `null`. When adding a new per-entity list-response aggregate backed by a
  `Map`, default the map lookup to a zero-valued object in the service layer
  BEFORE calling the DTO mapper — `?? null` inside the mapper is only correct
  for the single-entity `get()` path where the stat was never computed at
  all. (2026-08-08, Agents Lab card-stats fix)

## Recurring Errors & Fixes

- **An `.it.test` suite that fails a DIFFERENT file each full run, while every
  file passes in isolation, is a product race — not test flakiness. Do not
  "fix" it with retries or a longer timeout.** Diagnosed 2026-08-19:
  `run-executor.ts` awaited `completeAgentRun(status: 'done')` and only then
  `saveRunTrace`, so between those two lines a run reads as finished while
  `GET /runs/:id/trace` returns nothing. Tests polling `agent_runs.status`
  (`test/helpers/runs.ts`'s `waitForPrRuns`) then read a trace that has not
  landed: `intent.it.test.ts` died on `trace.tool_calls.find` of undefined,
  `agents-skills.it.test.ts` on `expected undefined to be null`. **The rule:
  write every derived row FIRST, flip the status consumers poll LAST** — a
  terminal status is a promise that everything about the run is readable, and
  that includes the failure paths, where "failed" must not outrun the log
  saying why.

  **The diagnosis recipe, which is the reusable part:** run the full suite
  twice and note that the failing file MOVES; run each failing file alone and
  watch it pass; then run the full suite on the change set's BASE commit. A
  failure there proves the race predates the branch and points at product
  code rather than the diff under review. Two runs at the base were enough
  here (one red, one green).

  **Pin it as call ORDER, never by racing the window** — a test that
  reproduces a race reproduces its flakiness too. `'persists the trace BEFORE
  the run reads as finished'` (`test/reviews.it.test.ts`) stubs both
  `ReviewRepository.prototype` methods with `vi.spyOn`, records the order they
  are called in, and asserts `['trace', 'status']`. It fails 100% on the old
  ordering and passes 100% on the new. Note the stubs mean the run never
  reaches a terminal status, so poll the recorded calls, not the database.

- OpenRouter `404 No endpoints found for deepseek/deepseek-v4-flash` after
  sending `provider: { order: ['DeepSeek'], allow_fallbacks: false }`. That
  slug is **not** hosted on OpenRouter's DeepSeek upstream; pinning drops
  every real endpoint. Do not set `provider.order` / `allow_fallbacks: false`
  for this default model. `temperature: 0` + `seed` is enough; keep OpenRouter
  free to pick an available host. (2026-08-13)

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

- **`diffBodies` (`server/src/modules/skills/helpers.ts:210`) never returns an
  empty string for two non-empty bodies — even identical ones.** For equal
  lines it pushes `` `line` `` (a *space*-prefixed line), not nothing; it
  only omits a line when one side is `undefined` (bodies of different
  length). Consequence: `client/.../VersionsTab.tsx`'s
  `result.diff || t("versions.diffEmpty")` fallback ("No differences.") is
  dead code — `result.diff` is truthy whenever both bodies are non-empty,
  identical or not, so that message can never render. Surfaced 2026-08-07
  diffing a skill's current version against itself (every line comes back
  space-prefixed, which reads as "just the body" — the caller there
  suppresses the misleading "vs current" caption instead of fixing
  `diffBodies`). Unresolved: either make `diffBodies` return `''` when
  `fromBody === toBody`, or drop the now-unreachable `diffEmpty` i18n key
  and fallback on the client. Flagged, not fixed — out of scope for the UI
  change that surfaced it.
