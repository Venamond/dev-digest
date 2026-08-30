---
name: dependency-checker
description: "Analyse every dependency in this repository — the npm packages each of the six packages pulls in, their weight on disk, their versions and vulnerabilities, and the internal graph between our own modules — then produce one structured Markdown report with diagrams, a priority table and concrete advice. Use when the human asks what the repo depends on, how much a package weighs, what is outdated or vulnerable, what can be removed, why node_modules is so large, or asks for a dependency map or diagram. It measures and reports; it never installs, upgrades or edits a package.json. Trigger terms: dependencies, dependency check, dependency graph, dependency map, node_modules size, bundle weight, outdated packages, npm audit, unused dependencies, duplicate versions, залежності, залежності репозиторію, схема залежностей, вага пакетів, застарілі пакети, зависимости, размер пакетов, карта зависимостей."
metadata:
  tags: dependencies, npm, pnpm, size, security, graph, report
---

# dependency-checker — what this repository actually depends on

Six packages, three package managers, 1.3 GB of `node_modules`, and no single
place that says what any of it is for. The information exists — it is spread
across six `package.json` files, three lockfiles, a `du` you never run and an
`npm audit` you run once a year. This skill collects it in one pass and writes
one report a developer can act on.

Design record: `docs/superpowers/specs/2026-08-27-dependency-checker-design.md`.

## Two rules that shape everything else

**It measures; it never changes anything.** No `npm install`, no `pnpm up`, no
edit to a `package.json`, no lockfile touched. The output is a report and a JSON
file. If the report says a package should go, a human removes it.

**Every number comes from the JSON.** The collector writes
`docs/dependencies/data/<date>.json`; the report quotes it. A figure that is not
in that file does not go in the report — the report says "not measured" instead.
This is not pedantry: sizes and version data differ per machine and per install,
and a remembered number is indistinguishable from a correct one on the page.

## Arguments

```
/dependency-checker [package…] [--offline] [--top N]
```

Without arguments: the whole repository. `--offline` skips `outdated` and
`audit`, the only two steps that touch the network. `--top` bounds the size
tables (default 25). An unknown package name is refused, not ignored — a typo
that silently widens the scope produces a report about the wrong thing.

## Phase 1 — collect

```sh
python3 .claude/skills/dependency-checker/scripts/collect.py \
  --top 25 --out docs/dependencies/data/$(date +%F).json
```

Add `--packages server,client` to narrow, `--offline` to drop the network steps.
The script takes a few minutes on the full repository, almost all of it in
`audit` and `outdated`.

Read the JSON. Do not re-run `du`, `npm ls` or `audit` by hand to "check" a
number — the collector is the instrument, and a second measurement taken a
different way is how two contradicting figures end up in one report.

## Phase 2 — read before writing

Before drafting, look at four things in the JSON and let them shape the report:

1. `env.node_linker` and each package's `sizes_trustworthy`. If a package's
   sizes are not trustworthy, its weight sections are dropped, not estimated.
2. `totals.not_installed`. A package without `node_modules` has **no** size,
   version, outdated or audit data. Print "not installed", never `0`.
3. `discovered` versus the package table in `CLAUDE.md`. When they differ, say
   so in one line — the repository grew a package the docs do not mention.
4. `limits`. Every entry there belongs in the report's last section.

## Phase 3 — write the report

`docs/dependencies/YYYY-MM-DD-dependencies.md`, always these sections, always
in this order:

| # | Section | Content |
|---|---|---|
| 1 | Verdict | 5 lines: total weight, packages analysed, the three highest priorities |
| 2 | Schema 1 — repo map | Mermaid: one node per package, edges from `tsconfig_links` |
| 3 | Package table | prod / dev / installed count / weight / manager / status |
| 4 | Schema 2 — heavy externals | Mermaid: top externals hanging off each package, size on the edge |
| 5 | Weight | Top-N by `exclusive_kb`, with `own_kb`, transitive count, and `shared_with` |
| 6 | Schema 3 — who pulls this in | Mermaid, only for packages named in the priority table |
| 7 | Risk | `audit` findings by severity **split on `scope`** (prod / dev / unknown); `outdated` by majors behind |
| 8 | Hygiene | unused candidates; `duplicates` — version splits and `redundant_kb`, the disk cost of the second copy |
| 9 | Schema 4 — internal modules | `internal_graph.mermaid` verbatim, per package that has one |
| 10 | Priorities | One table: `P / What / Why / Action / What it buys` |
| 11 | Not measured | Everything from `limits`, plus anything skipped this run |

Two distinctions the report must keep visible, because collapsing them is how
this kind of report starts lying:

- **`own_kb` vs `exclusive_kb`.** `own` is the package's own directory;
  `exclusive` adds the transitive dependencies nothing else reaches — what
  actually frees up if it goes. Quote `exclusive` when recommending removal and
  say which one you are quoting.
- **`scope` beats `direct`.** An `audit` finding's `direct` flag says whether we
  declared the vulnerable package; `scope` says whether it is reachable from a
  prod dependency. Almost every finding in this repository is indirect, so
  ranking by `direct` would hide the ones that ship. Rank by `scope`.
- **Disk weight is not bundle weight.** `node_modules` holds sourcemaps, type
  declarations and dual CJS/ESM builds; a fraction reaches the browser. Never
  write "this costs the user N MB" from a `du` figure. Measuring the bundle
  needs a build, which this skill does not run.

### Before you call it written

```sh
node .claude/skills/dependency-checker/scripts/check-diagrams.mjs \
  docs/dependencies/<date>-dependencies.md
```

Every `mermaid` block must parse. A broken one does not fail loudly — it renders
as an error box in the middle of the report and stays there until a reader trips
over it. The script exits 3 if `client/node_modules` is missing; in that case say
in section 11 that the diagrams were not validated, rather than implying they
were.

Then re-check every figure you *derived* rather than read. Counts you summed
yourself ("14 prod-reachable highs", "57 advisories outside prod") are the ones
that come out wrong; recompute them from the JSON before shipping. Two figures in
the first run of this report were wrong exactly this way.

Then print in chat only the verdict and the priority table, with the report's
path. The full report is read in the file.

## Priorities are computed, not felt

| P | Condition |
|---|---|
| **P0** | `audit` finding of `critical` or `high` severity with `scope: prod` |
| **P1** | prod dependency ≥2 majors behind, or a prod dependency in `client` over 1 MB `exclusive_kb` |
| **P2** | same package at different versions across our packages; unused candidate declared in prod |
| **P3** | dev-only findings, cosmetics |

Apply the table as written. Two runs over the same JSON must produce the same
priorities; an ordering that comes out of judgement instead cannot be checked by
the reader and cannot be compared to last month's report.

## Traps, all of them verified on this repository

**`npm audit` and `npm outdated` exit 1 when they find something.** Both are
data, not failures. The collector ignores their exit codes; if you ever run them
by hand, do the same, or the entire risk section silently comes back empty.

**Sizes are only real because of `node-linker=hoisted`.** `server/.npmrc` and
`client/.npmrc` set it, so `node_modules` holds real directories and `du -sk`
measures real bytes. Under pnpm's default isolated linker those entries are
symlinks into a global store and every size would be wrong by orders of
magnitude while still looking like a number. The collector measures the symlink
ratio itself and sets `sizes_trustworthy: false` rather than trusting the
`.npmrc`.

**`server/clones/` is a different repository.** The review engine clones repos
into it; it currently holds a full copy of dev-digest. The collector scans
`git ls-files`, not the filesystem, so that foreign code cannot mark our
dependencies "used". Any grep you run yourself needs the same care.

**Unused candidates are candidates.** The heuristic counts a dependency as used
when it is imported in source, named in a config file, or invoked through a
binary it ships (this last one is why `typescript` is not flagged — the script
calls `tsc`). `@types/*` are never flagged. It still cannot see a dependency
reached only at runtime through a computed name. Present the list as "check
these", and check the ones you intend to recommend before recommending them.

**`e2e` has no `node_modules`.** Until someone installs it, that package has no
weight and no versions. Report the absence; do not print zeros.

**macOS has no `timeout` and this Python has no `pyyaml`.** Do not add either to
the collector. Timeouts are Python-side; `pnpm-lock.yaml` is never parsed —
`pnpm list --json` is the source of the tree.

## What this skill never does

- Runs on a hook, a schedule, or the tail of another skill. The human asks.
- Dispatches subagents. It is one pass over one JSON file; a fan-out here costs
  more than the work.
- Installs, upgrades, removes or pins anything.
- Adds a dependency to the repository in order to analyse dependencies.

<!-- ci-trigger-test: 2026-08-28, harness evals workflow smoke test — no semantic change, safe to drop -->
