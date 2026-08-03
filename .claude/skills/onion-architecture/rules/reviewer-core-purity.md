# reviewer-core purity — the pure core

`reviewer-core` is DevDigest's diff→prompt→LLM→findings engine. Ring 0, in
its entirety.

## What it is

- **No I/O beyond the injected LLM call.** The only side effect anywhere in
  this package is calling the `LLMProvider` interface passed in by the
  caller (`server` for local reviews, the CI agent-runner for pipeline
  runs). No database, no filesystem, no network beyond that one injected
  call.
- **Allowlisted dependencies: `openai` and `zod` only** (plus
  `@devdigest/shared` via the tsconfig path alias — that resolves to a
  local file, not an npm install, so it doesn't count against the
  allowlist).
- **Consumed as source, not a build artifact.** `reviewer-core` never
  compiles to JS — `build` is `tsc --noEmit`. Both `server` and the future
  CI runner import the TypeScript source directly via a tsconfig path alias
  (`@devdigest/reviewer-core` → `../reviewer-core/src/index.ts`).

## Why this matters

No I/O means the entire engine is testable with a stubbed `LLMProvider` —
no keys, no network, no database, hermetic and fast. Adding a database
lookup or a filesystem read here breaks that for every consumer.

## Adding a capability without breaking this

If new logic needs a database, GitHub, or filesystem access: that access
belongs in the *caller* (`server`), which passes the already-fetched data
in as a parameter, or injects another narrow interface the same way
`LLMProvider` is injected. Don't reach for the resource directly from inside
`reviewer-core`.

## Check it

```sh
cd server && pnpm arch:check:core
```

Runs from `server/` since `reviewer-core` has no `dependency-cruiser`
dependency of its own — it uses `server`'s installed binary via a relative
path. Enforces:

- `core-no-node-builtins` — no `fs`, `child_process`, or any other Node
  core module.
- `core-allowlisted-deps-only` — only `openai` and `zod` as npm
  dependencies.
- `core-no-circular` — no import cycles.

See `enforcement.md` for a gotcha specific to this config: because it always
runs with `server/` as the working directory, module paths are reported as
`../reviewer-core/src/...`, not `src/...` — the rules are written to account
for that.
