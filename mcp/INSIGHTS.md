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

## Tool & Library Notes

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
