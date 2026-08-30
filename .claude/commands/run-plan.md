---
description: Execute an approved Implementation Plan from docs/plans/ — implementers over its tracks, then review and a bounded fix cycle
argument-hint: "<slug | path-to-plan> [--max-fix N] [--dry-run] [--from implement|review|fix|report]"
---

Invoke the `run-plan` skill now, with the arguments as given.

- Start at phase 0 always: run `./scripts/run-plan-state.sh` and show its
  output before dispatching anything.
- If the plan's `Status` is not `approved`, stop and say so. The human
  approves plans; you never flip a status.
- Re-running this command against the same plan **resumes** it — the reports
  on disk are the state, so never re-dispatch a step the resolver marked `✓`.
- `/spec-creator` and `implementation-planner` are run separately by the
  human. This command executes; it never authors requirements or a plan, and
  it never commits or pushes.
