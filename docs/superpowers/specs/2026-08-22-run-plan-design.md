# run-plan — decision record

- **Date:** 2026-08-22
- **Status:** draft — the human approves.
- **What this document is.** The reasons behind `/run-plan`, not its behaviour.
  Behaviour lives in `.claude/skills/run-plan/SKILL.md`, which is executed and
  therefore cannot go stale; this file holds the alternatives that were
  rejected, what each decision cost, and what is still unverified. It was
  rewritten on 2026-08-22 to drop ~140 lines that restated the skill in prose —
  two documents competing to describe one algorithm is a drift machine, and
  this one had already needed two corrective revisions in a single day.

## 1. What it is, and where its boundary runs

`/run-plan` executes an **already approved** Implementation Plan from
`docs/plans/` to a PR-ready state, without a human retyping briefs between
agents.

```
/spec-creator            ← human runs it, separately
implementation-planner   ← human runs it, separately
        │
        ▼  docs/plans/<slug>.md, Status: approved
/run-plan  →  implementers over the plan's tracks
           →  architecture-reviewer ‖ plan-verifier
           →  bounded fix cycle
           →  one report; the human commits
```

It is fully autonomous inside that boundary because every decision needing a
human was already made outside it. The gates did not disappear — they moved in
front of the command.

Three files: `.claude/commands/run-plan.md`, `.claude/skills/run-plan/SKILL.md`,
`scripts/run-plan-state.sh`.

## 2. Decisions, and what each one rejected

**A skill plus a deterministic resolver, not a skill alone.** Phase resolution
is bookkeeping — which steps have reports, which review round is current — and
a model miscounting one file dispatches an implementer on top of finished work.
`run-plan-state.sh` answers it in five lines without pulling files into
context. The rejected third option was the `Workflow` tool: the plan is
markdown bullets, so a parser breaks on the first format revision, and it needs
an explicit multi-agent opt-in every time.

**Artifacts are the state; there is no state file and no `--continue`.**
Re-running the same command resumes, because the plan's `Status`, the step
reports and the review rounds already say where the run stands. This follows
`specs/README.md`'s own rule that an index goes stale and then lies.
**The caveat:** `docs/reports/` is in `.gitignore` (line 40) and no report is
tracked, so the state survives a crash, a compaction and a closed session — but
not a fresh clone or `git clean -xdf`. Acceptable for a course project; worth
knowing before anyone relies on it.

**Gates are split: narrow per step, full once at the end.** A step verifies
itself with its own test and a typecheck; the plan's `## 5` table, `arch:check`
and `check-shared-sync.sh` run once, dispatched by the command after the last
track. Per-step full gates were what nine separate implementer runs did on the
mcp plan, and they buy nothing after the first.

**Scoped briefs are the cost decision.** Each implementer gets its step ids,
the branch earlier steps took, and what earlier files contain — which is what
lets it use its scoped single-step invocation instead of reading a plan that
runs to 134 KB. Without the brief there is no saving; the brief *is* the
feature.

**`test-writer` is not called.** Tests are written by `implementer` as part of
the step that introduces the behaviour (its hard constraint 7), and every plan
step carries a `Test:` field. `test-writer` after `implementer` was never a
legal position — its own entry condition calls that request a plan defect.
**What this costs:** the red proof, mutating the source to show a test can
fail. The agent is kept and run by hand when coverage is genuinely in doubt.

**Reviewers are cheap, the implementer is not.** `architecture-reviewer` moved
`opus` → `sonnet`; half its work is running checkers and pasting output, which
no model does better. It escalates back to `opus` — via the `Agent` tool's
`model` parameter, which overrides frontmatter — only when the change set adds
a module, adapter or port, touches `vendor/shared` or `db/schema`, or followed
a CRITICAL. `implementer` stays `inherit`: a reviewer's finding is
evidence-backed and checkable, a bad implementation is found late and
expensively.

`plan-verifier` was already `sonnet`. Its cost is re-running the plan's whole
`## 5` table, and that cannot be removed: its hard constraint 2 says the
Implementation Report is a claim, not evidence, so dropping its own command
runs would turn it into the echo verdict it exists to prevent.

**The fix cycle never auto-fixes MEDIUM or LOW.** Those are the reviewer's
judgement rather than a violated rule, and the human keeps the right to call
one a false positive.

**A stale plan is not a defect to fix.** `NOT MET` and `PARTIALLY MET` mean
either "never done" or "superseded by later approved work", and the verifier
reports both in the same words. Dispatching a fix for the second kind regresses
working code to an abandoned design. This rule was added *after* the first real
run produced eight such items out of twenty.

**`--max-fix` defaults to 3.** Each round is an implementer plus a re-review,
so the third round costs roughly a third of an implementation. Revisit.

## 3. What the prerequisites cost

P1–P4 were blocking and are applied: a findings-fix mode in `implementer`
(without it hard constraint 1 deadlocks every review-fix round), reports to
`docs/reports/` from both reviewers, `sonnet` for the architecture reviewer,
and a report-naming convention the resolver can read.

**P2 was not a pure addition.** Neither reviewer had a `Write` tool, and that
was deliberate. The rule was narrowed rather than dropped: `Edit` stays absent
from both, so neither can modify a file that already exists, and `Write` is
granted for exactly one destination — its own report under `docs/reports/**`,
held there by the prompt the way `spec-creator` is held to `specs/**`. The
invariant that carries the weight is unchanged: a reviewer never touches the
code it reviews and never writes `.claude/pr-self-review.local.md`. The stale
"it has no Write" wording was corrected in both descriptions, both hard
constraint 1 blocks, and `.claude/agents/README.md`.

## 4. Adjacent, not part of this command

Numbered `A`, because `P` in this document means prerequisite and these are
not. They came from an audit of the whole fleet.

- **A1 — `plan-verifier` learns `AC-<n>`. Done, never run.** In the
  spec-driven chain nothing checked the spec's acceptance criteria at all: the
  planner maps them to steps and asks for the id in the test name, but the
  verifier's prompt contained neither "spec" nor "AC-". No plan in
  `docs/plans/` names a `specs/` source yet, so this has never executed.
- **A2 — dropped on measurement.** The claim was a large cut in a green run's
  output. Measured: `mcp` 38 → 34 lines, `client` 85 → 61 across 281 test
  files — 10–28%, not the order of magnitude asserted. The worked example was
  wrong too: `--silent` intercepts `console.*`, not direct `process.stderr`
  writes, so `mcp/src/log.ts`'s JSON lines survive it. What was real is a
  prompt rule, now in `implementer` and `plan-verifier`: quote a green run by
  its summary line, a failure in full, and never re-type the runner's own words
  in prose.

## 5. Non-goals

A generic workflow engine; worktree isolation (the run happens in the working
tree); replacing `/pr-self-review`, which stays human-run and remains the only
writer of the hook's verdict file; deciding parallelism the plan did not
declare.

## 6. Open questions

Three decisions taken alone, all worth challenging:

- **Worktree isolation.** Working tree for now, because artifacts-are-state
  assumes one tree. Reopens if a run gets long enough that abandoning it means
  untangling a half-finished tree by hand.
- **Concurrency ceiling.** One implementer per track, no additional cap. A
  six-track plan launches six. No evidence yet that this hurts.
- **`--max-fix` 3 versus 2.** See §2.

## 7. Acceptance criteria, and where they stand

1. ✅ Runs to a final report with no human input between agents.
2. ✅ A `draft` plan is refused; no status is ever flipped.
3. ✅ The resolver prints plan status, per-step coverage and review rounds, and
   exits non-zero on a structurally invalid plan.
4. ⬜ Interrupt and re-invoke resumes at the right phase with nothing run twice.
5. ⬜ A multi-agent plan dispatches one implementer per track, concurrently,
   and the full gate runs exactly once.
6. ✅ Both reviewers run in parallel and leave a named report file.
7. ✅ A CRITICAL/HIGH outside the plan's file list is fixed in round 1, and the
   re-review covers only that round's files.
8. ⬜ An unfixable finding exits on the no-progress rule.
9. ✅ MEDIUM and LOW reach the report unedited.
10. ✅ No commit, no push, no `pr-self-review.local.md`.
11. ✅ `sonnet` by default, `opus` only under §2's three conditions — exercised
    in both directions.
12. ⬜ **Verified by running end to end.** Phases 0, 2, 3 and 4 are; **phase 1
    is not**, and neither are multi-agent fan-out, the budget exit or the
    no-progress exit.

## 8. What the first run proved, and what it broke

Run against `docs/plans/2026-08-18-mcp-server.md`, `--from review`; full record
in `docs/reports/2026-08-22-run-plan-mcp-server.md` (gitignored).

**It found a real bug in merged code.** `run-agent-on-pr.ts` started a paid LLM
run with a normalized `prId` and then polled, echoed and re-read with the raw
`pr_id`; a whitespace-padded uuid burned the full 180 s timeout reporting a
finished run as still going. Nine implementer reports and 76 tests had passed
over it. Fixed, with two regression tests watched failing first.

**It exposed two defects in the tooling, both now fixed.** `plan-verifier` had
no turn budget and burned 40 turns and 121k tokens producing nothing; with the
budget it wrote its 17 KB report and *then* ran out, losing the chat summary
and not the work — the file-first rule doing exactly its job. And the fix cycle
would have regressed working code to a superseded plan (§2).

**It confirmed a known gap:** no dependency-cruiser config walks `mcp/`, so no
`arch:check` ran on anything. `mcp/test/guards.test.ts` is the only boundary
enforcement there, and every ring claim in those reviews is judgement plus
grep.
