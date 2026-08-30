# The rings, in depth

## Ring 0 — Domain

**Where:** `reviewer-core/src/*`, `server/src/vendor/shared/contracts/*`,
`server/src/vendor/shared/adapters.ts`, `server/src/platform/grounding.ts`,
`server/src/modules/pulls/status.ts`.

**What it is:** pure logic and type/interface definitions. `reviewer-core`
is DevDigest's diff→prompt→LLM→findings engine — its only side effect is an
LLM call through an *injected* `LLMProvider`. `vendor/shared/contracts` are
the Zod DTOs shared between `server` and `client`. `vendor/shared/adapters.ts`
holds the port interfaces (`LLMProvider`, `GitHubClient`, `GitClient`,
`CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider`, `RepoIntel`,
`DepGraph`, `Tokenizer`) that ring 2 implements.

**May import:** `zod`, types from `@devdigest/shared`, other ring-0 files.

**May not import:** `fastify`, `drizzle-orm`, `octokit`, `postgres`,
`simple-git`, any `@fastify/*` package, `node:fs` or any other Node builtin,
or anything under `src/db/` — including `db/rows.ts`. Ring 0 defines what a
row looks like through its own types where it needs to; it does not import
Drizzle-derived shapes.

**Enforced by:** `no-domain-io`, `no-domain-node-builtins` in
`server/.dependency-cruiser.cjs`; the whole of `reviewer-core/.dependency-cruiser.cjs`.

## Ring 1 — Application

**Where:** `modules/*/service.ts`, `modules/*/helpers.ts`,
`modules/reviews/run-executor.ts`, `modules/reviews/diff-loader.ts`,
`modules/repo-intel/pipeline/*`, `platform/model-router.ts`.

**What it is:** use-case orchestration. A service calls ports (via the
container) and coordinates ring-0 logic; it does not know it's being called
from HTTP, and it does not touch a Drizzle table object directly.

**May import:** ring 0, `db/rows.ts` (see below), other ring-1 files within
the same module, ports resolved through the container.

**May not import:** `drizzle-orm`, `db/schema` (the table objects
themselves) — even though it may name a *row shape* via `db/rows.ts`.

**The `db/rows.ts` seam:** `server/src/db/rows.ts` exports `$inferSelect`
row types (`AgentRow`, `PullRow`, `FindingRow`, `AgentRunRow`, …). Its own
docstring explains why it exists: so cross-cutting consumers can reference a
row shape without importing *another module's* data layer. This is a
sanctioned exception, not a loophole — importing `db/rows.ts` from ring 1 is
fine; importing `db/schema` (the actual Drizzle table definitions and query
builder surface) is not.

**Enforced by:** `no-app-to-schema`. Not yet clean: `run-executor.ts`,
`diff-loader.ts`, and `modules/repos/helpers.ts` import `db/schema` directly
today, grandfathered in the baseline — see `enforcement.md`.

## Ring 2 — Infrastructure

**Where:** `server/src/adapters/*`, `modules/*/repository.ts` (and
`modules/*/repository/*.ts` for split repositories), `server/src/db/*`.

**What it is:** concrete implementations of ring-0 ports, plus all
persistence code. `adapters/llm/anthropic.ts` implements `LLMProvider`;
`adapters/github/octokit.ts` implements `GitHubClient`; a module's
`repository.ts` is the only place that imports `drizzle-orm` for that
module's tables.

**May import:** ring 0 (to implement its interfaces), `db/schema`,
`drizzle-orm`, third-party SDKs.

**May not import:** ring 1 — an adapter or repository must never import a
`service.ts`, another module's `repository.ts`, or a `routes.ts`. That
direction is the inversion Onion Architecture exists to prevent.

**Enforced by:** `no-infra-to-app` (scoped to `service`/`repository`/`routes`
targets — a leaf constants file like `repo-intel/constants.ts` is fine to
import, it carries no behavior).

## Ring 3 — Presentation

**Where:** `modules/*/routes.ts`, `platform/sse.ts`, `app.ts`, `server.ts`.

**What it is:** Fastify route handlers. A route validates with a Zod
contract (via `fastify-type-provider-zod`), resolves a service from
`container`, calls it, and maps thrown errors through
`platform/errors.ts`.

**May import:** ring 0 contracts, ring 1 services (via `container`),
Fastify itself.

**May not import:** `drizzle-orm` or `db/schema` directly — a route must go
through its module's service and repository, not around them.

**Enforced by:** `no-route-to-db`. Not yet clean: `pulls/routes.ts`,
`polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts` query the
database directly today, grandfathered in the baseline.

## Composition root

**Where:** `platform/container.ts`, `modules/index.ts`.

**What it is:** the one place concrete ring-2 classes are constructed and
handed out as their ring-0 interface type. `Container.llm('anthropic')`
constructs an `AnthropicProvider` but the callers everywhere else only ever
see `LLMProvider`.

**Exempt from every ring rule above by design** — a composition root must
import across all rings to do its job. `no-cross-module-internals` and
`no-infra-to-app` are scoped so `container.ts` importing
`AgentsRepository`/`ReviewRepository`/`RepoIntelService` is not flagged.

**Known wrinkle:** `ReviewsService`, `AgentsService`, `ReposService`, and
`RepoIntelService` currently take `Container` in their constructor rather
than explicit ports (see `rules/ports-adapters-di.md`). Because
`repo-intel/service.ts` and its pipeline modules import `container.ts` for
typing, and `container.ts` imports them back to construct
`RepoIntelService`, this creates real circular dependencies through the
composition root — caught by `no-circular` and grandfathered in the
baseline. Not a bug to silently fix; a consequence of an already-accepted
pattern, documented so it isn't mistaken for something new.
