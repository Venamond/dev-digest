# `@devdigest/mcp` — local stdio MCP server

A presentation adapter over HTTP, structurally the mirror of `client/`: it
owns transport and formatting and no business logic. It talks only to the
DevDigest REST API at `http://localhost:3001` and never to Postgres, Drizzle,
the DI container, or `server/src/db`. Built against
`docs/plans/2026-08-18-mcp-server.md` — read that plan for the full rationale
behind every decision below; this file is the operational summary.

## Commands

```sh
npm ci             # install — required before `npm run start` or registration
npm run typecheck  # tsc --noEmit; this package never emits JS (like reviewer-core)
npm test           # vitest, hermetic — fetch stubbed, no network, no DB
npm start          # tsx src/index.ts — the stdio entrypoint, normally launched by an MCP client, not by hand
```

## Structure

- `src/api/client.ts` — `DevDigestApi`, a thin `fetch` wrapper: timeouts
  (`REQUEST_TIMEOUT_MS = 60_000`), the `ApiErrorBody` → typed-error mapping.
  No Zod re-validation of responses (see "DTO typing" below).
- `src/api/resolve.ts` — the three lookups the API has no direct route for:
  `owner/name` → repo id, PR number → pr id, agent name/id → agent id.
- `src/api/types.ts` — hand-written local `interface`s for the DTO shapes
  this package reads (see "DTO typing" below).
- `src/format.ts` — finding trimming, `filter → sort → cap`, the two result
  constructors `jsonContent` / `errorContent`.
- `src/tools/*.ts` — one file per tool: validate → orchestrate via
  `resolve.ts`/`client.ts` → format → JSON.
- `src/server.ts` — `createMcpServer(api)` + the four-line `INSTRUCTIONS`
  string. Builds the registry; performs no I/O.
- `src/index.ts` — the only file that touches the transport: builds
  `DevDigestApi`, calls `createMcpServer`, then `server.connect(new
  StdioServerTransport())`.
- `src/log.ts` — `logInfo` / `logError`, the only permitted `stderr` writers.
- `src/config.ts` — `loadConfig`, reads `DEVDIGEST_API_URL` only.

## DTO typing — Branch B was taken

S0 of the plan measured whether `mcp/`'s Zod-4 dependency (forced by
`@modelcontextprotocol/server@^2.0.0`, which depends on `zod@^4.2.0`) could
compile the Zod-3-authored contracts at `server/src/vendor/shared` through a
type-only tsconfig `paths` alias (Branch A, the preferred outcome — the
precedent is `reviewer-core/tsconfig.json`). It could not:
`cd mcp && npm run typecheck` failed with Zod-4 rejecting
`SettingsKnown.feature_models` (`contracts/platform.ts:94`,
`z.record(FeatureModelId, FeatureModelChoice).default({})`) — Zod 4 made
`z.record(<enum>, …)` exhaustive, so the inferred type requires all five
`FeatureModelId` keys and rejects the empty-object default that Zod 3
accepted.

So this package is on **Branch B**: `mcp/tsconfig.json` has **no**
`@devdigest/shared` paths entry (bare or subpath), and `mcp/src/api/types.ts`
holds plain hand-written `interface`s for the ten shapes / 34 fields this
package actually reads, each headed with a comment naming the contract file
it mirrors. No Zod, no runtime code, no re-validation. **The subpath rule
(`@devdigest/shared/*`) is moot here** — under Branch B the alias doesn't
exist at all, bare or subpath, so there is nothing for a subpath import to
resolve to. `mcp/test/guards.test.ts` still asserts that `@devdigest/shared`
is never imported, bare or subpath, so a future re-introduction of the alias
without updating this file trips a test.

## Why this is architecturally sound, in ring vocabulary

`server/src/vendor/shared/contracts/*` is **ring 0 — Domain** in this repo's
onion map, alongside `vendor/shared/adapters.ts` and `reviewer-core/src/*`.
A new outer consumer importing ring 0 type-only points strictly **inward**,
the one direction the dependency rule permits — this is the shape Branch A
would have taken, had the typecheck allowed it. What must never happen,
under either branch, is an import of anything further out:

| Target | Ring | Why `mcp/` must not import it |
|---|---|---|
| `server/src/vendor/shared/contracts/*` | **0 — Domain** | Would be allowed, type-only, under Branch A. Pure Zod contracts, no I/O. |
| `server/src/db/rows.ts` | **2**, sanctioned seam ring 1 may use | Persistence shapes. Naming a DB row from outside the server is exactly the coupling the seam exists to *contain*, not to export. |
| `server/src/modules/*/service.ts` | **1 — Application** | Orchestration with side effects; reachable only through HTTP from here. |
| `server/src/modules/*/repository.ts` | **2 — Infrastructure** | Drizzle queries. Importing it would put SQL in an MCP process. |
| `drizzle-orm`, `postgres`, `fastify`, `@fastify/*` | ring 2/3 machinery | `mcp/` is an HTTP client, not a server or a DB consumer. |

`mcp/test/guards.test.ts` enforces the bottom four rows with a regex over
`../server/src`, `drizzle-orm`, `postgres`, `fastify`, `@fastify/`, and
`@devdigest/reviewer-core`. **Neither `server/`'s `arch:check` nor
`arch:check:core` ever walks `mcp/`** — both dependency-cruiser configs are
anchored to their own package's `src`, so this package-local vitest guard is
the *only* enforcement of the ring rule here. No third dependency-cruiser
config was added for this (a rejected alternative — see the plan's D6): a
new cruiser config costs a devDependency and a third set of cwd-sensitive
regexes, the exact class of silent-zero-match bug `server/INSIGHTS.md`
records twice.

## Non-default conventions

- **`get_blast_radius`'s description promises a working tool, on purpose.**
  It does not say "not implemented" or "stub". The model is *meant* to call
  it, receive the forward-leading `isError` (which names `get_conventions`
  and the `file` field of a finding as the alternative), and act on it — that
  is the live classroom demonstration of design principle 4, *errors lead
  forward*. Adding "not implemented" to the description would suppress the
  call and turn the tool into ~30 tokens of dead context weight paid at every
  chat startup for nothing. `mcp/test/tools.test.ts`'s
  `'get_blast_radius describes itself as working and does not say "not
  implemented"'` enforces this — if you are here because that description
  "looks wrong", it isn't; read this section before touching it. The real
  pickup point for the next lesson is `RepoIntel.getBlastRadius`
  (`server/src/modules/repo-intel/service.ts:214`, interface at `types.ts:147`)
  — the facade method exists, but `server/src/modules/repo-intel/routes.ts`
  exposes no route for it.
- **The `repo` example — in `INSTRUCTIONS` (`src/server.ts`) and in
  `run_agent_on_pr`'s `.describe()` — is a deliberate placeholder,
  `octocat/hello-world`, and must not be replaced with a real repository.**
  It illustrates the `owner/name` shape, nothing else. Two reasons it stays
  fake: (1) this server exposes no `list_repos` tool, so a real-looking
  example is the only repository name in the model's context and it will
  substitute that instead of asking which repo the user means — harmless on
  the read tools, but `run_agent_on_pr` would spend LLM money reviewing the
  wrong PR; (2) a fork-specific name baked into shared source ships upstream
  to every student of the course. Changed from `Venamond/dev-digest` on
  2026-08-18; the same string is mirrored in the plan's S4 table
  (`docs/plans/2026-08-18-mcp-server.md`) — keep both in sync. No test pins
  the example (`token-budget.test.ts` checks only
  `toContain('owner/name')`), and the token numbers below are unchanged by
  the swap.
- **The five tool `description` strings are fixed text, copied
  character-for-character from the plan's S4 table.** They are English on
  purpose in a Ukrainian-language course repo: the description is read by
  **the model, not the student**, models follow English tool descriptions
  more reliably, and Cyrillic tokenizes worse. They carry *routing*
  ("call this first", "without starting a new run") rather than argument
  documentation — argument formats live in `.describe()` on `repo` and
  `agent` only. `mcp/test/token-budget.test.ts`'s
  `'every tool description is byte-identical to the approved text'` asserts
  this mechanically; do not paraphrase, reflow, or translate them.
- **stdout is the protocol; all logging goes through `src/log.ts` to
  stderr.** `mcp/src/log.ts` writes `JSON.stringify({level, msg, ...data})`
  lines to `process.stderr` only. Application code must never write to
  `process.stdout` — it belongs to `StdioServerTransport`, and any stray
  write there breaks JSON-RPC framing for the connected client.
  `mcp/test/guards.test.ts`'s `'no source file writes to stdout'` enforces
  this by source scan.
- **`zod@^4.2.0` is a floor, not a preference.** Under Zod 4.0–4.1 the SDK
  falls back to a conversion path that silently drops `.describe()` field
  descriptions and logs a one-time console warning — both unacceptable here:
  `repo`'s description is the single most load-bearing hint in the tool
  surface, and a stray console warning from a dependency is exactly the
  stdout/stderr hygiene hazard the protocol's stdio transport spec forbids.
  `mcp/test/token-budget.test.ts`'s `'the repo description survives into the
  published inputSchema'` is the tripwire: a future loosening of this pin
  fails a test instead of silently degrading the tools.
- **`readOnlyHint` is an untrusted hint, not enforcement.** The MCP spec says
  clients must treat tool annotations from untrusted servers as advisory
  only; `readOnlyHint: true` on the four read tools is a UX signal that lets
  a client auto-approve a read, nothing more. The real guarantee that those
  four tools are read-only is that their code paths issue only `GET`s —
  `run_agent_on_pr` is the one tool without `readOnlyHint`, because it is the
  one tool that issues a `POST` and spends real LLM money.
- **`readOnlyHint` is the only annotation we set, and the other three are
  deliberately absent — do not "complete" the set for spec tidiness.**
  `destructiveHint` and `idempotentHint` are meaningful only when
  `readOnlyHint == false`, so on the four read tools they say nothing. On
  `run_agent_on_pr` every value we could write either repeats the client's
  default (`idempotentHint: false`, `openWorldHint: true`) or actively
  weakens the guard: an explicit `destructiveHint: false` would be formally
  accurate — a run only appends rows — but it nudges clients toward
  auto-approving the one tool that spends real money, which the omitted
  block's cautious default (`destructiveHint: true`) prevents. Cost, measured
  with the same `cl100k_base` encoder the tests use: `"annotations":
  {"readOnlyHint":true}` is 8 tokens, adding `openWorldHint` makes it 14
  (+6 per tool), and a full three-hint block on `run_agent_on_pr` is 22 —
  which would take that tool from 156 to roughly 178 tokens and force
  `PER_TOOL_TOKEN_CAP_OVERRIDES.run_agent_on_pr` up from 160, loosening the
  only mechanical gate on tool-surface size. The one hint that would carry
  new information is `openWorldHint: false` on the four read tools (they
  query a bounded set of imported repos, not the open internet); it costs
  +24 tokens per session start and no client acts on it today, so it stays
  unset until one does.

## Token budget — measured numbers (S7)

`mcp/test/token-budget.test.ts` gates `tools/list` + `instructions` at a
900-token total cap and 200 tokens per tool, using the same `cl100k_base`
encoder the server uses (`js-tiktoken`). Measured on this branch:

| Tool | Tokens |
|---|---|
| `list_agents` | 57 |
| `run_agent_on_pr` | 171 |
| `get_findings` | 191 |
| `get_conventions` | 69 |
| `get_blast_radius` | 102 |
| **Total (`tools` + `instructions`)** | **673** (cap 900) |

**The per-tool cap is 200, not the plan's 150, and there is no per-tool
override.** Two changes stacked. First, Zod 4's JSON-Schema conversion for
`z.number().int()` always emits explicit `minimum`/`maximum` bounds around
`Number.MAX_SAFE_INTEGER`, roughly 26 tokens per integer field; that alone
took `run_agent_on_pr` to 156 against the plan's 150, and was carried for a
while as `PER_TOOL_TOKEN_CAP_OVERRIDES = { run_agent_on_pr: 160 }`. Second,
on 2026-08-19 every parameter got a `.describe()` — `agent` and
`severity_min` on `get_findings` in particular carry semantics a model
cannot infer from the name and type (`agent` omitted unions every agent's
newest review; `severity_min` keeps that severity *and above*). That costs
+69 tokens across the surface and puts `get_findings` at 191. Human-approved
resolution: a flat `PER_TOOL_TOKEN_CAP = 200` with the override deleted,
because the gate that actually protects the session's context is
`TOTAL_TOKEN_CAP`, and the total moved 604 → 673 against 900. If a future
change pushes the total past ~800, cut parameter descriptions before
touching `TOTAL_TOKEN_CAP`.

**In-session cost — pending human verification.** The numbers above are
`JSON.stringify(tools)` measured by the test suite, which is a **systematic
underestimate** of what a real chat session pays: the client namespaces tool
names (e.g. `mcp__devdigest__run_agent_on_pr`, roughly four times the bare
name, across all five tools) and adds its own framing on top. The plan
requires reading the actual figure via `/context` in a live Claude Code
session after registration and recording it here as
`in-session: M tok (measured <date>)`. **This has not been done in this
implementation pass** — it requires an interactive Claude Code session,
which a subagent running this plan does not have. If `M` turns out to exceed
the 900-token cap even though the measured `tools/list` total (604) does not,
that is a finding for `mcp/INSIGHTS.md`, not a reason to loosen the gate.

## `.mcp.json` registration — verified green

The plan requires empirically verifying the committed root `.mcp.json`
(relative paths `mcp/node_modules/.bin/tsx` / `mcp/src/index.ts`) actually
launches the server. A full interactive Claude-Code-restart `/mcp` check
could not be performed from this implementation pass (a subagent, not the
interactive host session). As the practical equivalent, the Inspector CLI
was invoked directly from the repo root with the exact command/args
`.mcp.json` declares:

```sh
npx @modelcontextprotocol/inspector --cli \
  "$PWD/mcp/node_modules/.bin/tsx" "$PWD/mcp/src/index.ts" --method tools/list
```

(`--method tools/list` was required — the installed Inspector CLI,
`@modelcontextprotocol/inspector@2.2.0`, rejects a bare invocation with
`Method is required`; this is the one addition beyond the plan's literal
command line, invoking the same target and getting the same answer the
plan's check is after.) This returned all five tools
(`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`,
`get_blast_radius`) with their expected descriptions and schemas. **Branch:
green** — `.mcp.json` was kept as written, committed at the repo root, not
git-ignored.

**Still outstanding:** the actual Claude-Code-restart `/mcp` check inside an
interactive session. The Inspector check is strong evidence the committed
command/args are correct (same launch shape, invoked directly), but it is
not the same check — do not treat this file as claiming the restart check
was performed.

## Gotchas

- `resolvePullId(api, repoId, pr, repoLabel?)` takes an optional 4th
  `repoLabel` used only in its "not found" message — **pass the human
  `owner/name` string here** (both call sites do:
  `resolvePullId(api, repoId, pr, repo)`). Omitting it falls back to naming
  the internal `repoId` uuid instead, which is still actionable but far less
  readable. (Fixed 2026-08-18, after `mcp/INSIGHTS.md` recorded it as a
  minor deviation — the original signature had no way to name the repo at
  all.)
- `agents.name` has no unique constraint
  (`server/src/db/schema/agents.ts:13`), so `resolveAgentId` must never take
  `[0]` on a name match — collect every match and fail loudly when there is
  more than one, or a paid LLM run can silently target the wrong agent.
- `run_agent_on_pr` deliberately has neither `detail` nor `severity_min` in
  its schema, unlike `get_findings` — it's the one tool that spends money, so
  its response shape stays fixed; re-reading with a filter goes through the
  free `get_findings` instead.

## Do-not-touch

- Don't add a `@devdigest/shared` paths entry (bare or subpath) back into
  `mcp/tsconfig.json` without re-running S0's typecheck spike — Branch B was
  forced by a real Zod-4/Zod-3 incompatibility, not a preference.
- Don't add a fourth vendored copy of the contracts under `mcp/src/vendor` —
  `./scripts/check-shared-sync.sh` only diffs the two existing copies and
  would never see a third one drift.
- Don't paraphrase, reword, or translate the five tool `description`
  strings, and don't add "not implemented" to `get_blast_radius`'s — both are
  approved, budgeted, and asserted byte-for-byte by tests (see above).
- Don't build this package to `dist/` or add a bundler — it runs from
  TypeScript source via `tsx`, same as `reviewer-core/`.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | registering the server, or listing what the five tools do |
| [docs/plans/2026-08-18-mcp-server.md](../docs/plans/2026-08-18-mcp-server.md) | the full rationale behind every decision summarized here |
| [INSIGHTS.md](INSIGHTS.md) | **as soon as a request makes clear it concerns `mcp/`** — read before any other action |
| [../TESTING.md](../TESTING.md) | writing a new test |

**On finishing work here: re-read `INSIGHTS.md`, then append only if
something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
