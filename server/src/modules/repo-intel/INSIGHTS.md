# `repo-intel` — insights

Append-only. `repo-intel` is a semi-independent subsystem inside `server`
(its own README, its own pipeline) — it gets its own insights file at this
finer granularity instead of sharing `server/INSIGHTS.md`. Same rules apply:
cold-test every entry, append-only, treat as a draft to spot-check.

## What Works

## What Doesn't Work

## Codebase Patterns

- Application code (`service.ts`, `pipeline/*`) takes `RepoIntelDeps`
  (`deps.ts`), not `Container`. The composition root still passes the
  Container instance structurally. Importing `container.ts` from this
  module recreates the `no-circular` cycle that was burned down to
  baseline 0 on 2026-08-04 — don't reintroduce it.

- Clone I/O and AST parse go through injected ports on `RepoIntelDeps`:
  `fs` (`adapters/clone-fs.ts`) and `codeAnalysis`
  (`adapters/code-analysis.ts`). Application code must not import
  `node:fs` or `adapters/astgrep` / `adapters/codeindex/extract` directly
  — that was burned down 2026-08-04 (architecture plan F18).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
