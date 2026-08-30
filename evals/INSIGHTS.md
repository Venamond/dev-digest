# `evals` — insights

Append-only. Every entry must pass the cold test: an agent with zero session
context reads it and knows exactly what to do — no "be careful with X", only
"X breaks under Y, do Z instead", with a file/command when relevant. Treat this
file as a **draft to spot-check**, not ground truth.

## Tool & Library Notes

**`ci-detect.mjs`'s `hasEvals()` only checks that eval FILES exist — it never
checks that the AGENT DEFINITION they test for actually exists, so an orphaned
eval permanently red-lines its CI job regardless of what changed.**
`evals/agents/architecture-reviewer-lite/architecture-reviewer-lite.eval.ts`
exists, but `.claude/agents/architecture-reviewer-lite.md` does not — only
`architecture-reviewer.md` is a real agent in this repo. `touched()` derives
the agent name from either `.claude/agents/<name>.md` OR
`evals/agents/<name>/` changing, and `hasEvals('agents', name)` only checks
the second directory for a `*.eval.ts` file — so any diff touching
`evals/agents/architecture-reviewer-lite/` (not the agent itself) puts
`architecture-reviewer-lite` in the CI matrix, where `agentTask` throws
`agent not found: .../architecture-reviewer-lite.md` immediately (verified on
PR #11, run `33199090831`, job `98943866712` — `src/artifacts/load.ts:36`).
**Do:** before trusting `ci-detect.mjs`'s output, or if `eval-agents`/`eval-skills`
red-lines with "not found" rather than a real assertion failure, check whether
the matching `.claude/agents/<name>.md` (or `.claude/skills/<name>/SKILL.md`)
actually exists — `hasEvals()` alone does not guarantee it. The stale
`architecture-reviewer-lite` eval directory should be deleted or the missing
agent restored; this is a pre-existing repo gap, not something this session's
CI wiring introduced.

**`pnpm eval:workflow` (`vitest run workflow`) is a path substring match — any
`*.eval.ts` someone else drops under `workflow/` runs too, and `results/` is
shared, append-only state across concurrent sessions.** Observed 2026-08-28:
mid-session, an untracked `workflow/experiment4.cases.ts` +
`.eval.ts` appeared (another concurrent session's scratch file, confirmed live
via `ps aux | grep vitest` — a real `npm exec vitest run
workflow/experiment4.eval.ts` process, not a leftover), and that session's
`record()` calls interleaved into the SAME `results/records.jsonl` and edited
this SAME `INSIGHTS.md` while this session was also writing to it.
**Do:** before clearing `results/records.jsonl` or running the whole
`eval:workflow`/`eval` pattern, run `ps aux | grep -i vitest` to check for a
live process in this repo. If one is running, either wait for it
(`while kill -0 <pid> 2>/dev/null; do sleep 5; done`, or the `Monitor` tool)
or scope your own run to your own file (`npx vitest run
workflow/<your-file>.eval.ts`) instead of the wide `workflow` pattern — it
skips any sibling file a concurrent session dropped in the same directory.
Never bulk-clear `results/records.jsonl`; filter by `run_id`/label instead
when a concurrent session's rows are mixed in with your own.

**`toolsUsed` records an attempted tool_use, not a successful one — it cannot
tell you whether a restricted tool actually executed.** A positive-activation
case against `engineering-insights` (a genuine bug-fix story, no tools
restriction override — plain `workflowTask`, so `Edit`/`Write`/`Bash` are
outside `tools`) produced a trace with `Edit` in `toolsUsed` and 13/12 turns
used against real file re-reads of `server/INSIGHTS.md` (12 identical `Read`
entries in one attempt). `run-claude.ts` pushes `block.name` for every
`tool_use` block unconditionally (`case.ts`'s own logic never inspects the SDK's
response to that call), so an `Edit` name in the trace is consistent with
either "the SDK let it through" or "the model tried, the SDK rejected it, and
the model kept trying." The two are indistinguishable from `records.jsonl`
alone.
**Verified the restriction held**, but not from the trace: `server/INSIGHTS.md`
carried an unrelated, already-dirty diff from before this session even started
(present in the very first `git status` of the run), and after the case's Edit
attempts the file's diff was byte-identical to that starting state — no new
content, no duplicate block. Confirming this required checking `git status`
immediately before AND after the run and diffing the file, not trusting the
trace.
**Do:** before touching a real repo doc's contents after a workflow run that
carried an unexpected tool name, check `git status`/`git diff` on that specific
file first — do not `git checkout` a "polluted" file on the trace's word alone.
Doing exactly that here (checking out `server/INSIGHTS.md` on the strength of
an `Edit` appearing in `toolsUsed`) deleted a real, already-existing entry;
caught by cross-referencing its content against `.claude/skills/
dependency-checker/scripts/collect.py` (which already implements what the
entry described) before the mistake could compound, and restored verbatim.
**A second fix works even where a tools restriction doesn't need one:** telling
the model outright, in-prompt, which tools it does and doesn't have for this
session ("У цій сесії в тебе НЕМАЄ інструменту для редагування чи запису
файлів... виконай процес... тими інструментами, які в тебе є") turned a
13-turn `Edit`-retry loop into a clean 4-turn pass (`Read` + `Skill`, 2 tool
calls). `runClaude` already does exactly this when `allowedTools` is empty (the
"you have NO tools available" directive in `run-claude.ts`) but never for a
non-empty, merely-restricted set — which is precisely the gap a case author
still has to paper over by hand in the prompt.


**A vitest test-level timeout does not stop the underlying session, and a late
`finally` can still record a pass for a test vitest already reported as
FAILED.** `assertAndRecord`'s `finally` runs `record()` whenever the wrapped
async function eventually settles — but vitest's `testTimeout` (240_000ms) is
a race against the test callback, not a cancellation of it: when the timer
wins, vitest reports "Test timed out" and marks the test failed, while the
`runClaude` call keeps running in the background. If it later resolves
successfully, `record()` still fires. Observed 2026-08-28: the
`engineering-insights` near-miss negative dispatched a `researcher` subagent
(28 tool calls) instead of answering directly, took `durationMs: 243729` —
over the 240_000ms ceiling — and vitest reported it FAILED via timeout on
both retry attempts, yet its record shows `outcome: true`. The `passed`
precedence fix (`f11e786`) does not cover this: it protects a failed
*assertion* from being recorded as a pass, but a vitest-level timeout never
reaches the assertion at all.
**Do:** do not trust an `outcome: true` row at face value without also
checking `metrics.durationMs` against `testTimeout` (240_000 in
`vitest.config.ts`) — a row near or over that ceiling may belong to a test
vitest itself marked failed. Cross-check against the vitest summary, the same
discipline the `retry` entry below already asks for.

**`allowedTools` does not restrict anything — it is an auto-approve list, and
the workflow tier's "read-only sandbox" does not exist.** In
`@anthropic-ai/claude-agent-sdk` 0.3.198, `Options.allowedTools` is documented
as "tool names that are auto-allowed without prompting… **To restrict which
tools are available, use the `tools` option instead**" (`sdk.d.ts:1305-1311`).
Restriction lives in `tools` (the base set, `sdk.d.ts:1367`) and
`disallowedTools` (removes from context, `sdk.d.ts:1331`). `workflowTask` sets
neither, and runs with `permissionMode: "bypassPermissions"` against the live
repo — so `Write`, `Edit` and `Bash` are all available, and the model did call
`Bash` on 2026-08-27. Three places claim otherwise: the "Safety" comment in
`src/tasks.ts`, the `WORKFLOW_ALLOWED_TOOLS` comment in `src/config.ts`, and the
Safety section of `README.md`.
*(Now enforced: `runClaude` passes `allowedTools` as `tools` too, so every
caller — `skillTask`, `agentTask`, `workflowTask` — actually restricts its
parent session, not just this tier. Comments in `tasks.ts`, `config.ts` and
`README.md` were also wrong and are corrected. This does NOT restrict a
dispatched subagent, which gets its own tools from its
`.claude/agents/<name>.md` frontmatter by design — e.g. `architecture-reviewer`
still has `Bash`/`Write` when `workflowTask` dispatches it. This also changes
the measurement: a session that could reach for `Bash` before 2026-08-28 no
longer can, so runs before and after this fix are not comparable.)*

**Skills are configured by their own option, and `'Skill'` in `allowedTools` is
deprecated.** `Options.skills?: string[] | 'all'` is "the single place to turn
skills on; you do not need to add `'Skill'` to `allowedTools`"
(`sdk.d.ts:1848-1869`). `workflowTask` never sets it. This does NOT by itself
explain the zero skill activations recorded below: the same doc says omitting it
means "no SDK auto-configuration. The CLI's own defaults still apply, so this is
**not** 'skills off'".
*(Settled 2026-08-28 by a throwaway probe, three sessions on `claude-haiku-4-5`:
omitting `skills` — the state of every real case today — suppresses the `Skill`
tool almost entirely, contrary to the SDK doc's claim. `skills: 'all'` lets it
fire, but not reliably: three runs of the same wrap-up prompt gave three
different behaviours, one of which invoked `pr-self-review` via `Skill`. So the
three `expectSkills` failures recorded below were at least partly a harness
default, not pure model behaviour — but `skills: 'all'` does not turn into a
clean fix; see the next entry.)*

**A skill's own activation may carry tool grants that escape the session's
`tools` restriction — the same escalation path subagents already have, now
suspected for skills too.** In the probe above, the one run where `pr-self-review`
activated via `Skill` also showed `Bash` in `toolsUsed`, even though
`WORKFLOW_ALLOWED_TOOLS` has no `Bash` and the previous entry's `tools`
restriction was independently confirmed to work: a follow-up probe with plain
`tools: ["Read"]` (no skills involved) got the model to state outright "I don't
have a Bash tool available" rather than attempt the call. So the restriction
holds with skills off, and something let `Bash` through specifically when a
skill engaged. Not fully proven — the triggering run could not be reproduced a
second time (the very next attempt, same prompt, made no tool call at all), so
there is no `tool_result` trace confirming Bash actually EXECUTED rather than
being attempted and silently allowed through the assistant message.
**Do:** do not flip `skills: 'all'` (or any explicit skill list) into
`workflowTask` as a fix for the `expectSkills` failures above without first
resolving this. If skills are ever enabled here, re-verify the `tools`
restriction holds with a forced-Bash prompt under `skills: 'all'`, the way the
plain-tools case was verified above.

**`maxTurns` is a safety margin on a positive case but part of the measurement
on a negative one — set it generously on negatives, never tightly.** A
`shouldActivate: false` case asserts that a skill did NOT engage. If the session
dies on the turn ceiling, the skill did not engage because the session ran out
of room, and the case passes having measured nothing. Observed 2026-08-27: the
`engineering-insights` near-miss ran 5 turns against `maxTurns: 4`, recorded
`isError` — and still passed. On a positive case the same ceiling only produces
a visible false failure, which is why the instinct to keep negatives cheap is
backwards.
**Do:** give a negative at least as many turns as the positive it mirrors — the
two in `review-workflow.cases.ts` now sit at 8. *(Half enforced: `kind:
"activation"` asserts `isError === false` before the activation check in
`src/dsl/case.ts`, so an errored negative now fails loudly instead of passing
empty. Choosing a sane ceiling is still on the case author.)*

**`outcome` in `records.jsonl` does not mean "the case passed" for a workflow
case — it means "the session did not error".** `record()` computes
`outcome = !result.isError` whenever there is no grounding gate and no judge
verdict, which is every `trace` / `activation` / `dispatch` case, and it fires
from a `finally` that runs before the assertion's throw is visible to it.
Measured on the 2026-08-27 run: three cases that failed their assertions were
all persisted as `outcome: true`, and the one negative that genuinely passed was
persisted as `outcome: false` because its session hit `maxTurns`. Every pass
rate the statistics layer derives for this tier is therefore wrong, including
`eval:repeat` and `eval:benchmark`.
*(Now enforced by `deriveOutcome()` + `src/records/record.test.ts`: every
workflow branch goes through `assertAndRecord()`, which sets `passed` only when
the assertions return, and the unit test fails if that precedence is removed —
verified by disabling the line and watching it go red.)*
The 20 pre-fix rows were deleted on 2026-08-28 rather than carried forward, so
`records.jsonl` now starts clean. `history.jsonl` was kept: the trend reporter
writes it from vitest's own pass/fail, so it was never affected by this bug —
which also makes it the honest fallback whenever `records.jsonl` is in doubt.

**The parent trace absorbs a dispatched subagent's tool calls, so an assertion
can be satisfied by the subagent instead of the session under test.** Same run,
case 1 attempt 1: 49 tool calls, `skills: onion-architecture, spec-creator`, and
reads across the whole repo, all after an `Agent` call dispatching `researcher`
— against 5 tool calls on the attempt that dispatched nothing. `Result` carries
no depth or session id, so parent and child work cannot be separated after the
fact. (Corrected 2026-08-28: the original evidence for this was `Bash` appearing
in the trace "outside the allow-list". That reasoning was wrong —
`allowedTools` does not restrict anything, so the parent could call `Bash`
itself. The volume gap is the surviving evidence, and it is weaker.)
Also observed on a case with no `expectSubagents` at all: 2026-08-28's
`engineering-insights` near-miss negative unpredictably dispatched `researcher`
(28 tool calls) instead of just answering, on a prompt that only asks the model
to *explain* a concept — nothing about `activation` cases governs whether a
subagent fires, and this is what drove that case over the vitest timeout (see
the entry above).
**Do:** treat `expectFilesRead` / `expectSkills` as unreliable on any case that
also dispatches a subagent; assert the dispatch alone, or order the prompt so
the reads happen before the dispatch and keep `stopWhen` tight.

**Metrics under-report a dispatching case by an order of magnitude.** The same
attempt recorded `durationMs: 15625` while its vitest case took 243832ms — the
SDK's `duration_ms` excludes the nested subagent's run, and subagent tokens are
absent from `inputTokens`/`outputTokens` entirely. Early-stopped runs also record
`inputTokens: 0`, because the stop happens before the result message.
**Do:** never quote a workflow run's cost from `records.jsonl` without saying it
excludes subagent time and tokens.

**On the Anthropic subscription path the model still answers *about* a skill
instead of invoking it — the package README's claim to the contrary is wrong.**
`README.md` says activation cases are only shaky on non-Anthropic models and
that "on the Anthropic path the model invokes the Skill tool, so it passes". On
`claude-haiku-4-5` over the subscription, the `Skill` tool fired in the main
session **zero times across two full runs — 20 sessions** (2026-08-27 and
2026-08-28), failing every `expectSkills` assertion in all three cases that
carry one (`frontend-architecture`, `spec-creator`, `pr-self-review`). The
wrap-up case produced no tool calls whatsoever on all four of its attempts,
replying "готовий запустити `/pr-self-review`, коли скажеш". The one trace that
ever showed a `Skill` call belonged to a dispatched subagent, not the session
under test. Replicated, not a fluctuation.

`activated()` has a second path besides the `Skill` tool call — crediting a
direct `Read` of the skill's `SKILL.md`. Checked across all 12 records from
both runs for the three skill-carrying cases (client/authoring/wrap-up): that
path never fired either, zero `skills/*/SKILL.md` reads. So `expectSkills` was
not merely flaky here, it was dead via both of its evidence paths on every
single attempt — the decision to drop it (`e3dfdc8`) discarded a signal that
had produced zero passes across 12 sessions, not a working-but-unreliable one.
**Do:** treat `expectSkills` as indicative on every backend, not just OpenRouter,
until a prompt phrasing is found that reliably forces the `Skill` tool.

**A vitest `retry` silently corrupts two things in this package, because
`record()` fires per ATTEMPT, not per case.** `src/records/record.ts` appends a
row unconditionally from the test body's `finally`, so a retried case writes two
rows under one `nodeid`; `series()` in `src/records/stats.ts` counts both, which
means a case that failed once and passed on the retry reads as 50%, and
`eval:repeat -n 5` can return more than 5 samples. Worse, the output filename is
slugified from the case label alone with no attempt suffix, so the retry's
`writeFileSync` **overwrites the failing attempt's text** in
`results/outputs/<runId>/` — the copy you actually wanted for debugging.
**Do:** when reading stats after a run with `retry` on, group by `nodeid` and
check for duplicates before believing a pass rate. The promotion out of this
entry is an attempt suffix on the output slug plus a `attempt` field on the row.
`retry: 1` is set in `vitest.config.ts` (2 attempts max) — it bounds the token
cost of a flaky case, it does not reduce it.

**`expectFilesRead` is a bare substring match, and this repo contains a full
copy of itself — so a doc-routing assert can pass on a file the harness never
routed to.** `src/dsl/case.ts` asserts with
`result.filesRead.some((f) => f.includes(file))`, and `server/clones/<owner>/<repo>/`
is a gitignored clone the app writes on PR import (`.gitignore:20`; 26 markdown
files under it today). Every workflow target has a twin there — verified for
`TESTING.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/README.md` and
`docs/agent-prompts/`. `specs/README.md` is worse: it matches 8 paths, because
each package carries its own `specs/README.md` as well.
*(Now enforced by `readMatches()` in `src/dsl/case.ts`: both sides resolve
against `REPO_ROOT`, matching a file exactly or a directory by prefix, so a read
from the clone no longer counts. Two deliberate exceptions remain on substring
matching — `activated()`'s SKILL.md probe, because skills live under
`.claude/skills` and plugin skills outside the repo entirely, and the `contrast`
control run, which has its own cwd.)*

**Never assert a trace read against `<module>/AGENTS.md`.** Every module ships
`CLAUDE.md` as a symlink to `AGENTS.md` (`ls -la server/CLAUDE.md` →
`AGENTS.md`; same in `client`, `reviewer-core`, `e2e`, `mcp`), and the `Read`
tool reports the path it was *given*, not the resolved one. A model that opens
`server/CLAUDE.md` satisfies the rule while an assert on `server/AGENTS.md`
fails, and `expectFilesRead` has no OR.
**Do:** assert on a path with no symlink twin — `INSIGHTS.md`, `README.md`,
`TESTING.md`.

**Only the `Read` tool feeds `filesRead`.** `run-claude.ts` collects
`file_path` from `Read` blocks alone; `Grep` and `Glob` contribute nothing.
A model that finds a convention by grepping has behaved correctly and will
still fail the case.
**Do:** phrase the prompt so the document is *read* ("прочитай саме ці
документи"), not merely located.

## Codebase Patterns

**`origin/main` does not have `evals/` at all — any branch/PR built for evals
work must be based on `upstream/l06-evals`, not `main`.** Verified 2026-08-28:
`git cat-file -e origin/main:evals/scripts/ci-detect.mjs` → "MISSING on main";
the same check against `upstream/l06-evals` succeeds, and it already carries
the whole package (`README.md`'s own "Install" section documents this same
merge: `git fetch upstream && git merge upstream/l06-evals`). A branch cut
from `main` for evals-related work (e.g. to open a focused CI-wiring PR) would
reference `evals/package.json`, `pnpm-lock.yaml`, `proxy/`, and the case files
that don't exist there — broken from the first run, not just incomplete.
**Do:** `git fetch upstream` first, then branch from `upstream/l06-evals` (or
from a branch that already merged it, like `06_evals_plan_verified_export`)
for anything under `evals/` or `.github/workflows/` that depends on it.

**That same `l06-evals` branch cannot be a PR *target* in this repo — it only
exists on `upstream` (a different GitHub repository, the course template),
not on `origin` (the student's fork).** `git checkout -b X upstream/l06-evals`
works fine (it's a local ref, any remote's branches are fetchable), but
`gh pr create --repo <origin>/<repo> --base l06-evals` fails with "Base ref
must be a branch" — GitHub resolves `--base` against the repo you're opening
the PR *in*, not against arbitrary remotes you happen to have configured
locally. Confirmed 2026-08-28: `git remote -v` showed `origin` =
`Venamond/dev-digest`, `upstream` = `ai-agentic-engineering-neo/dev-digest`;
`l06-evals` is real on the latter only.
**Do:** for a same-repo PR that needs a small, evals-relevant diff, there is
no clean existing target — `main` lacks `evals/` entirely (735+ file diff
either way once this repo has accumulated course work past the lesson
template), and no branch on `origin` sits between the lesson template and the
current work. The only way to get a small diff is to construct a fresh branch
locally from `upstream/l06-evals` and cherry-pick just the relevant commits
onto it — accept the size, or build that branch deliberately, there is no
third option.

**Nested module docs are opened with the `Read` tool, so they ARE assertable.**
Settled by the 2026-08-27 run: `client/AGENTS.md` appears in `filesRead` on both
attempts of the client case, `server/AGENTS.md` on the server case. They are not
silently injected, and `expectFilesRead` can name them directly — subject to the
symlink caveat above (the model opened `AGENTS.md`, but `CLAUDE.md` would have
been just as valid a path for it to choose).

## Recurring Errors & Fixes

**A red `eval-skills`/`eval-agents` job is not evidence the model is too
cheap — check whether the failing expectation is grounded in real source
before believing that.** PR #11 (2026-08-28): three separate failures across
`dependency-checker` and `architecture-reviewer`, diagnosed against
`deepseek/deepseek-chat`'s actual CI output, turned out to be eval-authoring
bugs, not model quality — a `grounding` substring (`"flowchart"`) that
`SKILL.md` never mandates, and two `practices` rule identifiers
(`reviewer-core-zero-io`, `reviewer-core-ground-findings-gate`) that exist
nowhere in `.claude/agents/architecture-reviewer.md` or any
`.dependency-cruiser.cjs` — one had a real name under a different string
(`core-no-node-builtins`), the other had no backing rule at all. In all three
cases the model's actual answer was correct; the check was wrong. This is the
same class of bug `skill-evals/INSIGHTS.md` already documents for
`onion-architecture`'s cases ("Do not name a dependency-cruiser rule from its
comment") — recorded here too because it recurred independently in a
different eval suite in this package.
**Do:** before concluding a failure is about model capability, `grep` every
literal string in `grounding` and every named identifier in `practices`
against the real source it claims to test (the skill's `SKILL.md`, the
agent's own `.md` file, the actual `.dependency-cruiser.cjs`). If the string
isn't there, the eval is wrong, not the model — fix the case, don't reach for
a pricier model to paper over it.

**A `practices` entry phrased as an OMISSION ("does not claim X") can never
honestly PASS under `llm-judge.ts`'s current rubric — it requires a verbatim
quote as evidence for every PASS, and there is no quotable text for "the
model never brought this up".** Confirmed by isolating `llmJudge()` against a
verified-correct answer and watching a legitimate PASS come back FAIL with
`evidence: ""`. This is different from an EXPLICIT denial ("no violations
found", which two `architecture-reviewer.cases.ts` negatives rely on and
which works fine — there the judge has a real sentence to quote).
**Do:** when writing a negative practice, phrase it to require an explicit
positive assertion of the absence (e.g. "states these are TypeScript path
aliases, not workspace packages") rather than "does not mention X" — the
latter is unjudgeable by design, regardless of model quality, and will read
as a permanent, misleading red case.

**The judge is not deterministic on identical (output, practices) input, even
at `temperature: 0` — repeat calls diverge, sometimes badly.** Same exact
input to `llmJudge()`, called back to back: one run's JSON contained only 1
of 3 requested results (silently caught by the new `results.length !==
practices.length` guard, see the fix commit), a later run returned all 3 but
scored every one FAIL — including a practice that had PASSED with correct
verbatim evidence in an earlier, identical call. `EVAL_JUDGE_MODEL` currently
defaults to the same cheap model as `EVAL_MODEL` in CI (`deepseek/deepseek-chat`
for both, set this session for cost) — this is very likely why: judging is a
harder, more precision-demanding task than answering, and a model cheap
enough for the actor role is not necessarily stable enough for the judge
role. `README.md`'s own design principle already says the judge should
default to a *stronger* family than the task, specifically to soften
self-preference — this observation is a second, independent reason for the
same conclusion (reliability, not just fairness).
**Do:** don't chase judge flakiness by rewording `practices` further once the
wording is already grounded and unambiguous (verified here: rewording alone
did not stabilize the verdict). Set `EVAL_JUDGE_MODEL` to a distinct, stronger
model than `EVAL_MODEL`.
*(Applied 2026-08-28, `e783ed2`: `eval-agents`/`eval-workflow` moved both
`EVAL_MODEL` and `EVAL_JUDGE_MODEL` to `anthropic/claude-haiku-4.5`;
`eval-skills` kept its cheap actor but moved `EVAL_JUDGE_MODEL` alone to the
same. Confirmed on the next live PR #11 run: the same case that had swung
between 1/3, 0/3, and a false 1/1 across identical DeepSeek-judge calls now
returns consistent, detailed, non-empty evidence on every attempt — including
for FAIL verdicts. The fix worked.)*

**A stronger judge — or a stronger actor, which came bundled in this
session's fix — can make a `shouldActivate`-style NEGATIVE case fail where a
weaker model passed it, and that is not a regression.** `architecture-reviewer`'s
"does not fabricate an architecture finding for the out-of-scope security-shaped
change" scored 100% under `deepseek/deepseek-chat` and then FAILED once the
actor became `anthropic/claude-haiku-4.5` (`e783ed2`): Haiku additionally
flagged the `reply?: FastifyReply` parameter itself as a structural leak,
which the practice's wording counts as fabrication ("beyond the import issue
itself"). DeepSeek never noticed the parameter was worth a second look at
all, so the negative passed by omission, not by correct restraint.
**Do:** when a fabrication-prevention or other negative case starts failing
right after a model upgrade, check whether the model got *more* thorough
before assuming it got worse — the fix may belong in the practice's
scope (is the extra finding actually wrong, or just something the old model
was too weak to notice?), not in reverting the model choice. Left open in
`architecture-reviewer.cases.ts` as of 2026-08-28 — not resolved as a case
change, though the same case passed cleanly on the very next PR #11 run
against the same model, so this specific finding is itself intermittent, not
a fixed 100%-fail regression.

**`threshold: 1.0` on a multi-item `practices` list is close to an
automatic-fail gate against real model output, independent of whether the
answer is actually correct.** Confirmed live, PR #11, `anthropic/claude-haiku-4.5`:
a genuinely correct answer — every real rule identifier right, full
formatting — scored 0.83 on a 6-item list and 0.8 on a 5-item one, missing
exactly one item each time (a citation format, a firm verdict phrase). At
`threshold: 1.0` that scores identically to a wrong or empty answer (also
observed the same run, 0/6) — the gate can't tell "almost right" from "not
even trying".
**Do:** reserve `threshold: 1.0` for short, binary-in-nature checks
(fabrication/scope-violation practices, 2-3 items, where a "miss" means
tolerating a real defect, not a formatting slip). For a longer checklist
practices list, calibrate the threshold to the item count instead of
defaulting to 1.0 — `0.8` on a 5-6 item list still requires 4-5 to hold, which
still fails a genuinely wrong or empty answer, but stops conflating one
missed formatting detail with total failure.

## Open Questions

**An `eval-workflow` CI run logged a LiteLLM request for `openrouter/claude-sonnet-5`
— a model this job never configures.** PR #11, run `33199396766`, job
`98944890846`: the proxy container's log shows
`litellm.exceptions.BadRequestError: ... "openrouter/claude-sonnet-5 is not a
valid model ID"`, sandwiched between successful `POST /v1/messages` calls.
`claude-sonnet-5` is `config.ts`'s hardcoded DEFAULT for `EVAL_JUDGE_MODEL`
(unrelated env var, unset → this literal) — but `grep -rn EVAL_JUDGE_MODEL
src/` shows it is read only by `llmJudge()` and `benchmark.ts`, neither of
which the workflow tier calls (`runWorkflowCases` has no verdict/judge path).
Also not a hardcoded healthcheck — `litellm.config.yaml` has no
`claude-sonnet` string anywhere. Did not block the run: the actual test
failures in that job were legitimate `e2e/README.md`-routing assertion
misses, not proxy errors.
**Do:** before spending time on this, check whether it reproduces on a rerun,
and whether it correlates with a specific test case's turn count (it may be
stale/interleaved log output from something outside this job's own vitest
process, e.g. a LiteLLM internal call unrelated to `EVAL_MODEL`/`EVAL_JUDGE_MODEL`
at all). Unresolved as of 2026-08-28.

**A nested doc's rows are followed intermittently, not reliably.** Corrected on
2026-08-28 — the first run's conclusion that `client/AGENTS.md`'s row routing
browser coverage to `../e2e/README.md` simply does not fire was drawn from a
single run and was wrong. Across four attempts: run 1 opened neither `e2e` file,
run 2 opened `e2e/README.md` on one attempt and `e2e/AGENTS.md` on the other. So
the row does reach the model, and the destination varies. Do not draw a routing
conclusion from one run — this tier needs the same repeat discipline the quality
tier already has.
*(Reinforced 2026-08-28 across three separate model families on PR #11 —
`deepseek/deepseek-chat`, `google/gemini-2.5-flash`, `anthropic/claude-haiku-4.5`
— the same case flipped between passing and failing on every one of them.
This rules out "the model is too weak" as the explanation: the row's
destination is unreliable regardless of which model reads it, which points at
`client/AGENTS.md`'s own wording, not at model choice. Not yet acted on — no
change made to the doc.)*

Run-to-run variance is still unmeasured for this tier: every case above is one
or two samples, so no threshold here is safe as a blocking CI gate yet.
