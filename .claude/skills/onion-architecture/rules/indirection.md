# Violations that hide behind one hop

Every rule in `.dependency-cruiser.cjs` is a pair of path matchers over a
single import edge. That shape has a consequence worth stating plainly: a
violation split across **two legal edges**, or committed by a file **outside a
rule's `from` scope**, produces the same `0 violations` output as clean code.

So when reviewing, the question is not only *does this edge break a rule*. It
is also:

1. **Is this file inside the rule's scope at all?**
2. **Does the composition of two legal edges do what one illegal edge would?**

Three shapes recur. All three are review judgment; none is catchable.

## 1. The unprotected basename

`no-app-to-schema` does not match "ring 1". It matches a list of basenames:

```
^src/modules/[^/]+/(service|helpers|walk|resolve|facade|run-executor|diff-loader|feature-models)\.ts$
```

plus whole-directory alternatives for `repo-intel/pipeline/`, `reviews/intent/`,
`smart-diff/pure/`, three `blast/` files, `_shared/` and `brief/`.

The config says so itself, and says what it costs:

> This list enumerates BASENAMES: an application file whose name is not here is
> silently unprotected, and the rule then prints the same "0 violations" it
> prints when nothing is wrong.

A new ring-1 file called `aggregate.ts`, `rollup.ts`, `stats.ts` or
`query-builder.ts` may import `drizzle-orm` and `db/schema` freely. `walk`,
`resolve` and `facade` were added to that list when `modules/context` grew
them — for exactly this reason.

**In review:** for every new file under `modules/<name>/` that holds
application logic, check whether its basename is in that list. If it is not and
it touches persistence, either move the query into `repository.ts` or extend
the basename list **in the same commit** — never in a follow-up.

## 2. Laundering a handle instead of importing one

A rule sees imports. It does not see values. Ring 1 that never imports
`drizzle-orm` but *receives* a `Db` — through a deps bag field, a callback
parameter, or `container.db` — can compose the same queries with no edge to
match.

The distinction against the legal pattern is what the value **is**:

- `modules/brief/deps.ts` holds `blast: () => BlastService` and
  `github: () => Promise<GitHubClient>` — thunks that return a *service or a
  port*. Legal: the caller gets behaviour behind an interface.
- A field or callback that yields a `Db`, a transaction handle, or a query
  builder hands ring 1 the persistence layer itself. The import graph is clean
  and the layering is not.

`modules/brief` does take `db: Db` in its deps bag today; note that
`modules/brief/` is one of the whole-directory alternatives in
`no-app-to-schema`'s `from`, i.e. an already-accepted exception, not a pattern
to copy into a new module.

## 3. Re-export laundering through an exempt directory

`no-cross-module-internals` forbids `modules/X/**` → `modules/Y/(service|repository)`,
with `modules/_shared/` excluded from its `from`. Both halves of that sentence
are needed to see the hole:

```
modules/_shared/repos.ts   →  modules/reviews/repository.ts   legal: _shared is exempt as a source
modules/reports/service.ts →  modules/_shared/repos.ts        legal: the target is not a service/repository
```

Two legal edges. The composite is `reports` reaching into `reviews`'
repository, which is precisely what the rule exists to stop. The same trick
works through any file the `to` matcher does not name — an `index.ts` barrel, a
`facade.ts`, a type-only re-export.

**In review:** when a module imports a repository or a service it does not own,
follow the import one more hop. `_shared/` should hold request context, schema
fragments and name sets — not other modules' data layers.

## 4. Ring 0 importing outward

`no-domain-io`'s `to` matcher lists npm packages and `src/db/`. It does not
list `src/modules/`. A file under `vendor/shared/` may therefore import a
module's constants, helpers or types and nothing fires, even though ring 0
depending on ring 1 inverts the whole diagram.

It also breaks the vendored copy: `client/src/vendor/shared` must stay
byte-identical, and the client tree has no `src/modules/`, so the mirrored file
cannot resolve its own import.

**In review:** any import in `vendor/shared/**` whose specifier climbs out of
`vendor/shared` is a finding, whatever it points at.

## Check it

Nothing in this file is enforced. `pnpm arch:check` will print `0 violations`
for every example above. The check is a reader who asks, for each new file,
*which rules actually cover this path* — and who follows a suspicious import
one hop further than the diff shows.
