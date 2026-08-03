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
`ReposService`, and `RepoIntelService` all currently take `Container` in
their constructor (`constructor(private container: Container) {}`). This is
grandfathered — a known pattern in the existing codebase, not something
`dependency-cruiser` can catch statically (it's a constructor parameter
type, not an import-graph edge). It is also the direct cause of the
`no-circular` violations baselined in `enforcement.md`: `repo-intel/service.ts`
imports `container.ts` for typing, and `container.ts` imports
`RepoIntelService` back to construct it.

**Do not copy this into a new service.** A new service should list the
ports it actually uses in its constructor signature.

## Check it

Nothing here is enforced by `dependency-cruiser` — this is a
`review-checklist.md` item, held by review judgment, not by `arch:check`.
