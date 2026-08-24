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

- **The root `CLAUDE.md`'s "DB schema already has every table for every future
  course lesson" is a generalisation, not a guarantee — check before planning a
  lesson around it.** Verified 2026-08-23 while planning the Project Context
  lesson: the schema holds **42** tables, and the ones that lesson needs — any
  table associating a document PATH with an agent or a skill — are not among
  them. `grep -rn "path" src/db/schema/*.ts | grep -iE "agent|skill"` returns
  nothing. The lesson's own pre-built scaffolding is real and extensive
  (`SpecFile` in `vendor/shared/contracts/platform.ts:259`, the client's
  `useContextFiles` hook, `PromptParts.specs` in `reviewer-core`, and
  `trace-builder.ts`'s unused `specsRead`), which makes it easy to assume the
  DB half was pre-built too. It was not.
  **Do:** before writing a plan that assumes a table exists, enumerate them —
  `grep -rhoE "pgTable\(\s*'[a-z_]+'" src/db/schema/`; note that a bare
  `grep pgTable(` under-counts, because several definitions wrap the name onto
  the next line. The rule that IS reliable is the other half of the same
  CLAUDE.md entry: an empty table is not dead code, so never drop one. Adding a
  new migration is permitted (`migrations/` says "never hand-edit without
  coordination", which is about editing EXISTING files); hand-written ones need
  their own `meta/_journal.json` entry, per the `0015_snapshot_baseline` entry
  below. (2026-08-23, Project Context planning)

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

- **`no-app-to-schema` protects application files by ENUMERATING THEIR
  BASENAMES, so a new application-layer file whose name is not on the list is
  silently unprotected — `arch:check` reports 0 violations because it never
  looked.** The rule's `from.path`
  (`server/.dependency-cruiser.cjs:50`) is
  `^src/modules/[^/]+/(service|helpers|run-executor|diff-loader|feature-models)\.ts$`
  plus four directory alternatives (`repo-intel/pipeline/`, `reviews/intent/`,
  `smart-diff/pure/`, `blast/(constants|shape|summary).ts`). Tested the regex
  directly (2026-08-23): `src/modules/<m>/service.ts` matches,
  `src/modules/<m>/walk.ts`, `resolve.ts` and `facade.ts` do **not** — and
  neither does the existing `src/modules/pulls/facade.ts`. It happens to import
  no schema, so there is no live violation today; the point is that nothing
  would stop one.
  The four directory alternatives are themselves the fossil record of this
  recurring: each was appended when a module grew application files that the
  basename list did not name.
  **Do:** when adding an application-layer file under `src/modules/` whose name
  is not `service.ts` or `helpers.ts`, extend that `from.path` in the SAME
  commit that creates the file. Verify by regex, not by running `arch:check` —
  a rule that matches nothing and a rule that finds nothing wrong produce the
  identical "0 violations" output, which is why this class of gap survives a
  green build. Repository files (`repository.ts`) are correctly outside the
  rule: the data layer is *supposed* to import `db/schema`.
  (2026-08-23, Project Context planning)

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

- **`getRepo` exists in this codebase in BOTH a workspace-scoped and an
  unscoped form, and copying the wrong one into a URL-facing route is a
  cross-tenant read.** Scoped: `modules/context/repository.ts:28`,
  `modules/conventions/repository.ts:42`, `modules/pulls/repository.ts:46` —
  all `getRepo(workspaceId, repoId)`. Unscoped: `modules/blast/repository.ts:28`
  `getRepo(repoId)`, `modules/pulls/repository.ts:54` `getRepoById(repoId)`, and
  most of `modules/repo-intel/repository.ts`. Both spellings are legitimate —
  the unscoped ones are called with a `repoId` the server already resolved —
  but nothing in the type system or in `arch:check` distinguishes them, and the
  names do not warn you.
  Caught 2026-08-23 while building `modules/context`: the plan specified the
  unscoped signature, and on these routes `repoId` arrives straight off the URL
  (`GET /repos/:id/context`), so an unscoped lookup would have served another
  workspace's documents to any caller who guessed a uuid.
  **Do:** the test is not "which module am I copying from" but **where does this
  `repoId` come from**. Off a request param ⇒ the lookup must take
  `workspaceId` from `getContext(app.container, req)` and filter on it. Only
  reuse an unscoped variant when the id was produced by code that already
  checked the workspace. Whether any *existing* unscoped call site is reachable
  with a user-supplied id has NOT been audited here — treat that as an open
  question, not as a cleared one. (2026-08-23, Project Context track B)

- **Narrowing a record to what the NEXT step needs starves the log and the
  trace, and the feature then works while being unexplainable.**
  `resolveEffectiveDocs` returns an `EffectiveDoc` carrying `own` and the
  contributing `skills`, because the editor tab needs both. `run-executor` then
  did `docs.push({ path, text })` — everything the prompt builder wanted, and
  nothing else. Documents inherited from a skill were injected correctly and
  were **indistinguishable** in the run log and in the trace from ones attached
  to the agent, so a reader could see a document in the prompt and have no way
  to learn why. Nothing was broken; nothing could be explained.
  **Do:** in this repo the trace and the live log are consumers with their own
  requirements, not a by-product. When threading a value into a run, ask what
  the run's own record will have to say about it before dropping fields — the
  producer is the only place that still knows. Here it cost re-plumbing
  provenance through `ProjectContext`, a new trace field, and a mirrored
  contract, all of which would have been free at the `docs.push`.
  (2026-08-23, Project Context — skill-inherited documents)

- **"Is this path a project-context document?" existed in THREE copies, and
  widening one of them made the other two reject exactly what it had just made
  visible.** `modules/context` had the rule in `walk.ts` (which files to
  enumerate), in `service.assertInsideRoots` (read and save), and again in
  `service.createDoc`. Extending only the walk to honour AC-2's any-depth glob
  made `client/specs/README.md` appear in the list and answer **400** when
  opened — the list and the reader disagreed about what a document is.
  It is now one exported function, `rootOf(relPath, roots)` in `walk.ts`, used
  by all three, with unit tests for the outermost-match and file-name-is-not-a-
  segment cases.
  **Do:** before widening a predicate, grep for its shape rather than its name —
  here `startsWith(\`${root}/\`)` found all three sites while "root" found
  dozens. A predicate that answers a question about a domain object belongs in
  one place the moment it has a second caller.
  **And note how it surfaced:** every gate was green, because the fixture repos
  in the tests have no nested roots. It appeared the first time the page was
  screenshotted against a clone that did — a fix correct on 5 documents was
  broken on 49. (2026-08-23)

- **The Studio reads the CLONE, which tracks the repo's DEFAULT BRANCH — never
  your working tree and never your feature branch. "My files are not showing" is
  almost always this.** Diagnosed 2026-08-23 on Project Context: the page listed
  5 documents while the working tree held over a hundred. The clone sat on
  `main` at a commit from four weeks earlier, because the 191 commits since were
  on an unpushed local branch. Both the old and the new enumeration were right;
  there was nothing else in the clone to find.
  **Check in this order before suspecting the reader:**
  `git -C server/clones/<owner>/<name> log -1 --format='%h %ad' --date=short`,
  then the same for your working tree, then
  `git log origin/<default>..HEAD --oneline | wc -l`. A large third number with
  an old first number is the whole explanation.
  Note `POST /repos/:id/resync` answers `202` and does its work in the
  background, so a `202` is not evidence the clone moved — re-read the clone's
  HEAD afterwards. Sibling of `repo-intel`'s entry that every stored line number
  is relative to the default branch. (2026-08-23)

- **Every repo clone under `server/clones/` carries a live GitHub token INSIDE
  its remote URL, so `git remote -v` on one prints a credential.** The clone is
  created with `https://x-access-token:<token>@github.com/<owner>/<name>`, which
  means the token sits in that clone's `.git/config` and comes back out of any
  command that echoes the remote — `git remote -v`, `git config --get
  remote.origin.url`, `git fetch`'s error messages, and `git ls-remote`'s
  diagnostics. Leaked into a transcript this way on 2026-08-23, which cost the
  human a token rotation.
  **Do:** never dump a clone's remote while diagnosing. Ask git the questions
  that do not name it — `git log`, `git rev-parse --abbrev-ref HEAD`,
  `git ls-remote --heads origin <branch>` (its stdout is refs, not the URL) —
  and if a command might echo it, pipe through
  `sed 's/gho_[A-Za-z0-9]*/<redacted>/g'`. Note the same applies to anything
  pasting clone paths into a report or an issue. (2026-08-23)

- **To check that a WRITE route is live against the running dev server, send a
  request you expect it to REJECT.** A `400` proves the route is registered and
  reached its validation; a `201` proves the same thing and leaves a real file
  in the human's clone (or a real row in their database). Done here 2026-08-23
  to confirm `tsx watch` had picked up a new `POST /repos/:id/context/doc`: it
  answered `201` and created `docs/__probe__.md` inside the user's actual
  repository clone, which then had to be deleted.
  **Do:** probe with a body the route must refuse — a path outside the
  configured roots, a missing required field — or with the `GET` sibling.
  Reserve real writes for the integration suite, which runs against a
  throwaway Postgres and a fixture clone. Same family as the client's entry on
  the dev server being live, shared state. (2026-08-23)

- **A stub that models an OS primitive can make a test pass on the stub's shape
  rather than on behaviour — check that the stub lists what a real syscall
  lists.** `context-walk.test.ts`'s in-memory `CloneFs` registered symlinks in a
  separate `links` table that only `realpath` consulted, so a linked directory
  was resolvable **by path but absent from its parent's `readdir`**. A real
  `readdir` returns the symlink as a dirent; only `realpath` follows it.
  The original walk never noticed, because it built each root's path from the
  configured list (`<clone>/docs`) and called `readdir` on it directly — it
  never needed the entry to be listed. Rewriting the walk to DISCOVER roots by
  listing the tree turned the same fixture red, and the failure read like a
  regression in the new code. It was a gap in the fixture: the behaviour it
  claimed to pin (a link resolving back inside the clone is followed) had never
  been exercised through a listing at all.
  **Do:** when a stub stands in for the filesystem, make each modelled entity
  appear in EVERY call a real one would appear in — a symlink in `readdir` as
  well as in `realpath`. And when a rewrite turns one old test red, ask whether
  the fixture ever expressed the case, before assuming the new code broke it.
  (2026-08-23, Project Context — AC-2 nested roots)

- **A recursive walk that skips symlink DIRENTS still follows a symlinked
  ROOT — the seed of the traversal is never one of the entries it inspects.**
  `walkMarkdown` (`modules/context/walk.ts`) refused every symlink it
  enumerated (`if (entry.isSymbolicLink()) continue`) and handed each configured
  search root straight to `readdir`, so a reviewed repository containing
  `docs -> /etc` produced documents whose bytes live outside the clone. Proven
  2026-08-23 by deleting the guard again: the fixture emits
  `{ path: 'docs/passwd.md', root: 'docs' }`.
  Two things made it survive review the first time. The module's own docstring
  asserted the invariant ("never emits a symlink at all") in prose, which reads
  as a check; and the escape then **poisons every downstream membership test** —
  `readDoc` validates a requested path against the walked set, so once the walk
  is wrong the validation confirms the attack instead of blocking it. The
  browser-reachable route was `GET /repos/:id/context/doc?path=`.
  Note also which half had the guard: `SimpleGitClient.writeFile` re-checked
  through `realpath`, while `readFile` (`adapters/git/simple-git.ts:137-139`) is
  still a bare `readFile(join(clonePath, path), 'utf8')`. The write path — the
  scary-looking new one — was the safe half; the read path was not.
  **Do:** guard the seed separately from the entries. Containment for this walk
  now goes through `CloneFs.realpath` on the clone base and on every root
  (`adapters/clone-fs.ts`); resolve `realpath` rather than comparing lexical
  paths, because the clone base itself is legitimately a symlink on macOS
  (`/tmp`). And when a docstring states a containment invariant, test it by
  removing the line that supposedly enforces it — prose is not a control.
  (2026-08-23, Project Context arch review r1 / fix r1)

- **`pnpm typecheck` in `server/` does not look at `server/test/**` at all —
  `tsconfig.json:28` is `"include": ["src/**/*.ts"]`.** So a test fixture that
  no longer matches a changed contract is invisible to typecheck AND to `tsc`
  entirely; it surfaces only when the suite runs, as a runtime failure. This is
  a strictly worse version of the client's "vitest does not typecheck" entry:
  there, `pnpm typecheck` still covers the test files; here it does not compile
  them at all.
  Measured 2026-08-23: changing `PromptParts.specs` from `string[]` to
  `Array<{path,text}>` left stale `specs: string[]` fixtures in
  `test/prompt-callers.test.ts`, `test/prompt-log.test.ts` and
  `test/prompt-structured.test.ts` — all three typechecked green and failed at
  run time.
  **Do:** after changing any shared contract, grep `server/test/` for literals
  of the changed type yourself; a green `pnpm typecheck` is not evidence about
  them. Budget the fixture updates as part of the contract change, in the same
  step. (2026-08-23, Project Context track D)

- **`.default([])` on a shared-contract field does NOT keep existing object
  literals compiling — it is the sibling trap of the `.nullable()` entry below,
  and worse, because `.default()` reads as "the caller may omit this".** In Zod
  3 (`zod@^3.24.1` here) `.default()` makes the field optional on the *input*
  type and **required on the output type**, and `z.infer<T>` is the output. Any
  literal annotated with the contract type — `const trace: RunTrace = {…}` —
  therefore stops compiling the moment the field is added.
  Measured 2026-08-23 while extending `RunTrace` with `specs_omitted`: with
  `.default([])` it broke `modules/reviews/run-executor.ts:373` and `:561` and
  `platform/trace-builder.ts:38`. `.optional()` is the form that leaves them
  alone; consumers then read the field as `?? []`.
  **Do:** to add a collection field to an existing contract without touching
  every construction site, use `.optional()` and normalise at the read side.
  Reserve `.default()` for schemas you only ever `.parse()` into, never for one
  used as a TypeScript annotation on hand-written literals. Check which you have
  before choosing: `grep -rn ": RunTrace = {" server/src` finds the literals
  that decide it. (2026-08-23, Project Context track A)

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
  **The same choice has a second, runtime consequence when the shape lives in
  a jsonb blob.** A row written before the field existed has no such key, so
  `.nullable()` fails the parse of the WHOLE object — and every other field
  stored in that blob disappears with it, including ones the UI is rendering
  beside the new one. Adding `inputs_over_budget` to `pr_brief.inputs` on
  2026-08-24 would have blanked the "what was cut" list that its own sentence
  stands next to, on every brief built before that day. `.nullish().default(…)`
  reads old rows and new ones alike. **A jsonb blob has no migration to remind
  you** that older shapes are still on disk — the column type never changes,
  so nothing fails until a real row from last week is read back. (2026-08-24)

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

- **The integration suite can report "8 passed | 12 skipped" while Docker is
  running perfectly, and that line reads as green at a glance.** The gate is
  `dockerAvailable()` in `test/helpers/pg.ts:23-33`: it shells out to
  `docker info` with `timeout: 5000` and memoises the answer in `dockerCache`
  for the whole process. One slow call — Docker Desktop busy right after
  another container command, an image pull, a laptop under load — makes every
  `.it.test.ts` file self-skip, and vitest's summary counts skipped files as a
  clean run. Measured 2026-08-24 during `/run-plan`: a first
  `vitest run .it.test` gave `Test Files 8 passed | 12 skipped (20)` and
  `Tests 34 passed | 115 skipped (149)`; `docker info` on its own then took
  **108 ms**; an immediate re-run gave `20 passed (20)` / `149 passed (149)`.
  Nothing had changed but the timing.
  **Do:** read the SKIPPED count, never just the exit code or the word
  "passed". `115 skipped` means the DB-backed half of the suite did not run at
  all — re-run before believing any integration result, and before reporting
  one to a human. This bites hardest right after `docker compose exec` or any
  other command that has just made the daemon work.
  **Better than this entry:** the gate should fail loudly rather than skip
  silently when `docker info` times out but the daemon is in fact reachable —
  a retry, or an env var that turns "Docker unavailable" into an error in
  local runs. Until that exists, this entry is the only thing standing between
  a green-looking summary and 115 tests nobody ran. (2026-08-24)

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

- **A prompt edit is not local: it changes answers it has nothing to do with,
  and the grounding check turns that into a hard failure.** Measured
  2026-08-24: adding an 83-token rubric defining `risk_level` made the brief
  for an unrelated pull request start naming
  `client/src/vendor/shared/contracts/platform.ts` — the byte-identical twin of
  the `server/` copy the PR actually changes. That file is not in the input, so
  AC-9 rejected the whole answer with 422 and a pull request that had a stored
  brief minutes earlier could no longer be rebuilt.
  **The model invented nothing — we showed it that path.** Traced the same day:
  the document-relevance rule selects any document that literally names a
  changed file, so `server/.../platform.ts` pulled in three plans
  (`docs/plans/2026-08-13-intent-layer.md`,
  `docs/plans/2026-08-19-blast-radius.md`,
  `docs/superpowers/plans/2026-07-30-run-cost-ui.md`) — and each of those names
  the `client/` twin too, inside its prose. The fragments went into the prompt;
  the allowed-name set did not, because it is assembled from STRUCTURAL inputs
  (changed files, blast map, document PATHS, finding files) and never from the
  names written inside the text we send.
  **So the set and the prompt disagree about what "the input" is** — we
  instruct the model to name nothing outside its input, then reject it for
  naming something that was in it. Any name occurring in text the system chose
  to send is by definition not invented; the fix belongs in how the set is
  built, not in reprompting the model out of quoting us.
  And after ANY change to a system prompt, rebuild a few real pull requests,
  not one: temperature 0 does not make the output stable across a changed
  prompt, and a latent gap like this one stays invisible until some edit
  happens to make the model quote the wrong half. (2026-08-24)

- **A field of a structured response that nothing cross-checks against the rest
  of that same response will eventually contradict it — and it is usually the
  most prominent field.** Measured 2026-08-24 on a live brief: `risk_level`
  came back `medium` while the `risks` array beside it, from the same answer,
  carried a `high` entry. The card showed both. Cause: the system prompt named
  the three words and defined none of them, required no agreement with `risks`,
  and the server validated only `risks[].file_refs` and `review_focus[]`
  against the allowed-name set. The one field a reviewer reads first was the
  one field grounded in nothing.
  **Do:** when a schema has both a summary field and the detail it summarises,
  the summary is the server's to derive or to floor — never the model's alone.
  Here `risk_level` is raised to the highest severity among `risks` after the
  response is accepted and before it is persisted, so a cached read cannot
  serve the contradiction; the model may still raise it further, because "each
  small, together dangerous" is a judgement worth keeping. Log the raise with
  both values: a model disagreeing with itself is otherwise invisible.
  **Two things measured afterwards.** Defining the three levels in the prompt —
  83 `cl100k_base` tokens — was enough on its own: rebuilding the same pull
  request returned `high` unprompted and the floor never fired, so the rubric
  is doing real work and the floor is the guarantee behind it, not a substitute
  for saying what the words mean. And the contradiction had been sitting in a
  test fixture since that test was written (`medium` over a `severity: high`
  risk), green the whole time — a suite asserts the shape it was given, so a
  field nothing cross-checks is unguarded in the tests exactly as it is in
  production. (2026-08-24)

- **`BlastResponse` repeats the same endpoint list under every symbol, and a
  prompt that renders it symbol-by-symbol pays for each copy.** Measured
  2026-08-24 on a 117-symbol pull request: `totals.endpoints` says **33
  distinct** endpoints, while summing `symbols[].endpoints` gives **1,845
  entries** — the same names written out about 56 times — plus 329 importer
  entries. The whole map serialises to 112,072 characters, ~28,000
  `cl100k_base` tokens, which was ~80% of the brief's oversized request; the
  100-path changed-file list next to it costs ~1,100.
  **Confirmed end to end the same day.** Rendering each endpoint, cron and
  importer once at map level took the same live build from `usage.prompt_tokens`
  **35,299 → 11,992** against a 16,000 budget, with the fitter cutting
  **nothing** where it had previously deleted all 100 changed files and still
  overshot twofold. Cost halved ($0.0054 → $0.0027) and the brief came back
  richer, not poorer — 7 risks instead of 6. What is lost is only the
  association (which symbol reaches which endpoint), which a brief does not
  need: its `file_refs` are files, and an endpoint is never a valid one.
  **Do:** the shape is right for the card, which draws a per-symbol tree, and
  wrong for a prompt. Any feature feeding this map to a model should render
  each endpoint and importer ONCE at map level. That drops no name — the
  never-cut rule protects names, not copies — and it is the difference between
  a budget being unreachable and being comfortable. Check the two numbers
  against each other (`totals.endpoints` versus the sum over symbols) before
  assuming a map is inherently large. (2026-08-24)

- **A token-budget fitter verified only by its own counter proves nothing.**
  `brief/budget.ts` cuts inputs until `count(render(fitted)) <= 8000` with
  `container.tokenizer` (`cl100k_base`), and the hermetic suite asserts AC-12
  by asking that same counter. Measured 2026-08-24 on the first live call: the
  fitter reported a fit under 8,000 and did cut (12 caller tails, three
  documents), while the provider reported **`usage.prompt_tokens` = 35,255**
  for that one request — a 4.4× disagreement that no test in the suite can see,
  because nothing anywhere compares the two numbers.
  **Cause, measured — and NOT the reprompt loop.** I first blamed
  `completeStructured` accumulating `tokensIn` across retries
  (`adapters/llm/openai.ts:120`); that mechanism is real but was not what
  happened. Logging `attempts` and rebuilding gave **`attempts: 1`** with
  `tokens_in` 35,299 — one request, not a sum. The real cause is that
  **`fitToBudget` gives up silently**: its five cuts run, and the function ends
  in an unconditional `return { fitted, cut }` with no check that the result
  fits. On that build `inputs_cut` read `changed_files: 100 of 100` — the
  entire file list deleted — and the request was still 35,299. What remains is
  the never-cut set of AC-14 (symbol, endpoint and cron NAMES from the blast
  map), and on a pull request touching 117 symbols that alone exceeds any
  budget anyone would set.
  **Do:** a fitter that cannot fit must say so — throw, or return a flag the
  caller surfaces. Returning best-effort output makes an unachievable budget
  indistinguishable from a satisfied one, and the criterion reads as met while
  the request is 2× over. Check `inputs_cut` for a cut that removed 100% of
  something: that is the fingerprint of the loop having run out of things to
  drop.
  **A per-request cap does not survive that same loop.** `openai.ts:134-136`
  pushes the rejected answer AND the reprompt onto `messages`, so attempt 2 is
  strictly larger than attempt 1 and attempt 3 larger again. A fitter can only
  bound the FIRST request; if it fits exactly to the cap, every retry exceeds
  it. Any criterion worded "every single request stays under N" is therefore
  violated by construction on any build that retries — either fit to N minus
  the reprompt's growth, or put only the schema error in the reprompt instead
  of the whole rejected answer (that one is a shared-adapter change and touches
  every feature).
  **Do not infer an attempt count from token arithmetic — log it.** I read
  35,255 as "three attempts summed" because the numbers divided plausibly, and
  wrote that down as established. It was one attempt. The model honours strict
  `json_schema` here: probed directly against `deepseek/deepseek-v4-flash`,
  both a trivial prompt and a 10,513-token one returned clean first-try JSON
  with `finish_reason: stop`. `attempts` is what the adapter returns and the
  only thing that answers this; everything else is a story that fits the
  digits.
  **Do:** whenever a budget is a requirement, log both numbers on the first
  live call and compare them — the fitter's count and the provider's
  `prompt_tokens`. A fitter that grades its own homework is the same blind spot
  as the grounding check above, and it surfaces the same way: the product looks
  compliant and the user sees a number that contradicts the stated budget.
  (2026-08-24)

- **Changing a feature's `defaultProvider` in `FEATURE_MODELS` silently orphans
  its `MockLLMProvider` fixture — and `pnpm typecheck` sees none of it.**
  Fixtures are registered **per provider**, so flipping `risk_brief` from
  `openai` to `openrouter` routed every call to a mock that held no `PrBrief`
  fixture. Measured 2026-08-24: typecheck exit 0, unit suite 383/383 green,
  and **11 integration tests red** across `test/brief.it.test.ts` and
  `test/settings-models.it.test.ts` — the latter asserting the old default
  outright. The failures do not name the cause: they read as
  `expected 500 to be 200` and `expected Error: MockLLMProvider fixture failed
  sch… to be an instance of ValidationError`, which look like broken product
  code, not a misplaced fixture.
  **Do:** treat a one-line `FEATURE_MODELS` edit as a contract change — run
  `pnpm exec vitest run .it.test` before believing it, exactly as the entry
  below on `server/test/**` being outside typecheck already demands. And when
  moving a fixture to the new provider, MOVE it; registering it on both hides
  the next such break. (2026-08-24)

- **An input-budget trimmer and a "name only what was in the input" grounding
  check fight each other, and only a WIDE pull request shows it.** Measured
  2026-08-24, first live `POST /pulls/:id/brief` on a 109-file PR: the model
  returned a factually correct brief and the check rejected it with 422,
  naming seven refs — **every one of them a real path in this repository**.
  Three distinct causes, and the third is the one no test can reach:
  (1) directories — `mcp/src/tools/`, `.claude/` — the allowed set holds file
  paths plus their segments, and `a/b/` is neither;
  (2) a dropped leading dot — the model wrote `dependency-cruiser.cjs` for
  `server/.dependency-cruiser.cjs`, and the segment in the set carries the dot;
  (3) **paths the budget fitter had cut.** The changed-file list is trimmed to
  fit the token cap and, correctly, the cut paths leave the allowed set — but
  the model still knows from the PR title and the derived intent that the
  change is about the MCP server, so it names `mcp/src/args.ts` anyway. Trim
  and grounding are then in direct opposition, and the wider the PR the surer
  the 422.
  **Do:** never conclude a grounding check works from hermetic tests. Fixtures
  are small, nothing gets cut, and every name the model can produce is in the
  set by construction — the suite confirms only the shapes its author already
  imagined. One live call against a repository-sized PR is the only evidence,
  and it is the third time this check has failed *closed* on a correct answer
  (see the two cases at the top of this file). The symptom is always the same:
  a button that appears to do nothing. (2026-08-24)

- **A `401 Incorrect API key provided: sk-or-v1***…` naming
  `platform.openai.com` is NOT a bad key — it is a feature pointed at the
  wrong provider.** `~/.devdigest/secrets.json` on a local machine can hold an
  **OpenRouter** key under `OPENAI_API_KEY` (same string as
  `OPENROUTER_API_KEY`), so any feature whose `FEATURE_MODELS` default is the
  `openai` provider sends that key to OpenAI's endpoint and gets a 401 whose
  text blames the key. The `sk-or-v1` prefix in the masked key is the tell:
  OpenAI keys start `sk-`, OpenRouter's `sk-or-v1-`.
  **Do:** read the prefix in the error, then check `settings` for that
  feature's model — an empty `settings` means the built-in default in
  `vendor/shared/contracts/platform.ts` is in force, and the Settings screen is
  *showing* that default rather than a saved choice. **Fix it in
  `FEATURE_MODELS`, not in Settings and not in the adapter**: a per-machine
  click leaves the next person with the same 401. Four of the six features
  default to `openrouter`/`deepseek-v4-flash`; `risk_brief` and `conformance`
  were the two exceptions, both landed in the repository's very first commit
  (`587c46a`, 2026-06-14) and never executed until now. `risk_brief` was
  corrected on 2026-08-24; **`conformance` still carries it** and will 401 for
  whoever runs it first. Hit 2026-08-24 on the first live
  `POST /pulls/:id/brief`: `risk_brief` defaults to `openai`/`gpt-4.1`, so the
  whole pipeline ran on real data and died at the provider boundary, which
  reads at a glance like the new feature being broken. (2026-08-24)

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
