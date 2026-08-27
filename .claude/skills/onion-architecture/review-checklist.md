# Review checklist

`pnpm arch:check` catches import-graph violations. It cannot catch
everything — these need a human (or reviewer-agent) reading the diff.

| Symptom | Violated rule | Fix |
| --- | --- | --- |
| A new `service.ts` takes `Container` in its constructor | Not statically enforced — `rules/ports-adapters-di.md` | Take the specific ports the service actually uses, explicitly, in the constructor |
| A repository method's return type is `typeof t.foo.$inferSelect` (or similar) and is exported/consumed outside `repository.ts` | Ring-2 shape leaking past its boundary | Return a `vendor/shared/contracts` type at the boundary, or route the row type through `db/rows.ts` if it must cross into ring 1 |
| A service or route calls `Schema.parse()` on a value that was already validated by an earlier Zod parse in the same request | Double boundary-parsing, `rules/zod-contracts.md` | Parse once, at the actual boundary (route handler or external-API adapter) |
| A `routes.ts` file imports anything from `drizzle-orm` or `db/schema` | `no-route-to-db` (should already be caught by `arch:check` — if it isn't, check whether the file was added to the baseline by mistake) | Move the query into the module's service/repository |
| A `service.ts`/`helpers.ts` imports `db/schema` instead of `db/rows.ts` | `no-app-to-schema` (same caveat as above) | Swap to `db/rows.ts` for the row type, drop the `db/schema` import |
| An `adapters/*` file imports a module's `service.ts` | `no-infra-to-app` | Invert the dependency — the service should call the adapter through its ring-0 interface, not the other way around |
| A new field added to a shared contract is `.nullable()` when every existing caller expects it optional | Not an architecture violation, but breaks `tsc --noEmit` across `server`/`client` | Use `.nullish()` if the field should also be omittable; grep every existing object literal of that type first |
| A new application file under `modules/<name>/` imports `drizzle-orm` or `db/schema` and `arch:check` stays green | `no-app-to-schema` matches a BASENAME list (`service\|helpers\|walk\|resolve\|facade\|run-executor\|diff-loader\|feature-models`) — any other name is silently unprotected, `rules/indirection.md` | Move the query into `repository.ts`, or add the basename to the rule in the same commit that creates the file |
| Ring 1 never imports Drizzle but receives a `Db`, a `tx`, or a query builder through a deps bag or callback | Laundering a handle, `rules/indirection.md` — no import edge exists, so nothing fires | Hand ring 1 a service or a port behind an interface, the way `brief/deps.ts` passes thunks returning `BlastService` |
| A module imports another module's repository via `_shared/`, a barrel, or a `facade.ts` | Re-export laundering, `rules/indirection.md` — both edges pass `no-cross-module-internals`, the composite does not | Go through `container.<owner>Repo` or a narrow deps bag; keep other modules' data layers out of `_shared/` |
| An import inside `vendor/shared/**` climbs out of `vendor/shared` | Ring 0 depending outward, `rules/indirection.md` — `no-domain-io`'s `to` lists npm packages and `src/db/`, not `src/modules/`; it also breaks the byte-identical client copy | Move the value into `vendor/shared`, or pass it in as a parameter |
| A module imports a *function* from another module's `helpers.ts` (not a type or a constant) | Module boundary, `rules/module-boundaries.md` — `no-cross-module-internals` only matches `service`/`repository`, so this passes `arch:check` | Ask the owning module through `container.<their>Repo` or a narrow deps bag (`modules/brief/deps.ts`), or move the shaper to `_shared/` if it is genuinely shared |
| A new module's `routes.ts` exists but the module is not in `server/src/modules/index.ts` | Not statically enforced — the registry is a static map, so the endpoints simply do not exist at runtime | Add the import and the entry; the module is not wired until both lines are there |
| Two modules' repositories read or write the same table | Table ownership, `rules/module-boundaries.md` — invisible to `arch:check`, since both repositories import `db/schema` legitimately | One owner per table; the other module goes through the owner's repository via the container |
| The `.dependency-cruiser-known-violations.json` baseline grew in this diff without an obvious reason | Baseline policy, `enforcement.md` | Confirm the new entries are real, reviewed additions (e.g. an intentional new grandfathered exception) — not a way to silence a fresh violation |

## When `arch:check` fails in CI/locally

1. Read the rule name in the output — it maps directly to a row in
   `enforcement.md`'s rule table.
2. If the flagged file is already improving (moving toward compliance, not
   away from it), the fix is in the source, not the baseline.
3. If a change genuinely needs a new grandfathered exception (rare — this
   should almost never happen for new code), run `pnpm arch:baseline` and
   include the diff in the same PR with an explanation, not as a drive-by.
