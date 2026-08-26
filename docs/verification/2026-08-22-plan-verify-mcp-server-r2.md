# Plan Verification

## Plan
`docs/plans/2026-08-18-mcp-server.md`, Status: **approved** 2026-08-18 — implementation may begin at S0

## Headline finding

The plan's nine steps were implemented and merged (commit `9ecbde5` "feat(mcp):
add local stdio MCP server exposing five review tools" and follow-ups), but
`mcp/` then went through a long chain of **post-plan** commits (`git log --
mcp`: `c1fd3c7` … `03210b1`, plus an uncommitted fix round touching
`run-agent-on-pr.ts`/`tools.test.ts`) that superseded several of this plan's
own decisions:

- **D8 is reversed.** `jsonContent` (`mcp/src/format.ts:109-116`) now returns
  `structuredContent`, not `content:[{type:'text',text:JSON.stringify(...)}]`.
  A test literally named `'jsonContent returns the payload as
  structuredContent, not a stringified text block'` (`mcp/test/format.test.ts:123`)
  asserts the opposite of what S3/D8 specify.
- **D15's stub is gone.** `get_blast_radius` now calls a real
  `GET /pulls/:id/blast` route (`mcp/src/tools/get-blast-radius.ts:1-4`,
  referencing `server/src/modules/blast/routes.ts`), evidently the subject of
  a later plan (`docs/plans/2026-08-19-blast-radius.md`, referenced in the
  file's own header comment). This plan's "deliberate stub" / "errors lead
  forward" premise for that tool no longer holds.
- **D14 is reversed.** Every tool parameter now carries `.describe()`
  (`grep -n '\.describe(' mcp/src/tools/*.ts` — 9 hits across `pr_id`, `agent`,
  `severity_min`, `detail`, `timeout_s`, `summary`), where the plan required
  it on `repo` and `agent` only.
- **The three-resolver design (S2) is now two.** `resolvePullId` was removed
  from `mcp/src/api/resolve.ts` entirely — `repo`+`pr` number resolution was
  replaced by tools taking a `pr_id` (studio uuid) argument directly.
- **S5's per-tool cap changed.** `PER_TOOL_TOKEN_CAP` is `200` in
  `mcp/test/token-budget.test.ts:18`, not the `150` S5 specifies (the file's
  own comment records this: "`PER_TOOL_TOKEN_CAP` was 150 with a 160 override
  for `run_agent_on_pr` … to buy a `.describe()` on every parameter").

None of this is a code defect — `mcp/AGENTS.md` documents each change with a
rationale, and `mcp/`'s own 78 tests are green. But it means this specific
plan document no longer describes the shipped tool surface for
`run_agent_on_pr` / `get_findings` / `get_blast_radius`, and the verdict table
below reports that disagreement rather than picking a side, per the brief.

## Verdict table

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| S0 — DTO-typing spike | MET | `cd mcp && npm run typecheck` exits 0 (pasted below); `mcp/tsconfig.json` has no `@devdigest/shared` entry; `mcp/src/api/types.ts` exists; `mcp/src/spike.ts` absent (`ls` errors "No such file or directory"); `mcp/AGENTS.md:46-65` records "Branch B was taken" with the D1-style reasoning | Branch B correctly taken end-to-end |
| S1 — package skeleton, config, logger | MET | `mcp/package.json` has `typecheck`/`test`/`start` scripts exactly as specified; `mcp/package-lock.json:9` pins `@modelcontextprotocol/server: ^2.0.0`; `mcp/src/log.ts` writes stderr-only (test `'logInfo writes one JSON line to stderr and nothing to stdout'`, `mcp/test/config.test.ts:72`, green); `mcp/src/config.ts:47` `loadConfig` present with default/trailing-slash-strip tests green | `McpConfig`'s return type gained an optional `configError` field (post-plan hardening, `mcp/src/config.ts:37-45`) — additive, does not contradict S1's "nothing throws" requirement |
| S2 — HTTP client, errors, resolvers | PARTIALLY MET | `mcp/src/api/resolve.ts` exports only `resolveRepoId` and `resolveAgentId` (`grep -n 'export async function' mcp/src/api/resolve.ts`) — **`resolvePullId`, the plan's third resolver, does not exist**; its plan-named test `'resolvePullId skips a PrMeta row whose id is null'` is absent from `mcp/test/resolve.test.ts`. `resolveRepoId`/`resolveAgentId` and their named tests (case-insensitive match, ambiguous-name failure, exact-id-wins, `encodeURIComponent`, no-auth-header, 429 mapping) are all present and green | Superseded by later work: tools now take `pr_id` (studio uuid) directly instead of resolving `repo`+`pr` number |
| S3 — response formatting | PARTIALLY MET | `SEVERITY_RANK`, `MAX_FINDINGS_SUMMARY=50`, `MAX_FINDINGS_FULL=20`, `MAX_CONVENTIONS=100`, `MAX_AGENTS=50` all present verbatim (`mcp/src/format.ts:20-30`); filter→sort→cap order test green (`'filter runs before the cap so criticals are never dropped'`, `mcp/test/format.test.ts:31`). But `jsonContent` (`mcp/src/format.ts:109-116`) returns `{content: [], structuredContent: payload}`, not the `content:[{type:'text',text:JSON.stringify(payload)}]` shape S3/D8 require; `errorContent` (`:118-120`) matches the plan exactly | The `jsonContent` change is D8's explicit reversal, not a bug — but it means S3 as written is not what shipped |
| S4 — five tools, server, entrypoint | PARTIALLY MET | `createMcpServer` (`mcp/src/server.ts:26-35`) builds `McpServer({name:'devdigest',version:'0.1.0'}, {instructions, capabilities:{tools:{listChanged:false}}})` exactly per D10/R4; `tools/list returns exactly the five expected tool names` passes (`mcp/test/tools.test.ts:66`, part of the green 78). But: `run_agent_on_pr`/`get_findings`/`get_blast_radius` schemas use `pr_id: z.string()` in place of `repo`+`pr: z.number()` (`mcp/src/tools/run-agent-on-pr.ts:81`, `get-findings.ts:57`, `get-blast-radius.ts:63`); `get_blast_radius` is a real network call, not the D15 stub (`get-blast-radius.ts:1-34`); its description carries an added sentence ("Requires the repository to be indexed by DevDigest first.") not in S4's table; `get_blast_radius` now also lacks `readOnlyHint` (`grep -n annotations mcp/src/tools/*.ts` shows only 3 of 5 tools carry it, plan required 4) | `list_agents`, `get_findings`, `get_conventions`, `run_agent_on_pr` description strings ARE byte-identical to S4's table (verified by direct grep of the `_DESCRIPTION` constants) |
| S5 — token-budget gate | PARTIALLY MET | `TOTAL_TOKEN_CAP = 900` matches (`mcp/test/token-budget.test.ts:19`); tests for `tools.length===5`, `listChanged===false`, no `outputSchema`/`title`/`icons`/`_meta`, no `resources`/`prompts` capability, `timeout_s` default 180, `.describe()` survival — all present and green. But `PER_TOOL_TOKEN_CAP = 200` (`:18`), not the plan's `150`; the `EXPECTED_DESCRIPTIONS` fixture's `get_blast_radius` entry (`:41-42`) was updated to the *new* text, not S4's approved text, so the "byte-identical to the approved text" test now asserts self-consistency with the drifted description rather than the plan's D14 table | Two required S5 red-proofs ("append 200 words fails the cap", "change one word fails byte-identity") are process steps with no surviving artifact — CANNOT VERIFY from the current tree either way |
| S6 — protocol-safety / purity guards | MET | `mcp/test/guards.test.ts` green (5 tests, part of the 78); branch-appropriate test present: `'@devdigest/shared is never imported, bare or subpath'` (`mcp/test/guards.test.ts:102`, matching branch B — the branch-A-only subpath-type-only test is correctly absent); `'no source file imports drizzle-orm, postgres, fastify, or server internals'` (`:115`) green; `mcp/test/stdio-smoke.test.ts` (2 tests) green, including the unreachable-API boot case | The two S6 red-proofs (console.log trip, subpath-import trip) are likewise process steps with no surviving artifact — CANNOT VERIFY |
| S7 — docs, symlink, `.mcp.json` | PARTIALLY MET | `readlink mcp/CLAUDE.md` → `AGENTS.md`; `mcp/README.md`, `mcp/AGENTS.md`, `mcp/INSIGHTS.md` all exist; root `AGENTS.md`/`README.md`/`TESTING.md` each contain `mcp/` references (`grep -c`: 2/1/1); `mcp/AGENTS.md:73-75` records the ring-0 rationale (`grep -n 'ring 0'`); `mcp/AGENTS.md` names `get_blast_radius` repeatedly including its D15-era reasoning; `mcp/README.md` documents `cd mcp && npm ci` (`:62,67,105`), the `claude mcp add` fallback (`:110-116`), the Inspector command (`:131`), and all five evaluation questions (`:146-161`). But **the S7 restart check was not performed as literally required**: `mcp/AGENTS.md:257-286` states outright *"A full interactive Claude-Code-restart `/mcp` check could not be performed from this implementation pass … do not treat this file as claiming the restart check was performed"* — the Inspector CLI was run as a substitute, not the restart check the DoD names | Committed `.mcp.json` also carries a `"timeout": 1200000` key not in S7's "write exactly" JSON block — an unrequested addition, harmless but undocumented as a deviation |
| S8 — CI workflow | MET | `.github/workflows/mcp.yml` exists; header comment explicitly records Branch B and omits the `server/src/vendor/shared` path filter; `grep -c 'server/src/vendor/shared' .github/workflows/mcp.yml` → `0` (correct for branch B); `grep -E 'npm (ci\|run typecheck\|test)'` → 3 matching lines; `working-directory: mcp`, `cache-dependency-path: mcp/package-lock.json` present | |
| DoD-1 (`npm run typecheck` exits 0) | MET | Pasted below | |
| DoD-2 (`npm test` exits 0, every §4-named test present and green) | PARTIALLY MET | `npm test` exits 0, 78/78 tests pass (pasted below). But several §4-named tests do not exist because the underlying design changed: `'resolvePullId skips a PrMeta row whose id is null'` (function removed, S2), the S5 `PER_TOOL_TOKEN_CAP=150` framing, the byte-identical-to-S4's-table framing for `get_blast_radius` | |
| DoD-3 (`check-shared-sync.sh` prints in sync) | MET | `./scripts/check-shared-sync.sh` → `vendor/shared in sync` | |
| DoD-4 (`server` arch:check / arch:check:core exit 0) | MET | Both commands print "no dependency violations found" (pasted below) | |
| DoD-5 (`git status --porcelain -- server client reviewer-core e2e` empty) | MET | Command produced no output | |
| DoD-6 (`ls mcp/src/vendor` fails) | MET | `ls: mcp/src/vendor: No such file or directory` | |
| DoD-7 (no `console.log`/etc. under `mcp/src`) | MET | `grep -rn 'console\.\(log\|info\|debug\|dir\|table\|trace\)' mcp/src` returned nothing (exit 1) | |
| DoD-8 (S0 branch recorded and consistent) | MET | `mcp/tsconfig.json` has no `@devdigest/shared` paths entry; `mcp/src/api/types.ts` exists — branch B, both conditions hold together, matching `mcp/AGENTS.md`'s own statement | |
| DoD-9 (`.mcp.json` verified to launch, or git-ignored fallback) | PARTIALLY MET | `.mcp.json` is committed at repo root (not git-ignored) with the plan's shape (plus an extra `timeout` key). `mcp/AGENTS.md:257-286` self-reports the Inspector CLI (not the actual Claude-Code-restart `/mcp` check the DoD names) was used as evidence, and explicitly disclaims that the restart check itself was performed. Neither DoD branch (verified-by-restart, or git-ignored-fallback) is literally satisfied | Strong indirect evidence (Inspector returned all 5 tools) but not the specified check |
| DoD-10 (five description strings byte-identical to S4's table) | PARTIALLY MET | `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions` descriptions are byte-identical to S4's table (direct grep of the `*_DESCRIPTION` constants). `get_blast_radius`'s description (`mcp/src/tools/get-blast-radius.ts:35-36`) is `'Maps which files and symbols a pull request impacts, and who calls them. Requires the repository to be indexed by DevDigest first.'` — S4's table has only the first sentence | 4 of 5 MET, 1 diverges |
| DoD-11 (every §5 acceptance-criteria row green) | NOT MET | Not literally true given the above: "Five tools with … flat scalar args" (schemas changed to `pr_id`), "readOnlyHint on the four read tools, absent on run_agent_on_pr" (now absent on two tools), "get_blast_radius is an isError stub with forward-leading text" (no longer a stub at all), "≤150 tokens per tool" (cap raised to 200), "LLM-generated text returned as data… `jsonContent` sole success serializer" (now `structuredContent`, not JSON-string content) all fail as literally stated | The rows that don't touch the superseded design (D5 union-per-agent, `encodeURIComponent`, no-auth-header, config default, CI-runs-token-budget) do hold |

## Verification commands

| Package | Command | Result |
|---|---|---|
| `mcp/` | `cd mcp && npm run typecheck` | exit 0 |
| `mcp/` | `cd mcp && npm test` | exit 0, 78/78 tests passed |
| repo root | `./scripts/check-shared-sync.sh` | `vendor/shared in sync` |
| `server/` | `pnpm arch:check` | 0 violations, 202 modules |
| `server/` | `pnpm arch:check:core` | 0 violations, 25 modules |
| repo root | `git status --porcelain -- server client reviewer-core e2e` | empty |

```
$ cd mcp && npm run typecheck
> typecheck
> tsc --noEmit -p tsconfig.json
(exit 0)

$ cd mcp && npm test
> test
> vitest run
 ✓ test/guards.test.ts (5 tests)
 ✓ test/format.test.ts (9 tests)
 ✓ test/resolve.test.ts (10 tests)
 ✓ test/config.test.ts (9 tests)
 ✓ test/tools.test.ts (34 tests)
 ✓ test/token-budget.test.ts (9 tests)
 ✓ test/stdio-smoke.test.ts (2 tests)
 Test Files  7 passed (7)
      Tests  78 passed (78)

$ ./scripts/check-shared-sync.sh
vendor/shared in sync

$ cd server && pnpm arch:check
✔ no dependency violations found (202 modules, 662 dependencies cruised)

$ cd server && pnpm arch:check:core
✔ no dependency violations found (25 modules, 55 dependencies cruised)

$ git status --porcelain -- server client reviewer-core e2e
(empty)

$ ls mcp/src/vendor
ls: mcp/src/vendor: No such file or directory

$ grep -rn 'console\.\(log\|info\|debug\|dir\|table\|trace\)' mcp/src
(no matches)
```

## Unrequested work

- `mcp/src/args.ts` — a whole new module (`optionalArg`/`requiredArg`) not
  named by any S-step's Files list, added in commit `c25616a` "fix(mcp): a
  cleared text field is 'not supplied', not a value" (post-plan).
- The `pr_id`-based argument shape for `run_agent_on_pr`, `get_findings`,
  `get_blast_radius` (replacing `repo`+`pr` resolution) — commits `7c89748`,
  `cbfad7d`.
- A real `get_blast_radius` implementation against `GET /pulls/:id/blast`
  and `POST /pulls/:id/blast/summary` — commit `11d4734`, apparently the
  subject of a separate plan `docs/plans/2026-08-19-blast-radius.md` not in
  scope here.
- `.describe()` added to every tool parameter, and the per-tool token cap
  raised 150→200 — commit `bc9c5aa`.
- `jsonContent` switched from `content[0].text` JSON-string to
  `structuredContent` — commits `4a0459f`/`6fda7cc`/`78b4a8e`.
- `DEVDIGEST_API_URL` validation (`server/src/platform/config.ts`-style Zod
  check, `configError` surfaced through every tool) — commit `49115b9`.
- `.mcp.json`'s extra `"timeout": 1200000` key, not in S7's literal JSON
  block.
- Uncommitted, per the task brief: `mcp/src/tools/run-agent-on-pr.ts` and
  `mcp/test/tools.test.ts` normalize `pr_id` before use (raw → normalized),
  with two new regression tests (`'uses the normalized pr_id for every
  request…'`, `'echoes the normalized pr_id in the timeout message…'`). Not a
  plan item either way.

## Plan defects

- `## 0` has no "Requirements (verified)" table with `R<n>` rows — the
  plan's `R1`–`R13` are external SDK research references inside `2b`, not a
  per-requirement verification table — so no `R<n>` rows were produced in the
  verdict table above; this is a structural fact about the plan, not a gap in
  verification.
- The plan itself anticipates being partially superseded: its `## 7`
  handoff to `plan-verifier` says to check "which S0 branch the repo is
  actually in" but has no provision for the tool-surface redesign
  (`pr_id`, `structuredContent`, a real `get_blast_radius`) that followed —
  those are legitimate later decisions this document does not know about,
  and the disagreement is reported above rather than resolved either way.

## What I could not verify

- **DoD-9 / S7's restart check** — genuinely could not be performed by me
  either (no interactive Claude Code restart available in this session);
  relied on `mcp/AGENTS.md`'s own admission that it, too, was not performed,
  plus the Inspector CLI output it substitutes.
- **S5's and S6's "red-proof, run once and reverted" DoD clauses** — by
  construction these leave no artifact in the final tree; CANNOT VERIFY
  either way from source or from a command I can run now.
- Did not independently exercise `mcp/README.md`'s five evaluation questions
  against a live server (would need `./scripts/dev.sh` + Postgres + a real
  Claude Code session) — out of the read-only/no-Docker-startup constraint
  on this agent; the plan itself marks this row "manual, human" in `## 5`.
- Did not diff every one of the ~40 rows in the `## 5` acceptance-criteria
  traceability table one-by-one against current test bodies beyond the ones
  cited above; the table's rows that were checked are representative of
  where the design held (D5, `encodeURIComponent`, no-auth-header, CI gate
  wiring) versus where it moved (schema shape, `jsonContent`, blast radius,
  token caps, `.describe()` coverage). Budget was directed at breadth across
  S0–S8 and DoD 1–11 rather than exhaustively re-deriving every acceptance
  row past what already surfaced the plan/code disagreement.

## Summary line
11 MET / 8 PARTIAL / 1 NOT MET / 0 CANNOT VERIFY
