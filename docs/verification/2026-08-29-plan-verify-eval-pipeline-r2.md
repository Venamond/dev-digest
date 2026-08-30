# Plan Verification — Round 2 (scoped)

## Plan
`docs/plans/2026-08-29-eval-pipeline.md`, Status: approved
Spec: `specs/2026-08-29-eval-pipeline.md`, Status: approved
Round 1: `docs/verification/2026-08-29-plan-verify-eval-pipeline-r1.md`
(63 MET / 2 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY)

Scope of this round, as instructed: **AC-63, AC-64, S11, S14 only.** Nothing
round 1 marked MET was re-verified except where a regression check required it
(see `## Regression check`).

## Verdict table

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| AC-63 | PARTIALLY MET | fixed part: `client/…/EvalsTab/EvalsTab.tsx:94-97` builds the row result map with precedence batch rows → `c.last_run` → in-mount trial; `:303` passes `lastRun={results.get(editing.evalCase.id) ?? null}` into the editor; `client/src/components/eval-case-editor/EvalCaseEditor.tsx:132` `const result = trial ?? lastRun ?? null`, panel gated at `:358`. Server side already MET in r1. Tests: `EvalsTab.test.tsx:303-331` (two cases). Residual: `EvalsTab.tsx:97` overwrites `last_run` with `trials[caseId]` unconditionally, and `trials` is written at `:245` and **never cleared** (grep of `trials` in that file returns exactly lines 73, 97, 245). | Both behaviours round 1 named are fixed. A third path inside the same criterion is not: fire a trial on case c1, then let a set run complete **in the same mount** — the effect at `:76-88` invalidates `evalCases`, `c.last_run` refetches to the newer set-run record, and `:97` then overwrites it with the older trial. The row and the editor then show a result that is not "whichever execution touched that case most recently". **Unfinished code**, not superseded plan. One-line shape of the fix: compare `ran_at` at `:97`, or clear `trials` in the completion effect. |
| AC-64 | MET | `server/src/modules/eval/service.ts:340` `const caseCounts = await this.repo.caseCountsByAgent(workspaceId)`, `:352` `cases_total: caseCounts.get(agent.id) ?? 0`; repository method at `server/src/modules/eval/repository.ts:225-233` (`count(*)::int` grouped by `owner_id`, scoped to `workspace_id` + `owner_kind='agent'`). Client: `client/src/app/evals/_components/EvalOverview/EvalOverview.tsx:84` `agents.reduce((n, a) => n + (a.cases_total ?? a.latest?.cases_total ?? 0), 0)`. Contract: `vendor/shared/contracts/eval-ci.ts:186` `cases_total: z.number().int().nullish()`. Tests: `server/test/eval.it.test.ts:543-557` asserts `latest: null` **and** `cases_total: 2`; `EvalOverview.test.tsx:174-203` asserts `/9 model calls/` across two agents with `latest: null`. | The exact defect round 1 named — an agent with cases but no completed run contributing zero to the `Run all agents` estimate — is gone, proven on both sides of the wire. The previously-dead `caseCountsByAgent` now has a caller. Round 1's other four AC-64 controls were already MET and were not re-verified. |
| S11 | MET | Checklist row 18 (right pane, result panel, bottom): rendered at `EvalCaseEditor.tsx:358-377` — bold `t("lastRunPassed")` / `t("lastRunFailed")` at `:366-368`, then `t("resultDetail", { expected, actual, duration, cost })` at `:370-375`. It is now fed for its in-app existing-case consumer: `EvalsTab.tsx:303`. Proven live by `EvalsTab.test.tsx:323-330`, which opens the editor from a row and finds `Last run failed` in the dialog. | The dead-on-open finding is fixed. The other consumer, `FindingCard.tsx:188`, opens the editor on a **new seeded** case, which by construction has no prior execution — row 18 being absent there is correct, not a gap. S11's departure bullet for row 18 (`the outcome comes from whichever execution touched the case most recently — AC-63`) is a cross-reference, so the residual ordering gap is carried on the AC-63 row above and not double-counted here. |
| S14 | MET | Element row 9 (`Completion`, `N of M ran`, partial wording when any case errored): `client/src/app/evals/_components/AgentEvalView/AgentEvalView.tsx:224` `t(latest.state === "partial" ? "completionPartial" : "completion", { produced: latest.traces_produced ?? 0, total: latest.cases_total })`. New key `client/messages/en/eval.json:153` `"completionPartial": "Partial result — {produced} of {total} ran"`, matching the Evals-tab wording at `:99`. Test: `AgentEvalView.test.tsx:155-160` asserts `/Partial result — 7 of 8 ran/` on a `state: "partial"` batch; the pre-existing non-partial assertion `"7 of 8 ran"` at `:152` still stands. | Wording parity with `EvalsTab.tsx:179`; only the ICU argument name differs (`{produced}` vs `{ran}`), which is forced by the existing `agentView.completion` string. Row 15's `GitMerge` substitution was adjudicated plan-superseded in round 1 and was not revisited, per instruction. |

## Adjudication of the two implementer judgement calls

### Claim 4 — `EvalCaseWithLastRun` placed in `contracts/eval-ci.ts`, not on `EvalCase` in `knowledge.ts`

**The circularity reasoning is correct.** The shape needs `EvalRunRecord`, which
is defined in `eval-ci.ts` (`server/src/vendor/shared/contracts/eval-ci.ts:63`),
while `eval-ci.ts:2-13` already imports `EvalCase` and eight siblings from
`./knowledge.js`. `knowledge.ts` today imports nothing but `zod`:

```
$ grep -n "^import\|from '" server/src/vendor/shared/contracts/knowledge.ts
1:import { z } from 'zod';
```

Putting `last_run` on `EvalCase` in `knowledge.ts` would have required
`knowledge.ts → eval-ci.ts` for `EvalRunRecord` against the existing
`eval-ci.ts → knowledge.ts`, i.e. a genuine cycle, and would additionally have
forced `last_run` onto every `EvalCase` construction site including the create
and update responses that legitimately carry no run. `eval-ci.ts` is the right
file. Both copies are byte-identical:

```
$ diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts
eval-ci IDENTICAL
$ diff server/src/vendor/shared/contracts/knowledge.ts client/src/vendor/shared/contracts/knowledge.ts
knowledge IDENTICAL
```

### Claim 5 — the out-of-scope deletions in `routes.ts:39` and `service.ts:37`

**Server behaviour is unchanged, and it is proven rather than argued.** Both
deletions replaced a local declaration with the shared one:

- `routes.ts:9` imports `EvalCaseWithLastRun` from `@devdigest/shared`; the only
  use is the response schema at `routes.ts:92`,
  `response: { 200: z.array(EvalCaseWithLastRun) }`.
- `service.ts:6` imports the same type; `service.ts:56` types `listCases`, whose
  body at `:59-63` is unchanged (`last_run: runToDto(latest.get(c.id), c)`).

The only behavioural risk in swapping a route-local schema for a shared one is
Fastify's zod response serialization, and both branches of the new `.nullish()`
field are pinned by integration assertions that were already green in the run
the human collected:

```
server/test/eval.it.test.ts:306   expect(cases[0].last_run).toBeNull();
server/test/eval.it.test.ts:460   expect(cases[0].last_run.id).toBe(trialRun.id);
```

Line 306 proves a never-run case still serializes `last_run: null` (not stripped
to `undefined` by the optional schema); line 460 is round 1's own AC-63 server
proof, still passing. The `service.ts` deletion was of a type-only interface —
no runtime surface. `pnpm arch:check` at 0 violations confirms the new
service → repository call added no layering breach.

## Regression check — did the fix break anything round 1 marked MET?

**No regression found.** The three surfaces named in the request:

1. **The eval contracts.** Both added fields are `.nullish()`
   (`eval-ci.ts:71-74`, `:186`), so no existing object literal lost validity —
   this is what keeps `EvalCase`'s create/update responses, which carry no
   `last_run`, compiling and serializing as before. `check-shared-sync.sh`
   reports `vendor/shared in sync`, and my own `diff` of both file pairs above
   confirms it independently.
2. **The overview response.** The only client consumer of the new field is
   `EvalOverview.tsx:84`. The row's other renderings were untouched, and the
   fallback branch is still exercised: the default fixture at
   `EvalOverview.test.tsx:36-51` supplies rows with **no** `cases_total`, so the
   pre-existing `/8 model calls/` assertion at `:156` now covers
   `a.latest?.cases_total`, while the new test at `:174-203` covers
   `a.cases_total`. Both branches of the coalesce chain are tested.
3. **The case-row result.** `EvalsTab.tsx:99-102` derives `ran`/`passed` from the
   same `results` map, so the `passingBadge` at `:189-192` now counts
   server-recorded results too. That is the criterion's own definition of the
   row result, not a drift. The batch-scoped caption at `:176-183` still reads
   `latestBatch.traces_produced` / `latestBatch.cases_total` and is untouched,
   so the run-completion wording did not change meaning.

The gate numbers the human collected are consistent with this: server 634 (was
633), client 492 (was 488), 0 arch violations, vendor in sync.

### Do the new tests cover the changed behaviours, or merely pass?

**They discriminate — but there are five of them, not six.** The suite deltas
the human collected are client +4 and server +1. I located exactly five new
tests, and they account for the whole delta:

| Test | Covers | Would it fail on the pre-fix code? |
|---|---|---|
| `EvalsTab.test.tsx:316` "shows the case's last_run on first render, over the older batch row" | AC-63 row precedence | Yes — it asserts `/did not pass/i` present **and** `Last run passed` absent; the pre-fix row was built from the batch alone, which held the older passing result. The negative assertion is what makes it a precedence test rather than a presence test. |
| `EvalsTab.test.tsx:324` "opens the case editor with that same result already in its panel" | AC-63 editor / S11 row 18 | Yes — pre-fix the editor received no `lastRun`, so `EvalCaseEditor.tsx:358` rendered nothing and `Last run failed` would be absent. |
| `EvalOverview.test.tsx:175` "states the calls of an agent whose set was authored but never run" | AC-64 client | Yes — both fixture rows carry `latest: null`, so the pre-fix `a.latest?.cases_total ?? 0` sum was 0, not 9. |
| `eval.it.test.ts:543` "AC-64: the overview reports an agent real case count before it has ever run" | AC-64 server | Yes — the field did not exist pre-fix; `cases_total` would be `undefined`, not `2`. It also asserts `latest: null`, which is what makes the count unobtainable from a batch. |
| `AgentEvalView.test.tsx:155` "names a run that did not complete every case as partial (S14, AC-45)" | S14 row 9 | Yes — pre-fix the component rendered `"7 of 8 ran"` with no partial branch, so `/Partial result — 7 of 8 ran/` would not match. |

Each assertion is scoped (`within(row)`, `within(dialog)`) and pins a value the
pre-fix code could not have produced, so none is a test that merely passes. The
one gap in coverage is the residual named on the AC-63 row: no test fires a
trial and then completes a set run in the same mount, which is precisely the
path that is still wrong.

Note on the count: the invocation says six new tests appeared. I find five, and
the +4/+1 suite deltas agree with five. The discrepancy is in the count, not in
the code.

## Unrequested work
Beyond the two deletions adjudicated under claim 5 — both justified — none. The
fix round touched no file outside the set the four findings implied:
contracts (both copies), `eval/service.ts`, `eval/routes.ts`, `eval.it.test.ts`,
`hooks/eval.ts`, `EvalsTab`, `EvalOverview`, `AgentEvalView` and their tests,
and `messages/en/eval.json`.

## Plan defects
None newly found in this round.

## What I could not verify
- **Appearance.** I cannot see an image. Element presence for S11 row 18 and S14
  row 9 is checked against the component source and the plan's checklist text,
  which itself derives from `img/mockup-src/*.jsx`; visual fidelity — spacing,
  colour, position within the pane — is not verifiable here. This is the same
  limit round 1 recorded and it still applies.
- **The gate commands** (`check-shared-sync.sh`, `verify:l06`, `arch:check`,
  both `pnpm test` runs) were run by the human after the fix round and supplied
  to me; I did not re-run them, per instruction. I did independently re-derive
  the vendor-sync result with `diff` on both file pairs.
- **The AC-63 residual at runtime.** I derived it from the source
  (`EvalsTab.tsx:73, 97, 245` — `trials` never cleared) rather than by
  exercising the app, since that needs a running stack. The code path is
  unambiguous, but the user-visible reproduction is not something I executed.

## Summary line
3 MET / 1 PARTIAL / 0 NOT MET / 0 CANNOT VERIFY
(AC-64 MET, S11 MET, S14 MET, AC-63 PARTIALLY MET — over the four scoped items
only; the other 65 items of round 1 were not re-verified.)
