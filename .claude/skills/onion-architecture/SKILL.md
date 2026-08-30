---
name: onion-architecture
description: "Enforces Onion Architecture in DevDigest's backend packages (server, reviewer-core). Use when adding or moving a route, service, repository, adapter, or port; when deciding which layer new backend code belongs in; when reviewing a backend diff for layering; or when `pnpm arch:check` fails. Covers the ring map (domain / application / infrastructure / presentation + composition root), the inward dependency rule, and how it is enforced via dependency-cruiser. Trigger terms: onion architecture, dependency rule, layering, arch:check, dependency-cruiser, which layer, port, adapter, composition root, repository layer. For general DDD, Hexagonal, CQRS or Event Sourcing theory use the clean-ddd-hexagonal skill instead — this skill carries only DevDigest specifics."
metadata:
  tags: architecture, backend, server, reviewer-core, layering, dependency-rule
---

## The one rule

Dependencies point **inward only**:

```
Presentation (3) → Infrastructure (2) → Application (1) → Domain (0)
                Infrastructure (2) ─────────────────────→ Domain (0)
```

Ring 2 depending on ring 1 is the inversion this architecture exists to
prevent — it is a hard error, enforced by `pnpm arch:check`.

## Ring map

| Ring | Contents | Rule |
| --- | --- | --- |
| **0 — Domain** | `reviewer-core/src/*`; `server/src/vendor/shared/contracts/*` (Zod contracts); `server/src/vendor/shared/adapters.ts` (port interfaces); pure helpers: `modules/pulls/status.ts`, `platform/grounding.ts` | No I/O. Must not import `fastify`, `drizzle-orm`, `octokit`, `postgres`, `simple-git`, `node:fs`, or anything under `db/` (including `db/rows.ts`). Defines interfaces; implements none. |
| **1 — Application** | `modules/*/service.ts`, `modules/*/helpers.ts`, `modules/reviews/run-executor.ts`, `modules/reviews/diff-loader.ts`, `modules/repo-intel/pipeline/*`, `platform/model-router.ts` | Orchestrates ring 0 through ports. Knows nothing of HTTP. May name persistence shapes via `db/rows.ts` (the sanctioned seam) but must not import `db/schema` or `drizzle-orm`. |
| **2 — Infrastructure** | `server/src/adapters/*`, `modules/*/repository.ts` (+ `repository/*.ts`), `server/src/db/*` | Implements ring-0 interfaces. Must not import ring 1 (`modules/*/service.ts`, `.../repository.ts`, `.../routes.ts`). |
| **3 — Presentation** | `modules/*/routes.ts`, `platform/sse.ts`, `app.ts`, `server.ts` | Validate with a Zod contract, call a service, map errors. Must not import `drizzle-orm` or `db/schema`. |
| **Composition root** | `platform/container.ts`, `modules/index.ts` | The only place concrete classes meet interfaces. Exempt from every rule above by design. |

`db/rows.ts` is a deliberate seam, not a loophole: its own docstring says it
exists so cross-cutting consumers can name a row shape (`AgentRow`,
`PullRow`, `FindingRow`, …) without importing another module's data layer.
Ring 1 may import it. Ring 0 may not.

## Where does this go?

- Pure business logic, no I/O → **ring 0** (`vendor/shared` or `reviewer-core`)
- Orchestrates domain logic, has side effects via ports (DB, LLM, GitHub) → **ring 1** (a module's `service.ts`)
- Talks to Postgres, GitHub, git, an LLM, the filesystem → **ring 2** (`adapters/*` or a module's `repository.ts`)
- Parses/validates an HTTP request, calls a service, maps errors → **ring 3** (a module's `routes.ts`)
- Wires a concrete class to an interface → **composition root** (`platform/container.ts`)
- Needs data another module owns → **through the container or a deps bag**, never a relative import of its `service.ts`/`repository.ts` (`rules/module-boundaries.md`)

## Check it

```sh
cd server && pnpm arch:check       # server's ring rules
cd server && pnpm arch:check:core  # reviewer-core's purity rules
```

Both run in CI-equivalent form; a new violation fails with a non-zero exit
code. See `enforcement.md` for how the check works and the baseline policy.

## Read next

| File | Read when |
| --- | --- |
| [rules/layers.md](rules/layers.md) | full detail on each ring, the composition-root exemption, and the `db/rows.ts` seam |
| [rules/module-boundaries.md](rules/module-boundaries.md) | adding a module, or reviewing an import that crosses from one module into another |
| [rules/indirection.md](rules/indirection.md) | a diff passes `arch:check` but the layering still looks wrong — violations split across two legal edges, or in files no rule's `from` matcher covers |
| [rules/fastify-routes.md](rules/fastify-routes.md) | writing or reviewing a `routes.ts` file |
| [rules/drizzle-repositories.md](rules/drizzle-repositories.md) | writing or reviewing a `repository.ts` file, or any Drizzle query |
| [rules/zod-contracts.md](rules/zod-contracts.md) | adding or changing a shared contract, or deciding where to `parse` |
| [rules/ports-adapters-di.md](rules/ports-adapters-di.md) | adding a new external dependency (LLM provider, API client, …) |
| [rules/reviewer-core-purity.md](rules/reviewer-core-purity.md) | working inside `reviewer-core/` |
| [enforcement.md](enforcement.md) | `arch:check` fails and you need to know why, or you're touching `.dependency-cruiser.cjs` |
| [examples.md](examples.md) | want a concrete good/bad pair from this repo instead of the abstract rule |
| [review-checklist.md](review-checklist.md) | reviewing a backend diff — includes what `arch:check` *cannot* catch |
| [references.md](references.md) | sources this skill is built on |
