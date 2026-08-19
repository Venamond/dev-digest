# `mcp` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

- ~~`pollRunUntilTerminal` undercounts real elapsed time under a slow
  network.~~ **Fixed 2026-08-18.** `pollRunUntilTerminal`
  (`src/tools/run-agent-on-pr.ts`) now checks a `Date.now() + timeoutMs`
  wall-clock deadline before each sleep, instead of a fixed
  `floor(timeoutMs / POLL_INTERVAL_MS)` poll count — a slow `GET
  /pulls/:id/runs` (up to `REQUEST_TIMEOUT_MS = 60_000`) now counts against
  the budget instead of being free. Covered by
  `'run_agent_on_pr stops once wall-clock time exceeds timeout_s...'` in
  `test/tools.test.ts`, which simulates one 8s-slow poll against a 10s
  `timeout_s` and asserts only one poll happens, not the five a poll-count
  budget would have allowed.
- ~~`list_agents` has no partial-failure handling in its skills
  fan-out.~~ **Fixed 2026-08-18.** `list_agents` (`src/tools/list-agents.ts`)
  now uses `Promise.allSettled` instead of `Promise.all` for the per-agent
  skills fetch; an agent whose `GET /agents/:id/skills` fails gets
  `skills: []` plus `skills_unavailable: true` instead of failing the whole
  tool call. Covered by `"list_agents degrades gracefully when one agent's
  skills fetch fails..."` in `test/tools.test.ts`.

- **`README.md`'s acceptance questions 2 and 5 cannot pass against the
  seeded fixture they name.** Both route to `get_findings` on
  `acme/payments-api` #482, and that PR's persisted findings include
  `coverage`, `flaky` and `over-mocking` categories written by our own seed
  (`server/src/db/seed.ts:524,550,563,576`) — values outside
  `FindingCategory = z.enum(['bug','security','perf','style','test'])`, so
  `GET /pulls/:id/reviews` fails response serialization and returns 500.
  The tool surfaces it as `Internal error This endpoint can 500 when a
  finding's category isn't one of the recognized values` — that is the API
  breaking, **not** the MCP server. Root cause and triage recipe are in
  `server/INSIGHTS.md` (2026-08-15 entry). To verify `get_findings`
  end-to-end meanwhile, use `Venamond/dev-digest` PR #7 (or #3, #6) — five
  reviews across five agents, exercises the same D5 newest-per-agent union,
  worst-verdict and `severity_min` paths and returns findings with
  `file`/`lines`. Probe for a usable PR with
  `curl -s localhost:3001/repos/<repoId>/pulls` then hitting
  `/pulls/<id>/reviews` for each and keeping the 200s.
  (Verified live 2026-08-18.)

## Codebase Patterns

- **A client sends a cleared text field as `""`, not as an absent key — so
  every string argument must be normalized before it is used.** `z.string()`
  and `z.string().optional()` both accept `""` happily, and it then travels
  into a lookup or a path segment. Two failure shapes, both reported or
  reachable on 2026-08-19: `get_findings` with a cleared `agent` answered
  `Agent "" not found. Call list_agents to see the available agents.` (wrong
  — a blank field means *every* agent, which is that tool's default), and a
  blank `pr_id` would have requested `/pulls//reviews` and come back a 404
  about a missing pull request, sending the caller after the wrong problem.
  MCP Inspector does this whenever you type a value and then clear it; a
  model filling a template it has no value for produces the same thing.
  `src/args.ts` holds the two helpers every tool now calls first —
  `optionalArg` (`""`/whitespace → `undefined`, i.e. not supplied) and
  `requiredArg` (throws a `ToolError` naming the field, before any request).
  Normalizing in the handler rather than in the Zod schema is deliberate: a
  `.transform()` on an input schema changes what the SDK publishes as the
  tool's JSON Schema, which `test/token-budget.test.ts` pins byte-for-byte.

- **A caveat the caller needs but the tool description cannot afford goes in
  the response `hint`, not in the description or a `.describe()`.** The five
  descriptions are pinned byte-for-byte by `test/token-budget.test.ts` and
  the whole tool definition is capped per tool (200 since 2026-08-19) under
  a 900-token total, and every token there is paid at *every* session start,
  whether or not the caveat is relevant. A `hint` field in the payload costs
  nothing until the situation actually arises. Measured while adding one:
  a `.describe()` on `get_findings`'s `detail` came to 24 tokens against
  that tool's then-143 of a 150 cap, while the equivalent conditional
  `hint` cost zero. (Later the same day the caps were raised to a flat 200
  and every parameter got a `.describe()` as well — the two are
  complementary, not alternatives: the schema text prevents the mistake,
  the payload `hint` catches it when it happens anyway. Reach for the
  `hint` first; it is the one that is free.) Two live examples
  (2026-08-19):
  `get_findings` warns when `detail: 'full'` truncated below what
  `'summary'` would have returned (`MAX_FINDINGS_FULL` 20 vs
  `MAX_FINDINGS_SUMMARY` 50 — asking for more detail returns *fewer*
  findings), and `get_conventions` warns when any returned candidate is
  still `pending` rather than `accepted`. Emit the hint only when the
  condition holds, and cover both branches with a test.

  **The strongest case for a hint is a rule the payload silently applies.**
  D5 keeps one review per agent, so a re-run replaces that agent's earlier
  opinion — right on substance (an older run's finding may already be fixed,
  and reporting it sends the caller to repair nothing) but invisible in a
  bare `total`. A real PR with three Performance Reviewer runs returned
  `total: 9` while the studio timeline showed 11, with nothing anywhere
  saying why. Added 2026-08-19: the hint names the count and the agents and
  points at the timeline. Note the field holds ONE string, so accumulate
  sentences in an array and join — picking between two applicable caveats
  drops one.

## Tool & Library Notes

- **`structuredContent` alone is enough for the clients this repo targets —
  the spec's "also send a text copy" is optional and costs a full duplicate
  payload.** Verified 2026-08-19 in both directions. Wire: returning
  `{ content: [], structuredContent: payload }` from `jsonContent`
  (`src/format.ts`) is accepted by the SDK with no `outputSchema` and no
  error; `content: []` must be present because the `registerTool` callback
  type demands the field, even though the runtime tolerates its absence.
  Client: a fresh headless `claude -p` run (spawned *after* the change, so
  running the new code) received the whole payload in its `tool_result` —
  Claude Code reads the structured field and hands it to the model. MCP
  Inspector reads it too, and renders it colourised in its "Structured
  Output" panel, which the old text block never got. Cost: 939 → 919 tokens
  on one real `get_findings` reply, the difference being `\"` escaping.
  **How to test a change like this without fooling yourself:** `tsx` reads
  source at process start, so an already-running MCP server keeps serving
  the old code — compare `ps -o lstart -p $(pgrep -f mcp/src/index.ts)`
  against the commit time before trusting any result, or bypass the
  question entirely with `claude -p ... --output-format stream-json
  --verbose`, which spawns a fresh server and lets you read the exact
  `tool_result` the model saw.

- **You cannot colour our JSON in MCP Inspector by tagging the text block —
  `mimeType` on a `type: 'text'` block is silently dropped.** Verified on
  the live server 2026-08-19: adding `mimeType: 'application/json'` to
  `jsonContent` (`src/format.ts`) never reaches the wire, because
  `TextContentSchema` in `@modelcontextprotocol/core` has no such field and
  is a Zod `$strip` object. Inspector's web client picks the Prism
  (`tomorrow` theme) JSON renderer purely from a block's mime type, so our
  untagged text lands in the monochrome `<pre>` branch — it still
  pretty-prints anything starting with `{` or `[`, which is why the output
  is indented but uncoloured. The only two paths that do colour are
  `structuredContent` (Inspector renders it in a "Structured Output" panel
  with `mimeType: 'application/json'` hardcoded) and an embedded
  `type: 'resource'` block — both change what every client receives and
  duplicate the payload the model pays for, so neither is worth it for a
  dev-tool cosmetic. For coloured output while debugging, pipe the raw
  stdio call through `jq -C 'select(.id==2) | .result.content[0].text |
  fromjson'` instead.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
