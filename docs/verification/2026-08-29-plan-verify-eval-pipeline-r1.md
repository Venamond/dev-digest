# Plan Verification

## Plan

`docs/plans/2026-08-29-eval-pipeline.md`, Status: **approved** (amended 2026-08-29 —
S2 split into S2a/S2b).
Requirements source: `specs/2026-08-29-eval-pipeline.md` — `SPEC-2026-08-29-eval-pipeline`,
`approved`, AC-1…AC-67. Criterion text read from the spec, not from the plan.

**Scope limit stated up front.** I cannot see an image. Every element-checklist row
below was checked for **presence** in the rendered component source (and against the
readable mockup sources under `img/mockup-src/*.jsx` where the plan cites a line
number). **Appearance** — spacing, colour, alignment, fidelity to the PNG screenshots —
is not verified by anything in this report and cannot be `MET` on my authority.
The §5 screenshot comparisons for S13/S14/S15 remain the human's.

## Verdict table

### Definition of done (plan §0)

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| DoD-1 — every criterion covered by its named step and proven by its named check | PARTIALLY MET | 63 of 67 criteria `MET`; AC-63 and AC-64 `PARTIALLY MET`; AC-8 / AC-33 not executable | code unfinished (two criteria); see AC-63, AC-64 |
| DoD-2 — `cd server && pnpm test && pnpm typecheck && pnpm arch:check && pnpm arch:check:core && pnpm verify:l06` | MET | `verify:l06`: `Test Files 2 passed (2) / Tests 29 passed (29)`; `typecheck` clean; `arch:check` `✔ no dependency violations found (232 modules, 805 dependencies cruised)`; `arch:check:core` `✔ no dependency violations found (25 modules, 55 dependencies cruised)` — all re-run by me. `pnpm test` cited from the collected gate output (65 files / 633 tests), plus my own `vitest run eval.it.test`: `Test Files 1 passed (1) / Tests 15 passed (15)` | |
| DoD-3 — `cd client && pnpm test && pnpm typecheck` | MET | `pnpm typecheck` re-run by me, clean. Targeted run of the 13 eval-touching files: `Test Files 13 passed (13) / Tests 114 passed (114)`. Full 69 files / 488 tests cited from the collected gate output | |
| DoD-4 — `./scripts/check-shared-sync.sh` | MET | re-run by me: `vendor/shared in sync` | |
| DoD-5 — AC-8 and AC-33 demonstrated on `Security Reviewer` against the running dev stack | CANNOT VERIFY | S16/S17 deliberately not executed; dev DB not migrated | human-run, by design |

### Plan steps

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| S1 — shared eval contracts, both copies | MET | `EvalExpectation` `server/src/vendor/shared/contracts/knowledge.ts:78`; `EvalCaseSeededFrom` `:82`; `EvalCase.expectation` `:93`, `.seeded_from` `:98`; `EvalCaseInput` `eval-ci.ts:32,37`; `EvalRunRecord` `:56-60`; `EvalRunBatch` `:119`; `EvalCaseSeed` `:147`; `EvalOverviewRow` `:163`; `EvalOverview` `:174`; `EvalAgentDashboard` `:188`. `EvalRun`/`EvalRunResult`/`EvalDashboard` still present (`:65`, `:84`). `check-shared-sync.sh` → `vendor/shared in sync`. The DoD grep found no object literal missing `expectation` outside the module itself | |
| S2a — snapshot-chain repair | MET | `server/src/db/migrations/0019_snapshot_baseline.sql` is exactly `SELECT 1;`; `meta/0019_snapshot.json` exists; `_journal.json` has `{'idx': 19, … 'tag': '0019_snapshot_baseline'}`. The whole chain applies to a fresh Postgres — `vitest run eval.it.test` (testcontainers) passed 15/15 | I did **not** re-run `pnpm db:generate` for the "No schema changes" half of the DoD: that command writes files on drift and rule 1 forbids me mutating the repo. The testcontainers run is the stronger end-to-end proof |
| S2b — eval migration + schema barrel | MET | `0020_eval_run_batches.sql` contains exactly `CREATE TABLE eval_run_batches`, five `ADD COLUMN`s, three FKs and one index — **no** `pr_brief`, `pr_intent` or project-context statement. `_journal.json` `idx: 20`. `grep -c evalRunBatches server/src/db/schema.ts` → `2` (`:39` import, `:82` const). Schema matches §2c: `schema/eval.ts:46-78`, `:33`, `:37`, `:94`, `:95`, `:97` | |
| S3 — three dependency-cruiser allow-lists | MET | the plan's own regex probe, run by me, printed the nine expected booleans: `no-domain-io` / `no-domain-node-builtins` `true,false,false`; `no-app-to-schema` `true,true,false`. `git diff --stat server/.dependency-cruiser-known-violations.json` empty; `arch:check` still `0 violations` | |
| S4 — client data layer | MET | `client/src/lib/hooks/keys.ts:25-31` (six keys); `hooks/eval.ts` exports all twelve hooks, `asArray` guard at `:35`, `grep 'queryKey: \['` returns nothing; `hooks/index.ts:12`; `lib/eval-run-state.ts:15-18`; `components/eval-run-confirm/`; `eval.json` `runConfirm` section | |
| S5 — pure scorer and `verify:l06` | MET | `pure/scoring.ts`, `aggregate.ts`, `types.ts` + colocated tests. Purity grep `from '(../)+db/|drizzle-orm|fastify|node:'` returns nothing; the only imports in `pure/` are `zod`, `@devdigest/shared`, `vitest` and siblings. `server/package.json:19` `"verify:l06": "vitest run src/modules/eval/pure"`; run output `29 passed` | |
| S6 — eval repository | MET | `repository.ts` is the module's only `db/schema` importer (`arch:check` probe row `no-app-to-schema … repository.ts false`). `grep EvalExpectation.parse` → `:135` (insert) and `:162` (update). `latestRunPerCase` `:386-392` orders by `desc(evalRuns.ranAt)` **unfiltered** (AC-63's storage). Every read takes `workspaceId` | |
| S7 — service + background runner | MET | `service.ts:128-164` (startSetRun, fire-and-forget at `:156`), `:171-193` (trial), `:199-224` (run all), `:242-308` (seed). `runner.ts:80` resolves `container.llm` once, `:83` one case at a time, `:98-103` publish, `:106` progress, `:115-126` complete, `:131-134` `runBus.complete` in `finally`. `grep groundFindings server/src/modules/eval/` returns nothing | |
| S8 — routes, registration, integration suite | MET | all twelve routes present, `routes.ts:92,101,118,128,140,149,158,169,178,187,196,205`; `SPEND_LIMIT` `:83` applied to the three spend routes `:142,151,160`; invalid-JSON 400 at `:76-78`; `modules/index.ts:17,47` static `evalPipeline`. `vitest run eval.it.test` → `Test Files 1 passed (1) / Tests 15 passed (15)` | |
| S9 — six-tab agent editor | MET | `AgentEditor/constants.ts:14-21` — six tabs in mockup order, `ci` `disabled: true`; `VALID_TABS` excludes `ci` `:24`; `AgentEditor.tsx:19-34` renders five through `Tabs` and `CI` as a sibling `<button disabled title=…>`; `:46` mounts `EvalsTab`. Checklist rows 1-7 all resolve | appearance not checked |
| S10 — the `Evals` tab | MET | all 25 checklist rows resolve: 1 `EvalsTab.tsx:138`, 2 `:140-142`, 3-7 `:105-162`, 8 `:154-158`, 9 `:164-167`, 10 `:168-175`, 11 `:178`, 12 `:180-186`, 13 `:187`, 14 `:199-213`, 15 `:215-217`, 16-23 `EvalCaseRow.tsx:59-86`, 24 `EvalsTab.tsx:222`, 25 `:189-197`. Every departure traces to the criterion it names | appearance not checked |
| S11 — eval-case editor modal | PARTIALLY MET | rows 1-17 resolve (`EvalCaseEditor.tsx:196,197-201,206-209,210-212,213-221,222-230,236-250,251-255,256-258,259-268,270-277,280-301,302-316,321-324,325-333,335-348,351-357`). **Row 18 (the result panel) renders only from `trial ?? lastRun` (`:132`) and its one in-app consumer never passes `lastRun`** — `EvalsTab.tsx:288-295` passes `agentId`, `agentName`, `evalCase`, `onClose` and nothing else | **code unfinished** — the panel is dead on open; it lights up only after a trial fired in the same mount. This is AC-63's editor half |
| S12 — `Turn into eval case` on a finding | MET | all 8 checklist rows resolve: 1-2 `FindingCard.tsx:121-140`, 3 `:142-144`, 4 `:145-153`, 5 `:154-162`, 6 `:89-94`, 7 `:165-183`, 8 `styles.ts` `s.actions`. Editor moved to `client/src/components/eval-case-editor/` and imported from both consumers (`FindingCard.tsx:25`, `EvalsTab.tsx:30`) | appearance not checked |
| S13 — dashboard route, sidebar, overview | MET | `nav.ts:47` (after `conventions` `:41-46`, inside `section: "SKILLS LAB"` `:36`) and `:80` shortcut; `app/evals/page.tsx` is a Server Component delegating to a `'use client'` view (`EvalDashboardView.tsx:5`); all 22 checklist rows resolve in `EvalOverview.tsx:99-199` | `MetricBar` (`:34-52`) replaces the plan's `BarRow`. The element the row asks for — a filled bar plus its right-aligned percentage — is present. **plan superseded**: the departure is justified in the source (`BarRow` fixes a 150px label column). Appearance not checked |
| S14 — per-agent dashboard view | PARTIALLY MET | rows 1-8, 10-24 resolve in `AgentEvalView.tsx:125-345`. **Row 9 is half-built**: `:220-227` renders `t("completion")` = `"{produced} of {total} ran"` with **no partial branch**, where the row asks for "partial wording when any case errored"; `EvalsTab.tsx:170` has the branch, this screen does not. Row 15 uses `icon="GitMerge"` (`:277`) | row 9: **code unfinished**. Row 15: **plan superseded** — `GitCompare` does not exist in `client/src/vendor/ui/icons.tsx` (`grep GitCompare src/vendor/ui/` → no hits; `GitMerge` at `icons.tsx:47`), and that directory is read-only third-party code. Appearance not checked |
| S15 — compare-two-runs modal | MET | all 16 checklist rows resolve: 1 `RunCompare.tsx:82`, 2 `:83`, 3 `:86-88`, 4 `:89-91`, 5-9 `:96-125`, 10 `:43-51`, 11 `:127`, 12 `:129`, 13 `:130-139`, 14 `:140-155`, 15 `:58-61,75`, 16 `:76`. `diffTokens.ts:14` is a plain function (LCS over whitespace-split tokens) | appearance not checked |
| S16 — author the delivered eval set through the UI | CANNOT VERIFY | deliberately not executed; the dev DB is unmigrated, so the DoD SQL cannot run | human-run, by design |
| S17 — the demonstration | CANNOT VERIFY | deliberately not executed | human-run, by design |

### Acceptance criteria

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| AC-1 | MET | `FindingCard.tsx:145-153` — `Turn into eval case`, ghost/sm/`FlaskConical`, inside the expanded body's action row `:120` beside `Accept` `:121` and `Dismiss` `:131` | covered by S12 |
| AC-2 | MET | `service.ts:284,286` — `dismissed → must_not_flag`, assertion `MUST NOT comment on ${file}:${range} (${title})`; `eval.it.test.ts:251-253` asserts both; editor renders it as the `Negative case` banner `EvalCaseEditor.tsx:236-250` | S8/S11/S12 |
| AC-3 | MET | `service.ts:264-268` (open **and** accepted → `must_find`), assertion `:287`; `eval.it.test.ts:263-275` runs both the accepted and the undecided finding | |
| AC-4 | MET | `service.ts:282` seeds `owner_id: review.agentId`; `routes.ts:112` forces `owner_id` from the URL, never the body; `eval.it.test.ts:255`, `:295-307` | |
| AC-5 | MET | `service.ts:249-260` filters `pr_files` to `f.path === finding.file` and rebuilds the unified diff; `eval.it.test.ts:258-259` asserts the diff contains `src/config.ts` and **not** `src/other.ts` | |
| AC-6 | MET | `EvalCaseRow.tsx:59-86` — status icon, name, expectation badge (`:67-76`), last-run result line (`:78`), `Play`/`Edit`/`Trash` (`:82-84`) | |
| AC-7 | MET | `EvalsTab.tsx:215` opens the editor with `{evalCase: null}` and no `seed` prop; label `eval.json evalsTab.newCase = "New eval case"` | |
| AC-8 | CANNOT VERIFY | S16 human-run and deliberately not executed; the DoD SQL needs a migrated dev database | never `NOT MET` — by design |
| AC-9 | MET | `EvalCaseEditor.tsx:252` `FormField label required` + mono `TextInput`; `:259-268` `Diff`/`Files`/`PR meta`; `:351-357` expected-output textarea; `:325-333` validity badge | |
| AC-10 | MET | `runner.ts:83` iterates cases sequentially, `:170-176` passes `agent.systemPrompt`/`agent.model`, `:80` resolves the agent's own provider; `eval.it.test.ts:415` asserts N cases → N `completeStructured` calls | |
| AC-11 | MET | `service.ts:144-154` copies `agent.version` and `agent.systemPrompt` onto the batch at creation; `eval.it.test.ts:350-354` — `agent_version`, `system_prompt`, and every result row sharing one `batch_id` | |
| AC-12 | MET | `service.ts:463-484` `batchToDto` reads the stored columns and recomputes nothing; `eval.it.test.ts:356-364` edits the prompt via `PUT /agents/:id` then asserts `after.batch` equals the pre-edit batch | |
| AC-13 | MET | `pure/` imports only `zod`, `@devdigest/shared` and siblings (grep of every `^import` line); the `db/|drizzle-orm|fastify|node:` grep returns nothing; `verify:l06` runs the 29 scorer tests with no provider in scope | |
| AC-14 | MET | `EvalsTab.tsx:164-167` renders `Icon.Code` + `evalsTab.scoringNote` = "Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer." | |
| AC-15 | MET | `scoring.ts:29-37` — file equality **and** range overlap, no other field; `scoring.test.ts:31-63` covers the three negatives and the "different severity/category/title, same location still matches" case | |
| AC-16 | MET | `scoring.ts:72-85` — `tp` counts matched **expected**, `fp: 0` unconditionally on `must_find`; `scoring.test.ts:142` and `aggregate.test.ts:54` | |
| AC-17 | MET | `scoring.ts:57` — `fp` = every actual finding overlapping the forbidden location, each counted; `scoring.test.ts:93,105`. **Deviation 1 adjudicated:** track B stored the forbidden location in `expected_output` (`service.ts:295-304`) because the shipped `EvalCaseSeededFrom` (`knowledge.ts:82-85`) carries no location. The behaviour the criterion asks for is present and the case is violable | **plan superseded** — S5's prose ("the forbidden location comes from `seeded_from` when present") describes a contract that was never shipped. The criterion itself is satisfied |
| AC-18 | MET | `aggregate.ts:39` `ratio(tp, tp+fn)` over `produced` only; only `must_find` cases carry tp/fn (`scoring.ts:60-61`); `aggregate.test.ts:37` | |
| AC-19 | MET | `aggregate.ts:42` `ratio(tp, tp+fp)` over every produced case; `aggregate.test.ts:42,47` — only-positive set reads `1`, one violated `must_not_flag` case is the only thing that lowers it | |
| AC-20 | MET | `aggregate.ts:43`; `runner.ts:192-193` passes `kept = outcome.review.findings.length`, `dropped = outcome.dropped.length` and never re-runs the gate (`grep groundFindings` empty) | |
| AC-21 | MET | `aggregate.ts:45-46` — passed over **produced**, `null` at zero produced; `aggregate.test.ts:67` | |
| AC-22 | MET | `client/src/vendor/ui/nav.ts:47` — `{key:"evals", label:"Eval Dashboard", icon:"Gauge", href:"/evals", gKey:"e"}` appended to `section: "SKILLS LAB"` (`:36`) after `conventions` (`:41-46`); shortcut `:80`; asserted through the rendered shell in `EvalOverview.test.tsx:171` | |
| AC-23 | MET | `EvalOverview.tsx:129-167` — icon tile, name, model chip (`:135`), `lastRun` sub-line with version/date/pass count (`:141-146`), `Sparkline` (`:152`), three `Mini` metrics (`:160-166`) | |
| AC-24 | MET | `EvalOverview.tsx:147` renders `overview.noRuns` = "No eval runs yet"; `:150` gates the sparkline on `latest`; `Mini` values fall to `pct(null)` = `—` (`:22-24`) | |
| AC-25 | MET | `EvalOverview.tsx:172-199` — seven columns (agent, ran-at, version, three bars, pass count), sorted `byNewest` (`:66-68,77`) | |
| AC-26 | MET | `AgentEvalView.tsx:197-219` three `MetricCard`s with `delta`; `:229-266` legend + `LineChart` over chronological points; `:288-341` the eight table columns including `Pass` and `Cost`. `casesTotal` reads `dash.cases_total` (`:103`), the server's real count (`service.ts:376`) | |
| AC-27 | MET | `AgentEvalView.tsx:85-88,185-195` — alert rendered only on a drop, naming the pp (`{points}pts`) and the version (`v{version}`); server-side twin at `service.ts:508-517` | |
| AC-28 | MET | `AgentEvalView.tsx:274-283` — `disabled={sel.length !== 2}`, affordance `selectTwo` = "Select two runs to compare" at `:270-272` | |
| AC-29 | MET | `AgentEvalView.tsx:90-93` — a third pick yields `[cur[1]!, id]`, dropping the earliest and holding at two | |
| AC-30 | MET | `RunCompare.tsx:58-61` orders by `ran_at ?? started_at`, `:75` destructures `[older, newer]`; the four metrics render old → new `:96-125` | |
| AC-31 | MET | `RunCompare.tsx:140-155` — `del` tokens get `--code-del` + `line-through`, `add` tokens `--code-add`; `diffTokens.ts:14-40` is the LCS word diff | |
| AC-32 | MET | `RunCompare.tsx:76` reads `older.system_prompt` / `newer.system_prompt` off the runs; the storage half is proven by `eval.it.test.ts:356-364` | |
| AC-33 | CANNOT VERIFY | S17 human-run and deliberately not executed | never `NOT MET` — by design |
| AC-34 | MET | `EvalCaseEditor.tsx:123-129` parses, `:190` `canSave` requires `parsed.ok`, `:225` disables Save, `:330-332` renders the `invalid JSON` badge. Server half `routes.ts:76-78` → 400; `eval.it.test.ts:309` | |
| AC-35 | MET | `EvalsTab.tsx:259-286` — the `Trash` action opens a Modal whose body carries `deleteHistoryNote` = "Its recorded run history is deleted with it and cannot be restored." | |
| AC-36 | MET | `schema/eval.ts:82-84` — `evalRuns.caseId` references `evalCases` `onDelete: 'cascade'`; `service.ts:114-118` relies on it; `eval.it.test.ts:463` asserts the rows are gone | |
| AC-37 | MET | `service.ts:156-163` — `void runner.executeBatch(...)` then `return {run_id, cases_total}`; `eval.it.test.ts:336-343` reads the run back immediately and the screen stays usable | |
| AC-38 | MET | `runner.ts:98-103` publishes `{index, total}` per case; `EvalsTab.tsx:97-103` reads the newest position off the event stream and `:191-193` renders `k / N` | |
| AC-39 | MET | one predicate `eval-run-state.ts:15-18`, read by `EvalsTab.tsx:59,189` (progress + disabled `Running…` in place of the start control) and `AgentEvalView.tsx:60,170-176` | |
| AC-40 | MET | `EvalsTab.tsx:76-84` and `AgentEvalView.tsx:66-75` — a stream that was running and stopped invalidates the runs/dashboard queries with no remount; asserted in `AgentEvalView.test.tsx:222` | |
| AC-41 | MET | `service.ts:156` fire-and-forget with a `.catch`; `runner.ts:131-134` closes the bus in a `finally`; `eval.it.test.ts:326-349` polls the batch to `complete` after the POST already returned | |
| AC-42 | MET | `service.ts:409-414` throws `ConflictError('A run is already in progress for this agent.')`, called from both `startSetRun` (`:134`) and `runSingleCase` (`:177`); `eval.it.test.ts:367` asserts both 409s with the stated reason | |
| AC-43 | MET | `runner.ts:162-167` (unparseable diff → throw inside the per-case try) and `:221-245` (catch records `errored` + truncated reason, loop continues); `eval.it.test.ts:386` | |
| AC-44 | MET | `EvalCaseRow.tsx:47-57` — `resultErrored` = "Failed to run — {reason}" is a distinct string and a distinct style (`s.rowResult(errored)`, `:78`) from `resultFailed` = "Last run did not pass · …" | |
| AC-45 | MET | `runner.ts:118` marks the batch `partial` when any case errored; `EvalsTab.tsx:168-175` renders `completionPartial` = "Partial result — {ran} of {total} ran" | the per-agent dashboard names the count but not the partiality (`AgentEvalView.tsx:220-227`) — recorded against S14 row 9, not against this criterion |
| AC-46 | MET | `scoring.ts:52-67` — only findings overlapping a forbidden location count; `scoring.test.ts:79` is the `users.ts:3` / `users.ts:40` fixture, passing with `fp = 0`, and `:93` is its mirror at `users.ts:2-4` failing with `fp = 1`. Deviation 1 does not weaken it: the forbidden location is real, so the case is genuinely violable | |
| AC-47 | MET | `aggregate.ts:11-13` returns `null` at a zero denominator; client renders `—` in all three surfaces: `EvalsTab.tsx:35-37`, `EvalOverview.tsx:22-24` (also used by `AgentEvalView` via `:24`), `RunCompare.tsx:29`; cost `—` at `AgentEvalView.tsx:340` | |
| AC-48 | MET | `service.ts:199-224` starts one batch per enabled agent that has cases and skips one already running with its reason; `eval.it.test.ts:480` asserts both; the control is `EvalOverview.tsx:105-113` | the spend estimate attached to this control is AC-64's problem, below |
| AC-49 | MET | `aggregate.ts:28` drops every `errored` case before any sum; `aggregate.test.ts:74,88` (one of eight, then all eight) | |
| AC-50 | MET | `EvalsTab.tsx:168-175` `"{ran} of {total} ran"`; `AgentEvalView.tsx:220-227` the same over `traces_produced` / `cases_total` | |
| AC-51 | MET | `scoring.ts:77` — `passed = fn === 0`, whatever else the case produced; `scoring.test.ts:142` | |
| AC-52 | MET | `FindingCard.tsx:142-144` `Learn` and `:154-162` `Reply to author`, both `disabled` with a non-empty `title` from `prReview.json` (`learnDisabled`, `replyDisabled`) | |
| AC-53 | MET | `EvalCaseEditor.tsx:280-301` `Files` renders a list plus a `<pre>`; `:302-316` `PR meta` renders three `FormField`s wrapping read-only `<div>`s, no input element | |
| AC-54 | MET | `EvalCaseEditor.tsx:157-180` — the trial fires from the save mutation's `onSuccess` when `runOnSave`; `:184-187` routes that save through the confirmation first | |
| AC-55 | MET | `EvalCaseEditor.tsx:335-348` — `[...current, EMPTY_FINDING]`, the existing entries untouched; asserted at `EvalCaseEditor.test.tsx:122` | |
| AC-56 | MET | `AgentEvalView.tsx:78-81` — the window filters `trend` (the chart's points) only; `runList` (`:57`) feeds the table `:304` and the selection `:90` unfiltered; asserted at `AgentEvalView.test.tsx:193` | |
| AC-57 | MET | `RunCompare.tsx:89-91` — `Promote v{newer.agent_version}`, `disabled`, `title` = `compare.promoteDisabled` | |
| AC-58 | MET | `AgentEditor/constants.ts:14-21` — `Config, Skills, Context, Evals, Stats, CI` in that order, `ci` `disabled: true`; rendered `AgentEditor.tsx:19-34` | |
| AC-59 | MET | `EvalsTab.tsx:187` `casesBadge` over `caseList.length`; `AgentEvalView.tsx:139` over `runList.length` / `casesTotal` (server's `cases_total`, `service.ts:376`); `RunCompare.tsx:83` over the passed `casesTotal`. Three tests additionally assert the literal `20` never appears | |
| AC-60 | MET | four controls, each `disabled` with a stated `title`: `CI` tab `AgentEditor.tsx:32-33`; `Learn` `FindingCard.tsx:142`; `Reply to author` `:158-159`; `Promote` `RunCompare.tsx:89` | |
| AC-61 | MET | `server/package.json:19`; my run: `RUN v2.1.9 … Test Files 2 passed (2) / Tests 29 passed (29)`. It exercises AC-15 (`scoring.test.ts:31-63`) and AC-18…AC-21 (`aggregate.test.ts:37,42,62,67`) | I did not physically disconnect the network; the offline property is evidenced structurally — `pure/` imports only `zod`, `@devdigest/shared` and siblings, so there is no I/O edge to take |
| AC-62 | MET | `service.ts:171-193` awaits one case and never creates a batch; `runner.ts:198-210` writes `batchId: null`; `eval.it.test.ts:432-461` asserts `batch_id` null, run history unchanged at length 1, and one `batch_id IS NULL` row in the table | |
| AC-63 | PARTIALLY MET | **Server: MET** — `repository.ts:386-392` is an unfiltered `ORDER BY ran_at DESC`, and `eval.it.test.ts:459-460` proves `GET /agents/:id/eval-cases` returns the trial as `last_run` after a set run. **Client: not MET on either surface the criterion names.** The case row is fed from `EvalsTab.tsx:87-89` — the newest batch's per-case rows overlaid with a component-local `trials` map (`:71`) — and never reads the server's `last_run`; on remount `trials` is empty and the row shows the older set-run result. The case editor's result panel reads `trial ?? lastRun` (`EvalCaseEditor.tsx:132`) and `EvalsTab.tsx:288-295` passes no `lastRun` at all | **code unfinished.** The server already serves the correct value; the client discards it. Deviation 2 adjudicated: as shipped, a trial's result does not survive a remount on the case row, and never appears in the editor |
| AC-64 | PARTIALLY MET | Five of six spend paths state an exact count through the one shared component: `Run all evals` `EvalsTab.tsx:206` (`caseList.length`), `Play` `:232` (1), `Run eval` `AgentEvalView.tsx:109` (`casesTotal`), `Run case` `EvalCaseEditor.tsx:218` (1), `Run on save` `:185` (1). **`Run all agents` states a lower bound**: `EvalOverview.tsx:83` sums `a.latest?.cases_total ?? 0`, so an agent with cases but no run contributes zero — the state immediately after S16 authoring, where the dialog would read "0 model calls" for a click that makes N | **code unfinished.** The overview contract carries a case count only inside `latest` (`eval-ci.ts:163-170`); the fix is a per-agent `cases_total` on `EvalOverviewRow`, which the repository already computes (`repository.ts:226 caseCountsByAgent`, currently unused by `overview()`) |
| AC-65 | MET | `service.ts:279,306` sets `existing_case_id`; `eval.it.test.ts:277-293`; `FindingCard.tsx:66-67` reads it and `:89-94` renders a marker in the header badge row beside the status badge | Deviation 3 adjudicated: driving the marker off `EvalCaseSeed.existing_case_id` satisfies the criterion. One narrowing worth recording: the seed query is `enabled: expanded` (`:66`), so the marker appears once the finding is expanded, not while collapsed |
| AC-66 | MET | `FindingCard.tsx:150` — activating the action with `existingCaseId` set opens the notice at `:165-183` ("This finding already has an eval case. Creating another makes a second case with a colliding name.") with `Create another` / `Cancel`, before the editor opens | |
| AC-67 | MET | `RunCompare.tsx:127` renders `compare.comparability` = "Both runs used the same case set and the same model, so the deltas are comparable — but model output varies between identical calls, so a small change is not proof of a regression." | |

## Verification commands

| Package | Command | Result |
|---|---|---|
| repo | `./scripts/check-shared-sync.sh` | pass |
| server | `pnpm verify:l06` | pass — 2 files / 29 tests |
| server | `pnpm typecheck` | pass |
| server | `pnpm arch:check` | pass — 0 violations |
| server | `pnpm arch:check:core` | pass — 0 violations |
| server | `pnpm exec vitest run eval.it.test` | pass — 1 file / 15 tests (testcontainers applied the full migration chain) |
| server | S3 regex probe (`node -e …`) | 9/9 expected booleans |
| server | `git diff --stat server/.dependency-cruiser-known-violations.json` | empty — baseline unchanged |
| client | `pnpm typecheck` | pass |
| client | `pnpm exec vitest run EvalsTab EvalCaseEditor EvalRunConfirm EvalOverview AgentEvalView RunCompare diffTokens eval-run-state AgentEditor FindingCard` | pass — 13 files / 114 tests |
| server | `pnpm test` | cited from the collected gate output (65 files / 633 tests) — not re-run by me |
| client | `pnpm test` | cited from the collected gate output (69 files / 488 tests) — not re-run by me |
| server | `pnpm db:generate` (S2a/S2b "No schema changes") | **not run** — it writes files on drift; rule 1 forbids mutating the repo |
| human | `pnpm db:migrate` | not run — human's step, still pending |

```
### verify:l06
 ✓ src/modules/eval/pure/aggregate.test.ts (11 tests) 2ms
 ✓ src/modules/eval/pure/scoring.test.ts (18 tests) 3ms
 Test Files  2 passed (2)
      Tests  29 passed (29)

### arch:check
✔ no dependency violations found (232 modules, 805 dependencies cruised)

### arch:check:core
✔ no dependency violations found (25 modules, 55 dependencies cruised)

### S3 regex probe (from.path AND NOT from.pathNot)
no-domain-io src/modules/eval/pure/scoring.ts true
no-domain-io src/modules/eval/runner.ts false
no-domain-io src/modules/eval/repository.ts false
no-domain-node-builtins src/modules/eval/pure/scoring.ts true
no-domain-node-builtins src/modules/eval/runner.ts false
no-domain-node-builtins src/modules/eval/repository.ts false
no-app-to-schema src/modules/eval/pure/scoring.ts true
no-app-to-schema src/modules/eval/runner.ts true
no-app-to-schema src/modules/eval/repository.ts false

### eval.it.test.ts
 ✓ test/eval.it.test.ts (15 tests) 3595ms
 Test Files  1 passed (1)
      Tests  15 passed (15)

### client, the 13 eval-touching files
 Test Files  13 passed (13)
      Tests  114 passed (114)

### check-shared-sync.sh
vendor/shared in sync

### server purity grep — grep -rnE "from '(\.\./)+db/|drizzle-orm|fastify|node:" src/modules/eval/pure/
(no output, exit 1)

### grep -rn "groundFindings" src/modules/eval/
(no output, exit 1)

### grep -c evalRunBatches server/src/db/schema.ts
2
```

## Unrequested work

Three modified paths appear in no step's file list:

- `server/INSIGHTS.md` — modified. Not named by any step, though the root `CLAUDE.md`
  instructs appending insights on finishing work in a module. Recorded, not faulted.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx`
  and `.../ReviewRunAccordion/ReviewRunAccordion.test.tsx` — modified. Neither is in S12's
  file list. Both mount `FindingCard`, which gained a `fetch`-backed hook in S12, so these
  are almost certainly the `client/INSIGHTS.md:388` stub-chain repair the plan predicted in
  S12's own Test paragraph; the plan simply did not name the files.
- `repository.ts:226 caseCountsByAgent` is written and called by nothing — dead code today,
  and (see AC-64) the exact thing the overview's spend estimate needs.

## Plan defects

- **S5's `must_not_flag` sourcing rule describes a contract that was never shipped.** It
  says the forbidden location "comes from `seeded_from` when present and from the first
  entry of `expected_output` otherwise", but the shipped `EvalCaseSeededFrom`
  (`knowledge.ts:82-85`) is `{finding_id, disposition}` with no location, so the first
  branch is unreachable. Track B's deviation is the correct resolution; the plan text is
  superseded.
- **S13's departure note names `BarRow` from `@devdigest/ui`** as the way to reproduce the
  mockup's `MiniBar`. The shipped local `MetricBar` is a justified substitution, recorded
  in the source.
- **S14's element row 15 names `icon="GitCompare"`**, which does not exist in
  `client/src/vendor/ui/icons.tsx` — a read-only vendored file. `GitMerge` was substituted.
- **S13/S14/S15's DoD requires a screenshot comparison that no agent can perform**, which
  the plan itself states in §5. Those halves are unverified here and stay with the human.

## What I could not verify

- **AC-8 (S16) and AC-33 (S17)** — human-run, deliberately not executed, dev database
  unmigrated. `CANNOT VERIFY`, not `NOT MET`.
- **Every appearance claim.** I read the mockup sources as text and checked element
  presence, labels, ordering and nesting. Spacing, colour, alignment and fidelity to the
  four PNG screenshots are unchecked, and the S13/S14/S15 screenshot DoDs are outstanding.
- **The "No schema changes, nothing to migrate" half of S2a/S2b's DoD** — `pnpm db:generate`
  writes files when it finds drift, so I did not run it. The `0020` SQL contents and the
  clean testcontainers migration run are the substitute evidence.
- **`server pnpm test` and `client pnpm test` in full** — cited from the gate output
  supplied with the task, per its instruction not to re-run them. Every eval-specific
  suite inside them was re-run by me.
- **The live stack** — nothing here was exercised against a running API or a migrated
  dev database.

## Summary line

63 MET / 2 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY (criteria) ·
14 MET / 2 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY (steps) ·
3 MET / 1 PARTIAL / 1 CANNOT VERIFY (definition of done)
