import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import { DevDigestApi } from '../src/api/client.js';
import { logInfo } from '../src/log.js';

describe('loadConfig', () => {
  it('loadConfig defaults to http://localhost:3001', () => {
    expect(loadConfig({})).toEqual({ apiUrl: 'http://localhost:3001' });
  });

  it('loadConfig strips a trailing slash from DEVDIGEST_API_URL', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://localhost:3001/' })).toEqual({
      apiUrl: 'http://localhost:3001',
    });
  });

  // `??` treats `""` as a supplied value, so an empty `env` entry in
  // `.mcp.json` used to produce `apiUrl: ''` and a message that named no URL
  // at all. Same rule as `args.ts`: blank means "not supplied".
  it('loadConfig treats an empty DEVDIGEST_API_URL as not supplied', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '' })).toEqual({ apiUrl: 'http://localhost:3001' });
  });

  it('loadConfig treats a whitespace-only DEVDIGEST_API_URL as not supplied', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '   ' })).toEqual({ apiUrl: 'http://localhost:3001' });
  });

  it('loadConfig accepts an https URL and strips its trailing slashes', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'https://api.example.com//' })).toEqual({
      apiUrl: 'https://api.example.com',
    });
  });

  it('loadConfig reports a non-http(s) DEVDIGEST_API_URL as a config error instead of throwing', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: 'ws://localhost:3001' });

    expect(config.configError).toContain('DEVDIGEST_API_URL');
    expect(config.configError).toContain('ws://localhost:3001');
    expect(config.configError).toContain('.mcp.json');
  });

  it('loadConfig reports a value that is not a URL at all as a config error', () => {
    const config = loadConfig({ DEVDIGEST_API_URL: 'localhost:3001' });

    expect(config.configError).toContain('localhost:3001');
  });
});

describe('DevDigestApi with a config error', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The boot contract stays "never crash on start" (a stdio server that exits
  // shows up as an opaque connect failure); the misconfiguration surfaces on
  // the first tool call instead, before any request leaves the process.
  it('rejects every request with the config error and never calls fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const api = new DevDigestApi('ws://localhost:3001', 'DEVDIGEST_API_URL is broken. Fix .mcp.json.');

    await expect(api.get('/agents')).rejects.toThrow('DEVDIGEST_API_URL is broken. Fix .mcp.json.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('logInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logInfo writes one JSON line to stderr and nothing to stdout', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logInfo('hello', { foo: 'bar' });

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]?.[0]).toBe(JSON.stringify({ level: 'info', msg: 'hello', foo: 'bar' }) + '\n');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
