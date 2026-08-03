# Onion Architecture skill — design

**Date:** 2026-08-03
**Status:** approved, ready for implementation planning
**Scope:** `server/`, `reviewer-core/`. `client/` is explicitly out of scope.

## Problem

DevDigest's backend already has most of an Onion Architecture by accident of
good taste: port interfaces in `server/src/vendor/shared/adapters.ts`, their
implementations in `server/src/adapters/*`, a composition root in
`server/src/platform/container.ts`, and a genuinely pure core in
`reviewer-core/`. Nothing names this structure, nothing writes down its
rules, and nothing enforces them. The result is drift that already happened:

- `modules/pulls/routes.ts`, `modules/polling/routes.ts`,
  `modules/workspace/routes.ts` and `modules/settings/routes.ts` import
  `drizzle-orm` and `db/schema` and query `container.db` directly inside
  handlers — the HTTP layer reaching past service and repository into the
  database.
- `modules/reviews/run-executor.ts`, `modules/reviews/diff-loader.ts` and
  `modules/_shared/schemas.ts` import types from `db/schema`, leaking the
  persistence shape into the application layer.
- `server/AGENTS.md` claims "routes never touch the DB". That invariant is
  false today, so the documentation actively misleads.

Agents (and humans) copy the file they are sitting next to. Without a written
rule and a machine check, each new module has a coin-flip chance of inheriting
the leaky pattern.

## Goal

A project skill that makes the dependency rule explicit, tool-specific, and
mechanically enforced — without demanding a rewrite of existing code.

**Non-goals:** renaming directories to `domain/application/infrastructure`;
introducing separate domain entities with mappers over Drizzle rows;
restructuring `client/`; teaching general DDD/Hexagonal theory (the existing
personal `clean-ddd-hexagonal` skill covers that and is linked, not
duplicated).

## Decisions taken

1. **Codify the existing structure, then patch the leaks.** The skill names
   our current directories as onion rings rather than prescribing new ones.
   Chosen over a canonical folder refactor because a skill that permanently
   contradicts the code it governs gets ignored.
2. **Enforcement via `dependency-cruiser`, not a new tool.**
   `dependency-cruiser` 17.4.3 is already a `server` dependency (used as a
   library by `repo-intel`'s `DepCruiseGraph`). Its CLI supports
   `--ignore-known [file]`, which grandfathers today's violations into a
   committed baseline while failing the build on any new one. Zero new
   packages, and the migration is a burn-down rather than a big-bang.
3. **Project skill, plus a short rule echoed into `AGENTS.md`.** Lives in
   `.claude/skills/onion-architecture/` alongside `fastify-best-practices`,
   so it is version-controlled and shared with the team. A five-line summary
   of the dependency rule goes into `server/AGENTS.md` and
   `reviewer-core/AGENTS.md` so an agent sees it always, not only when the
   skill is invoked.

## Ring map

The skill's central artefact. Every other rule refers back to this table.

| Ring | Contents | Rule |
| --- | --- | --- |
| **0 — Domain** | `reviewer-core/src/*`; `server/src/vendor/shared/contracts/*` (Zod contracts); `server/src/vendor/shared/adapters.ts` (port interfaces); pure helpers: `modules/pulls/status.ts`, `platform/grounding.ts`, `modules/reviews/helpers.ts`, `modules/agents/helpers.ts` | No I/O. Must not import `fastify`, `drizzle-orm`, `octokit`, `postgres`, `simple-git`, or `node:fs`. Defines interfaces; implements none of them. |
| **1 — Application** | `modules/*/service.ts`, `modules/reviews/run-executor.ts`, `modules/repo-intel/pipeline/*`, `platform/model-router.ts` | Orchestrates ring 0 through ports. Knows nothing of HTTP or of Drizzle. Must not import `db/schema`. |
| **2 — Infrastructure** | `server/src/adapters/*`, `modules/*/repository.ts`, `server/src/db/*` | Implements ring-0 interfaces. Must not import ring 1 (`modules/*/service.ts`). |
| **3 — Presentation** | `modules/*/routes.ts`, `platform/sse.ts`, `app.ts`, `server.ts` | Validate with a Zod contract, call a service, map errors. Must not import `drizzle-orm` or `db/schema`. |
| **Composition root** | `platform/container.ts`, `modules/index.ts` | The only place concrete classes meet interfaces. Exempt from the rules above by design. |

Dependency direction is inward only: 3 → 2 → 1 → 0, plus 2 → 0 (an adapter
implements a port defined in the core). 2 → 1 is the inversion that Onion
exists to prevent and is a hard error.

## Enforcement design

`server/.dependency-cruiser.cjs` with `forbidden` rules:

| Rule name | Forbids |
| --- | --- |
| `no-domain-io` | ring 0 → `fastify`, `drizzle-orm`, `octokit`, `postgres`, `simple-git`, `node:fs`, `db/*` |
| `no-route-to-db` | `modules/*/routes.ts` → `drizzle-orm`, `db/schema` |
| `no-app-to-schema` | `modules/*/service.ts`, `run-executor.ts`, pipeline → `db/schema` |
| `no-infra-to-app` | `adapters/*` → `modules/*` |
| `no-cross-module-internals` | `modules/a/*` → `modules/b/{repository,service}.ts` (shared access goes through the container, per the existing `agentsRepo`/`reviewRepo` precedent) |
| `no-circular` | dependency cycles |

A second, narrower config, `reviewer-core/.dependency-cruiser.cjs`: no Node
builtins, no dependencies beyond `openai` and `zod` — the existing purity
contract, made executable. `reviewer-core` has no `dependency-cruiser`
dependency of its own; its check runs from `server`'s installed binary via a
relative path, so no package is added there either.

Scripts added to `server/package.json`:

- `arch:check` — `depcruise src --config .dependency-cruiser.cjs --ignore-known`
- `arch:check:core` — same binary against `../reviewer-core/src` with
  `reviewer-core`'s config
- `arch:baseline` — regenerates `.dependency-cruiser-known-violations.json`,
  run deliberately and reviewed in the diff

All three are run from `server/` (`cd server && pnpm arch:check`), matching
how every other check in this repo is invoked.

The baseline file is committed. Its entry count may only decrease; growing it
requires an explicit, reviewed `arch:baseline` run. The skill states this.

## Skill contents

```text
.claude/skills/onion-architecture/
  SKILL.md                       # ring map, dependency rule, when to use, delegation note
  rules/layers.md                # the ring table in depth; where new code goes
  rules/fastify-routes.md        # ring 3
  rules/drizzle-repositories.md  # ring 2 persistence
  rules/zod-contracts.md         # ring 0 DTOs and boundary parsing
  rules/ports-adapters-di.md     # ring 0 interface + ring 2 impl + container wiring
  rules/reviewer-core-purity.md  # the pure core
  enforcement.md                 # dependency-cruiser config, scripts, baseline policy
  examples.md                    # good/bad from real repo files
  review-checklist.md            # symptom → violated rule → fix
  references.md                  # sources
```

### Per-tool rule content

**`fastify-routes.md`** — a route is a driving adapter. A Zod contract from
`vendor/shared/contracts` drives request validation *and* response
serialization through `fastify-type-provider-zod` (never a hand-rolled
`Schema.parse(req.body)`; this restates an existing `AGENTS.md` convention in
onion terms). The handler resolves a service from `container`, calls it, and
translates failures via `platform/errors.ts`. Anti-example:
`container.db.select()` in `modules/pulls/routes.ts`.

**`drizzle-repositories.md`** — `drizzle-orm` is imported only in
`modules/*/repository.ts` and `db/*`. A repository accepts and returns
contract types, never `InferSelectModel` rows. The transaction boundary
belongs to the application layer and is expressed as a port; a `tx` handle is
never threaded into ring 0 or ring 1 code.

**`zod-contracts.md`** — contracts in `vendor/shared/contracts` are the
domain DTOs, and the `server`/`client` copies stay byte-identical (existing
do-not-touch rule). Parse at the boundary as an anti-corruption layer; inside
the domain the type is already valid, so a second `parse` is a smell.

**`ports-adapters-di.md`** — the sequence for any new external dependency:
interface in `vendor/shared/adapters.ts` → implementation in `adapters/*` →
lazy getter in `platform/container.ts` → entry in `ContainerOverrides` → mock
in `adapters/mocks.ts`. A service takes its ports explicitly; `Container`
belongs in the composition root. Existing services taking `Container` in
their constructor are grandfathered and named as such — this is a
review-checklist item, not a dependency-cruiser rule, because it is not
statically detectable.

**`reviewer-core-purity.md`** — why the core has no DB, GitHub or filesystem
access, its single permitted side effect (the injected `LLMProvider`), and
how to extend it without breaking that.

### Supporting files

`examples.md` uses real repo files — `modules/pulls/routes.ts` as the bad
case, `modules/reviews/repository/*` as the good one — rather than abstract
`Book`/`Reader` samples, so the pattern matches what an agent actually sees.

`review-checklist.md` is a symptom → rule → fix table, and deliberately
covers what `dependency-cruiser` cannot catch: `Container` in a service
constructor, `db/schema` types in an exported signature, a repository
returning raw rows.

## Integration with existing docs

- `.claude/skills/README.md` — new catalog row.
- `server/AGENTS.md` — replace the now-false "routes never touch the DB" line
  with the ring rule plus a pointer to the skill, and note the four known
  offenders so the doc stops misleading.
- `reviewer-core/AGENTS.md` — pointer to `rules/reviewer-core-purity.md`.
- `SKILL.md` frontmatter delegates general DDD/Hexagonal/CQRS theory to the
  `clean-ddd-hexagonal` skill; this skill carries only DevDigest specifics.

## Verification

The work is done when: `pnpm arch:check` passes on a clean tree; introducing
a deliberate `drizzle-orm` import into a route makes it fail with a non-zero
exit code; the baseline contains exactly today's known violations and no
more; and `pnpm test` plus `pnpm typecheck` are unchanged, since no runtime
code is modified by this work.

## Risks

- **Rule scope too wide on first run** — a config that flags dozens of
  unforeseen edges makes the baseline meaningless. Mitigation: add rules one
  at a time, inspecting each rule's violation list before committing it.
- **The baseline becomes a dumping ground.** Mitigation: the monotonic
  decrease policy is stated in `enforcement.md` and checked at review.
- **Skill overlap with `clean-ddd-hexagonal`** causing contradictory advice.
  Mitigation: explicit delegation note in `SKILL.md`; this skill never
  restates general theory.

## Sources

Canon:

- [The Onion Architecture: part 1 — Jeffrey Palermo](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Onion Architecture — Herberto Graça](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)
- [Onion Architecture — Allegro Tech Blog](https://blog.allegro.tech/2023/02/onion-architecture.html)
- [Onion Architecture: Going Beyond Layers — NDepend](https://blog.ndepend.com/onion-architecture-layers/)
- [Chop Onions Instead of Layers — Methods & Tools](https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php)

Node/TypeScript practice:

- [DTOs, Mappers & the Repository Pattern — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- [Clean Architecture in Node.js: the Repository Pattern — Alex Rusin](https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/)
- [fastify-typescript-drizzle-starter-kit](https://github.com/256Taras/fastify-typescript-drizzle-starter-kit) — closest published layering to our stack
- [onion-architecture-boilerplate — Melzar](https://github.com/Melzar/onion-architecture-boilerplate)

Enforcement:

- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Dependency Cruiser: Restrict Imports — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [How We Enforce Architecture Boundaries at Scale — lastminute.com](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/)
- [Maintaining clean architecture with dependency rules — cubic.dev](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)
- [Clean Architecture Anti-Patterns — Milan Jovanović](https://milanjovanovic.tech/blog/clean-architecture-anti-patterns) — returned HTTP 403 when fetched; listed as further reading, nothing in this document is drawn from it
