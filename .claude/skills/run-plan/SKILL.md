---
name: run-plan
description: Execute an already approved Implementation Plan from docs/plans/ end to end — dispatch implementers over the plan's tracks, run the gates once, review with architecture-reviewer and plan-verifier in parallel, then drive a bounded fix cycle. Use when the human wants a plan carried out without retyping briefs between agents, or wants to resume a run that was interrupted. Requires an approved plan; it never writes a spec, never plans, never commits and never pushes. Trigger terms: run the plan, execute the plan, /run-plan, продовжити план, виконати план.
---

# run-plan — executing an approved plan

You run in the main session, so you can dispatch subagents and they cannot.
That is the whole reason this skill exists: the plan already says what to do,
and every handoff between agents is retyping a human should not be doing.

Design record: `docs/superpowers/specs/2026-08-22-run-plan-design.md`.

**You execute. You never author.** `/spec-creator` and
`implementation-planner` are run by the human, separately, before you. If the
requirements are wrong, that is not something you fix mid-run — you stop and
say so.

## Arguments

```
/run-plan <slug | path-to-plan> [--max-fix N] [--dry-run] [--from PHASE]
```

`--max-fix` defaults to **3**. `--from` takes `implement`, `review`, `fix` or
`report` and overrides the resolver. `--dry-run` stops after phase 0.

There is no `--continue`: re-running the same command resumes, because the
artifacts on disk are the state.

## Phase 0 — resolve, always

```sh
./scripts/run-plan-state.sh <slug>
```

Show its output to the human verbatim, then say in one sentence what you are
about to do. Never derive the phase yourself — that is bookkeeping, and the
script exists so you do not spend judgement (or context) on counting files.

Stop here, without dispatching anything, when:

- the script exits non-zero — the plan is missing or structurally invalid;
- `Status` is not `approved` — say that a human approves the plan, and stop.
  **Never flip a status yourself**, in the plan or in a spec;
- `--dry-run` was passed. List the dispatches you would have made.

## Phase 1 — implement

Read `Execution mode` from the plan's `## 0`. When the resolver prints
`unspecified` (older plans predate the field), treat it as single-agent and
say so.

- **multi-agent** — one `implementer` per track that still has unreported
  steps, all dispatched **in a single message** so they run concurrently.
  The plan already guarantees tracks do not share files; do not re-derive
  that judgement, and do not re-cut tracks. If an implementer reports an
  overlap, stop the run: only `implementation-planner` re-cuts tracks.
- **single-agent** — one `implementer`, steps in order.

**Never dispatch a step the resolver marked `✓`.** That is what makes a
re-invocation a resume rather than a repeat.

**Every dispatch carries a scoped brief**, and this is where the run's cost is
decided. Include: the plan path, the step ids in scope, which `Depends on`
branch earlier steps took, what earlier files already contain, and the report
file name to use. That brief is what lets `implementer` use its scoped
single-step invocation instead of reading a plan that can run past 130 KB.

Add one line to every brief: **the report file is a requested deliverable, not
proactive documentation** — otherwise the agent may return it inline and the
resolver will read that step as unfinished and run it again.

**Gates are split.** Steps verify themselves narrowly. When the last track
lands, you run the full gate once — the plan's `## 5` table plus
`arch:check` and `check-shared-sync.sh` where they apply. Paste the summary,
not the whole runner output.

## Phase 2 — review

Dispatch `architecture-reviewer` and `plan-verifier` **in parallel, in one
message**. Both are read-only towards the code and independent of each other.

Give both: the resolved list of changed files (so neither spends a turn
re-deriving it), the plan path, the slug, and the round number.

**Escalate the reviewer's model to `opus`** — via the `Agent` tool's `model`
parameter, which overrides frontmatter — when any of these holds:

- the change set adds a new module, adapter or port;
- it touches `vendor/shared` or `db/schema`;
- the previous round produced a CRITICAL.

Otherwise leave it on its `sonnet` default. Say which you chose and why.

## Phase 3 — the fix cycle

Bounded by `--max-fix`.

| Source | Fix these | Brief |
|---|---|---|
| `architecture-reviewer` | CRITICAL, HIGH | the findings with `file:line` — findings mode, the list is the allowlist |
| `plan-verifier` | NOT MET, PARTIALLY MET | the plan step id — ordinary mode, files from `## 4. Steps` |

**Never auto-fix MEDIUM or LOW.** They are the reviewer's judgement rather
than a violated rule, and the human keeps the right to call one a false
positive. They go to the final report as handoff.

**Before fixing any `NOT MET` or `PARTIALLY MET`, ask which side is stale.**
A plan describes what was decided *then*; later approved work supersedes parts
of it, and the verifier reports that divergence in exactly the same words it
uses for unfinished work. Read its Note column: when it says the item was
superseded — a helper deleted by a later decision, a stub since replaced, a
threshold deliberately raised — the **plan** is out of date, not the code, and
dispatching a fix would make an implementer regress working code back to an
abandoned design.

Those items are plan defects. They go to the final report under that heading,
addressed to the human, who takes them to `implementation-planner` or retires
the plan. Only items the verifier attributes to work that was never done reach
the fix cycle.

This is not a rare edge: the first real run of this skill verified a plan whose
code had moved on twice since approval, and eight of its twenty items were
divergence rather than defect.

`CANNOT VERIFY` is not a defect. Report it with its reason; do not fix it.

After a fix round, re-review **only the files that round changed**.

**Three exits, whichever comes first:**

1. **Clean** — no CRITICAL/HIGH, no NOT MET/PARTIALLY MET.
2. **Budget** — `--max-fix` rounds spent.
3. **No progress** — a round changed no file. Exit immediately and name the
   item that stalled; the remaining rounds would buy nothing.

**When a fix would contradict a step of the plan**, neither side wins. Record
it as a plan defect for the human and move on — reconciling the two is
`implementation-planner`'s job, not yours.

## Phase 4 — report

Write `docs/reports/<YYYY-MM-DD>-run-plan-<slug>.md`: per-step status, the
final gate output, what each fix round changed, anything unresolved when the
budget or no-progress exit hit, MEDIUM/LOW as handoff, and what was not
verified.

In chat: five lines and the path. Then tell the human what is theirs —
migrations if a plan step is marked human-run, the commit, `/pr-self-review`,
the PR.

## Never

- Write or edit a spec, a plan, or any `Status:` line.
- Call `/spec-creator`, `implementation-planner` or `test-writer`. Coverage
  comes from each step's own `Test:`, written by `implementer` with the
  behaviour it proves.
- Commit, push, or open a PR. `git push` stays blocked by the `PreToolUse`
  hook until `/pr-self-review` records `CLEAR`, and that review is the
  human's to run.
- Run `pnpm db:migrate`. A step marked human-run stops the run and asks.
- Re-cut tracks, widen a findings list, or decide parallelism the plan did
  not declare.
