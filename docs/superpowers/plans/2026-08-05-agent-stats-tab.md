# Agent Stats tab — implementation plan

> Spec: `docs/superpowers/specs/2026-08-05-agent-stats-tab-design.md`

## Done

1. Extended `AgentStats` (+ `AgentStatsRun`, `findings_by_category`, `recent_runs`) in vendor/shared (synced).
2. `buildAgentStats` pure helper + unit tests; repository loaders; `GET /agents/:id/stats`.
3. Client `useAgentStats`, Stats tab UI, editor tab wiring, i18n, tests.
