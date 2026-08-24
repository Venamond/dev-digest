# Ports, adapters, and the DI container

Adding a new external dependency (an LLM provider, a third-party API
client, anything that does I/O) follows this sequence:

1. **Interface in ring 0** — add the port to
   `server/src/vendor/shared/adapters.ts` (and mirror to
   `client/src/vendor/shared/adapters.ts` if it's a shared type).
2. **Implementation in ring 2** — a concrete class in
   `server/src/adapters/<name>/`, implementing that interface. Model:
   `SecretsProvider` (interface) / `LocalSecretsProvider` in
   `adapters/secrets/local.ts` (implementation). Secrets never go through
   `AppConfig` and are never read from `process.env` directly outside this
   adapter.
3. **Lazy getter in the composition root** —
   `server/src/platform/container.ts` gets a `get foo(): Foo` (or an async
   method, for adapters needing a secret lookup) that constructs and caches
   the concrete class, returning the interface type.
4. **Override field** — add it to `ContainerOverrides` so tests can inject a
   mock without touching the real adapter.
5. **Mock in `adapters/mocks.ts`** — a test double implementing the same
   interface.

## A service takes ports, not `Container`

`Container` is a service locator, and belongs only in the composition root.
A service constructor should take the specific ports it needs, explicitly.

**This does not hold everywhere yet.** `ReviewsService`, `AgentsService`,
and `ReposService` still take `Container` in their constructor
(`constructor(private container: Container) {}`). That pattern is
grandfathered — not something `dependency-cruiser` can catch from a
constructor parameter alone.

`RepoIntelService` was the circular case: it (and its pipeline) imported
`Container` for typing while `container.ts` imported `RepoIntelService` to
construct it. Fixed 2026-08-04 by taking a narrow `RepoIntelDeps` bag
(`modules/repo-intel/deps.ts`) instead — composition root still passes
`this`, but the import edge is gone.

**Do not copy the Container-in-constructor pattern into a new service.**
List the ports (or a narrow deps bag) the service actually uses.

## Check it

Nothing here is enforced by `dependency-cruiser` — this is a
`review-checklist.md` item, held by review judgment, not by `arch:check`.
