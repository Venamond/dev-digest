import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { DevDigestApi } from '../src/api/client.js';
import { createMcpServer } from '../src/server.js';
import { POLL_INTERVAL_MS } from '../src/tools/run-agent-on-pr.js';
import type {
  Agent,
  AgentSkillEditorRow,
  ConventionsList,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '../src/api/types.js';

const BASE_URL = 'http://test.local';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A route-based fetch stub matching on the path (after `BASE_URL`) and method. */
function stubFetch(
  handler: (path: string, method: string, body: unknown) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) : url;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return handler(path, method, body);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Connects a fresh `Client`/`McpServer` pair over an in-memory linked transport (R7: both halves from `@modelcontextprotocol/server`). */
async function connectClient(api: DevDigestApi): Promise<Client> {
  const server = createMcpServer(api);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('expected a text content block');
  return first.text;
}

/** Success payloads ride in `structuredContent`; `content` stays empty for them. */
function structured<T = Record<string, unknown>>(result: CallToolResult): T {
  if (result.structuredContent === undefined) throw new Error('expected structuredContent');
  return result.structuredContent as T;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('tools/list', () => {
  it('tools/list returns exactly the five expected tool names', async () => {
    stubFetch(() => jsonResponse([]));
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const { tools } = await client.listTools();

    expect(tools.length).toBe(5);
    expect(new Set(tools.map((t) => t.name))).toEqual(
      new Set(['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius']),
    );
  });

  it('run_agent_on_pr is the only tool without readOnlyHint', async () => {
    stubFetch(() => jsonResponse([]));
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const { tools } = await client.listTools();

    for (const tool of tools) {
      if (tool.name === 'run_agent_on_pr') {
        expect(tool.annotations?.readOnlyHint).toBeUndefined();
      } else {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    }
  });
});

describe('list_agents', () => {
  it('list_agents keeps only linked and enabled skills, in order', async () => {
    const agents: Agent[] = [{ id: 'a1', name: 'Agent One', model: 'gpt-5' }];
    const rows: AgentSkillEditorRow[] = [
      { skill: { name: 'B' }, linked: true, enabled: true, order: 1 },
      { skill: { name: 'A' }, linked: true, enabled: false, order: 0 },
      { skill: { name: 'C' }, linked: false, enabled: false, order: -1 },
    ];
    stubFetch((path) => {
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/agents/a1/skills') return jsonResponse(rows);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    const payload = structured<{ agents: Array<{ skills: string[] }> }>(result as CallToolResult);

    expect(payload.agents).toHaveLength(1);
    expect(payload.agents[0]?.skills).toEqual(['B']);
  });

  it("list_agents degrades gracefully when one agent's skills fetch fails, instead of failing the whole call", async () => {
    const agents: Agent[] = [
      { id: 'a1', name: 'Agent One', model: 'gpt-5' },
      { id: 'a2', name: 'Agent Two', model: 'claude' },
    ];
    const rowsForA2: AgentSkillEditorRow[] = [{ skill: { name: 'X' }, linked: true, enabled: true, order: 0 }];
    stubFetch((path) => {
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/agents/a1/skills') throw new Error('simulated network failure');
      if (path === '/agents/a2/skills') return jsonResponse(rowsForA2);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = await client.callTool({ name: 'list_agents', arguments: {} });
    const payload = structured<{
      agents: Array<{ id: string; skills: string[]; skills_unavailable?: boolean }>;
    }>(result as CallToolResult);

    expect(result.isError).toBeFalsy();
    expect(payload.agents).toHaveLength(2);
    const a1 = payload.agents.find((a) => a.id === 'a1');
    const a2 = payload.agents.find((a) => a.id === 'a2');
    expect(a1?.skills).toEqual([]);
    expect(a1?.skills_unavailable).toBe(true);
    expect(a2?.skills).toEqual(['X']);
    expect(a2?.skills_unavailable).toBeUndefined();
  });
});

describe('run_agent_on_pr', () => {
  const repos: Repo[] = [{ id: 'repo-1', full_name: 'acme/repo' }];
  const pulls: PrMeta[] = [{ id: 'pr-1', number: 42 }];
  const agents: Agent[] = [{ id: 'agent-1', name: 'Agent One', model: 'gpt-5' }];

  it('run_agent_on_pr polls until the run is done and returns the review', async () => {
    let runsCall = 0;
    stubFetch((path, method) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/pulls/pr-1/review' && method === 'POST') {
        return jsonResponse({ runs: [{ run_id: 'run-1' }] });
      }
      if (path === '/pulls/pr-1/runs') {
        runsCall += 1;
        const status = runsCall < 3 ? 'running' : 'done';
        const summary: RunSummary = { run_id: 'run-1', status, error: null };
        return jsonResponse([summary]);
      }
      if (path === '/pulls/pr-1/reviews') {
        const review: ReviewRecord = {
          run_id: 'run-1',
          agent_id: 'agent-1',
          agent_name: 'Agent One',
          verdict: 'approve',
          summary: 'looks fine',
          findings: [],
        };
        return jsonResponse([review]);
      }
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    vi.useFakeTimers();
    const resultPromise = client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/repo', pr: 42, agent: 'Agent One', timeout_s: 30 },
    });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const result = (await resultPromise) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const payload = structured<{ verdict: string; summary: string }>(result);
    expect(payload.verdict).toBe('approve');
    expect(payload.summary).toBe('looks fine');
    expect(runsCall).toBe(3);
  });

  it('run_agent_on_pr returns isError with the run_id when timeout_s elapses', async () => {
    stubFetch((path, method) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/pulls/pr-1/review' && method === 'POST') {
        return jsonResponse({ runs: [{ run_id: 'run-1' }] });
      }
      if (path === '/pulls/pr-1/runs') {
        const summary: RunSummary = { run_id: 'run-1', status: 'running', error: null };
        return jsonResponse([summary]);
      }
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    vi.useFakeTimers();
    const resultPromise = client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/repo', pr: 42, agent: 'Agent One', timeout_s: 10 },
    });
    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    }
    const result = (await resultPromise) as CallToolResult;

    expect(result.isError).toBe(true);
    const message = text(result);
    expect(message).toContain('run-1');
    expect(message).toContain('get_findings');
  });

  it('run_agent_on_pr stops once wall-clock time exceeds timeout_s, even when a single slow poll ate the whole budget', async () => {
    let runsCall = 0;
    stubFetch((path, method) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/pulls/pr-1/review' && method === 'POST') {
        return jsonResponse({ runs: [{ run_id: 'run-1' }] });
      }
      if (path === '/pulls/pr-1/runs') {
        runsCall += 1;
        // Simulate a slow backend: this one request takes 8s of wall-clock
        // to resolve — almost the entire 10s `timeout_s` budget in a single
        // round trip.
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            const summary: RunSummary = { run_id: 'run-1', status: 'running', error: null };
            resolve(jsonResponse([summary]));
          }, 8000);
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    vi.useFakeTimers();
    const resultPromise = client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/repo', pr: 42, agent: 'Agent One', timeout_s: 10 },
    });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // the 2s sleep before the first poll
    await vi.advanceTimersByTimeAsync(8000); // the slow fetch resolving
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); // would start a 2nd round under a poll-count budget
    const result = (await resultPromise) as CallToolResult;

    expect(result.isError).toBe(true);
    // A poll-count deadline (floor(10000 / 2000) = 5) would let this run
    // 5 rounds regardless of how long each one actually took — 40s+ of real
    // time on a stated 10s budget. The wall-clock deadline must stop after
    // the one round that already consumed the whole 10s.
    expect(runsCall).toBe(1);
  });

  it('run_agent_on_pr reports a failed run with its error text', async () => {
    stubFetch((path, method) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/agents') return jsonResponse(agents);
      if (path === '/pulls/pr-1/review' && method === 'POST') {
        return jsonResponse({ runs: [{ run_id: 'run-1' }] });
      }
      if (path === '/pulls/pr-1/runs') {
        const summary: RunSummary = { run_id: 'run-1', status: 'failed', error: 'boom' };
        return jsonResponse([summary]);
      }
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    vi.useFakeTimers();
    const resultPromise = client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/repo', pr: 42, agent: 'Agent One', timeout_s: 30 },
    });
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const result = (await resultPromise) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('boom');
    expect(text(result)).toContain('run-1');
  });
});

describe('get_findings', () => {
  const repos: Repo[] = [{ id: 'repo-1', full_name: 'acme/repo' }];
  const pulls: PrMeta[] = [{ id: 'pr-1', number: 42 }];

  it('get_findings returns the newest review per agent, not just the newest row', async () => {
    // reviews is already newest-first: agent B's review is 1ms newer than
    // agent A's. A naive `reviews[0]` would return only B's findings.
    const reviews: ReviewRecord[] = [
      {
        run_id: 'run-b',
        agent_id: 'agent-b',
        agent_name: 'Agent B',
        verdict: 'approve',
        summary: 'B looks fine',
        findings: [
          {
            id: 'f-b',
            severity: 'WARNING',
            category: 'style',
            title: 'B finding',
            file: 'b.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
      {
        run_id: 'run-a',
        agent_id: 'agent-a',
        agent_name: 'Agent A',
        verdict: 'request_changes',
        summary: 'A needs work',
        findings: [
          {
            id: 'f-a',
            severity: 'CRITICAL',
            category: 'security',
            title: 'A finding',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
    ];
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/pulls/pr-1/reviews') return jsonResponse(reviews);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/repo', pr: 42 },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const payload = structured<{ findings: Array<{ title: string }>; verdict: string }>(result);
    expect(payload.findings.map((f) => f.title).sort()).toEqual(['A finding', 'B finding']);
    expect(payload.verdict).toBe('request_changes');
  });

  it('get_findings on a PR with no reviews returns a 200-shaped empty payload, not isError', async () => {
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/pulls/pr-1/reviews') return jsonResponse([]);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/repo', pr: 42 },
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const payload = structured(result);
    expect(payload).toMatchObject({ verdict: null, summary: null, findings: [], total: 0 });
  });

  it('get_findings warns in the payload when detail "full" caps the list lower than "summary" would', async () => {
    // 25 findings: `detail: 'full'` keeps 20 (MAX_FINDINGS_FULL), `'summary'`
    // would have kept all 25 — asking for more detail returns fewer findings,
    // so the payload must say so.
    const reviews: ReviewRecord[] = [
      {
        run_id: 'run-a',
        agent_id: 'agent-a',
        agent_name: 'Agent A',
        verdict: 'comment',
        summary: 'many findings',
        findings: Array.from({ length: 25 }, (_, i) => ({
          id: `f-${i}`,
          severity: 'WARNING' as const,
          category: 'style',
          title: `finding ${i}`,
          file: `f${String(i).padStart(2, '0')}.ts`,
          start_line: 1,
          end_line: 1,
          rationale: 'because',
        })),
      },
    ];
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/pulls/pr-1/reviews') return jsonResponse(reviews);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const full = (await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/repo', pr: 42, detail: 'full' },
    })) as CallToolResult;

    const fullPayload = structured<{ findings: unknown[]; total: number; hint?: string }>(full);
    expect(fullPayload.findings.length).toBe(20);
    expect(fullPayload.total).toBe(25);
    expect(fullPayload.hint).toContain('summary');

    const summary = (await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/repo', pr: 42 },
    })) as CallToolResult;

    const summaryPayload = structured<{ findings: unknown[]; hint?: string }>(summary);
    expect(summaryPayload.findings.length).toBe(25);
    expect(summaryPayload.hint).toBeUndefined();
  });

  it('get_findings surfaces a 500 from /pulls/:id/reviews as an actionable isError', async () => {
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/pulls/pr-1/reviews') {
        return jsonResponse({ error: { code: 'internal_error', message: 'boom' } }, 500);
      }
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/repo', pr: 42 },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/category|500|boom/i);
  });
});

describe('get_conventions', () => {
  const repos: Repo[] = [{ id: 'repo-1', full_name: 'acme/repo' }];

  it('get_conventions never returns evidence_snippet', async () => {
    const list: ConventionsList & { candidates: Array<Record<string, unknown>> } = {
      candidates: [
        {
          rule: 'Use named exports',
          category: 'style',
          status: 'accepted',
          evidence_snippet: 'export function foo() {}',
          evidence_url: 'https://example.com/foo.ts',
        },
      ],
      scan: { scanned_at: '2026-08-18T00:00:00Z' },
    };
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/conventions') return jsonResponse(list);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/repo' },
    })) as CallToolResult;

    const serialized = JSON.stringify(structured(result));
    expect(serialized).not.toContain('evidence_snippet');
    expect(serialized).not.toContain('evidence_url');
  });

  it('get_conventions flags pending candidates so they are not quoted as accepted rules', async () => {
    const list: ConventionsList = {
      candidates: [
        { rule: 'Use named exports', category: 'style', status: 'accepted' },
        { rule: 'Prefer const', category: 'style', status: 'pending' },
        { rule: 'Never do this', category: 'style', status: 'rejected' },
      ],
      scan: null,
    };
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/conventions') return jsonResponse(list);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/repo' },
    })) as CallToolResult;

    const payload = structured<{ total: number; hint?: string }>(result);
    // The rejected candidate is dropped entirely; the pending one is kept but announced.
    expect(payload.total).toBe(2);
    expect(payload.hint).toMatch(/1 of 2 .*pending/);
  });

  it('get_conventions adds no pending hint when every kept candidate is accepted', async () => {
    const list: ConventionsList = {
      candidates: [{ rule: 'Use named exports', category: 'style', status: 'accepted' }],
      scan: null,
    };
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/conventions') return jsonResponse(list);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/repo' },
    })) as CallToolResult;

    const payload = structured<{ hint?: string }>(result);
    expect(payload.hint).toBeUndefined();
  });

  it('get_conventions on an unscanned repo omits scanned_at', async () => {
    const list: ConventionsList = {
      candidates: [{ rule: 'Use named exports', category: null, status: 'accepted' }],
      scan: null,
    };
    stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/conventions') return jsonResponse(list);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_conventions',
      arguments: { repo: 'acme/repo' },
    })) as CallToolResult;

    const payload = structured(result);
    expect('scanned_at' in payload).toBe(false);
  });
});

describe('get_blast_radius', () => {
  it('get_blast_radius returns isError and makes no HTTP request', async () => {
    const fetchMock = stubFetch(() => {
      throw new Error('fetch must not be called by get_blast_radius');
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/repo', pr: 42 },
    })) as CallToolResult;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('get_conventions');
  });

  it('get_blast_radius describes itself as working and does not say "not implemented"', async () => {
    stubFetch(() => jsonResponse([]));
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'get_blast_radius');

    expect(tool?.description).toBeDefined();
    expect(tool?.description ?? '').not.toMatch(/not implemented|stub|coming soon/i);
  });
});
