/**
 * S5 — the startup token-budget gate. Measures what a chat actually pays at
 * `tools/list` time: five approved, fixed `description` strings (D14) plus
 * their generated JSON Schemas must stay under the caps below, and the
 * server must not advertise capabilities it does not have (D10).
 *
 * `INSTRUCTIONS` is imported directly from `../src/server.js` rather than
 * read back off the connection — the constant is the thing under budget, and
 * importing it avoids depending on a client API this plan has not verified.
 */
import { describe, expect, it } from 'vitest';
import { getEncoding } from 'js-tiktoken';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { DevDigestApi } from '../src/api/client.js';
import { createMcpServer, INSTRUCTIONS } from '../src/server.js';

const PER_TOOL_TOKEN_CAP = 200;
const TOTAL_TOKEN_CAP = 900;

/*
 * `PER_TOOL_TOKEN_CAP` was 150 with a 160 override for `run_agent_on_pr`
 * (Zod 4's `z.number().int()` conversion emits explicit
 * `Number.MAX_SAFE_INTEGER` bounds, ~26 tokens per integer field, and that
 * tool has two). Human-approved 2026-08-19: raised to a flat 200 and the
 * override dropped, to buy a `.describe()` on every parameter — `agent` and
 * `severity_min` in particular carry semantics a model cannot infer from the
 * name and type. `TOTAL_TOKEN_CAP` is the gate that actually protects the
 * session's context and is unchanged; the measured total is 673 of 900. See
 * `mcp/AGENTS.md`'s token-budget section for the per-tool numbers.
 */

/** S4's approved table, copied verbatim (D14) — this is what makes "do not paraphrase" mechanical. */
const EXPECTED_DESCRIPTIONS: Record<string, string> = {
  list_agents:
    'Lists the review agents configured in DevDigest, with their model and skills. Call this first to get a valid agent name for run_agent_on_pr.',
  run_agent_on_pr:
    'Runs one review agent on a pull request, waits for it to finish, and returns the verdict with its findings. Starts a real LLM run: slow and not free.',
  get_findings:
    'Returns the verdict and findings from reviews already done for a pull request, without starting a new run.',
  get_conventions: 'Returns the coding conventions DevDigest extracted for a repository.',
  get_blast_radius: 'Maps which files and symbols a pull request impacts, and who calls them.',
};

const encoder = getEncoding('cl100k_base');

function countTokens(text: string): number {
  return encoder.encode(text).length;
}

/** Connects a fresh `Client`/`McpServer` pair over an in-memory linked transport (R7: both halves from `@modelcontextprotocol/server`). */
async function connectClient(): Promise<Client> {
  const api = new DevDigestApi('http://test.local');
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'token-budget-test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('startup token budget', () => {
  it('tools/list returns five tools', async () => {
    const client = await connectClient();

    const { tools } = await client.listTools();

    expect(tools.length).toBe(5);
  });

  it('every tool description is byte-identical to the approved text', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(5);

    for (const tool of tools) {
      expect(tool.description).toBe(EXPECTED_DESCRIPTIONS[tool.name]);
    }
  });

  it('each tool definition stays under 200 tokens', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(5);

    for (const tool of tools) {
      const count = countTokens(JSON.stringify(tool));
      expect(
        count,
        `${tool.name} costs ${count} tokens, cap is ${PER_TOOL_TOKEN_CAP}`,
      ).toBeLessThanOrEqual(PER_TOOL_TOKEN_CAP);
    }
  });

  it('tools/list plus instructions stays under 900 tokens', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(5);

    const total = countTokens(JSON.stringify({ tools, instructions: INSTRUCTIONS }));
    expect(total, `startup payload costs ${total} tokens, cap is ${TOTAL_TOKEN_CAP}`).toBeLessThanOrEqual(
      TOTAL_TOKEN_CAP,
    );
    expect(INSTRUCTIONS.split('\n').length).toBeLessThanOrEqual(4);
  });

  it('no tool declares outputSchema, title, icons, or _meta', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(5);

    for (const tool of tools) {
      const record = tool as unknown as Record<string, unknown>;
      expect(record.outputSchema).toBeUndefined();
      expect(record.title).toBeUndefined();
      expect(record.icons).toBeUndefined();
      expect(record._meta).toBeUndefined();
    }
  });

  it('the server declares no resources or prompts capability', async () => {
    const client = await connectClient();
    await client.listTools();

    const capabilities = client.getServerCapabilities();

    expect(capabilities?.resources).toBeUndefined();
    expect(capabilities?.prompts).toBeUndefined();
  });

  it('the server advertises tools.listChanged as false', async () => {
    const client = await connectClient();
    await client.listTools();

    const capabilities = client.getServerCapabilities();

    expect(capabilities?.tools?.listChanged).toBe(false);
  });

  it('the repo description survives into the published inputSchema', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();

    const runAgentOnPr = tools.find((tool) => tool.name === 'run_agent_on_pr');
    expect(runAgentOnPr).toBeDefined();
    const schema = runAgentOnPr?.inputSchema as { properties?: Record<string, { description?: string }> };

    expect(schema.properties?.repo?.description).toContain('owner/name');
  });

  it('timeout_s defaults to 180 in the published schema', async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();

    const runAgentOnPr = tools.find((tool) => tool.name === 'run_agent_on_pr');
    expect(runAgentOnPr).toBeDefined();
    const schema = runAgentOnPr?.inputSchema as { properties?: Record<string, { default?: unknown }> };

    expect(schema.properties?.timeout_s?.default).toBe(180);
  });
});
