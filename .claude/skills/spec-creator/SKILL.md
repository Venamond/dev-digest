---
name: spec-creator
description: Run the interview that produces a Spec-Driven-Development feature spec, then dispatch the spec-creator agent to write it. Use when the human wants a spec for a feature before any planning starts, when a design or mockup needs to be analysed for gaps, uncovered corner cases, cross-module communication and UX problems, and when answers must be folded back into an existing spec. Covers reading the design sources the human supplies, grounding them in the code, dispatching researcher agents for facts nobody in the session holds, asking the questions that would change the spec, and confirming the target path and Spec ID before anything is written. Trigger terms: spec, specification, feature spec, SDD, spec driven development, acceptance criteria, EARS, специфікація, спека.
---

# spec-creator — the interview

You run in the main session, so **you can ask the human questions and the agent
cannot**. That is the whole reason this half exists. Your output is not a file:
it is a briefing precise enough that `spec-creator` can write the spec without
guessing.

**Check you are the right process first.** `/spec-creator` is for **product
behaviour** and ends in a feature spec under `specs/`. The `brainstorming`
skill is for decisions about this repository's own tooling — agents, skills,
hooks, CI — and ends in a design document under `docs/superpowers/specs/`.
Running the wrong one produces a document in the wrong shape, in the wrong
folder, for the wrong reader. If the request is about our tooling rather than
about what a user of DevDigest can do, say so and hand over.

Two modes:

- **A — new spec.** `/spec-creator <feature description>`
- **B — revise.** `/spec-creator <path to an existing spec> <what changed>`

In mode B, read the spec first, run only the phases the change needs, and skip
straight to the dispatch when the human has simply answered its open questions.

## Phase 1 — take in the design sources

Ask for them if they were not supplied, and **write no spec without any**: a
spec with no source is a guess with headings.

Accepted: paths to mockups or screenshots in the repo, a written description,
paths to existing screens in `client/src`. Not accepted: Figma links or
anything else requiring the network.

Read every source, then **echo back the list of what you took in** — path by
path — before asking anything else. A spec written against the wrong mockup is
worse than no spec, and this is the cheapest place to catch it.

**Images pasted into the chat are yours alone.** The agent receives only text.
If a design source is an attachment rather than a file on disk, transcribe it
into the briefing element by element — regions in order, controls with their
exact labels, what is collapsed or hidden, what each control does — and mark it
as a transcription. Never let the agent infer a layout from a feature name.

## Phase 2 — ground it in the code

Read what already exists before concluding anything is missing: the contracts
in `vendor/shared`, the neighbouring routes, services and components.

**Read `INSIGHTS.md` and `AGENTS.md` only for the folders this feature
touches** — `<module>/INSIGHTS.md` for each module in scope, plus a
subsystem's own file where one exists (`server/src/modules/repo-intel/`).
Reading all of them costs the context the interview needs and drags in lessons
about subsystems this feature will never touch, which then leak into the spec
as requirements nobody asked for. Treat what you read as high-confidence
guidance that is still a draft to spot-check: confirm against the code anything
that would become a requirement.

**Dispatch `researcher` when a decision turns on a fact nobody in this session
holds** — how an existing flow really behaves across packages, what a pinned
library actually does, what a standard requires. Several in parallel, but only
for independent questions.

- One question per agent, phrased as a question.
- Two or three at a time, never a fleet. Needing more means the feature is not
  understood yet — say so instead of researching around it.
- A researcher returns evidence with `path:line` or a URL, plus its own list of
  what it could not establish. That list goes to Open questions verbatim.
- **A finding is not a requirement.** Research says what *is*; the spec says
  what *shall be*. Only the human turns one into the other, in phase 4.
- Most features need no research at all. Skip it.

## Phase 3 — analyse the design, four lenses

| Lens | Look for |
|---|---|
| Gaps | states the mockup does not show: loading, empty, error, partial data, long text, zero items, permissions |
| Corner cases | data boundaries, concurrent actions, retries, disconnects, stale cache, an external service failing |
| Cross-module communication | who calls whom, under which contract, what happens on timeout, how it degrades, whether `vendor/shared` changes — and therefore both mirrored copies. Findings here fill two sections of the spec: the call graph and its failure edges go to **Cross-module interactions**, the shape of what crosses each boundary to **Contracts** |
| UX | redundant steps, irreversible actions without confirmation, invisible progress, accessibility |

Two checklists to run the lenses against:

- **States**, per screen and per resource: zero, one, many, too many to render;
  loading, empty, error, partial; stale or cached; no permission; very long
  text; the same action fired twice.
- **Degradations**, per boundary: the callee times out, errors, returns late
  after the user moved on, or returns something the caller cannot parse.

**Provenance and prompt injection.** This product feeds model prompts with
diffs, PR titles and comments. For any feature that reaches a model, establish
three things: where the text comes from, whether it enters a prompt, and what
happens when it tries to act as an instruction.

**The boundary that governs this phase:** a mockup is a specification, not a
draft. What it omits is a decision, not a gap to fill. Never turn a gap you
found into a requirement on your own authority — it becomes a question or a
proposal, and reaches the criteria only after an explicit yes.

## Phase 3b — the six clarification categories

The lenses find what is wrong with the design; these six find what the design
never said. Walk all of them before phase 4 and turn every unanswered one into
a question — they are the six ways a spec ends up silently incomplete:

1. **Data & loading** — which data is needed, where it comes from, what happens
   on failure.
2. **Display & sorting** — what is shown, in what order, in which states.
3. **Interactions** — which actions the user has.
4. **State & persistence** — what is stored, for how long, and where it lives.
5. **Feedback** — how the system reports success, progress and failure.
6. **Edge cases** — empty states, large volumes, concurrency, partial data.

Ask only about the categories this feature actually has — a read-only view has
no category 4 to settle, and saying so is an answer. What stays unanswered
after phase 4 goes into the briefing as an open question **naming its
category**, so the agent writes `[NEEDS CLARIFICATION]` instead of a guess and
the human can see which of the six is still open.

## Phase 4 — ask, and propose

Keep the two apart, because they need different answers:

- **Questions** — things without which the spec cannot be written. At most four
  per round through `AskUserQuestion`, at most two rounds. What stays
  unresolved becomes `[NEEDS CLARIFICATION]`, never a silent assumption.
- **Proposals** — improvements the human accepts or rejects in one word. At
  most five, ordered by impact. A rejected proposal goes to Non-goals **with
  its reason**, so it is not re-litigated a month later.

**Then settle the destination and show it for confirmation:**

- one module in scope → `specs/<module>/YYYY-MM-DD-<slug>.md`; two or more →
  `specs/YYYY-MM-DD-<slug>.md`;
- Spec ID = `SPEC-` plus that file name without `.md` —
  `SPEC-2026-08-22-rerun-one-review-agent`. Nothing to count and nothing to
  reserve, so parallel branches cannot collide;
- a one-line scope statement.

Before showing it, confirm **no file already sits at that path** — the agent
refuses to overwrite a spec, and finding that out after the interview wastes
the whole run. Pass today's date in the briefing too: the agent has no shell
and cannot look it up, and a wrong date in a file name is permanent.

**The way out.** If after both rounds the problem still cannot be stated in one
sentence, the feature is not ready: say so and write nothing. If the interview
revealed two features, propose the split — a name and a one-line scope each,
and which comes first — and let the human choose.

## Phase 5 — dispatch

Launch the `spec-creator` agent with a briefing containing, explicitly:

1. the confirmed target path and Spec ID;
2. the one-line scope and the agreed non-goals;
3. **paths** to every design source — not summaries — plus any transcription of
   a chat-attached image, marked as such;
4. every question with its answer, and every unanswered question, verbatim;
5. every proposal with its verdict — accepted, or rejected with the reason;
6. the four lenses' findings, each tagged with its destination section, and
   the state of all six clarification categories — answered, or open and named;
7. every researcher finding with `path:line` or URL, and what they could not
   establish;
8. in mode B: the spec's path, what changed, and whether the human explicitly
   moved its `Status`.

Then relay the agent's report: the path, the criteria, the remaining
`[NEEDS CLARIFICATION]` entries and the proposals awaiting a verdict.

## Never

- Write the spec file yourself. The agent writes; you interview.
- Write anything outside `specs/**` — and in this half, prefer writing nothing
  at all.
- Promote a spec to `approved`. That is the human's word, relayed to the agent.
- Answer your own question because the human's reply was slow or partial.
