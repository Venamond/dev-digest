# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Ring map, inward dependency rule, dependency-cruiser enforcement for `server` + `reviewer-core` |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | Where code goes in `client/` — feature folders, constants, business logic, state, `use client` boundary |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [pr-self-review](pr-self-review/SKILL.md) | Process | Routes the local diff to the relevant skills above, runs deterministic gates, blocks on CRITICAL findings before a PR opens |
| [spec-creator](spec-creator/SKILL.md) | Process | Runs the interview that produces an SDD feature spec, then dispatches the `spec-creator` agent to write it under `specs/` |
| [run-plan](run-plan/SKILL.md) | Process | Executes an approved Implementation Plan from `docs/plans/` — dispatches implementers, runs the gates, reviews, drives a bounded fix cycle |
| [engineering-insights](engineering-insights/SKILL.md) | Process | Read a module's `INSIGHTS.md` before working in it; append a new lesson at wrap-up when one cleared the bar |
| [workflow-retro](workflow-retro/SKILL.md) | Process | Retrospective on a finished multi-agent run — what it cost, where the waste was, proposals; appends to `docs/retro/ledger.md`. Manual trigger, dispatches no agents |
| [dependency-checker](dependency-checker/SKILL.md) | Process | Reads every package's dependencies — weight on disk, versions, vulnerabilities, duplicates, unused candidates, internal graph — and writes one report under `docs/dependencies/`. Manual trigger, dispatches no agents, changes nothing |

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
