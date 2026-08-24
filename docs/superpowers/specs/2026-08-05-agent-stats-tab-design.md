# Agent Stats tab (2026-08-05)

## Goal

Ship the Agent Editor **Stats** tab per design `StatsTab`, backed by real
aggregates from `agent_runs` + `findings`/`reviews`.

## API

`GET /agents/:id/stats` → `AgentStats` (shared contract), extended with:

- `findings_by_category: Record<string, number>` — for the category donut
- `recent_runs: AgentStatsRun[]` — last N runs for the history table

Existing fields used for KPI + severity: `runs`, `avg_cost_usd`,
`avg_latency_ms`, `accept_rate`, `findings_by_severity`, `trend`.

## UI

- Four StatBig cards (runs / avg cost / avg duration / accept rate)
- Most-used skills + Most-pulled memory → EmptyState (no usage telemetry yet)
- Findings by severity (totals bar) + by category (Donut)
- Run history table; “View trace” → existing trace route when `run_id` known
- Zero runs → empty state, no fake numbers

## Out of scope

Weekly stacked severity, skill/memory usage %, Evals/CI tabs.
