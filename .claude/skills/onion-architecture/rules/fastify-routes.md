# Fastify routes — ring 3

A route file is a **driving adapter**: validate, delegate, map errors.
Nothing else belongs in a handler.

## Do

- Validate request/response with a Zod contract from
  `vendor/shared/contracts`, wired through `fastify-type-provider-zod` — one
  schema drives both request validation and response serialization. Never
  hand-roll `Schema.parse(req.body)` in a handler.
- Resolve a service from `container` and call it: `const { container } =
  app; const result = await container.reviewsService.doThing(...)`.
- Translate thrown errors through `platform/errors.ts` (`AppError`,
  `NotFoundError`, `ConfigError`, …) — don't catch and swallow, don't return
  raw error objects.

## Don't

- Import `drizzle-orm` or `db/schema`. A route reaching into the database
  directly skips the service and repository layers entirely.
- Put business logic in the handler — severity rollups, status derivation,
  cost math belong in a service or a ring-0 helper, not inline in
  `routes.ts`.

## Bad example (in this repo today)

`server/src/modules/pulls/routes.ts`'s `GET /repos/:id/pulls` handler opens
with:

```ts
const [repo] = await container.db
  .select()
  .from(t.repos)
  .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
```

This is a direct Drizzle query inside a route handler — exactly what
`no-route-to-db` forbids. `pulls`, `polling`, `workspace`, and `settings`
routes all do this today; they're grandfathered in the dependency-cruiser
baseline (`enforcement.md`), not a pattern to copy into new code.

## Good example

`server/src/modules/agents/routes.ts` delegates to `AgentsService` for
every handler — the route file itself never imports `drizzle-orm` or
`db/schema`.

## Check it

```sh
cd server && pnpm arch:check
```

`no-route-to-db` fails the build if a route imports `drizzle-orm` or
`db/schema` and isn't already in the baseline.
