---
name: pr-self-review
description: "Review the local change set against DevDigest's own skills before it becomes a PR. Use BEFORE creating a pull request, BEFORE pushing a branch that will become one, or WHEN reporting a feature as done. Routes touched files to the relevant project skills (onion-architecture, frontend-architecture, security, drizzle-orm-patterns, etc.) by path, runs the deterministic gates (typecheck, arch:check, shared-sync, tests) for touched packages, and reports findings by severity. Refuses to open the PR while any CRITICAL finding stands, with an explicit override for stated false positives. Trigger terms: pr self review, before opening a PR, ready to push, is this ready to merge, pre-PR check."
metadata:
  tags: process, pr, review, gate, routing
---

# PR Self Review

Reviews the local change set the way a human reviewer would see it —
against the project's own skills — before a PR exists. It is a **soft
gate**: it reports and can refuse to proceed with `gh pr create` / `git
push`, but it is not a hook and cannot mechanically block a tool call. See
[references.md](references.md) for the full routing table and severity
lists this file only summarizes.

Design record: `docs/superpowers/specs/2026-08-04-pr-self-review-design.md`.

## When to use

- Before running `gh pr create`.
- Before `git push` on a branch that will become a PR.
- When a feature or fix is being reported as done.
- On demand via `/pr-self-review`, `/pr-self-review --dry-run`, or
  `/pr-self-review --parallel`.

## Procedure

Read `references.md` once at the start of a run — it holds the routing
table and the severity lists this procedure applies. Re-reading it per step
below is not necessary; it doesn't change mid-run.

### 1. Resolve the change set

```sh
BASE=$(git merge-base origin/main HEAD 2>/dev/null \
    || git merge-base upstream/main HEAD 2>/dev/null \
    || git merge-base main HEAD)
git diff --name-status "$BASE"            # committed on the branch
git diff --cached --name-status           # staged
git diff --name-status                    # unstaged
git ls-files --others --exclude-standard  # untracked (treat as status A)
```

Union the four lists. Exclude lockfiles (`pnpm-lock.yaml`,
`package-lock.json`) and `node_modules`. Do **not** exclude
`server/src/db/migrations/**` — a hand edit there is itself a finding
(CRITICAL #6 in `references.md`).

If the union is empty: report "no changes" and stop. Do not fall back to
reviewing `HEAD`.

### 2. Apply file-status handling

Keep the status letter from `--name-status`; it changes what "review" means
for that file:

| Status | Treatment |
|---|---|
| `A` (added, or untracked) | full review against every routed skill, plus "does it have a test?" (see HIGH list) |
| `M` (modified) | review changed hunks only — see step 6 |
| `D` (deleted) | don't review content; check for surviving imports of it and now-dead exports. `D` on a `vendor/shared` file is CRITICAL #7 |
| `R` (renamed) | treat as a move, not new code; flag only if the new path contradicts where the routing table expects that kind of file |

### 3. Size guard

If the change set exceeds ~40 files or ~2000 changed lines: say so before
doing anything else, and recommend `--parallel` or splitting the PR. Never
silently narrow the review to fit — if scope does end up bounded, the final
report must say exactly what was left out.

### 4. Route files to skills

For each file, match it against the routing table in `references.md`. If a
file matches nothing in the table, read `.claude/skills/README.md` and each
candidate skill's frontmatter `description` and match by topic — this is
what lets a future 13th skill participate without this table being edited.

Before reviewing anything in a module, read that module's `INSIGHTS.md` and
`AGENTS.md` if present. Per `CLAUDE.md`, those rank as high-confidence
guidance and override generic skill advice.

**`--dry-run` stops here.** Print the file list with statuses, the skills
each routed to, and the gates that would run (step 5) — then stop. No
review happens.

### 5. Run deterministic gates

Only for packages the diff actually touches:

| Condition | Command |
|---|---|
| `*/vendor/shared/**` touched | `./scripts/check-shared-sync.sh` |
| `server/` touched | `cd server && pnpm typecheck && pnpm arch:check` |
| `reviewer-core/` touched | `cd server && pnpm arch:check:core` |
| `client/` touched | `cd client && pnpm typecheck` |
| either touched | `pnpm test` in that package |

Any failure here is CRITICAL #1 by construction — no interpretation needed.

**If `server/.dependency-cruiser-known-violations.json` (or the
`reviewer-core` equivalent) is in the diff:** compare its entry count before
(`git show "$BASE":<path>`) and after. Entries grew with nothing in the
same change set explaining why → CRITICAL #10. Entries shrank → LOW note,
no action. Unchanged count → no finding. `arch:check` runs with
`--ignore-known`, so it cannot see this on its own — this check is what
closes that gap.

### 6. Review changed lines only

For each routed skill, read that skill and apply it — but **a finding may
block only if it anchors to an added or modified line.** Read surrounding
code for context (a rule can't be judged without it), but anything found
only in code the diff didn't touch goes into a closing "Pre-existing — not
blocking" note, capped at the few most serious items, never into the
blocking findings list.

This is the rule that decides whether the gate survives a second run. A
skill routed to a 400-line file will otherwise report everything wrong with
code nobody touched, and a report that opens twenty findings about
pre-existing code on its first outing gets switched off.

Exception: CRITICAL #6 (migration hand-edit) and #7 (one-sided
`vendor/shared` edit) are properties of the change set, not of a line — they
block regardless of where they anchor.

### 7. Classify findings

For each finding: if the skill that produced it has its own severity scale
(`frontend-architecture`, `security`, `react-best-practices`, `zod`,
`fastify-best-practices` all do), use that skill's severity. Otherwise map
against the CRITICAL/HIGH/MEDIUM/LOW lists in `references.md` — this file
owns that scale for the 7 skills that don't have one of their own.

### 8. Build the report

Markdown, most severe first:

1. **CRITICAL findings** (if any) — each as `path/file.ts:42` · rule broken
   · why it matters here · the fix
2. **HIGH / MEDIUM / LOW findings** — same format
3. **Pre-existing — not blocking** — from step 6, only if non-empty
4. **Draft PR summary** — only if the verdict is CLEAR (see below); what
   changed, why, where the risk sits. The diff was already read in full to
   get here, so this is nearly free and replaces a task usually done by
   hand.
5. **Verdict footer:** `BLOCKED — N critical` or `CLEAR`

### 9. Enforce the verdict

**BLOCKED:** refuse to run `gh pr create` or `git push`; list the critical
findings; offer to fix them. After any fix, run the **entire procedure
again from step 1** — not a recheck of only the previously-failing items,
since a fix can introduce a new violation elsewhere.

**Escape hatch:** if the user explicitly states a finding is a false
positive and asks to proceed, comply — but add a line to the report
recording it as an accepted risk with the stated reason. Without this, one
wrong CRITICAL halts all work indefinitely, and a gate nobody can override
is a gate people stop running.

### 10. Memoize the verdict

Write `.claude/pr-self-review.local.md` (gitignored) in this exact format —
a `.claude/settings.json` `PreToolUse` hook reads it and must compute the
same hash, so the shape here is a contract, not a suggestion:

```
sha: <output of `git rev-parse HEAD`>
worktree_hash: <output of `(git diff HEAD; git ls-files --others --exclude-standard) | shasum` (first field only)>
verdict: CLEAR|BLOCKED
critical_count: <integer>
```

On the next invocation, if both `sha` and `worktree_hash` match the current
repo state, report "unchanged since the last run — verdict stands" instead
of repeating the full procedure. Any difference invalidates the record and
forces a full run from step 1.

This file holds only that state — never the full report text. If report
persistence is ever added, it's a separate file; this one stays small.

## Enforcement beyond the soft gate

This skill is the judgment layer — routing, line-level review, severity
classification — and none of that runs inside a hook. A
`.claude/settings.json` `PreToolUse` hook on `Bash` backs it with a
mechanical check: before `gh pr create` or `git push`, it reads the file
from step 10 and denies the command unless `sha`/`worktree_hash` match the
current repo state **and** `verdict: CLEAR`. It cannot perform the review
itself — only confirm this skill already did, recently, and cleanly. If the
file is missing, stale, or the verdict is `BLOCKED`, the hook denies with a
message pointing back to `/pr-self-review`.

No CI integration, no persisted DB record of runs, no machine-readable
(JSON) findings output, no auto-fixing, no severity blocks added to the 7
skills that lack them. All additive later if this soft gate proves
insufficient in practice.
