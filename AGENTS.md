# DevDigest

Local-first AI PR reviewer. Course starter — one working path (import PR → run
agent review) that later lessons extend. Four standalone packages, no monorepo
workspace: cross-package code is shared via tsconfig path aliases, not npm.

## Stack

Node ≥22 · Fastify 5 + Drizzle + Postgres/pgvector (server) ·
Next.js 15 + React 19 (client) · Zod contracts shared via
`server/src/vendor/shared` (duplicated into `client/src/vendor/shared`, see
Gotchas).

**Package managers:** `server/` and `client/` use **pnpm ≥10**; `reviewer-core/`,
`e2e/` and `mcp/` use **npm**. Keep vendored contracts in sync with
`./scripts/check-shared-sync.sh` (CI enforces this).

## Commands

```sh
./scripts/dev.sh              # Postgres (Docker) + API :3001 + web :3000
cd server && pnpm db:migrate  # NOT run automatically on boot
cd server && pnpm test        # unit + integration
cd client && pnpm test        # vitest + jsdom
./scripts/check-shared-sync.sh  # server/client vendor/shared must match
```

## Map — where things live

| Path | Package | What |
|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, DB, review engine caller |
| `client/` | `@devdigest/web` | Next.js studio (the UI) |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure diff→prompt→LLM→findings engine |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows (no LLM) |
| `mcp/` | `@devdigest/mcp` | local stdio MCP server over the REST API |

Each has its own `AGENTS.md` — module conventions live there, not duplicated
here.

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own package.json/lockfile; cross-package code is shared via tsconfig path aliases. `@devdigest/shared` and `@devdigest/reviewer-core` are
  resolved via tsconfig `paths`, not `node_modules`.
- Modules are registered statically in server/src/modules/index.ts (no filesystem autoload).
- ESM: relative imports carry the .js extension.

## Non-default conventions

- **Migrations are manual.** Server never migrates on boot.
- **Secrets live in `~/.devdigest/secrets.json`** (mode 0600), never in the DB
  or `.env` for production values — `process.env` is only the fallback.
- **DB schema already has every table** for every future course lesson. Empty
  tables are not dead code — do not drop them.
- **Module docs are named `AGENTS.md`** (the cross-tool convention). Each
  directory also carries a `CLAUDE.md` → `AGENTS.md` symlink so Claude Code's
  auto-loader still finds it under its expected filename — edit `AGENTS.md`,
  never the symlink.

## Claims

Both rules exist so the human can catch a wrong claim in one second. They are
format requirements, not appeals to care — care is what fails.

- **Never assert a negative without naming the search.** Not "the editors have
  no tab bars" but "I searched `client/src/app/agents/_components/` and
  `agents/[id]/page.tsx`; no tab bar". A bare negative cannot be refuted by a
  reader who knows the codebase; a bounded one is refuted instantly. Two
  unbounded negatives shipped on 2026-08-23: the tab bars existed in
  `agents/[id]/_components/AgentEditor/constants.ts`, and the "unmeasurable"
  main-session transcript sat one directory level above where I looked.
- **When quoting a figure, name what it excludes.** Not "the run cost 117k" but
  "subagents cost 117k; the conversation itself and `claude -p` subprocesses
  are not in that number". Same session: 117k was reported as the run's cost
  while the conversation alone was 523k — the figure was correct and the
  sentence was wrong by a factor of five.

## Do-not-touch

- `server/src/vendor/shared` and `client/src/vendor/shared` must stay
  byte-identical — they are a manually-synced copy, not a symlink. Edit both
  or neither.
- `reviewer-core` stays DB/GitHub/fs-free — its only side effect is the
  injected `LLMProvider`. Don't add I/O to it.
- `server/src/db/migrations/` — never hand-edit without coordination.



## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | first time in this repo — architecture diagram, full setup |
| [TESTING.md](TESTING.md) | writing or debugging any test |
| [specs/README.md](specs/README.md) | writing or reading a feature spec — the `specs/` layout, Spec IDs, the EARS shape, the status lifecycle |
| [docs/agent-prompts/](docs/agent-prompts/README.md) | editing a built-in agent's system prompt |
| `<module>/README.md` | working inside that module — deep architecture diagram |
| `<module>/AGENTS.md` | working inside that module — conventions + gotchas |
| `<module>/INSIGHTS.md` | **as soon as the user's request makes clear which module it concerns** — read it before any other action; treat it as high-confidence guidance unless told otherwise |

**On finishing work in a module: re-read its `INSIGHTS.md`, then append only
if something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is the correct outcome when nothing new cleared that bar.

**Before running `gh pr create`, run the `pr-self-review` skill (or
`/pr-self-review`) against the local change set.** It routes the diff to the
relevant skills above and blocks on CRITICAL findings.
