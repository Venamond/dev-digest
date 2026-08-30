# PR Self Review skill — implementation plan

**Date:** 2026-08-04
**Spec:** [2026-08-04-pr-self-review-design.md](2026-08-04-pr-self-review-design.md)
**Execution model:** single pass, no implementer/reviewer pairing per task.
This is authoring markdown (a `SKILL.md`, a command file, table rows) — not
application code with a test suite to run per change. Each step below is
self-checked by re-reading the file against the spec section it implements,
then moving on. One consolidated read-through at the end (Step 8) stands in
for per-task review.

## Still open before starting

A1–A3 in the spec are unconfirmed. This plan implements them as designed —
inline execution, the 10-item CRITICAL list, terminal-only reports plus the
small P7 state file. If any of the three is later flipped, only the step
noted next to it needs redoing.

## Steps

### 1. Skill directory scaffold

Create `.claude/skills/pr-self-review/`:
- `SKILL.md` — main file (Step 2)
- `references.md` — the routing table (Stage 2) and the CRITICAL/HIGH lists
  (Severity scale), pulled out of `SKILL.md` so the main file stays a
  procedure, not a spec reprint
- `fixtures.md` — the Verification table from the spec, expanded into
  literal `git diff`-shaped snippets an agent can run against (Step 6)

Follow the existing skill shape (`mermaid-diagram/` is the smallest
reference: `SKILL.md` + `examples.md` + `references.md`).

### 2. `SKILL.md`

Frontmatter `description` states the trigger moments verbatim from the
spec's Triggers section (before opening a PR, before pushing a branch that
will become one, when a feature is reported done) — this is what makes the
automatic trigger work, so the wording matters more than usual.

Body, in the order an agent executes them (spec section in parens):

1. Resolve base ref, collect the four-source diff union (Stage 1)
2. Apply file-status handling — A/M/D/R (Stage 1, P3)
3. If empty → report "no changes", stop
4. Size guard — file/line count check, name what's skipped if bounded (P7)
5. Route files to skills — table + README fallback (Stage 2); read touched
   modules' `INSIGHTS.md`/`AGENTS.md` first
6. `--dry-run` exit point: print routing only, stop (P6)
7. Run deterministic gates for touched packages (Stage 3); check the
   dependency-cruiser baseline file specifically if it's in the diff (P2)
8. Review changed lines only per routed skill; pre-existing issues go to a
   separate non-blocking note (P1, Review surface)
9. Classify findings against the severity scale (own-skill severity wins,
   else the closed list in `references.md`)
10. Build report: findings by severity → pre-existing note → draft PR
    summary if CLEAR (P5) → verdict footer
11. On BLOCKED: refuse `gh pr create`/`git push`, list criticals, offer
    fixes; require a full re-run after fixes, not a partial recheck
12. Escape hatch: explicit user override records an accepted-risk line in
    the report and unblocks
13. Verdict memoisation: read/write the local state file (Step 4) keyed on
    commit SHA + worktree hash (P7)

### 3. Command file

`.claude/commands/pr-self-review.md` — thin wrapper that invokes the skill
and documents `--parallel` and `--dry-run`. Match the frontmatter shape of
the existing `.claude/commands/engineering-insights.md`.

### 4. Local state file plumbing

- Add `.claude/pr-self-review.local.md` to `.gitignore` (currently only
  `.claude/worktrees/` is ignored there — this is a new pattern, not an
  existing one to extend).
- Document its shape (SHA, worktree hash, verdict, critical count) in
  `SKILL.md` step 13, not as a separate file — it's a few lines, doesn't
  need its own doc.

### 5. Wire into project docs

- `CLAUDE.md`: one line making the run mandatory before `gh pr create`
  (spec, Triggers).
- `.claude/skills/README.md`: one new catalog row, scope `Process` (it's the
  only skill in the table that isn't Backend/Frontend/Full-stack/Shared —
  add that scope value rather than force-fitting).

### 6. Fixtures (`fixtures.md`)

Write out the 14 rows from the spec's Verification table as literal
artifacts: a short diff snippet or file-tree description plus the expected
verdict and, where relevant, the expected routed-skill list (routing must be
asserted, not just the verdict — a silent routing regression should fail
this check even if the verdict happens to still land right).

These are read-and-reason-through fixtures for whoever validates the skill
by hand or in a future agent run — not an automated test harness. Building
a harness for a markdown-driven skill is exactly the overhead this plan is
avoiding.

### 7. Dry run against this repo's actual working tree

Once Steps 1–6 exist, invoke `/pr-self-review --dry-run` for real, against
the state that motivated this design (the untracked
`server/src/modules/{settings,workspace}/{repository,service}.ts` files and
the modified `.dependency-cruiser-known-violations.json` seen at design
time). Confirm by inspection that:
- those four untracked files route to onion-architecture +
  drizzle-orm-patterns, and get flagged HIGH for missing tests (P4)
- the baseline file is recognized and its entry count is compared (P2) —
  note: at last check its count was unchanged (4→4), so this exercises the
  "no action" branch, not the CRITICAL branch; that's fine, it still proves
  the check fires
This is the one live check in the plan — everything else is inspection
against the fixtures.

### 8. Final read-through

Read `SKILL.md` end to end against the design spec's numbered
sections once, checking nothing was dropped in translation. Fix inline. No
separate reviewer pass — this is the same self-check every other step
already did, done once more across the whole file instead of piecemeal.

## Explicitly not doing

No automated test suite, no CI wiring, no separate agent invoked to review
the skill file after writing it, no dedicated implementer/reviewer split
per step. This is markdown authoring against an approved spec; the spec
itself was already adversarially shaped through the design conversation.
