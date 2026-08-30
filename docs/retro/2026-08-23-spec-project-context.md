# Retro — spec: project-context

> 2026-08-23 · 9 agents · 117,316 output tokens · 205 tool uses · 25 min of agent time
> Workflow: `/spec-creator` interview → `spec-creator` agent, seven times, plus one `researcher`

## What ran

| # | type | task | out tok | tools | sec |
|---|---|---|---|---|---|
| 1 | spec-creator | Write Project Context spec | 26,063 | 22 | 337 |
| 2 | spec-creator | Revise Project Context spec | 12,610 | 24 | 161 |
| 3 | researcher | Sweep what already ships | 22,128 | 69 | 301 |
| 4 | spec-creator | Fold researcher sweep into spec | 12,583 | 23 | 159 |
| 5 | spec-creator | Fold seven answers into spec | 12,282 | 19 | 145 |
| 6 | spec-creator | Adjudicate proposal and design review | 12,989 | 18 | 158 |
| 7 | spec-creator | Replace chunks with tokens total | 6,992 | 10 | 93 |
| 8 | spec-creator | Fold four ordering and scope answers | 10,063 | 15 | 125 |
| 9 | spec-creator | Move spec status to approved | 1,606 | 5 | 22 |

Concurrent starts: **0 of 8**. Every dispatch waited for the previous one, and
in almost every case for a human answer between them — roughly twelve
round-trips. That, not the token count, is what made the run take an evening.

## Findings

**Order inversion — the expensive one.** The research pass ran third. Had it
run first, agents 2 and 4 would not have existed: agent 2 corrected a claim the
sweep later refuted, and agent 4 existed only to fold the sweep's findings in.
That is **~25k output tokens, a fifth of the run**, spent re-deciding what a
$0-risk read of the codebase would have settled up front.

**Rework 78%.** Seven of nine dispatches revised a previous agent's output.
That is not inherently wrong — an interview genuinely arrives in waves as the
human answers — but two of the seven were avoidable, and the first write cost
more than twice any revision (26k vs 10–13k). Getting the first write right is
worth disproportionate effort.

**Contradiction.** The research pass refuted a claim — "the editors have no tab
bars" — that had already reached the spec. The claim came from checking one
directory and generalising. It cost a revision to undo. The general shape:
a confident negative ("X does not exist") asserted from a partial search.

**Investigation-heavy agent.** The sweep used 69 tool calls against a median of
19, and produced 320 output tokens per call where others produced 500–1,200. It
spent its turn reading rather than writing, and it stopped without emitting its
report — recoverable only by resuming it and asking for the report from what it
already had.

**Duplicated context, mostly justified.** The spec file was opened by 8 of 9
agents. That is inherent to revision — mode B requires reading the file first.
The interesting case is agent 2 reading it **four times in one run**. Also
worth noting the good news: the mockups were read by exactly one agent, the
only one that needed them, because the briefing carried a transcription instead
of a pointer.

## Proposals

**P1. Run the "what already exists" sweep before the first writer, not after.**
**Where:** `.claude/skills/spec-creator/SKILL.md`, phase 2.
**Evidence:** the sweep started at 22:05, the first writer at 21:39. Two of
seven revisions, ~25k output tokens, existed only to correct what it found.
**Status:** **applied during this session** — the conditional "dispatch a
researcher when a decision turns on a fact nobody holds" was replaced by an
unconditional first step with a fixed question. The old trigger was unknowable
by construction: you cannot notice a fact you do not know you are missing.

**P2. Give an investigation-heavy agent a turn budget, not just an order.**
**Where:** the `researcher` brief, and any agent asked for a per-item table.
**Evidence:** 69 tool calls, 320 output tokens per call, and no report until it
was resumed. A large tabular deliverable is itself a budget item.
**Status:** proposed. The fix is one clause — "stop investigating at turn N and
emit what you have".

**P3. Never assert a negative from a partial search.**
**Where:** the interview half of `/spec-creator`, phase 2.
**Evidence:** "the editors have no tab bars" came from checking the list-view
folder and the six-line route file, missing `AgentEditor/` entirely. One
revision to undo.
**Status:** proposed. P1 covers it indirectly — the sweep would have caught it —
but the habit is worth naming separately.

## Limits of this measurement

- Whether an agent needed a second push is **not in its transcript**: a resumed
  agent's transcript ends with the message it produced after the nudge. The
  investigation-heavy flag is a proxy, not proof.
- Human round-trips were counted from the session, not the transcripts. Nothing
  on disk records them.
- Cost in currency is not reported. It needs a price table for the models the
  agents actually ran on, which does not exist yet — the server's price book
  covers the models the *product* reviews with, which is a different question.
