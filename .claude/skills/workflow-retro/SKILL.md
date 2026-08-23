---
name: workflow-retro
description: "Retrospective on a multi-agent workflow that just finished — what it cost, where the waste was, and what to change so the next run is cheaper. Use it AFTER a run that dispatched several agents (a spec interview, /run-plan, a review fan-out, any session with more than two or three subagents), whenever the human asks how a run went, what it cost, how many tokens or agents it took, why it took so long, or whether the agents duplicated each other's work. Also use it when the human wants to know whether a change they made after the last retro actually helped. It reads the transcripts the harness already wrote, reports metrics, findings and concrete proposals, and appends a row to docs/retro/ledger.md. Trigger terms: retro, retrospective, how did that run go, what did that cost, workflow cost, token spend, why so many agents, ретро, ретроспектива, скільки коштувало."
metadata:
  tags: process, retrospective, cost, agents, ledger
---

# Workflow Retro

A multi-agent run is judged badly from the inside. While it happens every
dispatch looks necessary; only afterwards, with the numbers beside each other,
does it become clear that two of seven revisions existed solely because one
agent ran too late. The harness writes every transcript to disk and nobody ever
reads them again, so the same ordering mistake is free to repeat next week.

This skill reads them once, says what the run cost and where the waste was, and
proposes specific changes — each naming a file, a change, and what it would
have saved on the run just measured.

Design: `docs/superpowers/specs/2026-08-23-workflow-retro-design.md`.

## Two rules that shape everything else

**It never runs on its own.** No hook, no automatic trigger. The human asks.

**It dispatches no subagents.** An instrument that measures what a fan-out cost
must not be a fan-out. Everything here runs inline, in this session. If you
find yourself reaching for the Agent tool, the answer is that the run is too
big for one pass — say so and narrow the scope instead.

## The run

### 1. Metrics

**The session is always named, never guessed.** For the current session, take
the id from your own scratchpad path — it is
`/private/tmp/claude-501/<project-slug>/<SESSION-ID>/scratchpad`, and that
`<SESSION-ID>` is exactly the transcript directory's name. Pass it:

```sh
bash .claude/skills/workflow-retro/scripts/metrics.sh <SESSION-ID>
```

For an older run, pass its id or full path from the list the script prints.

The script **refuses to run with no argument** (exit 2) and prints the
candidates instead. That refusal is deliberate. It used to fall back to "newest
directory with transcripts", and on 2026-08-23 that answered a question about
the current session with another session's numbers — a second Claude Code
window had written a transcript four minutes earlier and won the race. The
figures were real, internally consistent and wrong, which is the worst way an
instrument can fail: nothing in the output looks off. An argument you must
supply cannot be silently wrong.

Prints, in this order: the sessions that hold transcripts with the chosen one
marked; agents in launch order with tokens, tool uses and duration; totals and
how many dispatches overlapped; files touched by more than one agent; files
re-read inside one agent; flags; and what the numbers do not cover. No LLM, no
network — every number comes from the JSONL on disk, so two runs of this on the
same session agree.

**Check the marked row before reading anything else.** The list prints every
candidate with its agent-type mix, and marks the one being measured with `->`.
A project accumulates a session per workflow ever run in it, so confirm the
marked row is the run the human meant — `9×implementer` and
`4×architecture-reviewer 3×plan-verifier` are recognisable at a glance where a
UUID is not. If it is the wrong one, re-run with the right id rather than
reporting numbers from a run nobody asked about.

**If the script errors, read it before working around it.** It is short, and a
wrong path is a five-second fix; re-deriving its jq inline costs more than the
retro is worth.

### 2. Findings

The numbers are not the report. Read them for the six things that actually cost
something, and say which ones this run shows — with the figures attached, not
as general observations.

| Look for | The signal |
|---|---|
| **Rework — split it in two, always** | how many agents revised a previous agent's output. Report it as two numbers, never one. **Designed iteration** is a cycle the workflow is built around: `/run-plan`'s fix → re-review → verify rounds are not waste, they are the method. **Accidental redo** is work that existed only because something ran in the wrong order or a briefing was wrong. Only the second is avoidable, and only it belongs in a proposal. Measured runs so far: the project-context spec was 78%, almost all accidental; the mcp-server run-plan was ~30%, all of it designed. Quoting those two side by side as one metric compares nothing. |
| **Order inversion** | whose output would have changed the briefing of an agent that ran *earlier*. Almost always the biggest single saving, and the hardest to see from inside. |
| **Outliers, within a type** | each agent is compared only against others of its own type, and the baseline is printed per type with where it came from. This matters: a `plan-verifier` median is 40 tool uses where an `implementer` median is 6, so a whole-session median makes a verifier look anomalous every time it does its job correctly — and a flag that accuses correct work teaches the reader to ignore flags. When a type ran only once or twice here, the baseline is borrowed from that type's history across the project's other sessions and marked `(history)`; a spec workflow legitimately dispatches exactly one researcher, and that is precisely the agent worth judging. Read the marker: `(this run)` compares an agent with the peers it actually ran beside, `(history)` with how that type usually behaves. Only when neither yields three runs does it print `not judged`. |
| **Duplicated context** | one file opened by many agents. Partly unavoidable (a reviser must read what it revises); a file read three or more times inside *one* agent is the interesting case — its briefing did not stick. |
| **Serialisation** | `concurrent starts: 0` means every dispatch waited. Ask what it waited for: agents that touch disjoint files could have gone together, and a wait for a human is the dominant driver of elapsed time even though it costs no tokens. |
| **Contradiction** | a later agent refuting an earlier one's claim. A quality signal rather than a cost one, and it usually points at a missing check earlier in the workflow. |

Human round-trips are worth counting too, and they are **not** in the
transcripts — they come from this session's own history. Count them.

### 3. Proposals

Analysis that changes nothing is a report. Each proposal carries three parts,
and the third is what separates it from advice:

> **P1. Run the "what already exists" sweep before the first writer, not after.**
> **Where:** `.claude/skills/spec-creator/SKILL.md`, phase 2.
> **Evidence:** the sweep started at 22:05, the first writer at 21:39. Two of
> seven revisions (~25k output tokens) existed only to correct what it found.
> **Status:** applied during this session.

The evidence line comes from the run being measured. A proposal justified by
general principle rather than by this run's numbers is one you already knew and
did not need a retro to learn.

Propose; do not apply. The human picks which land, and applying them is a
separate step they ask for.

### 4. Output

**To chat:** one headline figure, the agent table, three to five findings, the
proposals. Ordered by value, and short enough not to scroll.

**To the ledger,** appended, never rewritten:

```
docs/retro/ledger.md              one row per run
docs/retro/YYYY-MM-DD-<slug>.md   the full account, when there is one to give
```

Create `docs/retro/` and the ledger's header row if they do not exist yet.

```
| date | workflow | agents | out tokens | rework | applied since last retro |
|------|----------|--------|-----------|--------|--------------------------|
| 2026-08-23 | spec: project-context | 9 | 117k | 78% | — (first) |
```

The last column is what makes this a ledger and not a pile of reports: the next
retro reads the previous row and can say *rework fell from 78% to 30% after
P1*. Fill it by reading the previous row's proposals and checking whether they
landed. Without it, diagnoses accumulate and nobody learns whether a fix worked.

Write the per-run file only when there is a narrative worth keeping — an
ordering mistake, a contradiction, an agent that failed. A run that went well
earns a ledger row and nothing more.

## `deep`

Off unless asked for. It reads transcript **content**, and only for the agents
the metrics flagged.

Extract with `jq` field selectors — tool names, the final text, the sites of a
repeated read. Never `cat` a transcript and never tail one: they run to hundreds
of kilobytes and the harness warns that reading one whole overflows the session.

If nothing was flagged, `deep` has nothing to do. Say so rather than reading
transcripts to look busy.

## Scope

Default: the current session, and the human names the workflow.

If one session ran two different workflows the script cannot separate them —
ask for a time or agent-type filter rather than guessing. A word from the human
is exact where inference would not be.

## What it does not do

- **No grades.** A number beside an agent's name invites optimising the number.
- **No edits to agent or skill definitions.** It proposes; the human chooses.
- **Nothing in a module's `INSIGHTS.md`.** Those hold lessons about the
  product's code. Retro findings live in `docs/retro/`.
- **Its own cost is reported, and so is what it cannot see.** An instrument
  that measures spending and hides its own is not trustworthy — and one that
  reports a total while silently omitting a whole category is worse, because
  the number looks complete. Two categories are missing from the metrics and
  the script says so on every run: work done by `claude -p` subprocesses (the
  description optimiser is the one that bites — real tokens, no transcript),
  and the main session's own turns. Counting either would mean matching
  session directories by time window, which is a guess; naming the gap is
  honest where a guess would not be.

## Known about the transcripts

Learned by running this against real sessions; each of these costs an hour to
rediscover.

- Timestamps carry milliseconds (`2026-08-22T22:52:55.860Z`) and
  `fromdateiso8601` rejects them — `sub("\\.[0-9]+Z$";"Z")` first.
- `<session>/tasks/<id>.output` are **symlinks** into `subagents/`. Follow them.
- `agentType` and the human-readable description live only in
  `agent-<id>.meta.json`, never in the `.jsonl`. Join on the file stem.
- Token counts are on assistant lines under `message.usage`;
  `cache_read_input_tokens` is usually the largest field and is not what a run
  "cost" in the sense the human means.
