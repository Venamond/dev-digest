# `mcp/` — a local stdio MCP server for DevDigest

`@devdigest/mcp` is a fifth, standalone DevDigest package: a local
**stdio** [MCP](https://modelcontextprotocol.io) server that lets an AI
coding agent (Claude Code, or any MCP client) drive the DevDigest REST API at
`http://localhost:3001` directly from chat — list agents, kick off a review,
read findings and conventions — without the agent ever touching Postgres,
Drizzle, or a route handler. It never emits JS; it runs from TypeScript
source via `tsx`, the same way `reviewer-core/` does.

## The five tools

| Tool | What it does | Lineage |
|---|---|---|
| `list_agents` | Lists the configured review agents with their model and enabled skills. Call this first to get a valid `agent` name for `run_agent_on_pr`. | — |
| `run_agent_on_pr` | Runs one review agent on a pull request, waits for it to finish (polling, not SSE), and returns the verdict with its findings. Starts a real LLM run: slow and not free. | — |
| `get_findings` | Returns the verdict and findings already recorded for a pull request, without starting a new run. | — |
| `get_conventions` | Returns the coding conventions DevDigest extracted for a repository. | Same data as **L02**'s Conventions Extractor (`GET /repos/:id/conventions`, `server/src/modules/conventions`) — this tool is an MCP surface over work you already did in that lesson, not a new feature. |
| `get_blast_radius` | Maps which files and symbols a pull request impacts, and who calls them. | **Deliberate stub.** The facade method `RepoIntel.getBlastRadius` exists (`server/src/modules/repo-intel/service.ts:214`) but has no HTTP route yet — wiring it up is **L04**. The tool's description promises a working tool on purpose; calling it returns a forward-leading error instead of silently disappearing from the tool list. See `mcp/AGENTS.md` for why. |

Successful results are returned as `structuredContent` — a real JSON object
on the wire, with `content` left empty — never as prose, because
repo-derived, LLM-generated text (finding titles, suggestions, rationale,
convention rules) is untrusted third-party content and must stay
unambiguously *data*, never formatted instructions. Errors are the one
exception: `errorContent` puts an actionable sentence in a text block and
sets `isError`, because an error message is written for the model to act on,
not parsed as data.

The spec suggests *also* repeating the payload as a JSON string in a text
block, for clients written before `structuredContent` existed. This server
does not: the duplicate is a second full copy of every response (a single
`get_findings` reply measures 919 tokens), and the clients this package
targets read the structured field — verified against Claude Code and MCP
Inspector 2.2.0. A client that reads only `content[]` will see empty
results here.

## Configuration

The only environment variable this server reads:

| Variable | Default | What it controls |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API this server calls. Set it if the API runs on a different host/port. |

No auth, no other config. The DevDigest API resolves the default workspace
via `LocalNoAuthProvider` on every request, so the MCP server sends no
credentials and needs none.

## Setup

```sh
cd mcp && npm ci
```

**Run this before registering the server** — the committed `.mcp.json`
(below) points at `mcp/node_modules/.bin/tsx`, which does not exist until
`npm ci` has run. On a fresh clone this is the very first thing to do.

The DevDigest API itself must also be running (`./scripts/dev.sh` from the
repo root) before any tool call that touches the network — the four read
tools and `run_agent_on_pr` all fail with an actionable `isError` if it isn't.

## Registration

### Committed `.mcp.json` (primary path)

This repo commits a project-scoped `.mcp.json` at the repo root with the
server pre-registered, using paths relative to the repo root:

```json
{
  "mcpServers": {
    "devdigest": {
      "type": "stdio",
      "command": "mcp/node_modules/.bin/tsx",
      "args": ["mcp/src/index.ts"],
      "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }
    }
  }
}
```

After `cd mcp && npm ci`, restart Claude Code (or your MCP client) in this
repository and approve the server if prompted; `/mcp` should show `devdigest`
with 5 tools. This was verified empirically for this repo (see
`mcp/AGENTS.md`, "S7 registration check").

### `claude mcp add` (manual / per-machine fallback)

If you need to register the server by hand instead (e.g. a different working
directory, or a client that does not read `.mcp.json`), use absolute paths:

```sh
claude mcp add --env DEVDIGEST_API_URL=http://localhost:3001 --transport stdio devdigest \
  -- "$PWD/mcp/node_modules/.bin/tsx" "$PWD/mcp/src/index.ts"
```

Note the `--env` ordering: the CLI reads whatever comes directly after
`--env` as another `KEY=value` pair, so `--env KEY=value devdigest` would
make it try to parse `devdigest` as an env pair and reject it. Put at least
one other option (here, `--transport stdio`) between `--env` and the server
name, as above.

### Inspector (manual smoke check)

To talk to the server directly, bypassing any MCP client:

```sh
npx @modelcontextprotocol/inspector --cli \
  "$PWD/mcp/node_modules/.bin/tsx" "$PWD/mcp/src/index.ts" --method tools/list
```

This prints the raw `tools/list` response. If the pinned Inspector CLI's
flags drift, `npx @modelcontextprotocol/inspector@2.2.0` is the version this
was last verified against.

## Evaluation questions

Read-only, idempotent, and each has an unambiguously verifiable expected tool
call. They assume the seeded demo repo `acme/payments-api` PR #482 (the same
fixture `e2e/AGENTS.md` relies on) is imported and that `./scripts/dev.sh` is
running.

1. *"Which review agents are configured, and which skills does the Security
   Reviewer have?"* → must call `list_agents` only.
2. *"For `acme/payments-api` PR #482, what are the critical findings?"* →
   `get_findings` with `severity_min: 'CRITICAL'`; the answer must cite
   `file` and `lines`.
3. *"What conventions has DevDigest extracted for `acme/payments-api`?"* →
   `get_conventions` only.
4. *"What is the blast radius of PR #482?"* → the model **must actually call
   `get_blast_radius`**, receive the `isError`, and follow it — calling
   `get_conventions` or reading a finding's `file` field — rather than
   stalling. This question is the acceptance test for design principle 4,
   *errors lead forward*.
5. *"Has PR #482 been reviewed yet, and by whom?"* → `get_findings` without
   `agent`; the answer must name **every** agent that reviewed it, not just
   the one whose review row happens to be newest.
