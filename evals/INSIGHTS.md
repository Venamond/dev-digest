# `evals` — insights

Append-only. Every entry must pass the cold test: an agent with zero session
context reads it and knows exactly what to do — no "be careful with X", only
"X breaks under Y, do Z instead", with a file/command when relevant. Treat this
file as a **draft to spot-check**, not ground truth.

## Tool & Library Notes

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

**Nested module docs are opened with the `Read` tool, so they ARE assertable.**
Settled by the 2026-08-27 run: `client/AGENTS.md` appears in `filesRead` on both
attempts of the client case, `server/AGENTS.md` on the server case. They are not
silently injected, and `expectFilesRead` can name them directly — subject to the
symlink caveat above (the model opened `AGENTS.md`, but `CLAUDE.md` would have
been just as valid a path for it to choose).

## Open Questions

**A nested doc's rows are followed intermittently, not reliably.** Corrected on
2026-08-28 — the first run's conclusion that `client/AGENTS.md`'s row routing
browser coverage to `../e2e/README.md` simply does not fire was drawn from a
single run and was wrong. Across four attempts: run 1 opened neither `e2e` file,
run 2 opened `e2e/README.md` on one attempt and `e2e/AGENTS.md` on the other. So
the row does reach the model, and the destination varies. Do not draw a routing
conclusion from one run — this tier needs the same repeat discipline the quality
tier already has.

Run-to-run variance is still unmeasured for this tier: every case above is one
or two samples, so no threshold here is safe as a blocking CI gate yet.
