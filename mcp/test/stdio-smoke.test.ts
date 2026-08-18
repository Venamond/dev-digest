/**
 * Spawns the real `mcp/src/index.ts` entrypoint as a child process and
 * speaks the real stdio MCP protocol to it (S6). This is the one test in the
 * suite nothing in-process can substitute for:
 *
 *  - the entrypoint actually boots under `tsx`;
 *  - it frames JSON-RPC cleanly on stdout — any stray write (e.g. a stray
 *    `console.log`) breaks framing and the client call below errors instead
 *    of resolving;
 *  - it needs no network at startup: `DEVDIGEST_API_URL` points at
 *    `127.0.0.1:9` (the discard port), so a constructor-time `fetch` would
 *    hang or throw. `tools/list` still succeeds because `createMcpServer()`
 *    only builds the tool registry and returns — the first `fetch` happens
 *    inside a tool handler, never before.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const MCP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSX_BIN = path.join(MCP_DIR, 'node_modules/.bin/tsx');
const ENTRYPOINT = path.join(MCP_DIR, 'src/index.ts');

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('stdio smoke test', () => {
  it(
    'the stdio entrypoint boots and lists 5 tools with the API unreachable',
    async () => {
      const transport = new StdioClientTransport({
        command: TSX_BIN,
        args: [ENTRYPOINT],
        env: { ...getDefaultEnvironment(), DEVDIGEST_API_URL: 'http://127.0.0.1:9' },
      });
      client = new Client({ name: 'stdio-smoke-test', version: '0.0.0' });

      await client.connect(transport);
      const { tools } = await client.listTools();

      expect(tools.length).toBe(5);
    },
    20_000,
  );
});
