# PR Self Review — verification fixtures

Read-and-reason-through fixtures, not an automated test harness — this
skill is markdown authoring, not application code, and a harness here would
be overhead the design deliberately avoided. Use these to hand-validate a
change to `SKILL.md` or `references.md`: for each row, construct the
described change set (or point at the real one, where noted) and check both
the **verdict** and the **routed skills** — a routing regression must fail
this even when the verdict happens to still come out right.

| # | Fixture | Expected verdict | Expected routing (if applicable) |
|---|---|---|---|
| 1 | `routes.ts` handler reads `request.body` with no zod schema | BLOCKED (CRITICAL #3) | onion-architecture, fastify-best-practices, zod, security |
| 2 | A `domain/` file imports from `infrastructure/` | BLOCKED (CRITICAL #4) | onion-architecture |
| 3 | `server/src/vendor/shared/*` edited, `client/src/vendor/shared/*` untouched | BLOCKED (CRITICAL #7) | zod + shared-sync gate |
| 4 | New file under `server/src/db/migrations/` | BLOCKED (CRITICAL #6) | postgresql-table-design + do-not-touch flag |
| 5 | Diff contains only `.md` files, no mermaid blocks | CLEAR | none matched (or mermaid-diagram if a block is present) |
| 6 | Diff is empty (nothing staged/unstaged/untracked/ahead of base) | "no changes", no verdict | — |
| 7 | `.dependency-cruiser-known-violations.json` entry count rises with nothing else in the change set explaining it | BLOCKED (CRITICAL #10) | — |
| 8 | Same file, entry count falls | CLEAR, one LOW note | — |
| 9 | A 400-line file with a known pre-existing violation elsewhere in it, one unrelated line added | CLEAR — the pre-existing violation appears only in "Pre-existing — not blocking" | whatever the file's path routes to |
| 10 | New `service.ts` added with no corresponding test file | CLEAR with one HIGH (missing test) | onion-architecture, drizzle-orm-patterns |
| 11 | `vendor/shared` file deleted on one side (status `D`), present on the other | BLOCKED (CRITICAL #7, via status `D` handling) | zod + shared-sync gate |
| 12 | A file renamed (status `R`) with no content change | CLEAR, no findings | routes per its new path |
| 13 | Two consecutive runs against the same commit SHA and worktree hash | Second run reports "unchanged since the last run — verdict stands" without repeating the full procedure | — |
| 14 | Change set exceeds ~40 files / ~2000 changed lines | Size-guard message before any review starts; recommends `--parallel` or splitting | — |

## Live check against this repo's own state (2026-08-04)

Two things worth recording from actually running the base-resolution logic
against this repo rather than assuming its output:

**Fixture 14 fired for real, unprompted.** `git branch --show-current`
returns `main` — there is no separate feature branch here; local `main` is
194 files and ~ahead of `origin/main` (a full stack of prior, already
merged-locally-but-unpushed lessons). Resolving `BASE` as
`git merge-base origin/main HEAD` against that state pulls in the entire
unpushed history as "the change set," which is correct — that *is* what
would go into a PR from this branch — but it means the size guard (fixture
14) is the realistic first thing to fire here, not a normal-sized review.
This confirms step 3 needs to run, and run first, before assuming a diff is
small enough to review inline.

**The baseline-file check (fixture 7/8, CRITICAL #10) had nothing to
exercise in the small uncommitted diff at this same moment** — as of this
check, `server/.dependency-cruiser-known-violations.json` is `[]` (zero
entries) and is not part of the small uncommitted diff at all (only
`.claude/skills/README.md`, `.gitignore`, and `AGENTS.md` were modified
uncommitted; the pr-self-review skill's own files were untracked). Do not
assume a specific entry count when validating #10 by hand — read the file
fresh each time; treat fixtures 7 and 8 as needing a synthetic before/after
pair, not a live one, since the real file's count moves as other work
lands.
