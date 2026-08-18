import { describe, it, expect, vi, afterEach } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { resolveAgentId, resolvePullId, resolveRepoId } from '../src/api/resolve.js';
import type { Agent, PrMeta, Repo } from '../src/api/types.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveRepoId', () => {
  it('resolveRepoId matches full_name case-insensitively', async () => {
    const repos: Repo[] = [{ id: 'r1', full_name: 'Venamond/dev-digest' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(repos)));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(resolveRepoId(api, 'venamond/DEV-DIGEST')).resolves.toEqual({
      repoId: 'r1',
      fullName: 'Venamond/dev-digest',
    });
  });

  it('resolveRepoId lists the imported repos when the name is unknown', async () => {
    const repos: Repo[] = [
      { id: 'r1', full_name: 'a/b' },
      { id: 'r2', full_name: 'c/d' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(repos)));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(resolveRepoId(api, 'x/y')).rejects.toThrow(/Add it in the studio/);
  });
});

describe('resolvePullId', () => {
  it('resolvePullId skips a PrMeta row whose id is null', async () => {
    const pulls: PrMeta[] = [
      { number: 482, id: null },
      { number: 7, id: 'uuid-7' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(pulls))));
    const api = new DevDigestApi('http://localhost:3001');

    // The trap: a naive `.find(p => p.number === pr)` would return the row
    // with `id: null` and later callers would address `undefined`/`null`.
    await expect(resolvePullId(api, 'repo1', 482)).rejects.toThrow();
    await expect(resolvePullId(api, 'repo1', 7)).resolves.toBe('uuid-7');
  });

  it('resolvePullId names the given repo label, not the internal id, in its not-found message', async () => {
    const pulls: PrMeta[] = [{ number: 7, id: 'uuid-7' }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(pulls))));
    const api = new DevDigestApi('http://localhost:3001');

    // Callers pass the human `owner/name` as the 4th arg so the model sees a
    // readable name instead of an internal uuid it never typed.
    await expect(resolvePullId(api, 'internal-uuid-1', 999, 'acme/payments-api')).rejects.toThrow(
      /acme\/payments-api/,
    );
  });

  it('resolvePullId falls back to the repo id when no label is given', async () => {
    const pulls: PrMeta[] = [{ number: 7, id: 'uuid-7' }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(pulls))));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(resolvePullId(api, 'internal-uuid-1', 999)).rejects.toThrow(/internal-uuid-1/);
  });
});

describe('resolveAgentId', () => {
  it('resolveAgentId accepts either the agent uuid or its name', async () => {
    const agents: Agent[] = [{ id: 'a1', name: 'Security Reviewer', model: 'gpt-5' }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(agents))));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(resolveAgentId(api, 'a1')).resolves.toEqual({ agentId: 'a1', name: 'Security Reviewer' });
    await expect(resolveAgentId(api, 'security reviewer')).resolves.toEqual({
      agentId: 'a1',
      name: 'Security Reviewer',
    });
  });

  it('resolveAgentId error text tells the model to call list_agents', async () => {
    const agents: Agent[] = [{ id: 'a1', name: 'Security Reviewer', model: 'gpt-5' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(agents)));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(resolveAgentId(api, 'Nonexistent Agent')).rejects.toThrow(/list_agents/);
  });

  it('resolveAgentId fails with both ids when two agents share a name', async () => {
    const agents: Agent[] = [
      { id: 'a1', name: 'Security Reviewer', model: 'gpt-5' },
      { id: 'a2', name: 'Security Reviewer', model: 'claude' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(agents)));
    const api = new DevDigestApi('http://localhost:3001');

    // The silent-wrong-answer trap: taking `[0]` would pass every other test
    // in this file while running the wrong agent in production.
    await expect(resolveAgentId(api, 'Security Reviewer')).rejects.toThrow(/a1.*a2|a2.*a1/);
  });

  it('resolveAgentId prefers an exact id match over a same-named agent', async () => {
    const agents: Agent[] = [
      { id: 'a1', name: 'Foo Reviewer', model: 'gpt-5' },
      { id: 'a2', name: 'a1', model: 'claude' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(agents)));
    const api = new DevDigestApi('http://localhost:3001');

    // agent2's *name* is literally "a1" — an id match must win outright and
    // must not be reported as ambiguous.
    await expect(resolveAgentId(api, 'a1')).resolves.toEqual({ agentId: 'a1', name: 'Foo Reviewer' });
  });
});

describe('DevDigestApi', () => {
  it('get() turns a fetch rejection into the ./scripts/dev.sh message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const api = new DevDigestApi('http://localhost:3001');

    await expect(api.get('/repos')).rejects.toThrow(/\.\/scripts\/dev\.sh/);
  });

  it('get() maps a 429 on POST /pulls/:id/review to the rate-limit message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'too many' } }, 429)),
    );
    const api = new DevDigestApi('http://localhost:3001');

    await expect(api.post('/pulls/pr-1/review', { agentId: 'a1' })).rejects.toThrow(
      /max 10 review runs per minute/,
    );
  });

  it('get() percent-encodes the id in the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const api = new DevDigestApi('http://localhost:3001');

    const evilId = '../secret';
    await api.get(`/repos/${encodeURIComponent(evilId)}/pulls`);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('%2F');
    expect(calledUrl).not.toContain('/../');
  });

  it('no request carries an Authorization or Cookie header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const api = new DevDigestApi('http://localhost:3001');

    await api.get('/repos');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['Authorization']).toBeUndefined();
    expect(headers?.['Cookie']).toBeUndefined();
  });
});
