import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
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
