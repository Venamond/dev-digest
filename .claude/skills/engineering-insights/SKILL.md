---
name: engineering-insights
description: Use PROACTIVELY at the very start of a session — as soon as the user's request makes clear which module(s) it concerns, read that module's INSIGHTS.md before doing any other work. Use again whenever this session produces a non-obvious, actionable engineering lesson — a gotcha, a fix for a recurring error, a library/tool quirk, a codebase pattern, or a failed approach. Also invoke on /engineering-insights or at session wrap-up.
---

# Engineering Insights

## When to read

**Read first, before any work.** As soon as the user's request makes clear
which module(s) it touches — `server`, `client`, `reviewer-core`, `e2e`, or
`server/src/modules/repo-intel` — read that module's `INSIGHTS.md` in full
before writing or editing anything. Treat it as high-confidence guidance
unless the user says otherwise. If the module only becomes clear once work
starts, read it at that point, before touching more code.

## When to write

**Before writing any new entry, re-read the target file first.** If an
equivalent entry already exists (even worded differently), do not add a
duplicate — skip it.

**Write only what's substantial.** At session wrap-up, add an entry only if
something genuinely new and non-trivial surfaced that isn't already covered.
Cold test: would an agent with zero context act on this correctly without
re-investigating? "Be careful with async" fails; "X times out after 30 items
— use Y with batches of 10" passes. If nothing this session clears that bar
— including because it was already recorded — write nothing. An empty
wrap-up is the correct, expected outcome, not a shortfall.

## Prefer a rule over an entry

**Prefer promotion over accumulation.** Before writing an entry, ask whether
the lesson can be expressed one level up: as a rule in the relevant skill
(`onion-architecture`, `frontend-architecture`, …), or — better — as a
machine check (a `dependency-cruiser` rule, a test, a script, a hook). If it
can, do that instead of writing the entry: a rule that fails in CI cannot be
forgotten, while an entry only helps the agent that happens to read the file.
Write to `INSIGHTS.md` when the lesson is real but not yet expressible as a
rule. When an existing entry later becomes a machine check, mark it
`(now enforced by <check>)` rather than leaving it to compete for attention
with active guidance — these files are read in full before work, so stale
entries cost context on every read.

## Where the entry goes

Route each entry into exactly one section (create it if missing): What
Works, What Doesn't Work, Codebase Patterns, Tool & Library Notes, Recurring
Errors & Fixes, Session Notes, Open Questions.

## How to write it safely

**How to write, mechanically — never risk existing content:**

- The file already exists (every module has one). Use a surgical **Edit**
  (old_string = the exact target section heading, e.g. `## Tool & Library
  Notes`; new_string = that same heading + a blank line + the new entry) —
  never retype or reproduce the file's other content.
- **Never use Write on an existing `INSIGHTS.md`.** Write replaces the
  whole file from what the model currently holds in context; on a file this
  file can grow into, that risks silently dropping or corrupting entries
  that aren't in the current context window. Write is only for creating a
  file that doesn't exist yet.
- Do not touch, reformat, reorder, or "clean up" any line you were not
  explicitly asked to add. If the section heading isn't found verbatim, or
  the file looks different from expected, stop and ask instead of guessing
  with a full rewrite.
