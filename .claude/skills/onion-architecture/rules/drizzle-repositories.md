# Drizzle repositories — ring 2 persistence

`drizzle-orm` and `db/schema` are imported **only** in a module's
`repository.ts` (or split `repository/*.ts` files) and under `server/src/db/`.
Nowhere else.

## Do

- Keep every `drizzle-orm` import and every `db/schema` table reference
  inside `repository.ts`. `server/src/modules/reviews/repository.ts`
  composes its aggregate's queries from `repository/{review,run,pull}.repo.ts`
  — same principle, split by aggregate for a larger module.
- Where a row type needs to cross into ring 1 (a service or helper), source
  it from `server/src/db/rows.ts`, not from another module's `repository.ts`
  and not from `db/schema` directly. `reviews/helpers.ts` and
  `agents/helpers.ts` both take `FindingRow`/`PullRow`/`AgentRow` this way
  today.
- Express a transaction boundary as something ring 1 can call through a
  port — don't thread a raw Drizzle `tx` handle into ring 0.

## Don't

- Return a raw Drizzle row (`typeof t.foo.$inferSelect`) from a repository
  method that a route or ring-0 code will consume directly, if a contract
  type from `vendor/shared/contracts` already exists for that shape. Prefer
  the contract type at the boundary; keep the row type as the repository's
  internal working type.
- Import another module's `repository.ts` — cross-module repository access
  goes through the container (`container.agentsRepo`, `container.reviewRepo`),
  not a relative import. See `no-cross-module-internals` in `enforcement.md`.

## Check it

```sh
cd server && pnpm arch:check
```

`no-app-to-schema` fails the build if a `service.ts`, `helpers.ts`,
`run-executor.ts`, `diff-loader.ts`, or `repo-intel/pipeline/*` file imports
`drizzle-orm` or `db/schema` — `db/rows.ts` is explicitly exempted.
`run-executor.ts`, `diff-loader.ts`, and `repos/helpers.ts` do this today
and are grandfathered in the baseline, not a pattern to extend.
