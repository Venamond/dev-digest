# dependency-checker — design

**Status:** implemented · **Date:** 2026-08-27 · **Skill:** `.claude/skills/dependency-checker/`

## Problem

Six packages, three package managers, ~1.3 GB of `node_modules`, and no single
place that answers "what do we depend on, what does it cost, and what is
dangerous". The data exists — six `package.json` files, three lockfiles, a `du`
nobody runs, an `npm audit` run once a year — and nobody assembles it, so the
same questions get re-answered by hand every few months.

## What it produces

One Markdown report under `docs/dependencies/YYYY-MM-DD-dependencies.md`, backed
by a JSON file under `docs/dependencies/data/` that holds every number the report
quotes. Four axes, all requested: weight, risk (outdated + vulnerable), graph
hygiene, and understanding.

## Decisions

**A deterministic collector, not ad-hoc commands.** `scripts/collect.py` writes
JSON; the skill body only interprets it. Rejected: letting the agent run `du`,
`npm ls` and `audit` itself (numbers drift between runs and cannot be audited)
and adding `knip`/`depcheck` (a skill that recommends removing dependencies
should not open by adding one to six packages — and this repository is not a
workspace, so it would be six installs and six configs).

**Sizes come with a guard, not an assumption.** `du -sk` measures real bytes
only when `node_modules` holds real directories. `server/.npmrc` and
`client/.npmrc` set `node-linker=hoisted`, so it does there. The collector does
not trust that file: it measures the fraction of `node_modules` entries that are
symlinks and marks the package's sizes untrustworthy above 10%. This fired on
the first full run — `evals/` has no `.npmrc`, is installed with pnpm's default
isolated linker, and its per-dependency sizes are reported as `null`, not `0`.

**Two weights per dependency.** `own_kb` is the package's own directory;
`exclusive_kb` adds the transitive dependencies nothing else reaches — what
actually frees up if it goes. When `exclusive_kb` is 0 on a large package, the
row names who else reaches it (`shared_with`), because an unexplained zero next
to a 150 MB `own_kb` reads as a bug.

**Priorities are a table, not a judgement.** P0 = critical/high vulnerability in
a prod dependency; P1 = prod ≥2 majors behind, or a client prod dependency over
1 MB exclusive; P2 = version duplicated across packages, or an unused candidate
in prod; P3 = dev-only. Two runs over one JSON must rank identically.

**Manual trigger, no subagents.** Following `workflow-retro`: no hook, no
schedule, no tail-call. One pass over one JSON does not justify a fan-out.

## Verified constraints

Each of these was measured on this repository, not assumed:

- `npm audit` and `npm outdated` **exit 1 when they find something**. Reading the
  exit code as failure empties the whole risk section.
- macOS has no `timeout`; this Python has no `pyyaml`. Timeouts live in Python
  and `pnpm-lock.yaml` is never parsed — `pnpm list --json` is the tree source.
- `du -sk` per entry sums exactly to `du -sk node_modules` (246616 KB on
  `server/`), so per-package sizes are safe to add.
- `depcruise --output-type mermaid` works (v17.4.3) but follows imports into
  `node_modules` and fills the diagram with `openai` and `zod` internals unless
  `--exclude` is passed.
- `server/clones/` is a gitignored checkout of another repository written by the
  review engine. The unused-dependency scan reads `git ls-files`, not the
  filesystem, so foreign code cannot mark our dependencies used.
- Tailwind v4 enters through `@import "tailwindcss"` in CSS, so the scan reads
  `.css` too; a dependency invoked through a binary it ships (`typescript` →
  `tsc`) counts as used.

## Scope

Reports. Never installs, upgrades, pins or edits a manifest; never adds a
dependency of its own.
