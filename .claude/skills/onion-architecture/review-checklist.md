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
| The `.dependency-cruiser-known-violations.json` baseline grew in this diff without an obvious reason | Baseline policy, `enforcement.md` | Confirm the new entries are real, reviewed additions (e.g. an intentional new grandfathered exception) — not a way to silence a fresh violation |

## When `arch:check` fails in CI/locally

1. Read the rule name in the output — it maps directly to a row in
   `enforcement.md`'s rule table.
2. If the flagged file is already improving (moving toward compliance, not
   away from it), the fix is in the source, not the baseline.
3. If a change genuinely needs a new grandfathered exception (rare — this
   should almost never happen for new code), run `pnpm arch:baseline` and
   include the diff in the same PR with an explanation, not as a drive-by.
