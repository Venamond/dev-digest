/**
 * The stdio entrypoint — the only file that touches the transport (S4).
 * No network happens before `connect()`; the first `fetch` happens inside a
 * tool handler. Never write to stdout here — it belongs to
 * `StdioServerTransport` (R9, `log.ts`).
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DevDigestApi } from './api/client.js';
import { loadConfig } from './config.js';
import { logError } from './log.js';
import { createMcpServer } from './server.js';

// A malformed environment does NOT abort the boot (see `config.ts`): the
// server still connects and lists its tools, and every tool call answers with
// the reason. The stderr line is for the human reading the client's MCP log;
// the model gets the same text in the tool response.
const config = loadConfig();
if (config.configError) logError('invalid configuration', { configError: config.configError });

const api = new DevDigestApi(config.apiUrl, config.configError);
const server = createMcpServer(api);
await server.connect(new StdioServerTransport());
