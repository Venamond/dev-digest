# Retro — `/run-plan`: project-context-folder

- **Date:** 2026-08-23
- **Session:** `401e9627-55c6-4486-b180-e0d68a0ac1e4`
- **Workflow:** `/run-plan` over `docs/plans/2026-08-23-project-context-folder.md` (17 steps, 4 tracks)

## Metrics

| | |
|---|---|
| agents | 9 — 5 `implementer`, 2 `architecture-reviewer`, 2 `plan-verifier` |
| agent output tokens | 459,717 |
| agent tool uses | 595 |
| agent time | 6,877s (≈1h55m) |
| concurrent starts | 4 of 8 |
| outliers within a type | none |
| **main session output tokens** | **921,232** over 419 user turns |

| # | agent | task | out tok | tools | sec |
|---|---|---|---|---|---|
| 1 | implementer | track A (S1–S4) | 53,073 | 85 | 747 |
| 2 | implementer | track B (S5–S9) | 90,559 | 95 | 1,342 |
| 3 | implementer | track C (S10–S13) | 111,025 | 116 | 1,625 |
| 4 | implementer | track D (S14–S17) | 59,072 | 79 | 905 |
| 5 | architecture-reviewer | review r1 | 22,855 | 22 | 313 |
| 6 | plan-verifier | verify r1 | 30,432 | 43 | 445 |
| 7 | implementer | fix round 1 | 53,047 | 91 | 950 |
| 8 | architecture-reviewer | review r2 | 20,358 | 32 | 292 |
| 9 | plan-verifier | verify r2 | 19,296 | 32 | 258 |

## Findings

**1. Rework was 20% and all of it designed.** Fix round + both re-reviews =
92,701 of 459,717 output tokens. No agent revised another's work because of a
bad briefing or a wrong order; the cycle that ran is the one `/run-plan` is
built around. For comparison, the spec run measured on the same day was 78%,
almost entirely accidental. The fan-out itself was clean.

**2. The expensive half of this session was not the fan-out.** The main
session spent **921,232 output tokens — twice all nine agents combined** — and
almost all of it after the run reported CLEAR, converging the UI against the
mockups. The workflow's cost was not where the workflow was.

**3. Nothing in the workflow can see a mockup, and it passed a screen that
matched none.** 42 acceptance criteria MET, `architecture-reviewer` CLEAR,
`plan-verifier` 58 MET, 342 client tests green — and the Project Context page
did not match M1. Every reviewer was correct: no criterion describes layout.
This is an **order inversion of a missing check**: the design was consumed once,
to write the criteria, and nothing downstream carried it. Recorded separately
at `client/INSIGHTS.md`.

**4. Two agents reported `completed` with their deliverable missing.** Track C
stopped mid-S13 and `plan-verifier` r1 stopped before writing its report; both
returned a truncated final message. Neither was detected by the notification —
only by re-reading the resolver and `docs/reports/`. Two resume round-trips.
**This is exactly the failure the previous retro's P2 predicted**, and P2 was
never applied.

**5. Serialisation was justified, not accidental.** 4 of 8 dispatches
overlapped: B‖C, and both review rounds ran in pairs. Track A ran alone because
it owned every shared surface, and D waited on S8 because it consumes S8's
facade. The waits that dominated elapsed time were human ones, which cost no
tokens.

**6. No duplicated context worth fixing.** The plan was read by 6 agents (it is
the brief — unavoidable), and no file was re-read inside a single agent, which
says the scoped briefs held.

## Proposals

**P1. Carry the mockup into the plan step as an element checklist, and have
`plan-verifier` walk it.**
**Where:** `.claude/agents/implementation-planner.md` (the `## 4. Steps`
template) and `.claude/agents/plan-verifier.md` (what it verifies).
**Evidence:** finding 3. Every gate passed a non-conforming screen, and the
correction consumed the larger half of this session's 921k main-session tokens.
The planner already cannot see images — the checklist is the only form in which
a design survives into an agent's brief.
**Status:** **applied 2026-08-23** — `implementation-planner` now requires an
element checklist (region tree, exact labels, deliberate absences, and each
departure with the criterion that forced it), and `plan-verifier` enumerates
those rows with the other items before looking at code. A worked example exists
at `docs/reports/2026-08-23-mockup-conformance-project-context.md`.

**P2. `/run-plan` must confirm the artifact exists before advancing — and the
previous retro's turn budget must actually land.**
**Where:** `.claude/skills/run-plan/SKILL.md`, phases 1 and 2.
**Evidence:** finding 4, twice in one run. The skill already tells the
dispatcher to say "the report is a requested deliverable"; it does not tell it
to **check**. One `ls docs/reports/` between phases turns a silent stall into a
resume.
**Status:** **applied 2026-08-23** — `/run-plan` now re-checks the resolver
before advancing a phase and resumes a stalled agent with `SendMessage`, and
every brief carries "stop at turn N and emit what you have". This is the
previous retro's P2, finally landed.

**P3. A UI step's verification must include a screenshot.**
**Where:** `.claude/agents/implementation-planner.md`, the `## 5` verification
table, for any step touching `client/src/app/**`.
**Evidence:** headless Chrome was on the machine the whole time and no agent
used it. The first screenshot taken — after typecheck was clean and 348 tests
were green — immediately showed four defects no test could see, including a
detail pane that never loaded its document.
**Status:** **applied 2026-08-23** — the planner's `## 5` table now requires a
screenshot for any step touching `client/src/app/**`, with the command and its
`--virtual-time-budget` caveat inline. Two further changes landed alongside:
`spec-creator` signs off design departures row by row, and `implementer` /
`test-writer` are told to assert the criterion rather than the copy.

## Token analysis (added 2026-08-23, after the retro)

Where the spend actually sits, from the same measurement:

| | tokens |
|---|---|
| output, all nine agents | 459,717 |
| output, main session | **921,232** |
| cache read, main session | **409,733,914** |
| cache written | 5,217,588 |

**The fan-out is a third of the spend.** Two thirds is the conversation, and the
409.7M cache read is 419 turns each re-sending everything before it. The
write/read ratio of 1:78 says caching already works; the lever is not to add
caching but to stop growing what is cached.

Five levers were considered. What each is worth **here**:

| Lever | Verdict on this run |
|---|---|
| Shorter artifacts between agents | **Largest of the five.** Six of nine agents read the 1000-line plan in full; naming step ids in the brief did not prevent it. → **P4** |
| Cheaper models for mechanical stages | **Small, and mis-aimed by track.** Track B found a real cross-tenant hole and track D hardened `wrapUntrusted` — neither is mechanical. Mechanical is a property of a *step* (contract mirroring, i18n, moving helpers), not of a track. The clear saving is round 2's escalation. → **P5** |
| Caching shared context | Already effective (1:78). The real cost is **images**: nine screenshots and mockups entered context, one mockup read twice by mistake. Read a design once, convert it to text, work from the text. |
| Not re-sending the diff | **Does not apply.** No diff travels between agents; each implementer reads files itself. The re-sent thing is the conversation. |
| Fewer agents where work is sequential | Parallelism was justified everywhere except round 2, which spent 39k across two agents to confirm four fixes. → **P5** |

**None of the five addresses the biggest number.** The 921k main-session spend
went mostly on converging the UI against the mockups *after* the run reported
CLEAR — which is what P1–P3 target.

**P4. Dispatch against a per-track extract, not the plan.**
**Where:** `.claude/skills/run-plan/SKILL.md`, phase 1.
**Evidence:** the metric's "files touched by more than one agent" shows the plan
read by six agents.
**Status:** **applied 2026-08-23** — the dispatcher writes
`docs/plans/.extract/<slug>-<track>.md` as a **verbatim slice** (never a
summary, which would be a second source of truth), and the extract directory is
git-ignored.

**P5. Round 2+ re-runs only the reviewer whose findings were fixed, and judges
model escalation on that round's change set.**
**Where:** `.claude/skills/run-plan/SKILL.md`, phase 2.
**Evidence:** round 2 cost 39k output tokens across two agents to confirm four
fixes; both ran on `opus` because the trigger was read against the whole run's
change set rather than the round's.
**Status:** **applied 2026-08-23**.

**Not measured:** the saving from P4 is an estimate. The metrics report agents'
**output** tokens; the input each spent reading the plan is not in them, so "six
agents read the plan" is a fact and "what it cost" is not.

## What this measurement does not cover

- `claude -p` subprocesses write no transcript here; none of their tokens are
  above.
- The 921,232 main-session figure is the **whole session**, which includes the
  spec discussion and the plan before the run, not only the post-run UI work.
  It is an upper bound on that phase, not a measurement of it.
- This retro itself: 4 tool calls, no subagents, inline.
