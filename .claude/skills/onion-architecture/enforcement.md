# Enforcement

Two `dependency-cruiser` configs make the dependency rule a build failure
instead of a convention. `dependency-cruiser` 17.4.3 is already a `server`
dependency (used as a library by `repo-intel`'s `DepCruiseGraph`) — no new
package for either config.

## `server/.dependency-cruiser.cjs`

| Rule | Forbids |
| --- | --- |
| `no-domain-io` | ring 0 → `fastify`, `drizzle-orm`, `octokit`, `postgres`, `simple-git`, `@fastify/*`, `db/*` |
| `no-domain-node-builtins` | ring 0 → any Node core module |
| `no-route-to-db` | `modules/*/routes.ts` → `drizzle-orm`, `db/schema` |
| `no-app-to-schema` | ring 1 (`service.ts`, `helpers.ts`, `run-executor.ts`, `diff-loader.ts`, `repo-intel/pipeline/*`) → `drizzle-orm`, `db/schema`. `db/rows.ts` is explicitly allowed. |
| `no-infra-to-app` | `adapters/*` → a module's `service.ts`/`repository.ts`/`routes.ts` |
| `no-cross-module-internals` | one module → another module's `service.ts`/`repository.ts` (shared access goes through the container) |
| `no-circular` | any import cycle |

## `reviewer-core/.dependency-cruiser.cjs`

| Rule | Forbids |
| --- | --- |
| `core-no-node-builtins` | any Node core module |
| `core-allowlisted-deps-only` | any npm dependency except `openai`, `zod` |
| `core-no-circular` | any import cycle |

`reviewer-core` has no `dependency-cruiser` of its own — `arch:check:core`
runs `server`'s installed binary against `../reviewer-core/src` with
`../reviewer-core/.dependency-cruiser.cjs`, invoked from `server/`. Because
of that, dependency-cruiser reports every module path prefixed with
`../reviewer-core/`, not bare `src/...` — the `reviewer-core` config's
`from`/`to` patterns are written unanchored (`(^|/)src/`,
`(^|/)node_modules/...`) specifically to survive this. See
`server/INSIGHTS.md` for the full story if this trips you up again.

## Two config gotchas, not obvious from reading the code

- **`options.exclude` is not `options.doNotFollow`.** `doNotFollow` stops
  recursion *into* `node_modules` but still records the edge from your
  source file to the package — that edge is what every `to.path` rule
  needs. `exclude` drops the matched module *and every edge to it* from the
  graph entirely. With `exclude` set for `node_modules`, every rule
  forbidding a real, resolvable npm package (`fastify`, `drizzle-orm`)
  silently matches zero violations, while unresolvable packages
  (`octokit`, `p-queue`) still show up — because failed resolutions bypass
  `exclude`. That asymmetry makes the bug look like a resolver problem when
  it's a graph-filtering one. **Never add `exclude` for `node_modules` to
  either config.**
- **pnpm's `.pnpm` store layout.** A `to.path` regex written as
  `node_modules/<pkg>` will never match here — this repo's pnpm install
  resolves through `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...`.
  Both configs' rules that target specific npm packages match both forms.
  `octokit` specifically never resolves to a `node_modules/...` path at all
  (a pre-existing dependency-cruiser/package resolution limitation,
  unrelated to pnpm) — rules targeting it need a bare `octokit$`
  alternative too.

## Scripts (run from `server/`)

```sh
pnpm arch:check       # cd server && depcruise src --config .dependency-cruiser.cjs --ignore-known
pnpm arch:baseline    # regenerate .dependency-cruiser-known-violations.json
pnpm arch:check:core  # depcruise ../reviewer-core/src --config ../reviewer-core/.dependency-cruiser.cjs
```

## Baseline policy

`server/.dependency-cruiser-known-violations.json` is committed. It
grandfathers violations that predate this skill so `arch:check` can be
turned on today without a big-bang rewrite. **Its entry count may only
decrease.** Growing it requires a deliberate, reviewed `pnpm arch:baseline`
run — never as a way to make a new violation quietly disappear.

Current baseline (16 entries, as of this skill landing):

| Rule | File(s) | Why grandfathered |
| --- | --- | --- |
| `no-route-to-db` (8) | `pulls`, `polling`, `workspace`, `settings` routes | predate this skill, each imports `drizzle-orm` + `db/schema` directly |
| `no-app-to-schema` (3) | `run-executor.ts`, `diff-loader.ts`, `repos/helpers.ts` | predate this skill, import `db/schema` directly |
| `no-circular` (5) | `repo-intel/service.ts` + pipeline modules ↔ `container.ts`; `agents/helpers.ts` ↔ `agents/repository.ts` | direct consequence of services taking `Container` in their constructor (`rules/ports-adapters-di.md`) — a real, pre-existing architectural wrinkle, not fixed here under this work's no-runtime-source-changes constraint |

Fixing any of these is real follow-up work — move the query into the
module's service/repository, remove the corresponding baseline entry,
confirm `arch:check` stays green — done one file at a time, not bundled
into an unrelated change.
