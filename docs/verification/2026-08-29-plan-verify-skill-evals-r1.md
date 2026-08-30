# Plan Verification — track F (skill evals)

## Plan
`docs/plans/2026-08-29-eval-pipeline.md`, Status: approved (amended 2026-08-29, track F added)

**Scope:** steps `F1`–`F9` and the thirteen rows of the `## 0` "Track F — skill evals"
requirement table. `S1`–`S17` were verified in
`docs/verification/2026-08-29-plan-verify-eval-pipeline-r1.md` and `-r2.md` and are not
re-examined here.

Track F has **no `AC-` ids** and none are invented: the requirement rows below are keyed
`RQ-1`…`RQ-13` in the order of the plan's own table, and their Note names the verbatim
quote's stater. F7's and F8's element checklists are verified row by row (`F7-C1`…`F7-C21`,
`F8-C1`…`F8-C17`) because the frames they were transcribed from no longer exist — that
table is the entire design record.

**One limit stated rather than papered over:** I cannot see an image. Every checklist row
below is a verdict about an **element's presence, label and nesting in the component
source**. Nothing here is a verdict about appearance, spacing or visual fidelity, and no
such verdict may be attributed to me.

## Verdict table — steps

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| F1 | MET | `server/src/db/migrations/0021_far_harry_osborn.sql` is exactly `ALTER TABLE "eval_runs" ADD COLUMN "recall_without" double precision;` and nothing else; `meta/_journal.json:156` carries the `0021_far_harry_osborn` tag; `server/src/db/schema/eval.ts:93` `recallWithout: doublePrecision('recall_without')`; contracts at `server/src/vendor/shared/contracts/eval-ci.ts:59` (`recall_without: z.number().nullish()`), `:265`, `:274`, `:286`, `:297`; `diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts` → identical | `.nullish()` as required, not `.nullable()`/`.default()`. The DoD's "a second `pnpm db:generate` prints *No schema changes*" was **not** run — `db:generate` writes files and hard constraint 1 forbids it. See `## What I could not verify`. |
| F2 | MET | `pure/skill-scoring.ts:27-31` (`skillCaseRecall`), `:74-88` (`skillCaseVerdict`, rule B); `pure/diff-builder.ts:118-165` (`buildUnifiedDiff`); `pnpm verify:l06` → 4 files / 51 tests passed, `skill-scoring.test.ts` 13 + `diff-builder.test.ts` 9; `grep -rnE "from '(\.\./)+db/\|drizzle-orm\|fastify\|node:" src/modules/eval/pure/` returns nothing | `skillCaseVerdict` never calls `aggregateRun` (C1 kept separate). Reference rows 2 and 3 are both present and named: `skill-scoring.test.ts:69`, `:78`, plus `:96` "rows 2 and 3 differ ONLY in the without-run, and that alone flips the mark". |
| F3 | PARTIALLY MET | present: `platform/container.ts:116-117` `get skillsRepo()`; `service.ts:240,256,282,308` the four skill siblings; `:348-353` `resolveAgentForSkill`; `:641-651` `buildOrRefuse` refuses an empty diff with 400; `repository.ts:237-243` `skillIdsWithCases`, `:89`/`:429` `recallWithout`; the shipped agent literals survive at `service.ts:68,84,141,549` | **missing: "taking the lowest `order`".** `resolveAgentForSkill` takes `linked.find(l => l.linkEnabled && l.enabled)` over `listLinkedAgents`, which orders by **agent name** (`modules/skills/repository.ts:234 orderBy(asc(t.agents.name))`) and does not project `agent_skills.order`. Documented in `service.ts:340-347`. **Superseded plan, not unfinished code** — the plan named a seam that cannot deliver `order` without editing another module's repository, which F3 forbids. The two-sided enabled test is implemented exactly as asked. |
| F4 | MET | `runner.ts:356-509` `executeSkillCase`; the two calls are `runSide([skillBody])` (`:415`) and `runSide([])` (`:416`), one `runSide` body (`:371-412`) whose only variable is `...(skills.length > 0 ? { skills } : {})` at `:389` — same `systemPrompt`, `model`, `strategy`, `diff`, `prDescription`, `sessionId`, `correlationId`, and one `llm` resolved once by the caller (`service.ts:326-327`); the skill body is read once before both calls (`service.ts:313`, passed as `skillBody`); `skillCaseVerdict` called once over both sides (`:437`); `batchId: null` (`:484`); `recall` = with side, `recallWithout` = without side (`:487-488`); `costUsd = sumCosts([...])` (`:483`) | **Coordinator change 1 confirmed closed:** `runner.ts:466-471` persists `verdict.reason` as `failureReason` when the outcome is `failed`, and the client renders it (`SkillEvalCaseRow.tsx:87,108-110,131`). **Change 2 confirmed:** `CASE_TIMEOUT_MS` at `:77`, `withCaseTimeout` at `:80-88`, applied **inside** `runSide` (`:381`) so each SIDE is capped separately. The DoD's `git diff runner.ts` check is not obtainable — the file is untracked (`git status` shows `?? server/src/modules/eval/`) — and `executeOneCase`/`executeBatch` **were** changed afterwards by the coordinator (`:160-182`, `:259`). Superseded plan; it does not touch `executeSkillCase`. |
| F5 | MET | four routes at `routes.ts:231`, `:240`, `:256`, `:267`, documented in the header block at `:39-42`; `SPEND_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } }` at `:97` applied to the run route at `:267`; 422 for no enabled agent at `service.ts:315-320`; the shipped in-flight guard reused at `service.ts:325`. `pnpm exec vitest run skill-eval.it.test` → **17 tests passed** (output below) | Every case the plan enumerates is present by name in the suite, including the `100% / 100%` case (`test/skill-eval.it.test.ts:239`) asserting both halves of `server/INSIGHTS.md:210-233`. |
| F6 | MET | `client/src/lib/hooks/keys.ts:36-37` `skillEvalCases` / `skillEvalCase`; `hooks/eval.ts:205,221,239,250,262` the five hooks; `:38` `const asArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])`; `grep -n "queryKey: \[" client/src/lib/hooks/eval.ts` returns nothing (every key from the factory) | `eval-run-confirm/` reused unchanged and passed the doubled count by both consumers. |
| F7 | PARTIALLY MET | 20 of 21 checklist rows MET (below); `pnpm exec vitest run SkillEditor EvalsTab` → 6 files / 65 tests passed, of which `SkillEditor/_components/EvalsTab/EvalsTab.test.tsx` 23 | The one shortfall is checklist row 20's "replaces … 15": see `F7-C20`. **Unfinished code**, small. |
| F8 | MET | all 17 checklist rows MET (below); `pnpm exec vitest run src/components/skill-eval-case-editor` → 20 tests passed | The DoD's `git diff --stat client/src/components/eval-case-editor/` is empty, but **vacuously** — that directory is untracked, so git cannot testify. Its mtimes (19:45/19:46) are *later* than the skill editor's (17:40); per the invocation that is the coordinator's post-F8 appearance rework, not F8. I cannot separate the two from the working tree. |
| F9 | CANNOT VERIFY | — | **Human-run and deliberately not executed.** The delivered case set lives only in a database and the demonstration is a screen the human reads. Never `NOT MET`. |

## Verdict table — the `## 0` track-F requirement rows

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| RQ-1 "…running the same case **twice** against the same diff: once with that skill's body in the prompt, once without" | MET | `test/skill-eval.it.test.ts:207-221` asserts `completeStructured` calls `toHaveLength(2)`, exactly one containing `SKILL_MARKER` and exactly one not; the run passed | human, decision 1. Covered by F4, and the implementation at `runner.ts:415-416` differs **only** in the `skills` key. |
| RQ-2 "the case's pass/fail and its `recall` come from the run **with** the skill; `Without skill` is the same recall recomputed from the run **without** it" | MET | `runner.ts:431-432` computes `skillCaseRecall` per side with one function; `:487-488` persists `recall` = with, `recallWithout` = without; `test/skill-eval.it.test.ts:234-236` asserts `recall 1 / recall_without 0` | human, decision 2, superseded for `MUST FIND` by the ruling in RQ-3 — which is exactly how `runner.ts:437` behaves. |
| RQ-3 `MUST FIND` passes only when present **with** and absent **without**; `MUST NOT FLAG` on the with-run alone | MET | `pure/skill-scoring.ts:76-88`: `must_not_flag` returns on `withScore.passed` alone without reading `withoutScore`; `must_find` returns `passed: true` only when `withScore.passed && !withoutScore.passed`. Proven end-to-end at `test/skill-eval.it.test.ts:227` (passed) and `:239` (failed at 100%/100%), and in ring 0 at `skill-scoring.test.ts:69`, `:78`, `:96` | human, "как в эксперименте". This is the pair that carries the whole rule and it is present on both levels. |
| RQ-4 "the first enabled agent the skill is linked to, and **that agent's name is visible on screen**" | MET | `service.ts:348-353` requires both `linkEnabled` and `enabled`; `test/skill-eval.it.test.ts:329` (first enabled wins, proven at the prompt) and `:350` (disabled link and disabled agent both skipped); the name is rendered at `EvalsTab.tsx:162-167` via `agentLine: "Runs on {agent}"` and asserted by `EvalsTab.test.tsx:353` | human, decision 3. The verbatim quote is satisfied; the plan's *disambiguation* of "first" as lowest `order` is not — see F3. |
| RQ-5 "one case is **two** paid model calls; a four-case set is eight" | MET | `EvalsTab.tsx:29` `CALLS_PER_CASE = 2`, `:141` `calls: caseList.length * CALLS_PER_CASE` for the set, `:199` `calls: CALLS_PER_CASE` for one row; `SkillEvalCaseEditor.tsx:221` for a save with `Run on save`; asserted at `EvalsTab.test.tsx:358` ("states 2 × N model calls"), `:367` ("states 2"), and `SkillEvalCaseEditor.test.tsx:274`, `:286` | human, decision 4. |
| RQ-6 Screen A: `Evals` appended last; **no metric strip** | MET | `SkillEditor/constants.ts:10` `VALID_TABS = ["config","preview","context","stats","versions","evals"]` and `:21` the sixth `TABS` entry; the stale `(no Evals)` header comment is gone. No RECALL/PRECISION/CITATION element exists anywhere in `EvalsTab.tsx` (whole file read); asserted negatively at `EvalsTab.test.tsx:339` | reference, screen A. |
| RQ-7 Screen A header: `Eval cases`, `3/4 passing`, `4 cases`, `▷ Run all evals`, `+ New eval case` | MET | `EvalsTab.tsx:109`, `:111-116`, `:118`, `:134-148`, `:151-158`; strings at `messages/en/eval.json` `skillEvalsTab.casesHeading/passingBadge/casesBadge/runAll/newCase` | reference, screen A. The badge reads `{passed}/{ran}` (cases that produced a result), not `passed/total`. |
| RQ-8 Screen A case row: icon, name, expectation badge, the second line, severity·category, `▷ Run` `✎ Edit` trash | MET | `SkillEvalCaseRow.tsx:120` icon, `:123-125` monospace name, `:126-128` badge, `:130` second line, `:135-137` severity·category on `must_find` rows only, `:139-141` the three `IconBtn`s in that order | reference, screen A. |
| RQ-9 Screen B: `Code` \| `PR meta`; `New file` \| `Modified file`; labelled `Before`/`After`; collapsed `› Preview generated diff` | MET | `SkillEvalCaseEditor.tsx:318-319`, `:328-336`, `:352-365`, `:384-392` (`aria-expanded={previewOpen}`, initial `false`) | reference, screen B. |
| RQ-10 "The case's diff is authored as Before/After and **generated** — not pasted" | MET | `pure/diff-builder.ts` builds it; `service.ts:641-651` builds on create/update and refuses a zero-file result with 400; the browser posts `/eval-cases/preview-diff` and renders the **server's** bytes (`SkillEvalCaseEditor.tsx:393-399`). Round trip proven: `diff-builder.test.ts` 9 tests through `parseUnifiedDiff` — including `:90` "identical Before and After build nothing, which parses to zero files", `:99` last line without trailing newline, `:111` content lines starting with `--`/`@@`, `:143` two hunks — all green in `verify:l06`, and `test/skill-eval.it.test.ts:439`/`:490` end-to-end | reference + human. The hunk-header trap is closed: `diff-builder.ts:150` always emits `@@ -a,b +c,d @@`, and `:127-133` always puts the real path on `+++ b/<path>`. |
| RQ-11 Screen B: `Expected output` + `✓ valid JSON` + `+ Finding skeleton`, over an `Actual output` panel | MET | `SkillEvalCaseEditor.tsx:423` heading, `:424-430` valid/invalid badge, `:446` skeleton button, `:452` JSON editor, `:462-471` the `Actual output` panel rendering `Never run yet` or `JSON.stringify` of `{with, without}`; asserted at `SkillEvalCaseEditor.test.tsx:242`, `:248`, `:257` | reference, screen B. |
| RQ-12 Screen B footer: `Run on save` left; `Cancel`, `▷ Run case` (`Running…`), `Save` | MET | `SkillEvalCaseEditor.tsx:251-253`, `:256`, `:261-270` (`runCase.isPending ? t("running") : t("runCase")`), `:279` | reference, screen B. |
| RQ-13 "linked skills change a finding's CONTENT, not the finding COUNT" — the set needs a policy-dependent defect; F7 renders the `100% / 100%` account | PARTIALLY MET | the F7 half is MET: `EvalsTab.tsx:183-186` renders the standing account (`twoSidedNote`), and `SkillEvalCaseRow.tsx:108-110,131` renders the server's own `reason` on any non-passing row from `failure_reason` — never re-derived in the browser; asserted at `EvalsTab.test.tsx:265`, `:270`, `:276` | the F9 half — the **delivered** set containing a policy-dependent case, and the recorded percentages — is human-run and `CANNOT VERIFY`. Not a code defect. |

## Verdict table — F7 element checklist (screen A)

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| F7-C1 skill header unchanged | MET | `SkillEditor.tsx` carries only two track-F changes (`:13` import, `:49` render); the header above the tab bar is untouched shipped code | |
| F7-C2 `Evals` 6th, last | MET | `constants.ts:10`, `:21`; `SkillEditor.test.tsx` (4 tests) green | |
| F7-C3 no metric strip | MET | no metric card in `EvalsTab.tsx` (491-line file read in full); `EvalsTab.test.tsx:339` | absence asserted, which is the only way an absence can be |
| F7-C4 `Eval cases` heading, left | MET | `EvalsTab.tsx:109` | |
| F7-C5 `P/R passing` badge, green/amber | MET | `EvalsTab.tsx:111-116` — `var(--ok)` when `passed === ran`, else `var(--warn)` | |
| F7-C6 muted `N cases` | MET | `EvalsTab.tsx:118`, plural-aware message | real count, from `caseList.length` |
| F7-C7 `Run all evals`, Play, right, via `EvalRunConfirm` at 2×N | MET | `EvalsTab.tsx:134-148`, confirm at `:141` | |
| F7-C8 `New eval case`, primary, Plus, last | MET | `EvalsTab.tsx:151-158` | |
| F7-C9 resolved agent name beside the header | MET | `EvalsTab.tsx:162-167` | |
| F7-C10 status icon incl. a distinct **errored** state | MET | `SkillEvalCaseRow.tsx:55-62` — `CheckCircle`/`XCircle`/`AlertTriangle`/`Dot`, plus `data-status` at `:118`; `EvalsTab.test.tsx:284` | errored is amber `AlertTriangle`, not a red cross |
| F7-C11 case name, monospace | MET | `SkillEvalCaseRow.tsx:123-125` (`className="mono"`) | |
| F7-C12 expectation badge, uppercase | MET | `SkillEvalCaseRow.tsx:126-128`; `EvalsTab/styles.ts:77` `textTransform: "uppercase"` | message text is lowercase and uppercased by CSS |
| F7-C13 second line `expected N finding, got M · recall X% · With skill A% / Without skill B%` | MET | `SkillEvalCaseRow.tsx:95-101`; `eval.json` `skillEvalsTab.resultLine` matches that string exactly | `## 2d` C2 divergence is deliberate and asserted for internal consistency (`EvalsTab.test.tsx:237`) |
| F7-C14 severity·category right, absent on MUST NOT FLAG | MET | `SkillEvalCaseRow.tsx:135-137` gated on `positive`; `EvalsTab.test.tsx:247` | |
| F7-C15 `IconBtn "Play"` first | MET | `SkillEvalCaseRow.tsx:139` | present and ordered; its no-agent behaviour is C20 |
| F7-C16 `IconBtn "Edit"` second | MET | `SkillEvalCaseRow.tsx:140` | |
| F7-C17 `IconBtn "Trash"` last, with the history-loss confirmation | MET | `SkillEvalCaseRow.tsx:141`; `EvalsTab.tsx:226-262`, `deleteHistoryNote` = "Its recorded run history is deleted with it and cannot be restored."; `EvalsTab.test.tsx:417` | |
| F7-C18 `Never run yet` replaces the second line | MET | `SkillEvalCaseRow.tsx:102-104`; `EvalsTab.test.tsx:324` | |
| F7-C19 `EmptyState` on zero cases | MET | `EvalsTab.tsx:188-189`; `EvalsTab.test.tsx:331` | |
| F7-C20 no-agent notice **replaces 7, 9 and 15**; render no run control | **PARTIALLY MET** | 7 and 9 are replaced: `EvalsTab.tsx:133` suppresses `Run all evals` when `noAgent`, `:162` renders no agent line, `:169-177` renders the notice — `EvalsTab.test.tsx:400` asserts `Run all evals` is *not in the document*. **15 is not replaced:** `SkillEvalCaseRow.tsx:139` still renders the row's Play `IconBtn` and merely passes `onClick={disabled ? undefined : onRun}`, and `EvalsTab.test.tsx:407` confirms by clicking it and asserting no request fires | **Unfinished code.** The row control is rendered, looks identical to a live one, and silently does nothing on press — which is what the checklist row was written to prevent. `src/vendor/ui/primitives/IconBtn.tsx:4-18` has no `disabled` prop and is read-only third-party code, so the fix is to not render the button (or to render a stated reason) in the no-agent case, as the header control already does. |
| F7-C21 the `100% / 100%` account + per-row reason from `skillCaseVerdict` | MET | `EvalsTab.tsx:183-186`; `SkillEvalCaseRow.tsx:17-32` (the six reason codes), `:87`, `:108-110`, `:131`; `eval.json` `skillEvalsTab.reason.*`; `EvalsTab.test.tsx:265`, `:270`, `:276` | rendered from the server's `failure_reason`, never re-derived — the single-predicate rule holds |

## Verdict table — F8 element checklist (screen B)

| Item | Verdict | Evidence |
|---|---|---|
| F8-C1 title `Eval case · <name>` | MET | `SkillEvalCaseEditor.tsx:245`; `eval.json` `skillCaseEditor.caseTitle`; test `:153` |
| F8-C2 `Input` heading | MET | `:315` |
| F8-C3 tabs `Code` \| `PR meta` — two, not three | MET | `:318-319`; test `:158` asserts exactly two |
| F8-C4 sub-tabs `New file` \| `Modified file` | MET | `:328-336`; test `:166` |
| F8-C5 labelled `Before` textarea | MET | `:352-357` (`FormField` + `aria-label`); test `:172` |
| F8-C6 labelled `After` textarea, below | MET | `:361-365`; test `:172` |
| F8-C7 `New file` → one textarea, no Before | MET | `:373-377`; test `:185` "drops the Before area on a new file" |
| F8-C8 `› Preview generated diff`, collapsed, server-built | MET | `:384-392` (`aria-expanded`, initial `false`), `:393-399` renders `preview.data?.diff`; tests `:200`, `:207` |
| F8-C9 `Expected output` heading | MET | `:423` |
| F8-C10 `✓ valid JSON` badge / invalid state disabling `Save` | MET | `:424-430`; tests `:219`, `:224` |
| F8-C11 `+ Finding skeleton` | MET | `:446`; test `:231` asserts the existing entries survive |
| F8-C12 JSON editor | MET | `:452` |
| F8-C13 `Actual output` panel: `Never run yet`, then `{with, without}` | MET | `:462-471`; tests `:242`, `:248`, `:257` (one side failed) |
| F8-C14 `Run on save` toggle, far left | MET | `:251-253`, default `false` at `:130`; test `:266` |
| F8-C15 `Cancel`, ghost | MET | `:256` |
| F8-C16 `Run case` / `Running…` | MET | `:261-270` |
| F8-C17 `Save`, primary, last | MET | `:279` |

## Verification commands

| Package | Command | Result |
|---|---|---|
| server | `pnpm verify:l06` | 4 files / 51 tests passed — includes `skill-scoring.test.ts` (13) and `diff-builder.test.ts` (9), no network, no DB |
| server | `pnpm exec vitest run skill-eval.it.test` | 1 file / 17 tests passed (Docker available) |
| server | `grep -rnE "from '(\.\./)+db/\|drizzle-orm\|fastify\|node:" src/modules/eval/pure/` | no hits |
| repo | `diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts` | identical |
| client | `pnpm exec vitest run SkillEditor EvalsTab` | 6 files / 65 tests passed |
| client | `pnpm exec vitest run src/components/skill-eval-case-editor` | 1 file / 20 tests passed |
| client | `grep -n "queryKey: \[" src/lib/hooks/eval.ts` | no hits |

Cited from the gate output collected by the coordinator, not re-run:
`./scripts/check-shared-sync.sh` in sync · `server pnpm typecheck` clean ·
`server pnpm arch:check` 0 violations (236 modules, 822 dependencies) ·
`server pnpm test` 68 files / 673 tests · `server pnpm verify:l06` 4 files / 51 tests ·
`client pnpm typecheck` clean · `client pnpm test` 71 files / 544 tests.

```
$ cd server && pnpm verify:l06
 ✓ src/modules/eval/pure/aggregate.test.ts (11 tests) 2ms
 ✓ src/modules/eval/pure/skill-scoring.test.ts (13 tests) 3ms
 ✓ src/modules/eval/pure/diff-builder.test.ts (9 tests) 3ms
 ✓ src/modules/eval/pure/scoring.test.ts (18 tests) 3ms
 Test Files  4 passed (4)
      Tests  51 passed (51)

$ cd server && pnpm exec vitest run skill-eval.it.test
 ✓ test/skill-eval.it.test.ts (17 tests) 2460ms
 Test Files  1 passed (1)
      Tests  17 passed (17)

$ cd client && pnpm exec vitest run SkillEditor EvalsTab
 ✓ .../SkillEditor/SkillEditor.test.tsx (4 tests) 111ms
 ✓ .../SkillEditor/_components/EvalsTab/EvalsTab.test.tsx (23 tests) 331ms
 ✓ .../AgentEditor/_components/EvalsTab/EvalsTab.test.tsx (15 tests) 377ms
 Test Files  6 passed (6)
      Tests  65 passed (65)

$ cd client && pnpm exec vitest run src/components/skill-eval-case-editor
 ✓ src/components/skill-eval-case-editor/SkillEvalCaseEditor.test.tsx (20 tests) 274ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

## The three things the invocation asked me to check specifically

1. **The two engine calls differ ONLY in `skills`.** Confirmed. `runner.ts:371-412` is one
   `runSide(skills: string[])` closure called twice (`:415`, `:416`); every other argument
   to `reviewPullRequest` is computed **outside** it — `agent.systemPrompt`, `agent.model`,
   `agent.strategy`, the parsed `diff` (`:366`), `prDescription` (`:367`), `sessionId`,
   `correlationId`, and the single `llm` the service resolved once (`service.ts:326`). The
   only expression inside the call that reads `skills` is
   `...(skills.length > 0 ? { skills } : {})` at `:389`. The `withCaseTimeout` label at
   `:392` differs by side but is a log string, not engine input. No second difference found.
2. **`skillCaseVerdict` implements rule B and its tests cover rows 2 and 3.** Confirmed on
   both levels: `skill-scoring.test.ts:69` (row 2, 100%/0%, passes) and `:78` (row 3,
   100%/100%, fails), plus `:96` which asserts the pair explicitly; and
   `skill-eval.it.test.ts:227` / `:239`, the same pair through the real route chain against
   Postgres. `must_not_flag` never reads `withoutScore` (`skill-scoring.ts:76-80`), asserted
   at `skill-scoring.test.ts:116` and `skill-eval.it.test.ts:256`.
3. **The generated diff round-trips through `parseUnifiedDiff`.** Confirmed, and the
   hunk-header trap is closed by construction: `diff-builder.ts:150` emits an
   `@@ -a,b +c,d @@` header for every hunk, `:127-133` always puts the real path on
   `+++ b/<path>` (with `--- /dev/null` only on the `---` line for `mode: 'new'`), and
   `:167` deliberately omits the trailing newline with the reason stated. `''` is returned
   for an unchanged file so it parses to **zero files** rather than to a hunkless file, and
   `service.ts:641-651` refuses that at save time with 400. Nine round-trip tests green.

## Unrequested work

Two things in the working tree that no track-F step asked for. Neither is a track-F defect;
both are recorded because rule 5 of my brief is to diff the change set against the plan.

- `Oleksandr_Yudaiev_hw6.mov` is untracked at the repository root — the reference screencast
  `## 2d` was transcribed from. No plan step puts a video in the repository; if it is
  committed it will land in the PR.
- Post-F8 edits to files track F declared out of scope or shipped:
  `client/src/components/eval-case-editor/` (mtimes 19:45/19:46 vs the F8 component's 17:40)
  and `server/src/modules/eval/runner.ts`'s `executeOneCase`/`executeBatch`
  (`runner.ts:160-182`, `:259`). The invocation attributes both to the coordinator's later
  appearance/robustness rework, which is outside track F's steps. I verified they do not
  break a track-F requirement: `executeSkillCase` is untouched by them, and the new
  cross-agent trial feed filters `ownerKind = 'agent'` (`repository.ts:405`), so skill runs
  still enter no agent history — the decision the `## 2d` "no batch row" ruling rests on.

## Plan defects

- **F3 asks for the lowest `agent_skills.order`, through a seam that cannot supply it.** The
  plan cites `modules/skills/repository.ts:222` as the reader, but `listLinkedAgents` orders
  by `agents.name` and does not project `order` (`:234`). Delivering the plan's words would
  have required editing another module's repository, which the same step forbids. The
  implementation chose the seam and documented the departure at `service.ts:340-347`; the
  plan was never amended to say so. Fix the plan, not the code.
- **F4's and F8's Definition-of-done commands are `git diff`s over untracked paths**
  (`server/src/modules/eval/`, `client/src/components/eval-case-editor/`). Both pass
  vacuously and prove nothing. A "this file did not change" check needs a tracked baseline.
- **F1's "a second `pnpm db:generate` prints *No schema changes*"** is a DoD item that
  cannot be executed by a read-only verifier — `db:generate` writes files. It is a fine
  check for the implementer and not a verifiable one afterwards.

## What I could not verify

- **F9 in its entirety** — human-run by design. The delivered case set lives only in the dev
  database, and the demonstration (≥ 4 cases, at least one green `MUST FIND` row at
  `100% / 0%`, the two percentages of every row recorded, the agent name on the tab) is a
  screen the human reads. `CANNOT VERIFY`, never `NOT MET`.
- **F1's second `pnpm db:generate`** and **`pnpm db:migrate`** — both write; hard constraint
  1 and rule 7 forbid running them. What I did verify is that `0021_far_harry_osborn.sql`
  contains exactly one `ALTER TABLE eval_runs ADD COLUMN "recall_without"` statement and
  nothing else, and that `meta/_journal.json` carries its entry — the drift the DoD was
  guarding against would have shown up as extra statements in that file.
- **Whether F8 itself left `client/src/components/eval-case-editor/` byte-unchanged** — the
  directory is untracked and was written again at 19:45, after F8. Git has no baseline to
  compare against and mtimes cannot separate F8 from the later rework.
- **Anything visual.** Every checklist verdict above is about an element's presence, label
  and nesting in the component source. I cannot see an image, the reference frames no longer
  exist, and no verdict here may be read as confirming appearance, layout or fidelity.
- Nothing was left unreached for budget reasons; every F item has a verdict.

## Summary line
55 MET / 4 PARTIAL / 0 NOT MET / 1 CANNOT VERIFY
