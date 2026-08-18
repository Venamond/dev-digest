/**
 * The stdio entrypoint — the only file that touches the transport (S4).
 * No network happens before `connect()`; the first `fetch` happens inside a
 * tool handler. Never write to stdout here — it belongs to
 * `StdioServerTransport` (R9, `log.ts`).
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DevDigestApi } from './api/client.js';
import { loadConfig } from './config.js';
import { createMcpServer } from './server.js';

const api = new DevDigestApi(loadConfig().apiUrl);
const server = createMcpServer(api);
await server.connect(new StdioServerTransport());
