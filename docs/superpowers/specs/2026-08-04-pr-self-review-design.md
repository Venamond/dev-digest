# PR Self Review skill — design

**Date:** 2026-08-04
**Status:** implemented 2026-08-04. Seven additions (P1–P7) approved; A2/A3
implemented as designed. **A1 (inline default) also stands, but decision 1
("soft gate, not a hook") was reversed** — see "Amendment" below.

## Amendment (2026-08-04, post-implementation)

Decision 1 said no `PreToolUse` hook, with the Risks section naming one as
the fallback if bypasses were observed. That fallback was invoked directly,
without waiting for an observed bypass. A `.claude/settings.json`
`PreToolUse` hook on `Bash` now denies `gh pr create` / `git push` unless
`.claude/pr-self-review.local.md` (the P7 memoization file) shows a
`sha`/`worktree_hash` match for the current repo state and `verdict: CLEAR`.
The hook does not reimplement the skill's judgment — it only checks that the
skill already ran, recently, against this exact state, and passed. See
`SKILL.md`'s "Enforcement beyond the soft gate" section for the exact
contract between the memoization file and the hook.
**Scope:** new `.claude/skills/pr-self-review/`, new
`.claude/commands/pr-self-review.md`, one line added to `CLAUDE.md`, one row
added to `.claude/skills/README.md`. No changes to the 12 existing skills.

## Problem

The repo has 12 project skills and three deterministic gates (`arch:check`,
`typecheck`, `test`, plus `check-shared-sync.sh`), but nothing connects them
to *a change set*. Today an agent loads a skill only if it happens to
recognise the topic mid-task, which means:

- a `client/` diff can be written without `frontend-architecture` ever being
  read, and a `server/src/modules/**` diff without `onion-architecture`;
- the deterministic gates are run ad hoc, or not at all, before a PR opens;
- there is no point in the workflow that asks "is this change set fit to be
  reviewed by a human?" — the first reviewer is a person, on GitHub, after
  the fact.

The cost lands on the reviewer: layering violations, unvalidated routes and
one-sided `vendor/shared` edits are all mechanically detectable *before* the
PR exists, from the local diff.

## Goal

One skill that, given the local change set, selects the relevant subset of
the existing 12 skills by file path, runs the deterministic gates for the
touched packages, reports findings by severity, and refuses to open the PR
while any CRITICAL finding stands.

Explicitly **not** a goal: replacing human review, or replacing the
`reviewer-core` LLM review engine (which reviews *GitHub* PRs — a different
input and a different consumer).

## Decisions taken

1. **Soft gate, not a hook.** The skill reports and refuses; it does not
   install a `PreToolUse` hook and does not add a CI job. An agent could in
   principle route around a soft gate — accepted, in exchange for zero new
   moving parts in `settings.json`. Revisit only if the gate is observed
   being bypassed in practice.
2. **Diff scope = everything that would land in the PR.** Committed on the
   branch, staged, unstaged, and untracked — the union. Reviewing only
   uncommitted files would have missed the four untracked
   `service.ts`/`repository.ts` files present in the working tree on the day
   this was designed; reviewing only `merge-base..HEAD` would have missed
   them too.
3. **This skill owns the severity scale.** 7 of the 12 skills
   (`onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`,
   `next-best-practices`, `typescript-expert`, `react-testing-library`,
   `mermaid-diagram`) have no severity taxonomy, so "critical finding" is
   undefined for them. Rather than editing 7 skills, the scale and the
   closed CRITICAL list live here. Where a skill *does* carry its own scale
   (`frontend-architecture`, `security`, `react-best-practices`, `zod`,
   `fastify-best-practices`), that skill's CRITICAL/PROJECT wins.

## Assumptions pending confirmation

These three were recommended and not answered. They are implemented as
written below; each is cheap to flip.

| # | Assumption | If wrong |
|---|---|---|
| A1 | Review runs **inline sequentially**; parallel subagents are an opt-in `--parallel` flag | Swap the default in §"Execution model" — the routing output is identical either way |
| A2 | The CRITICAL list is the 9 items in §"Severity scale", closed | Add/remove list items; nothing else changes |
| A3 | Report goes to the **terminal only**, not persisted to a file | Add a write step to `docs/reviews/<date>-<branch>.md` at the end of §"Report and verdict" |

A1 defaults to inline because this repo's operating rules forbid spawning
subagents unless the user asks for them.

## Approved additions (P1–P7)

Added 2026-08-04 after a review pass over the first draft. Each is
independent and individually removable.

| # | Addition | Lands in |
|---|---|---|
| P1 | Findings anchor to changed lines only; pre-existing issues are reported separately and never block | §"Review surface" |
| P2 | A re-baselined `.dependency-cruiser-known-violations.json` is CRITICAL | §"Severity scale" #10, §Stage 3 |
| P3 | File statuses (A/M/D/R) drive different checks | §Stage 1 |
| P4 | Missing test for a new service/repository is HIGH | §"Severity scale" |
| P5 | Report emits a draft PR summary and a scope-creep signal | §"Report and verdict" |
| P6 | `--dry-run` prints routing only | §Triggers |
| P7 | Size guard, stated aloud; verdict memoised per commit + worktree hash | §"Review surface", §"Report and verdict" |

## Triggers

- **Manual:** `/pr-self-review` (a command file that invokes the skill).
  Flags: `--parallel` (see "Execution model"), and `--dry-run` (P6), which
  prints only the routing decision — files, their statuses, the skills each
  routes to, and the gates that would run — and then stops without
  reviewing. `--dry-run` is what makes the routing table debuggable: it
  costs a few seconds instead of a full pass, so a mis-route can be spotted
  without paying for the review that follows it.
- **Automatic:** the skill `description` names the moments — *before
  creating a pull request, before pushing a branch that will become a PR,
  and when reporting a feature as done*. Plus one line in `CLAUDE.md` making
  the run mandatory before `gh pr create`. Both are model-triggered, which
  is what "soft gate" means.

## Stage 1 — collect the change set

```sh
BASE=$(git merge-base origin/main HEAD)   # fall back to upstream/main, then main
git diff --name-status "$BASE"            # committed on the branch
git diff --cached --name-status           # staged
git diff --name-status                    # unstaged
git ls-files --others --exclude-standard  # untracked
```

Union the four file lists; fetch the corresponding patches for review
context. The repo has two remotes (`origin`, `upstream`), so the base
resolution order is explicit rather than assumed.

Excluded: lockfiles (`pnpm-lock.yaml`, `package-lock.json`), `node_modules`.
Deliberately **not** excluded: `server/src/db/migrations/**` — a hand edit
there is itself a finding (CRITICAL #6), so filtering it out would hide the
thing we want to catch.

If the union is empty, the skill reports "no changes" and stops — it does
not fall back to reviewing `HEAD`.

### File statuses drive different checks (P3)

`--name-status` already returns the status letter; keep it rather than
flattening to a path list, because the four cases want different treatment:

| Status | Treatment |
|---|---|
| `A` added | full review against every routed skill; also "is there a test?" (P4) |
| `M` modified | review changed hunks only (P1) |
| `D` deleted | do not review content; check instead for surviving imports of it, and for exports that are now dead. `D` on a `vendor/shared` file is CRITICAL #7 |
| `R` renamed | review as a move, not as new code — flag only if the new path contradicts the routing table's expectations for it (e.g. a repository landing under `domain/`) |

Untracked files from `git ls-files --others` count as `A`.

## Stage 2 — route files to skills

A hardcoded table for known paths, plus a fallback pass that reads
`.claude/skills/README.md` and each skill's frontmatter `description` to
match anything the table doesn't cover. The fallback is what lets a
13th skill participate without this table being edited.

| Path in diff | Skills |
|---|---|
| `server/src/modules/**/routes.ts` | onion-architecture, fastify-best-practices, zod, security |
| `server/src/modules/**/{service,repository}.ts` | onion-architecture, drizzle-orm-patterns |
| `server/src/db/schema*.ts` | drizzle-orm-patterns, postgresql-table-design |
| `server/src/db/migrations/**` | postgresql-table-design + do-not-touch flag |
| `reviewer-core/src/**` | onion-architecture, typescript-expert |
| `client/src/app/**` | next-best-practices, frontend-architecture, react-best-practices |
| `client/src/components/**` | frontend-architecture, react-best-practices |
| `client/src/lib/hooks/**` | frontend-architecture, react-best-practices |
| `client/src/features/**` (once it exists) | frontend-architecture, react-best-practices |
| `client/**/*.test.{ts,tsx}`, `client/src/test/**` | react-testing-library |
| `*/vendor/shared/**` | zod + shared-sync gate |
| any `.ts`/`.tsx` | typescript-expert, security (baseline layer) |
| `**/*.md` containing a mermaid block | mermaid-diagram |
| `e2e/**` | no skill; note in report that e2e has no coverage skill |

`client/src/` currently holds `app`, `components`, `i18n`, `lib`, `test`,
`vendor` — there is no `features/` directory yet, so its row is
forward-looking, not a description of today's tree.

**Higher precedence than any skill:** for every touched module, read its
`INSIGHTS.md` and `AGENTS.md` first. `CLAUDE.md` already ranks `INSIGHTS.md`
as high-confidence guidance; a generic skill rule must not override a
recorded project lesson.

## Review surface — changed lines only (P1)

The single most important rule in this design, and the one that decides
whether the gate survives its second run.

A skill routed to a 400-line `routes.ts` will happily report everything
wrong with the whole file. Most of that is code the author never touched.
A gate that opens twenty findings about pre-existing code on its first
outing gets switched off, and then none of the rest of this document
matters.

Therefore:

- **A finding may block only if it anchors to an added or modified line.**
  CRITICAL is reserved for lines in the diff.
- Surrounding code is read for *context* — a rule can't be judged without
  it — but anything found there goes to a separate closing section,
  **"Pre-existing — not blocking"**, capped at the few most serious items so
  it stays a note rather than a second report.
- One deliberate exception: CRITICAL #7 (one-sided `vendor/shared`) and
  CRITICAL #6 (hand-edited migration) are properties of *the change set*,
  not of a line. They block regardless of line anchoring.

### Size guard (P7)

If the change set exceeds roughly 40 files or 2000 changed lines, say so
before starting and recommend `--parallel` or splitting the PR. Never
quietly narrow the review to fit — a report that silently covered half the
diff reads exactly like one that covered all of it, which is worse than
refusing. If coverage does get bounded, the report must name what was left
out.

## Stage 3 — deterministic gates first

Cheap, unambiguous, and they fail fast. Run before any judgement-based
review, and only for packages the diff touches:

| Condition | Command |
|---|---|
| `vendor/shared` touched | `./scripts/check-shared-sync.sh` |
| `server/` touched | `cd server && pnpm typecheck && pnpm arch:check` |
| `reviewer-core/` touched | `cd server && pnpm arch:check:core` |
| `client/` touched | `cd client && pnpm typecheck` |
| either touched | `pnpm test` in that package |

Any failure here is CRITICAL by construction (#1) — no interpretation
needed. Note that `pnpm arch:check` runs with `--ignore-known`, so it
reports only *new* violations against the recorded baseline; that is the
desired behaviour for a pre-PR gate.

### The baseline itself is part of the change set (P2)

That `--ignore-known` flag opens a hole no other gate can see: running
`pnpm arch:baseline` re-records current reality as acceptable, after which
`arch:check` passes by definition. A new layering violation can therefore be
laundered into the baseline and every gate above will agree the diff is
clean.

So when `server/.dependency-cruiser-known-violations.json` (or the
`reviewer-core` equivalent) appears in the diff, compare the entry count
before and after:

- entries **grew** with no justification in the same change set → CRITICAL
  #10. Growing the baseline is how architectural debt gets silently
  capitalised; commit `10abea3` in this repo ("record onion-architecture
  baseline drift (6 -> 16 entries)") is the legitimate form — a deliberate,
  documented, standalone move.
- entries **shrank** → report as a LOW win, no action.
- entries unchanged but reordered/reformatted → note only.

This file is modified in the working tree as of this design's date, which is
what surfaced the gap.

## Execution model

- **Default (A1): inline, sequential.** Load each routed skill, review the
  files routed to it, collect findings. No subagents, predictable cost,
  long context.
- **Opt-in `--parallel`:** one subagent per cluster (backend-architecture,
  backend-data, frontend, security), results merged. Faster and each agent
  keeps a clean context, but materially more expensive and it needs the
  user to ask for it.
- **Rejected — hybrid** (inline under N skills, subagents above): extra
  branching for little gain.

## Severity scale

Owned by this skill. **CRITICAL — blocks the PR.** Closed list, so the gate
can't be widened by improvisation:

1. any deterministic gate from Stage 3 failing
2. a secret or credential in the diff; PII written to logs
3. a route accepting `body`/`params`/`query` without validation; any
   injection vector
4. an outward import breaking the inward dependency rule (e.g. domain →
   infrastructure, service → routes)
5. `reviewer-core` gaining I/O — DB, GitHub, or fs
6. a hand edit under `server/src/db/migrations/`
7. `vendor/shared` changed on one side only
8. a server-only secret or direct DB access leaking into a Client Component
9. a destructive migration with no rollback path
10. the dependency-cruiser baseline re-recorded with more entries than
    before, without justification in the same change set (P2)

**HIGH** — reported, never blocking. Named explicitly so these don't drift
down into MEDIUM:

- a new `service.ts` / `repository.ts` / route with no accompanying test
  (P4). This repo is mid-refactor into services and repositories, and the
  files sitting untracked in the working tree today arrived without tests —
  exactly the pattern this catches. `TESTING.md` defines what the test
  should look like.
- a change set spanning unrelated concerns — e.g. `client/`, a migration,
  and `.claude/skills/` at once (P5). Reviewers pay for mixed PRs, and the
  fix is mechanical: split it.
- a public contract changed without its `vendor/shared` counterpart being
  considered (as opposed to edited one-sidedly, which is CRITICAL #7).

**MEDIUM / LOW** — reported, never blocking.

Precedence: a skill's own severity wins where it has one; otherwise map
against the lists above. Items 5–7 and 10 are restatements or corollaries of
`CLAUDE.md`'s do-not-touch rules, which is why they rank CRITICAL despite
not being generic engineering defects.

## Report and verdict

Markdown to the terminal, grouped by severity. Each finding:
`path/file.ts:42` · the rule it breaks · why it matters here · the fix.
Findings with no file anchor are not reported — an unlocatable finding isn't
actionable.

Then the "Pre-existing — not blocking" section (P1), if it has anything in
it.

Footer: `BLOCKED — N critical` or `CLEAR`.

### Draft PR summary (P5)

On `CLEAR`, close with a ready-to-paste PR body: what changed, why, and
where the risk sits. The diff has already been read in full by this point,
so this costs almost nothing and replaces a task done by hand on every PR.
Skip it on `BLOCKED` — there is no PR to describe yet.

### Verdict memoisation (P7)

Record the reviewed commit SHA plus a hash of the dirty worktree alongside
the verdict. A re-run against an identical change set answers "unchanged
since the last run — verdict stands" instead of paying for the whole pass
again. Any difference in either value invalidates it and forces a full run,
which keeps this consistent with the re-run rule above: cheap when nothing
moved, complete the moment anything did.

This does not contradict A3. What persists is a few lines of state — SHA,
worktree hash, verdict, critical count — not the report prose. It belongs in
a gitignored local file (`.claude/pr-self-review.local.md`, matching the
plugin-settings convention), never committed. If A3 is later flipped to
persist full reports, this state file stays separate from them.

On `BLOCKED` the skill declines to run `gh pr create` or `git push`, lists
the critical findings, and offers to fix them. After fixes, a **fresh full
run** is required — not a re-check of only the previously failing items,
since a fix can introduce a new violation elsewhere.

**Escape hatch:** if the user states a finding is a false positive and says
to proceed, the skill complies and records it in the report as an accepted
risk with the stated reason. Without this, one wrong CRITICAL halts all
work — and a gate people cannot override is a gate people stop running.

## Verification

Synthetic diff fixtures with known verdicts:

| Fixture | Expected |
|---|---|
| a `routes.ts` handler reading `request.body` with no zod schema | BLOCKED (#3) |
| a `domain/` file importing from `infrastructure/` | BLOCKED (#4) |
| `server/src/vendor/shared/*` edited, `client/` copy untouched | BLOCKED (#7) |
| a new file under `server/src/db/migrations/` | BLOCKED (#6) |
| a `.md`-only diff | CLEAR |
| an empty diff | "no changes", no verdict |
| baseline file re-recorded with entries 6 → 16, nothing else explaining it | BLOCKED (#10) |
| baseline file with entries removed | CLEAR, one LOW note |
| an untouched 400-line file with a known pre-existing violation, one unrelated line added to it | CLEAR — the violation appears only under "Pre-existing" (P1) |
| a new `service.ts` with no test file | CLEAR with one HIGH (P4) |
| `vendor/shared` file deleted on one side | BLOCKED (#7 via status `D`) |
| a file renamed with no content change | CLEAR, no findings (P3) |
| two consecutive runs, nothing changed between them | second run answers "verdict stands" without a full pass (P7) |

Each fixture also asserts *routing*: the report must name the skills the
table predicts for those paths, so a silent routing regression fails the
check rather than merely producing a thinner review.

## Out of scope (YAGNI)

No CI integration, no `PreToolUse` hook, no persisted DB record of runs, no
machine-readable (JSON) findings output, no auto-fixing, and no severity
blocks retrofitted into the other 7 skills. Each is additive later if the
soft gate proves insufficient. JSON output and CI were considered together
and dropped together — the only consumer for a machine-readable format is
the CI job that is itself out of scope.

## Risks

- **Soft gate is advisory.** By decision 1. If bypasses are observed, the
  smallest fix is a `PreToolUse` hook on `Bash` matching `gh pr create`.
- **Routing table drifts** as directories are added. Mitigated by the
  README-driven fallback pass and by the routing assertions in
  Verification.
- **Cost on wide diffs.** A diff touching both packages routes to ~10
  skills; inline that is a long context. Four things hold it down: the
  changed-lines-only surface (P1) is far smaller than the files themselves,
  the deterministic gates run first so obvious failures short-circuit before
  any skill loads, memoisation (P7) makes an unchanged re-run nearly free,
  and `--parallel` exists for the genuinely wide case.
- **False CRITICALs erode trust.** Mitigated by the closed 10-item list, the
  changed-lines-only anchoring rule (P1) — which is what stops the common
  failure of blaming an author for pre-existing code — and the escape hatch.
- **`--dry-run` and the routing table can agree with each other and both be
  wrong.** The Verification fixtures assert routing against expected skill
  names, so the check is against this document, not against the
  implementation's own opinion.
