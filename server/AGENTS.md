# `@devdigest/api` — server

Fastify 5 + Drizzle/Postgres backend. Imports repos/PRs, indexes code
(`repo-intel`), runs `reviewer-core`, persists grounded findings. Adapters
(LLM, GitHub, git, ast-grep, secrets) sit behind a DI container
(`platform/container.ts`) for mock-swapping in tests.

## Commands

```sh
pnpm dev            # tsx watch, :3001
pnpm db:migrate      # apply migrations — NOT automatic on boot
pnpm db:seed         # idempotent demo data
pnpm test            # vitest run (unit + integration)
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit only, no Docker
pnpm exec vitest run .it.test                       # integration only (testcontainers)
pnpm typecheck
pnpm arch:check      # onion dependency rules (dependency-cruiser)
pnpm arch:check:core # same, for reviewer-core purity
```

## Structure

- `modules/<name>/{routes,service,repository,helpers,constants}.ts` — one
  feature per module. Dependencies point inward only: routes → service →
  repository → db. Routes must not import `drizzle-orm` or `db/schema`;
  services may name row shapes via `db/rows.ts` but not `db/schema`.
  Enforced by `pnpm arch:check`. Route→DB grandfathering is cleared —
  `settings`, `workspace`, `pulls`, and `polling` all go through
  service+repository. Remaining baseline entries are app→schema imports and
  a few circular type edges (see `.dependency-cruiser-known-violations.json`).
  Full ring map: `.claude/skills/onion-architecture/SKILL.md`.
- `adapters/*` — ports behind the DI container; prod impl vs
  `adapters/mocks.ts` in tests.
- `db/schema/*` — Drizzle tables, one file per domain.
- `platform/*` — container, config, run bus (SSE), errors, structured output.

## Non-default conventions

- **Zod schemas double as route schemas** via `fastify-type-provider-zod` —
  one definition drives request validation *and* response serialization.
  Don't hand-roll `Schema.parse(req.body)` in a handler.
- **Test split is filename-based, not folder-based.** A DB-backed test
  (imports `test/helpers/pg.ts`) *must* be named `*.it.test.ts` or the
  unit/integration CI split breaks silently.
- **`REPO_INTEL_ENABLED` defaults true**; an unindexed repo degrades the
  prompt silently to diff-only, it never throws.
- **Secrets never go through `AppConfig`** — always through
  `SecretsProvider` (`adapters/secrets/local.ts`), never read `process.env`
  for a key directly elsewhere.

## Gotchas

- Postgres host port is set in `../docker-compose.yml`, not always 5432 — it
  has changed before. Check it matches `DATABASE_URL` in `.env` before
  assuming the DB is unreachable.
- `relation ... does not exist` on first run = forgot `pnpm db:migrate`.
- A review run is fire-and-forget (`void executor.executeRuns(...)`) — the
  route returns before the LLM call finishes; progress comes via SSE
  (`RunBus`), not the HTTP response.

## Do-not-touch

- `src/vendor/shared` — manually synced copy of the Zod contracts, must stay
  identical to `client/src/vendor/shared`. See root `AGENTS.md`.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | working here for the first time — DI/request flow diagrams, API map |
| [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md) | touching indexing, repo map, blast radius, phantom detection |
| [docs/](docs/README.md) | writing an ADR or architecture note for this package |
| [specs/](specs/README.md) | implementing against a written spec/contract for this package |
| [INSIGHTS.md](INSIGHTS.md) | **as soon as a request makes clear it concerns `server`** — read before any other action |
| [src/modules/repo-intel/INSIGHTS.md](src/modules/repo-intel/INSIGHTS.md) | same, specifically for `repo-intel` work |
| [../TESTING.md](../TESTING.md) | writing a new test — unit vs `.it.test.ts` rules |

**On finishing work here: re-read the relevant `INSIGHTS.md`, then append
only if something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
