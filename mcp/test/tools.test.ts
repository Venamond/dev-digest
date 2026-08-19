import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';
import { DevDigestApi } from '../src/api/client.js';
import { createMcpServer } from '../src/server.js';
import { POLL_INTERVAL_MS } from '../src/tools/run-agent-on-pr.js';
import type {
  Agent,
  AgentSkillEditorRow,
  BlastResponse,
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

  it('only the tools whose every code path is a GET carry readOnlyHint', async () => {
    stubFetch(() => jsonResponse([]));
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const { tools } = await client.listTools();

    // `run_agent_on_pr` always POSTs; `get_blast_radius` POSTs when asked for
    // a summary. The annotation is per tool, not per call, so a tool with a
    // paid path must not advertise itself as auto-approvable.
    const paid = new Set(['run_agent_on_pr', 'get_blast_radius']);
    for (const tool of tools) {
      if (paid.has(tool.name)) {
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
      arguments: { pr_id: 'pr-1', agent: 'Agent One', timeout_s: 30 },
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
      arguments: { pr_id: 'pr-1', agent: 'Agent One', timeout_s: 10 },
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
      arguments: { pr_id: 'pr-1', agent: 'Agent One', timeout_s: 10 },
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
      arguments: { pr_id: 'pr-1', agent: 'Agent One', timeout_s: 30 },
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

  it('treats a cleared agent field as "every agent", not as an agent named ""', async () => {
    // Reported from MCP Inspector: type an agent name, clear it, run. The
    // client sends `agent: ""` rather than dropping the key, and the tool
    // answered `Agent "" not found. Call list_agents…` — wrong advice for
    // someone whose blank field meant "all of them".
    const reviews: ReviewRecord[] = [
      {
        run_id: 'run-1',
        agent_id: 'agent-a',
        agent_name: 'A',
        verdict: 'comment',
        summary: 'a',
        findings: [
          {
            id: 'f-a',
            severity: 'WARNING',
            category: 'perf',
            title: 'A finding',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
    ];
    const fetchMock = stubFetch((path) => {
      if (path === '/pulls/pr-1/reviews') return jsonResponse(reviews);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { pr_id: 'pr-1', agent: '   ' },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(structured<{ total: number }>(result).total).toBe(1);
    // No agent lookup was attempted at all.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/agents'))).toBe(false);
  });

  it('names the empty field when a required argument arrives blank', async () => {
    // `""` in a path segment would request `/pulls//reviews` and come back a
    // 404 about a missing pull request, which sends the caller looking for
    // the wrong problem. Fail before the request, naming the field.
    const fetchMock = stubFetch(() => {
      throw new Error('no request should be made');
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { pr_id: '' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('pr_id is empty');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says when a re-run superseded an older review of the same agent', async () => {
    // The real case this was written for: three Performance Reviewer runs on
    // one PR. D5 keeps the newest, which is right — an older run's finding may
    // already be fixed, and reporting it sends the caller to repair nothing.
    // But a bare `total` reads as "everything this PR has", and the studio
    // timeline shows all three, so the two surfaces disagree with no
    // explanation anywhere. The hint is that explanation.
    const reviews: ReviewRecord[] = [
      {
        run_id: 'run-3',
        agent_id: 'agent-p',
        agent_name: 'Perf',
        verdict: 'comment',
        summary: 'Perf says so',
        findings: [
          {
            id: 'f-new',
            severity: 'WARNING',
            category: 'perf',
            title: 'f-new finding',
            file: 'x.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
      {
        run_id: 'run-2',
        agent_id: 'agent-p',
        agent_name: 'Perf',
        verdict: 'comment',
        summary: 'Perf says so',
        findings: [
          {
            id: 'f-old',
            severity: 'CRITICAL',
            category: 'perf',
            title: 'f-old finding',
            file: 'x.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
      {
        run_id: 'run-1',
        agent_id: 'agent-s',
        agent_name: 'Sec',
        verdict: 'comment',
        summary: 'Sec says so',
        findings: [
          {
            id: 'f-sec',
            severity: 'CRITICAL',
            category: 'perf',
            title: 'f-sec finding',
            file: 'x.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
    ];
    stubFetch((path) => {
      if (path === '/pulls/pr-1/reviews') return jsonResponse(reviews);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { pr_id: 'pr-1' },
    })) as CallToolResult;

    const payload = structured<{ total: number; hint?: string }>(result);
    // Two agents, newest each: the superseded CRITICAL is NOT counted.
    expect(payload.total).toBe(2);
    expect(payload.hint).toContain('1 older review from Perf');
    expect(payload.hint).toContain('superseded');
  });

  it('stays silent when no review was superseded', async () => {
    // The hint costs nothing until its condition holds — emitting it always
    // would put a caveat about history into every reply that has none.
    const reviews: ReviewRecord[] = [
      {
        run_id: 'run-1',
        agent_id: 'agent-s',
        agent_name: 'Sec',
        verdict: 'comment',
        summary: 'Sec says so',
        findings: [
          {
            id: 'f-sec',
            severity: 'CRITICAL',
            category: 'perf',
            title: 'f-sec finding',
            file: 'x.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'because',
          },
        ],
      },
    ];
    stubFetch((path) => {
      if (path === '/pulls/pr-1/reviews') return jsonResponse(reviews);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_findings',
      arguments: { pr_id: 'pr-1' },
    })) as CallToolResult;

    expect(structured<{ hint?: string }>(result).hint).toBeUndefined();
  });

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
      arguments: { pr_id: 'pr-1' },
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
      arguments: { pr_id: 'pr-1' },
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
      arguments: { pr_id: 'pr-1', detail: 'full' },
    })) as CallToolResult;

    const fullPayload = structured<{ findings: unknown[]; total: number; hint?: string }>(full);
    expect(fullPayload.findings.length).toBe(20);
    expect(fullPayload.total).toBe(25);
    expect(fullPayload.hint).toContain('summary');

    const summary = (await client.callTool({
      name: 'get_findings',
      arguments: { pr_id: 'pr-1' },
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
      arguments: { pr_id: 'pr-1' },
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

/*
 * There is no test here asserting that the description avoids the words "not
 * implemented" / "stub". That guard existed only for the deliberate-stub era
 * (D15 of docs/plans/2026-08-18-mcp-server.md), which S7 of the blast-radius
 * plan retired by shipping the real tool; the description is still pinned,
 * byte for byte along with the other four, by `test/token-budget.test.ts`'s
 * 'every tool description is byte-identical to the approved text' (D22).
 */
describe('get_blast_radius', () => {
  const repos: Repo[] = [{ id: 'repo-1', full_name: 'acme/repo' }];
  const pulls: PrMeta[] = [{ id: 'pr-1', number: 42 }];

  const okBlast: BlastResponse = {
    state: 'ok',
    totals: { symbols: 1, callers: 2, callers_found: 3, endpoints: 1, crons: 0 },
    symbols: [
      {
        file: 'src/lib/money.ts',
        name: 'formatAmount',
        kind: 'function',
        callers: [
          { file: 'src/routes/invoice.ts', symbol: 'renderInvoice', line: 88 },
          { file: 'src/routes/receipt.ts', symbol: 'renderReceipt', line: 12 },
        ],
        callers_total: 3,
        callers_truncated: true,
        endpoints: ['GET /invoices/:id'],
        crons: [],
      },
    ],
    downstream_truncated: false,
  };

  function stubBlast(blast: unknown): ReturnType<typeof stubFetch> {
    return stubFetch((path) => {
      if (path === '/repos') return jsonResponse(repos);
      if (path === '/repos/repo-1/pulls') return jsonResponse(pulls);
      if (path === '/pulls/pr-1/blast') return jsonResponse(blast);
      throw new Error(`unexpected path ${path}`);
    });
  }

  async function callBlast(): Promise<CallToolResult> {
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);
    return (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1' },
    })) as CallToolResult;
  }

  it('accepts pr_id straight from the studio URL, with no lookup at all', async () => {
    // The mentor-facing flow: open the PR in the studio, copy the uuid. A
    // person has that string; asking them to translate it back into a repo
    // name and a number would be busywork. Neither /repos nor /repos/:id/pulls
    // may be touched — that is the whole point of the uuid path.
    const fetchMock = stubFetch((path) => {
      if (path === '/pulls/pr-1/blast') return jsonResponse(okBlast);
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1' },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    expect(structured<{ state: string }>(result).state).toBe('ok');
    const paths = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(paths.some((u) => u.includes('/repos'))).toBe(false);
  });

  it('rejects a call with no pr_id at the schema, before any request', async () => {
    // pr_id is required now, so the SDK refuses the call itself — the tool
    // body never runs and nothing is fetched.
    const fetchMock = stubFetch(() => {
      throw new Error('no request should be made');
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: {},
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toContain('pr_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes no summary request unless one is asked for', async () => {
    // The default path is the free one. A tool that quietly spends LLM money
    // on every call is the reason this parameter is opt-in.
    const fetchMock = stubBlast(okBlast);

    await callBlast();

    const posts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('returns the paragraph beside the map when summary is requested', async () => {
    const fetchMock = stubFetch((path, method) => {
      if (path === '/pulls/pr-1/blast') return jsonResponse(okBlast);
      if (path === '/pulls/pr-1/blast/summary' && method === 'POST')
        return jsonResponse({ summary: 'One helper reaches one endpoint.', model: 'deepseek/x', nodes: 4 });
      throw new Error(`unexpected ${method} ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1', summary: true },
    })) as CallToolResult;

    const payload = structured<{ summary?: string; summary_model?: string; symbols: unknown[] }>(result);
    expect(payload.summary).toBe('One helper reaches one endpoint.');
    expect(payload.summary_model).toBe('deepseek/x');
    // The map is still the answer — the paragraph is added, not substituted.
    expect(payload.symbols).toHaveLength(1);
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(true);
  });

  it('still returns the map when the summary call fails', async () => {
    // The summary route is rate-limited to 10/min and needs a configured
    // provider. Discarding a map the caller already paid a round trip for,
    // because its garnish failed, is the wrong trade.
    stubFetch((path, method) => {
      if (path === '/pulls/pr-1/blast') return jsonResponse(okBlast);
      if (path === '/pulls/pr-1/blast/summary' && method === 'POST')
        return jsonResponse({ error: { message: 'Rate limit exceeded' } }, 429);
      throw new Error(`unexpected ${method} ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1', summary: true },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const payload = structured<{ symbols: unknown[]; summary?: string; summary_error?: string }>(result);
    expect(payload.symbols).toHaveLength(1);
    expect(payload.summary).toBeUndefined();
    // The client's own 429 translation reaches the model verbatim — it is
    // actionable ("wait a minute"), which the raw upstream string is not.
    expect(payload.summary_error).toContain('rate-limited');
  });

  it('does not pay for a summary of an empty map, and says why', async () => {
    const fetchMock = stubFetch((path) => {
      if (path === '/pulls/pr-1/blast')
        return jsonResponse({ ...okBlast, symbols: [], totals: { ...okBlast.totals, symbols: 0 } });
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1', summary: true },
    })) as CallToolResult;

    const payload = structured<{ summary_skipped?: string }>(result);
    expect(payload.summary_skipped).toContain('no mapped impact');
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('does not pay for a summary of an unindexed repo, and says why', async () => {
    const fetchMock = stubFetch((path) => {
      if (path === '/pulls/pr-1/blast')
        return jsonResponse({
          state: 'degraded',
          reason: 'no_data',
          totals: { symbols: 0, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
          symbols: [],
          downstream_truncated: false,
        });
      throw new Error(`unexpected path ${path}`);
    });
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-1', summary: true },
    })) as CallToolResult;

    const payload = structured<{ state: string; summary_skipped?: string }>(result);
    expect(payload.state).toBe('degraded');
    expect(payload.summary_skipped).toContain('not indexed');
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('get_blast_radius returns the structured blast map for an indexed repo', async () => {
    stubBlast(okBlast);

    const result = await callBlast();

    expect(result.isError).toBeFalsy();
    const payload = structured<{
      state: string;
      totals: Record<string, number>;
      downstream_truncated: boolean;
      symbols: Array<{ callers: Array<Record<string, unknown>> }>;
      hint?: string;
      truncated?: boolean;
    }>(result);

    expect(payload.state).toBe('ok');
    expect(payload.totals).toEqual({ symbols: 1, callers: 2, callers_found: 3, endpoints: 1, crons: 0 });
    expect(payload.downstream_truncated).toBe(false);
    expect(payload.symbols[0]?.callers[0]?.file).toBe('src/routes/invoice.ts');
    // `rank` is an internal ordering score (D21): it must not survive the trim.
    expect(payload.symbols[0]?.callers[0]).not.toHaveProperty('rank');
    expect(payload.truncated).toBeUndefined();
    expect(payload.hint).toBeUndefined();
  });

  it('get_blast_radius surfaces an unindexed repo as state degraded with a hint, not an error', async () => {
    stubBlast({
      state: 'degraded',
      reason: 'no_data',
      totals: { symbols: 0, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
      symbols: [],
      downstream_truncated: false,
    } satisfies BlastResponse);

    const result = await callBlast();

    expect(result.isError).toBeFalsy();
    const payload = structured<{ state: string; reason: string; hint: string; symbols: unknown[] }>(result);
    expect(payload.state).toBe('degraded');
    expect(payload.reason).toBe('no_data');
    expect(payload.symbols).toEqual([]);
    expect(payload.hint).toBeTruthy();
  });

  it('get_blast_radius hints that a stale index means missing callers, not none', async () => {
    stubBlast({
      ...okBlast,
      state: 'partial',
      reason: 'index_stale',
      symbols: [],
      totals: { symbols: 0, callers: 0, callers_found: 0, endpoints: 0, crons: 0 },
    } satisfies BlastResponse);

    const result = await callBlast();

    expect(result.isError).toBeFalsy();
    const payload = structured<{ hint: string }>(result);
    expect(payload.hint).toMatch(/older DevDigest indexer/);
  });

  it('get_blast_radius caps symbols and callers', async () => {
    stubBlast({
      state: 'ok',
      totals: { symbols: 40, callers: 1200, callers_found: 1200, endpoints: 0, crons: 0 },
      symbols: Array.from({ length: 40 }, (_unused, s) => ({
        file: `src/s${s}.ts`,
        name: `sym${s}`,
        kind: 'function',
        callers: Array.from({ length: 30 }, (_c, c) => ({
          file: `src/caller${c}.ts`,
          symbol: `caller${c}`,
          line: c + 1,
        })),
        callers_total: 30,
        callers_truncated: false,
        endpoints: [],
        crons: [],
      })),
      downstream_truncated: false,
    } satisfies BlastResponse);

    const result = await callBlast();

    const payload = structured<{
      symbols: Array<{ callers: unknown[]; callers_truncated: boolean }>;
      truncated?: boolean;
    }>(result);
    expect(payload.symbols.length).toBe(25);
    for (const symbol of payload.symbols) {
      expect(symbol.callers.length).toBe(10);
      expect(symbol.callers_truncated).toBe(true);
    }
    expect(payload.truncated).toBe(true);
  });

  it('surfaces an unknown pr_id as the API 404, not a lookup error', async () => {
    // A uuid is passed through unverified on purpose — the endpoint answers
    // for itself. There is no local list of known ids to suggest, so the
    // message that reaches the model is the API's own.
    stubFetch(() =>
      jsonResponse({ error: { code: 'not_found', message: 'Pull request not found' } }, 404),
    );
    const api = new DevDigestApi(BASE_URL);
    const client = await connectClient(api);

    const result = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { pr_id: 'pr-999' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/not found/i);
  });
});
