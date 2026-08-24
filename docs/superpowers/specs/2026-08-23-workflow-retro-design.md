# `workflow-retro` — design

> Date: 2026-08-23
> Status: approved by the human, not yet implemented
> Scope: a new skill under `.claude/skills/workflow-retro/`

## Problem

A multi-agent workflow spends real money and real wall-clock time, and the
session that ran it is the worst possible judge of how it went. From inside,
every dispatch looked necessary. Only afterwards, with the numbers side by
side, does it become visible that two of seven revisions existed solely because
one agent ran too late.

Nothing today records that. The transcripts are written to disk and never read
again, so the same avoidable ordering mistake is free to repeat next week.

## What it is

A manually-triggered skill that reads what a finished workflow left behind,
reports what it cost and where the waste was, and proposes specific changes to
the agents and skills involved — each proposal naming a file, a change, and
what it would have saved on the run just measured.

It is a **retrospective**, not a monitor: it never runs on its own.

## Constraints the human set

| Constraint | Consequence |
|---|---|
| Manual trigger only | No hook, no automatic invocation. "At least for now." |
| Must not itself be a multi-agent run | The skill spawns **no** subagents. It runs inline in the main session. An instrument that measures cost must not be a major cost. |
| Two readers: the human and the agents | Chat output for the human; proposals written as concrete file-level changes for the agents. |
| Output to chat **and** a ledger file | Both, every run. |
| Analysis **and** proposals | A retro that only diagnoses is a report; the point is the change it causes. |
| In-context by default, `deep` optional | Metrics always; transcript content only on request, and only for flagged agents. |

## Where the data is

Proven on this session, 2026-08-23.

```
~/.claude-max/projects/<project-slug>/<session-id>/subagents/
    agent-<id>.jsonl        full transcript, one JSON object per line
    agent-<id>.meta.json    { agentType, description, toolUseId, spawnDepth }
```

`<session-dir>/tasks/<id>.output` are **symlinks** into that directory — follow
them, do not treat them as files.

Each `.jsonl` line carries `timestamp`, `type`, `message`, `toolUseResult`,
`agentId`. Assistant lines carry `message.usage` with `input_tokens`,
`output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.

Everything the metrics half needs is here. **No LLM call is required to produce
any number in this document.**

### Gotchas found while proving it

- Timestamps carry milliseconds (`2026-08-22T22:52:55.860Z`) and
  `fromdateiso8601` rejects them. Strip first:
  `sub("\\.[0-9]+Z$";"Z") | fromdateiso8601`.
- Transcripts reach hundreds of KB. Never `cat` or tail one — the harness warns
  that reading one overflows the session context. Extract with `jq` field
  selectors only.
- A `.meta.json` exists per agent and is the only place `agentType` and the
  human-readable description live. Join on the file stem.

## What it measures

### The human's list

- output / input / cache tokens, per agent and total
- number of agents and their types
- launch order, and whether anything ran concurrently
- tool-use count and duration per agent
- which files each agent touched → what information was duplicated

### Added during design, with the reason each earned its place

Each was justified by what it showed on the session that produced this document.

1. **Rework share** — how many runs revised a previous agent's output rather
   than doing new work. *This session: 7 of 9, and 2 of those existed only
   because one agent ran too late.* The single most actionable number: it
   states how much was avoidable.
2. **Serial vs parallel** — how many agents could have run concurrently,
   derived from whether their touched-file sets intersect. *This session: none
   ran concurrently, though the research pass conflicted with nothing.*
3. **Order inversion** — whose output would have changed the briefing of an
   agent that ran earlier. The highest-value finding and the only one that
   genuinely needs `deep` or the session's own memory.
4. **Budget exhaustion** — tool-use count far above the run's median **and** no
   structured result returned. *This session: 69 tool uses against a median of
   22, and it was the only agent that failed to deliver its report first time.*
   Detectable automatically.
5. **Briefing efficiency** — whether an agent re-read what its briefing already
   contained. *This session: the mockups were read once, by the only agent that
   needed them — the transcription in the briefing worked. But one agent read
   the same spec four times in a single run.*
6. **Contradiction** — whether a later agent refuted an earlier one's claim.
   *This session: the research pass refuted a claim that had already reached
   the spec.* A **quality** signal, not a cost one.
7. **Human round-trips** — how often the workflow stopped for an answer. *This
   session: roughly twelve.* The dominant driver of elapsed time, and absent
   from the transcripts — it comes from the session alone.
8. **The retro's own cost** — reported every run. An instrument that measures
   spending must account for its own.

### What it does not do

- Does not grade agents. A number next to a name invites optimising the number.
- Does not edit agent or skill definitions. It proposes; the human chooses; a
  separate step applies.
- Does not write to any module `INSIGHTS.md`. Those hold lessons about the
  product's code. Retro findings live in `docs/retro/`.

## Output

### Chat

Ordered by value, nothing that needs scrolling: one headline figure, the agent
table, three to five findings, then the proposals.

### Ledger — two levels

```
docs/retro/ledger.md              one row per run, append-only
docs/retro/YYYY-MM-DD-<slug>.md   the full account, when there is one to give
```

The row carries the run's cost **and whether the previous retro's proposals were
applied**:

```
| date | workflow | agents | out tokens | rework | applied since last retro |
|------|----------|--------|-----------|--------|--------------------------|
| 2026-08-23 | spec: project-context | 9 | 117k | 78% | — (first) |
```

That last column is what makes this a ledger rather than a pile of reports: the
next retro can say *rework fell from 78% to 30% after P1*. Without it the
diagnoses accumulate and nobody ever learns whether a fix worked.

### The shape of a proposal

Three parts, all required:

> **P1. Run the "what already exists" sweep before the first writer, not after.**
> **Where:** `.claude/skills/spec-creator/SKILL.md`, phase 2.
> **Evidence:** the sweep started at 22:05, the first writer at 21:39. Two of
> seven revisions (~25k output tokens) existed only to correct what it found.
> **Status:** applied during this session.

Without the evidence line it is advice, and advice is not scarce. The number
comes from the run being measured, never from general principle.

## `deep` mode

Off by default. When asked for, it reads transcript **content** for the agents
the metrics flagged — budget exhaustion, contradiction, anomalous rework — and
no others.

Bounded by construction: `jq` field selectors only — tool names, final text,
repeated-read sites. Never message bodies, never the whole file. If nothing was
flagged, `deep` does nothing and says so.

## Run boundary

The trigger is manual, so the default scope is the current session's agents and
the human names the workflow.

**Stated limitation:** if one session ran two different workflows, the skill
cannot separate them on its own; the human passes a time or agent-type filter.
Automatic detection is deliberately not designed now — it would add a guess
where a word from the human is exact.

## Worked example — the session that produced this design

| type | task | out tokens | tools | sec |
|---|---|---|---|---|
| spec-creator | Write Project Context spec | 26,063 | 22 | 337 |
| spec-creator | Revise Project Context spec | 12,610 | 24 | 161 |
| researcher | Sweep what already ships | 22,128 | 69 | 301 |
| spec-creator | Fold researcher sweep into spec | 12,583 | 23 | 159 |
| spec-creator | Fold seven answers into spec | 12,282 | 19 | 145 |
| spec-creator | Adjudicate proposal and design review | 12,989 | 18 | 158 |
| spec-creator | Replace chunks with tokens total | 6,992 | 10 | 93 |
| spec-creator | Fold four ordering and scope answers | 10,063 | 15 | 125 |
| spec-creator | Move spec status to approved | 1,606 | 5 | 22 |

9 agents · 117,316 output tokens · zero concurrency · the spec file read by 7
agents, 11 times.

Findings this would have surfaced: the ordering inversion (P1, since applied),
the budget exhaustion on the research pass, and the one agent that read the same
file four times in a run.

## Open

- Whether the ledger row should carry cost in currency as well as tokens. Needs
  a price table the skill does not have today.
- Whether `deep` should also be able to read a **previous** session's
  transcripts, not just the current one. Not needed yet; the trigger is manual
  and retros happen right after the run.
