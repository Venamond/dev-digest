# Module boundaries — what one module owns

The ring map says which *layer* code belongs to. This file says which *module*
owns it. A ring violation and a module violation are different failures: a
service calling another service is correct layering and a broken boundary.

## What a module owns

```
server/src/modules/<name>/
  routes.ts        ring 3 — the module's HTTP surface, registered in modules/index.ts
  service.ts       ring 1 — its use cases
  repository.ts    ring 2 — its tables, and only its tables
  helpers.ts       ring 1 — pure shapers over its own rows
  constants.ts     leaf values, no behaviour
  deps.ts          the narrow dependency bag, when the module needs another's data
```

A module is autonomous: adding one should touch its own directory plus a single
line in `modules/index.ts`. If a new module forces edits inside an existing
module, the boundary is wrong.

## The one rule that is enforced

```js
name: 'no-cross-module-internals',
from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/_shared/' },
to:   { path: '^src/modules/([^/]+)/(service|repository)(\.ts|/)',
        pathNot: '^src/modules/$1/' },
```

Read the matchers, not the name: it forbids importing **another module's
`service.ts` or `repository.ts`**. `modules/_shared/` is exempt as a source,
and the `$1` backreference is what lets a module import its own files.

The codebase is clean against it today — `grep -rn "from '\.\./[a-z-]*/\(service\|repository\)" server/src/modules/`
returns nothing.

## What that rule does not see

`helpers.ts` and `constants.ts` are not in its `to` matcher, so a cross-module
import of either passes `arch:check` silently. Six exist today:

| Importer | Imports | Reading |
| --- | --- | --- |
| `repos/service.ts:14` | `../repo-intel/constants.js` | leaf values — fine |
| `blast/service.ts:10` | `BFS_DEPTH`, `INDEXER_VERSION` from `../repo-intel/constants.js` | leaf values — fine |
| `reviews/run-executor.ts:24` | `approxTokens` from `../context/constants.js` | a pure function living in a constants file — borderline |
| `reviews/repository.ts:17` | `type PromptSkillRef` from `../agents/helpers.js` | a type — fine |
| `reviews/run-executor.ts:20` | `promptSkillBodies`, `promptSkillRefs` from `../agents/helpers.js` | **behaviour** crossing a module boundary |
| `conventions/service.ts:15` | `toSkillDto` from `../skills/helpers.js` | **behaviour** — another module's DTO shaper |

The distinction that matters is not the filename, it is **what crosses**:

- **A constant or a type** — fine. It carries no behaviour and no ownership.
- **A function that shapes another module's rows into another module's DTO** —
  a boundary break the checker cannot see. `toSkillDto` belongs to `skills`;
  when `conventions` needs a skill DTO it is asking `skills` a question, and
  that question should go through the container or a deps bag.

Do not extend the last two rows. They are the shape to recognise, not the shape
to copy.

## How a module asks another module for data

Two sanctioned seams, in order of preference:

**A narrow deps bag.** `modules/brief/deps.ts` names exactly the slice of
another module's repository it uses, and the composition root passes it in.
This is what fixed `RepoIntelService`'s import cycle: the module states its
needs as a type it owns, so no import edge points at the other module.

Declare that slice **structurally**, never as
`import type { ReviewRepository } from '../reviews/repository.js'`.
`.dependency-cruiser.cjs` runs with `tsPreCompilationDeps: true`, so a
type-only import is a real edge and a real `no-cross-module-internals`
violation — `brief/deps.ts` records exactly this reasoning above its
`BriefReviewRepo` interface. The concrete repository satisfies the structural
interface as it stands; row shapes travel through `db/rows.ts`.

**A container getter.** `container.agentsRepo` / `container.reviewRepo` expose
shared repositories as interface types. `reviews/service.ts:38` takes
`container.agentsRepo` this way; `brief/routes.ts:27` passes
`container.reviewRepo` into its deps bag. The import points at the composition
root, which is exempt by design — not at the other module.

Never a relative import of another module's `service.ts` or `repository.ts`.

## Table ownership

A module's `repository.ts` reads and writes **its own** tables. Nothing in
`arch:check` expresses this — every repository legitimately imports
`db/schema`, so two modules writing the same table produce an identical import
graph.

When a module needs rows another module owns, it goes through that module's
repository via the container, not by importing `t.<their_table>` and querying
it. Two writers on one table is how invariants get enforced in one place and
skipped in the other.

## Registering a module

`server/src/modules/index.ts` is a static registry — 14 entries today. Its
docstring states the procedure: create `modules/<name>/routes.ts` exporting a
default Fastify plugin, then add one import and one entry. Registration is
static rather than filesystem autoload so the same path works under tsx, the
bundler and vitest.

A module whose `routes.ts` is written but never added to that map type-checks,
lints and passes `arch:check` — and its endpoints do not exist at runtime. This
is the most common way a new module "works" in review and 404s in the studio.

## Check it

```sh
cd server && pnpm arch:check   # catches only the service/repository crossing
```

Everything else in this file is review judgment. For a cross-module import that
`arch:check` accepts, ask: *does behaviour cross here, or only a value?* And
for any new module: *is it in `modules/index.ts`?*
