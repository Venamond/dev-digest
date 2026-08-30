# Blast Radius — design

- **Date:** 2026-08-19
- **Lesson:** L04, second half (`README.md:86`). The first half — `devdigest-mcp` — already shipped.
- **Status:** draft — the human approves before `planner` writes the implementation plan.

## 1. What we are building

A map of a PR's potential impact, answering one reviewer question: *what else can
this diff touch?* Three layers, in order:

1. symbols declared in the PR's changed files,
2. who imports or calls those symbols,
3. which HTTP endpoints and cron jobs can be reached from those callers and
   from the modules that import the changed files.

Layer 2 covers **both** relationships the requirement names: callers (from
`references`) and importers (reverse-import graph, depth 1). A file can import
a changed file without calling any detected symbol; it is still impact.

The map is rendered as a **Blast Radius** card on the PR page's **Overview** tab,
beside the existing Intent card. It is also served over MCP as `get_blast_radius`.

**The main path makes zero LLM calls.** Every node and edge comes from the
`repo-intel` index. One optional, explicitly-triggered call writes a one-paragraph
explanation of a map the model is *given*, never one it invents.

## 2. Data sources

Every table already exists. **This feature requires no migration.**

| Data | Source | Written by |
|---|---|---|
| Changed files | `pr_files.path` | PR import |
| Declared symbols | `symbols` | repo-intel indexer |
| Callers | `references` where `decl_file` resolved | indexer + `resolveReferences` |
| File importance | `file_rank.rank` | `pipeline/rank.ts` |
| Endpoints / crons | `file_facts.endpoints` / `.crons` | indexer (precomputed) |
| Reverse import graph | `file_edges`, index `file_edges_repo_to_idx (repo_id, to_file)` | indexer |
| Index freshness | `repo_index_state.status` | indexer |
| Prior PRs on the same files | `pr_files` ⋈ `pull_requests`, same repo, other PRs | PR import |
| Deep links | `repos.full_name` + `pull_requests.head_sha` | PR import |

`server/src/db/schema/repo-intel.ts:52` states the reverse index exists precisely
so "blast" can walk *who depends on this file* in O(degree). We are the intended
consumer.

**Never read on the request path:** the git clone, the AST, the dependency graph
builder. Those are indexer-time concerns.

## 3. Call sequence

```
GET /pulls/:id/blast
  ├─ getContext(container, req)                   → workspaceId
  ├─ BlastRepository.getPull(workspaceId, prId)   → 404 if absent / other workspace
  ├─ BlastRepository.prFiles(prId)                → changedFiles[]
  ├─ repoIntel.getIndexState(repo.repoId)         → THE GATE
  │      status ∉ {full, partial} → { state: 'degraded', reason } and STOP
  │      status === 'partial'     → state: 'partial', continue
  ├─ repoIntel.getBlastRadius(repoId, changedFiles, { maxCallersPerSymbol: 20 })
  │      → changedSymbols[], callers[] (rank DESC), impactedEndpoints[], factsByFile
  ├─ repoIntel.getReverseDependents(repoId, callerFiles, 2)     ← new facade method
  │      → depth-limited reverse walk over file_edges, then their file_facts
  ├─ BlastRepository.priorPulls(repoId, prId, changedFiles)     → recent PRs, capped
  └─ shape → group callers under their symbol, attribute endpoints via factsByFile
```

### The index-state gate is load-bearing

Without it, `getBlastRadius` falls through to its ripgrep best-effort path
(`server/src/modules/repo-intel/service.ts:230-296`), which calls
`codeIndex.symbols(ref)` and then `readClone(...)` **for every caller file in the
request**. That directly violates the acceptance criterion *the server does not
rebuild the AST or the import graph during a request*. Gating on `getIndexState`
guarantees the route never enters that branch.

Combining two facade calls to distinguish `partial` from `degraded` is not a
workaround — `types.ts:17-20` documents that "the degraded status/reason is always
observable via `getIndexState()`", because `BlastResult` carries only a boolean.

## 4. Facade changes (`repo-intel`)

The module contract (`types.ts:5-7`) is explicit: features import the `RepoIntel`
facade, never the underlying libraries or tables. So the gaps get fixed **in the
facade**, additively, and `modules/blast/` reads nothing else.

### 4.1 `getReverseDependents(repoId, files, depth)` — new

Breadth-first over `file_edges` using the existing `(repo_id, to_file)` index,
`depth` capped at `BFS_DEPTH = 2`. Returns the dependent files per level plus
their `file_facts`. Needs one new repository method — a bounded reverse lookup.
`getEdges` cannot be reused: it loads the entire graph for a repo, which is
correct for rank computation and wrong for a request.

### 4.2 `MAX_CALLERS_PER_SYMBOL` is applied globally — fix

`service.ts` ends `tryPersistentBlast` with `callers.slice(0, MAX_CALLERS_PER_SYMBOL)`
over the **flat** list. The constant is named per-symbol
(`constants.ts:35`) and the spec asks for per-symbol, so this is a defect: a PR
touching five symbols currently shows twenty callers *in total*. Fix: cap per
`viaSymbol` after the rank sort, and report `callers_total` + `callers_truncated`
per symbol so truncation is visible rather than silent.

### 4.3 `getResolvedCallers` has no SQL `LIMIT` — fix

`repository.ts:503` selects every matching `references` row and trims in JS. On a
hot utility in a large repo that is an unbounded fetch. Add an ordered,
bounded query.

All three changes are additive: the five existing facade consumers keep compiling,
and `server/test/repo-intel-facade-degraded.test.ts` keeps passing unchanged.

## 5. API

New module `server/src/modules/blast/` following the `smart-diff` template
(`routes.ts` → `service.ts` → `repository.ts`), plus one import and one entry in
`server/src/modules/index.ts`.

### `GET /pulls/:id/blast`

```jsonc
{
  "state": "ok" | "partial" | "degraded",
  "reason": "index_partial" | "index_stale" | "no_data" | "flag_off" | "index_failed" | "repo_too_large",  // absent when state is "ok"
  "index": { "status": "full", "last_indexed_sha": "…", "updated_at": "…" },
  "totals": { "symbols": 2, "callers": 14, "callers_found": 19, "endpoints": 3, "crons": 1 },
  "symbols": [{
    "file": "src/middleware/ratelimit.ts",
    "name": "rateLimit",
    "kind": "function",
    "callers": [{ "file": "src/api/public/index.ts", "symbol": "register", "line": 23, "rank": 0.81 }],
    "callers_total": 4,
    "callers_truncated": false,
    "endpoints": ["GET /api/public/items"],
    "crons": ["reset-rate-buckets"]
  }],
  "downstream_truncated": false,
  "prior_pulls": [{
    "number": 401, "title": "…", "author": "…", "status": "merged", "updated_at": "…",
    "shared_files": ["src/api/public/webhooks.ts"],
    "unresolved_findings": [{ "severity": "CRITICAL", "title": "SSRF in webhook forwarding" }]
  }],
  "link": { "repo_full_name": "acme/payments-api", "indexed_sha": "a1b2c3d", "head_sha": "9f8e7d6" }
}
```

- `state` is always explicit. `symbols: []` occurs only with `state: "ok"` and a
  genuinely empty impact — missing data is never disguised as an empty array.
- **Nothing capped is reported as complete** (added by the plan review,
  2026-08-19). `callers_total` / `callers_truncated` cover the per-symbol cap;
  `totals.callers_found` covers the headline count; `downstream_truncated`
  covers the reverse-dependency walk hitting its cap. An index written by an
  older `INDEXER_VERSION` is `state: "degraded"`, `reason: "index_stale"` —
  **not** `"ok"` with zero callers, which is what the persisted `status: full`
  row alone would produce.
- `prior_pulls` carries `status` + nullable `updated_at`. `pull_requests` has
  no `merged_at` column; a real merge timestamp would need a migration.
- **A prior-PR row states why it is there, and states it as fact** (added
  2026-08-19). `shared_files` is the intersection with THIS PR's changed
  paths — not everything that PR touched — and `unresolved_findings` are
  findings raised there and *dismissed* (accepted ones were dealt with; still
  open ones belong to that PR's own review). `status` renders only when the
  PR is **not** merged, which is the case worth flagging: another open PR on
  the same files.
  What the row must NOT carry is prose asserting how the two PRs relate — the
  reference mockup's "SSRF concern was raised then but deferred, relevant to
  finding f2" is exactly such a link, and it exists in no index. §1's rule
  ("the model never invents nodes or links") forbids it. The card states the
  facts; the reviewer draws the conclusion.
- `404` only when the PR does not exist in the caller's workspace. An unindexed
  repo is `200` + `state: "degraded"`, because absence of an index is a valid,
  actionable state, not a missing resource. This mirrors the intent endpoint's
  `200 + null` decision.
- Response contract `BlastResponse` lives in `vendor/shared/contracts/brief.ts`,
  in **both** copies, verified by `./scripts/check-shared-sync.sh`.

### `POST /pulls/:id/blast/summary` — the optional LLM call

Exactly one `completeStructured` call. Rate-limited like `POST /pulls/:id/intent`.

## 6. Prompt builder

The model receives the **already-computed** map and nothing else: symbol names,
file paths, endpoint strings, cron names, counts. No diff, no file contents, no
source lines.

Symbol names and file paths are third-party repository content, so they are
wrapped with `wrapUntrusted` (`reviewer-core/src/prompt.ts:30`) exactly as the PR
description and intent evidence are. The `INJECTION_GUARD` already appended by
`assemblePrompt` is the single shared defence; we add no keyword scanning.

The task line is trusted text and states the constraint plainly: explain the given
map in one paragraph; do not introduce a symbol, file, endpoint or caller that is
not in the list. Because the model only ever *describes* nodes it was handed, a
hallucinated node is detectable — the summary is validated against the payload's
node set and rejected if it names an unknown symbol, file or endpoint.

**The summary is not persisted in v1.** It is returned by the POST and held in the
client's query cache. Persisting it would need a table and therefore a migration,
which §2 rules out; if it should survive a reload, that is a follow-up with its own
migration, not a silent addition here.

New feature-model id `blast_summary` joins `FeatureModelId` in both `vendor/shared`
copies and the `client/src/lib/feature-models.ts` mirror; Settings then renders
its picker with no further change.

## 7. UI

`BlastCard`, colocated at
`client/src/app/repos/[repoId]/pulls/[number]/_components/BlastCard/`, rendered by
`OverviewTab` beside `IntentCard` — the two-column arrangement in the mockup.

- **Data:** `useBlast(prId)` over TanStack Query, key `queryKeys.blast(prId)`.
  No Server Component fetching; the client talks to Fastify, per this project's
  architecture.
- **Tree view (default):** symbol → callers → endpoints/crons, matching the mockup.
- **Graph view:** a `flowchart LR` string built from the same payload and handed to
  the existing `client/src/components/mermaid-diagram/MermaidDiagram.tsx`.
  `mermaid@11.15` is already a client dependency — **no new package**.
- **Clickable `file:line`:** `githubBlobUrl(repoFullName, indexedSha, file, line)`
  (`client/src/lib/github-urls.ts:28`). **The ref is the indexed commit, not the
  PR head** — corrected by the requirements audit, 2026-08-19. The indexer runs
  against the clone's HEAD (`pipeline/full.ts:94`), and the clone tracks
  `repos.default_branch`, so every line number in this map is relative to the
  default branch. Linking at `head_sha` would point a main-relative line at the
  PR branch.
- **Prior PRs:** a collapsed section listing earlier PRs that touched the same files.
- **i18n:** namespace `blast` — `client/messages/en/blast.json` **already exists**
  with `stat.symbols/callers/endpoints/crons`, `view.tree/graph`, `callerCount`,
  `noDownstream`, `graph.empty`, `graph.ariaLabel`. We add `title`, `partial`,
  `degraded`, `notIndexed`, `reindex`, `priorPulls`, `truncated`. Strings for the
  card live in `blast`; any string added to a *shared* component would have to go
  in `shell` instead (client/INSIGHTS.md).
- **States:** `degraded` renders a call to action wired to the existing
  `POST /repos/:id/resync`, not an empty box. `partial` renders the map with a
  banner saying the index is incomplete. `ok` with no callers renders the existing
  `noDownstream` string.
- **Styling:** `styles.ts` JS objects with longhand borders, per the module convention.

## 8. Logging

One Pino line per request at `info`, counts only:
`{ prId, repoId, changedFiles, symbols, callers, endpoints, crons, state, durationMs }`.

File paths and symbol names go to `debug` only. File contents are never logged, in
line with the `DEVDIGEST_PROMPT_LOG` policy (`server/README.md:101`).

The summary endpoint logs its own line — `{ prId, model, tokensIn, tokensOut,
nodes }` — as a distinct tool call, the way the intent classifier is logged
separately from the review. Its tokens are **not** added to any `agent_runs` row.

## 9. Risks and decisions

| Risk | Consequence / mitigation |
|---|---|
| **Retiring D15 must be explicit** | See §9a. The stub is guarded by tests and a written convention that instruct future readers not to "fix" it; removing the code without removing those guards leaves an active instruction to revert this work. |
| **MCP token budget** | `get_blast_radius` costs 102 tokens today against a 200-per-tool cap and a 900 total (673 used). A richer description plus `.describe()` on new parameters must stay inside both caps; `mcp/test/token-budget.test.ts` enforces it. |
| **Unindexed repository** | Every user sees `degraded`. Mitigated by the resync CTA. The demo runs against a genuinely indexed repository, not the synthetic `acme/payments-api` seed, which has no clone and therefore no index. |
| **Callers are undercounted by design** | `references.decl_file` resolution favours precision: an ambiguous reference is not asserted as a caller. The UI must not claim completeness — hence `callers_total` and an explicit truncation flag. |
| **Class methods are skipped** | `tryPersistentBlast` drops qualified `Class.method` rows, keeping only the bare name. A PR changing only a method surfaces under the bare symbol. |
| **`arch:check` baseline is 0** | The new module must add zero violations. `blast/repository.ts` is the only file in it permitted to import drizzle / `db/schema`; the service and routes use `db/rows.ts` types. |
| **`vendor/shared` is a manual mirror** | `BlastResponse` and `blast_summary` must be edited in both copies byte-identically. |
| **Cross-module imports are forbidden** | `blast/repository.ts` duplicates the `getPull` / `prFiles` selects rather than importing `pulls/repository.ts`, exactly as `smart-diff/repository.ts` does and documents. |

## 9a. Decision: D15 is retired

**Approved by the human on 2026-08-19: every restriction on `get_blast_radius`
is lifted, because the tool now works.**

D15 (`docs/plans/2026-08-18-mcp-server.md:173`) decided that `get_blast_radius`
would *describe itself as a working tool while returning `isError`*. That was
never an oversight: a description saying "not implemented" would stop the model
calling the tool, turning ~30 tokens of context paid at every chat startup into
dead weight. Instead the model calls it, receives a forward-leading error naming
`get_conventions` as the alternative, and acts on it — the classroom
demonstration of *errors lead forward*.

That rationale expires the moment the tool works. Four artifacts encode it, and
all four change in the same commit as the implementation:

| Artifact | State today | Action |
|---|---|---|
| `mcp/src/tools/get-blast-radius.ts` | Returns `errorContent(...)`, never touches the network; header comment points at the L04 pickup | Real implementation; header comment replaced |
| `mcp/test/tools.test.ts:579` | Asserts `fetch` is never called and `isError === true` | **Breaks.** Rewrite to assert the success path and the `structuredContent` shape |
| `mcp/test/tools.test.ts:596` | Asserts the description avoids "not implemented / stub / coming soon" | **Still passes, but becomes vacuous** — it guarded a deliberate fiction. Retarget it at the real description or delete it with a note |
| `mcp/AGENTS.md:95` | Tells the reader "if you are here because that description *looks wrong*, it isn't" | **Rewrite.** Left as-is it is a standing instruction to revert this feature |

`mcp/test/token-budget.test.ts:42` pins the description string verbatim against
an approved table. A changed description breaks it by design; the table and the
per-tool token count in `mcp/AGENTS.md` are updated together, and the new
measurement must stay inside the existing 200-per-tool / 900-total caps. Those
caps are a repository-wide budget rule, not a D15 artifact — they stay.

`annotations: { readOnlyHint: true }` also stays: it is a true statement about a
tool that only reads, not a restriction inherited from the stub.

## 10. Definition of done

1. `GET /pulls/:id/blast` on an indexed repo returns `state: "ok"` with at least
   two real callers and at least one endpoint for a PR that changes a shared helper.
2. The request path issues no clone read, no AST parse, and no graph build —
   provable by asserting `codeIndex` and `fs` adapters are never called.
3. The main path makes zero LLM calls; `POST /pulls/:id/blast/summary` makes exactly one.
4. An unindexed repo returns `200` with `state: "degraded"` and a reason; a partial
   index returns `state: "partial"`; a repo whose index predates the current
   `INDEXER_VERSION` returns `reason: "index_stale"`. None of the three is an
   empty array presented as a fact.
5. Callers are capped at 20 **per symbol**, sorted by file rank, excluding the
   declaring file, with truncation reported.
6. Endpoint discovery walks the reverse import graph at most two levels, keeps
   the highest-ranked dependents when a level is capped (never the
   alphabetically first), and sets `downstream_truncated` when it caps.
7. Clicking `file:line` in the card opens that line on GitHub **at the indexed
   commit** — the ref the line numbers actually belong to.
8. `get_blast_radius` returns a compact structured result via `structuredContent`,
   within the per-tool and total token caps.
9. `pnpm typecheck`, `pnpm arch:check`, `./scripts/check-shared-sync.sh`, and the
   server / client / mcp test suites all pass.
