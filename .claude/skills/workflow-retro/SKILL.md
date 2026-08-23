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

**It never runs on its own.** No `Stop`, `SubagentStop` or `PreToolUse` hook,
no entry in `.claude/settings.json`, no tail-call from the end of another
skill. `grep -rn retro .claude/settings*.json` returns nothing, and it must
keep returning nothing: a retro that fires by itself measures runs nobody
asked about and trains the reader to skip its output. The human asks.

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
python3 .claude/skills/workflow-retro/scripts/metrics.py <SESSION-ID>
```

For an older run, pass its id or full path from the list the script prints.
`--idle-gap N` changes what counts as an agent sitting idle (default 120s).

The script **refuses to run with no argument** (exit 2) and prints the
candidates instead. That refusal is deliberate. It used to fall back to "newest
directory with transcripts", and on 2026-08-23 that answered a question about
the current session with another session's numbers — a second Claude Code
window had written a transcript four minutes earlier and won the race. The
figures were real, internally consistent and wrong, which is the worst way an
instrument can fail: nothing in the output looks off. An argument you must
supply cannot be silently wrong.

Prints, in this order: the candidate sessions with the chosen one marked; the
run header; the agent table, in launch order with nested agents indented under
their parent; the conversation's own cost, twice — the whole session and the
slice that overlaps the run; totals; launch waves; the critical path; files
touched by more than one agent; files re-read inside one agent; flags; and what
the numbers do not cover. No LLM, no network — every number comes from the
JSONL on disk, so two runs of this on the same session agree.

**Check the marked row before reading anything else.** The list prints every
candidate with its agent-type mix, and marks the one being measured with `->`.
A project accumulates a session per workflow ever run in it, so confirm the
marked row is the run the human meant — `9×implementer` and
`4×architecture-reviewer 3×plan-verifier` are recognisable at a glance where a
UUID is not. If it is the wrong one, re-run with the right id rather than
reporting numbers from a run nobody asked about.

**If the script errors, read it before working around it.** It is short, and a
wrong path is a five-second fix; re-deriving its arithmetic inline costs more
than the retro is worth.

### What each column means, and the three that are easy to misread

**The unit rides on the value, not in the header** — `53k`, `97%`, `12m27s`,
`$9.58` — so the headers stay short and the table stays narrow. Spelling units
into the headers instead (`out (tokens)`, `cache hit (%)`) was tried and
rejected: it widened every column for no gain. The three token columns keep a short `(tok)` hint
because their values below 10,000 are printed exact and carry no suffix — `8`
must be unmistakably eight tokens, not eight thousand.

`Totals` is the opposite case and keeps a `unit` column of its own, because one
value column holding tokens, seconds, a percent, a multiplier and dollars at
once cannot be fixed by any header wording. Keep the unit in the sentence when
you quote a figure in prose too.

| Column | What it is |
|---|---|
| `depth` / `└─` prefix | spawn depth. A nested agent is indented under the agent that dispatched it, resolved from the `toolUseId` in its meta — not from depth alone, which gives the level but not the branch. |
| `model` | the model that actually served the turns, plus effort — read from the transcript, not from the meta, because the meta records `null` whenever the agent inherited the session's model. This is the column that catches a reviewer silently running on sonnet while everything it reviews ran on opus. |
| `in (tok)` | **uncached** input tokens only. Tiny on almost every agent, and not the input cost — the input cost is `cache read (tok)` plus the cache writes behind `hit`. |
| `cache read (tok)` / `hit` | where the money actually is. `cache read` is input served from cache at 10% of the input rate; `cache hit` is cache read ÷ all input tokens. Under ~80% on a long agent means its prefix was being invalidated. |
| `active` / `wall` | `wall` is first-to-last timestamp; `active` is the same minus every gap over `--idle-gap` (300s). **This is not stall detection.** Across 18 agents in two measured sessions the largest gap inside any subagent transcript was 152s — a test run. An agent's wait for a human resume is not written to its own transcript at all; the only place human waiting is visible is the session-level `gaps` line. The column earns its keep on a parent that sits while its children work. |
| `cost` | Anthropic list price for that model, cache writes priced by TTL. A Max subscription is not billed this way — **say so whenever you quote the figure.** |

Three totals lines carry findings on their own:

- **`gaps`** — how much of the wall had *no agent running*. On a spec interview
  this is routinely two thirds of the elapsed time, and every second of it is a
  decision the workflow waited for. No per-agent number shows it.
- **`run  agents $X + conversation $Y`** — the conversation is frequently the
  larger half. Quoting the agent total as "the run" was wrong by a factor of
  five once already; the script now prints both so the mistake takes effort.
- **`parallelism`** — agent-seconds over wall. Below 1.0× means the fan-out was
  a queue.
- **`human round-trips`** — turns a person typed mid-run. Pair it with `gaps`:
  many round-trips and a large gap figure is a workflow that asks instead of
  proceeding; a large gap figure with no round-trips means the conversation
  itself was the bottleneck, which is a different fix entirely.

### 2. Findings

The numbers are not the report. Read them for the six things that actually cost
something, and say which ones this run shows — with the figures attached, not
as general observations.

| Look for | The signal |
|---|---|
| **Rework — split it in two, always** | how many agents revised a previous agent's output. Report it as two numbers, never one. **Designed iteration** is a cycle the workflow is built around: `/run-plan`'s fix → re-review → verify rounds are not waste, they are the method. **Accidental redo** is work that existed only because something ran in the wrong order or a briefing was wrong. Only the second is avoidable, and only it belongs in a proposal. Measured runs so far: the project-context spec was 78%, almost all accidental; the mcp-server run-plan was ~30%, all of it designed. Quoting those two side by side as one metric compares nothing. |
| **Order inversion** | whose output would have changed the briefing of an agent that ran *earlier*. Almost always the biggest single saving, and the hardest to see from inside. |
| **Outliers, within a type** | each agent is compared only against others of its own type, and the baseline is printed per type with where it came from. This matters: a `plan-verifier` median is 40 tool uses where an `implementer` median is 6, so a whole-session median makes a verifier look anomalous every time it does its job correctly — and a flag that accuses correct work teaches the reader to ignore flags. When a type ran only once or twice here, the baseline is borrowed from that type's history across the project's other sessions and marked `(history)`; a spec workflow legitimately dispatches exactly one researcher, and that is precisely the agent worth judging. Read the marker: `(this run)` compares an agent with the peers it actually ran beside, `(history)` with how that type usually behaves. Only when neither yields three runs does it print `not judged`. |
| **Duplicated context** | `files touched` counts Read+Edit+Write; `re-read within one agent` counts **Read only**, because an implementer editing one file six times is doing its job, and counting those as re-reads once made this skill contradict a previous retro that had it right. One file opened by many agents. Partly unavoidable (a reviser must read what it revises); a file read three or more times inside *one* agent is the interesting case — its briefing did not stick. |
| **Serialisation** | `concurrent starts: 0` means every dispatch waited. Ask what it waited for: agents that touch disjoint files could have gone together, and a wait for a human is the dominant driver of elapsed time even though it costs no tokens. |
| **Contradiction** | a later agent refuting an earlier one's claim. A quality signal rather than a cost one, and it usually points at a missing check earlier in the workflow. |

**Human round-trips are counted for you now**, in `### Human round-trips` —
every turn a person typed while the agents were running, with the text, and
harness records (task-notifications, system reminders, hook output) filtered
out. They are not in the subagent transcripts at all; the figure comes from the
conversation's own file, windowed to the run.

Read the list, not just the count. A question answered while the fan-out kept
running costs nothing; a decision the workflow *waited on* is usually the most
expensive thing in the run. The two measured extremes so far: the `/run-plan`
run took **1** round-trip across 85 minutes and idled 7% of its wall, while the
spec interview took **18** and idled 66% — the same metric explains both.

### 3. Proposals

Analysis that changes nothing is a report. Each proposal carries four parts,
and the last two are what separate it from advice:

> **P1. Run the "what already exists" sweep before the first writer, not after.**
> **Where:** `.claude/skills/spec-creator/SKILL.md`, phase 2.
> **Evidence:** the sweep started at 22:05, the first writer at 21:39. Two of
> seven revisions (~25k output tokens) existed only to correct what it found.
> **Worth on this run:** ~25k output tokens, ≈$0.60, and one round-trip.
> **Status:** applied during this session.

The evidence line comes from the run being measured. A proposal justified by
general principle rather than by this run's numbers is one you already knew and
did not need a retro to learn.

**Order them by what they are worth, largest first, and number them after
sorting** — so `P1` is always the biggest saving on the run just measured, and
a reader who stops after the first proposal has stopped at the right one.

The ranking key, in order:

1. **What it saves on this run**, in the units the metrics print — output
   tokens, dollars, wall time, round-trips. A proposal whose saving you cannot
   put a figure on ranks below every proposal that has one.
2. **Whether the failure it fixes recurred.** A fault that has now appeared in
   two measured runs outranks a larger one seen once; the ledger's previous row
   is how you check.
3. **How cheap the change is** — a one-line edit to a skill outranks a
   restructuring worth the same, and only breaks ties.

Say the ranking out loud when it is not obvious: *"P2 saves more tokens than P1
but has been seen only once, so P1 leads."* Never order by which file was
easiest to write about, and never present proposals in the order you happened
to find them.

**End with what you deliberately did not propose.** A retro that produces one
proposal because only one had evidence is a good retro; a retro that pads to
five is noise. Name what you considered and dropped, and why — that is what
stops the next retro re-proposing it.

Propose; do not apply. The human picks which land, and applying them is a
separate step they ask for.

### 4. Output

**To chat, in this order.** Nothing else, and each part earns its place:

1. **A title line** — `Workflow Retro — <workflow name>`.
2. **One `Run:` line** — what the run was, its agents and their shape, and
   where the data came from. `Run: spec interview (spec-creator → 4×researcher,
   2 resume rounds) · 5 agents · single + fan-out · data: transcripts (deep)`.
3. **The tables, pasted from the script verbatim.** It emits markdown —
   `### Agents`, `### The conversation itself`, `### Human round-trips`,
   `### Totals`, `### Launch order`, `### Critical path`,
   `### Duplicated context`, `### Baselines and outliers`, `### Not counted` —
   seven of them tables, so they render as such. Paste them; do not retype a number into prose and do not
   rebuild a table by hand. Retyping is where the errors enter. Drop a whole
   section only when it is empty or carries no finding.
4. **The totals table**, including cost and the conversation's own half of it.
5. **Launch order and critical path**, only when they carry a finding — a wave
   that started eight minutes late, a critical path that is mostly idle. On a
   run with neither, drop them.
6. **What went well** — two or three bullets, each with the figure that shows
   it. A retro that only lists faults teaches nothing about what to keep.
7. **What was hard or wasted** — the findings from step 2, figures attached.
8. **Recommendations** — the proposals from step 3, **in priority order**,
   numbered after sorting, each with its Where / Evidence / Worth / Status,
   and closing with what you considered and did not propose.
9. **Ledger** — one line saying what row was appended.

Sections 6 and 7 are where the human reads fastest, so put the figure inside
the sentence: not "cache efficiency was good" but "85% cache hit overall, 81–93%
across the researchers — the cache almost never broke, and it is the single
largest cost lever."

**To the ledger,** appended, never rewritten:

```
docs/retro/ledger.md              one row per run
docs/retro/YYYY-MM-DD-<slug>.md   the full account, when there is one to give
```

Create `docs/retro/` and the ledger's header row if they do not exist yet.

```
| date | workflow | agents | out | cache hit | wall | cost | rework | applied since last retro |
|---|---|---|---|---|---|---|---|---|
| 2026-08-23 | spec: project-context | 9 | 117k | 91% | 74m | $53 | 78% | — (first) |
```

Cost is the run total — agents **plus** the conversation's slice — and the row
means nothing without that convention held constant, so state it in the header
comment once and never mix the two.

The last column is what makes this a ledger and not a pile of reports: the next
retro reads the previous row and can say *rework fell from 78% to 30% after
P1*. Fill it by reading the previous row's proposals and checking whether they
landed. Without it, diagnoses accumulate and nobody learns whether a fix worked.

Adding a column to the ledger is allowed; **rewriting an existing row is not.**
Pad old rows with `—` and leave their figures alone.

Write the per-run file only when there is a narrative worth keeping — an
ordering mistake, a contradiction, an agent that failed. A run that went well
earns a ledger row and nothing more.

## `deep`

Off unless asked for. It reads transcript **content**, and only for the agents
the metrics flagged.

Extract with `jq` field selectors — tool names, the final text, the sites of a
repeated read. Never `cat` a transcript and never tail one: they run to hundreds
of kilobytes and the harness warns that reading one whole overflows the session.

The metrics are `deep` already in the sense that matters: they are computed from
the JSONL, not from what the session remembers. `deep` buys the *content* behind
a flag — why an agent made forty tool calls, what the two contradicting agents
each actually claimed.

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

- Timestamps carry milliseconds (`2026-08-22T22:52:55.860Z`); `jq`'s
  `fromdateiso8601` rejects them — `sub("\\.[0-9]+Z$";"Z")` first.
- `meta.json` records `"model": null` whenever the agent inherited the
  session's model, which is most of the time. The real model is
  `message.model` on the transcript's assistant lines.
- A child's `meta.json` carries the `toolUseId` of the `Agent` call that
  created it. The parent is whichever transcript contains a `tool_use` block
  with that id — `spawnDepth` gives the level but never the branch.
- A parent's `usage` does **not** include its children's tokens, so a total
  built from depth-1 agents alone silently under-counts a nested fan-out.
- Cache writes are split by TTL under `usage.cache_creation`
  (`ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`) and they are
  priced differently — 1.25× input for 5m, 2× for 1h.
- **A resume leaves no trace in the resumed agent's transcript.** Its
  timestamps stay continuous and its final message is the one it produced
  *after* being nudged, so an agent that stalled, was resumed and then
  succeeded is indistinguishable from one that succeeded first time. Measured
  on 2026-08-23: across 18 agents in two sessions the largest gap inside any
  subagent transcript was 152s — a test run — and the two agents known to have
  stalled showed 71s and 152s. Whether an agent needed a second push is simply
  not in the data. Human waiting is visible only between agents, in the
  session-level `gaps` figure.
- **A tool_use block named `Edit` or `Write` is not a read.** Counting the
  three together under "re-read" turns an implementer editing one file six
  times into a briefing failure. Cross-agent overlap wants all three;
  re-reading wants `Read` alone.
- `<session>/tasks/<id>.output` are **symlinks** into `subagents/`. Follow them.
- `agentType` and the human-readable description live only in
  `agent-<id>.meta.json`, never in the `.jsonl`. Join on the file stem.
- Token counts are on assistant lines under `message.usage`;
  `cache_read_input_tokens` is usually the largest field and is not what a run
  "cost" in the sense the human means.
