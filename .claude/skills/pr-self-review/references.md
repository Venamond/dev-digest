# PR Self Review — routing table and severity lists

Referenced by [SKILL.md](SKILL.md). Design rationale for every rule here is
in `docs/superpowers/specs/2026-08-04-pr-self-review-design.md`.

## Routing table

Match diff paths top-to-bottom; a path can match more than one row.
`client/src/` currently has no `features/` directory — that row is
forward-looking, kept for when it exists.

| Path in diff | Skills |
|---|---|
| `server/src/modules/**/routes.ts` | onion-architecture, fastify-best-practices, zod, security |
| `server/src/modules/**/{service,repository}.ts` | onion-architecture, drizzle-orm-patterns |
| `server/src/db/schema*.ts` | drizzle-orm-patterns, postgresql-table-design |
| `server/src/db/migrations/**` | postgresql-table-design + do-not-touch flag (CRITICAL #6) |
| `reviewer-core/src/**` | onion-architecture, typescript-expert |
| `client/src/app/**` | next-best-practices, frontend-architecture, react-best-practices |
| `client/src/components/**` | frontend-architecture, react-best-practices |
| `client/src/lib/hooks/**` | frontend-architecture, react-best-practices |
| `client/src/features/**` (once it exists) | frontend-architecture, react-best-practices |
| `client/**/*.test.{ts,tsx}`, `client/src/test/**` | react-testing-library |
| `*/vendor/shared/**` | zod + shared-sync gate (CRITICAL #7) |
| any `.ts`/`.tsx` (baseline layer, in addition to the above) | typescript-expert, security |
| `**/*.md` containing a mermaid block | mermaid-diagram |
| `e2e/**` | no skill matches — note in the report that e2e has no coverage skill |

**Fallback for unmatched paths:** read `.claude/skills/README.md` and match
by each candidate skill's frontmatter `description`.

**Higher precedence than any row above:** the touched module's own
`INSIGHTS.md` and `AGENTS.md`.

## Severity scale

This skill owns the scale for the 7 project skills that don't have their
own (`onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`,
`next-best-practices`, `typescript-expert`, `react-testing-library`,
`mermaid-diagram`). Where a skill has its own severity
(`frontend-architecture`, `security`, `react-best-practices`, `zod`,
`fastify-best-practices`), that skill's CRITICAL/PROJECT wins instead.

### CRITICAL — blocks the PR (closed list)

1. Any deterministic gate (SKILL.md step 5) failing.
2. A secret or credential in the diff; PII written to logs.
3. A route accepting `body`/`params`/`query` with no validation; any
   injection vector.
4. An outward import breaking the inward dependency rule (e.g. domain →
   infrastructure, service → routes).
5. `reviewer-core` gaining I/O — DB, GitHub, or filesystem access.
6. A hand edit under `server/src/db/migrations/`.
7. `*/vendor/shared/**` changed on one side only (or deleted on one side).
8. A server-only secret or direct DB access leaking into a Client
   Component.
9. A destructive migration with no rollback path.
10. The dependency-cruiser baseline file re-recorded with more entries than
    before, with nothing in the same change set explaining why (SKILL.md
    step 5). Growing the baseline is how a new layering violation gets
    laundered past `arch:check --ignore-known`, which cannot see this on
    its own. Legitimate baseline growth — a deliberate, documented,
    standalone move — is not this; see commit `10abea3` in this repo's
    history for the shape of a legitimate one. A file newly *added* (not
    modified) as part of introducing this baseline mechanism for the first
    time is not growth from a prior state and is not this finding.

Items 5–7 restate `CLAUDE.md`'s do-not-touch rules; item 10 closes a gap
those rules don't cover on their own. All rank CRITICAL despite not being
generic engineering defects.

### HIGH — reported, never blocks

- A new `service.ts` / `repository.ts` / route with no accompanying test.
- A change set spanning unrelated concerns at once (e.g. `client/`, a
  migration, and `.claude/skills/` together) — split it.
- A public contract changed without its `vendor/shared` counterpart being
  considered (as opposed to one-sided, which is CRITICAL #7).

### MEDIUM / LOW

Whatever the routed skill's own rules surface at that level. No project-wide
list — these are lower-stakes enough that the routed skill's own judgment
is enough.
