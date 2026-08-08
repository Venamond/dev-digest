import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';

describe('LocalSecretsProvider', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-secrets-'));
    filePath = join(dir, 'secrets.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to env when the file is missing', async () => {
    const secrets = new LocalSecretsProvider(filePath, {
      OPENAI_API_KEY: 'from-env',
    } as NodeJS.ProcessEnv);
    expect(await secrets.get('OPENAI_API_KEY')).toBe('from-env');
  });

  it('prefers stored file values over env', async () => {
    const secrets = new LocalSecretsProvider(filePath, {
      OPENAI_API_KEY: 'from-env',
    } as NodeJS.ProcessEnv);
    await secrets.set('OPENAI_API_KEY', 'from-ui');
    expect(await secrets.get('OPENAI_API_KEY')).toBe('from-ui');
  });

  it('maps GITHUB_PAT env fallback onto GITHUB_TOKEN', async () => {
    const secrets = new LocalSecretsProvider(filePath, {
      GITHUB_PAT: 'pat-value',
    } as NodeJS.ProcessEnv);
    expect(await secrets.get('GITHUB_TOKEN')).toBe('pat-value');
  });

  it('ignores invalid JSON / non-object file contents', async () => {
    await writeFile(filePath, 'not-json', 'utf8');
    const secrets = new LocalSecretsProvider(filePath, {
      ANTHROPIC_API_KEY: 'env-ok',
    } as NodeJS.ProcessEnv);
    expect(await secrets.get('ANTHROPIC_API_KEY')).toBe('env-ok');
  });

  it('ignores non-string values in the secrets file', async () => {
    await writeFile(filePath, JSON.stringify({ OPENAI_API_KEY: 123 }), 'utf8');
    const secrets = new LocalSecretsProvider(filePath, {
      OPENAI_API_KEY: 'env-ok',
    } as NodeJS.ProcessEnv);
    expect(await secrets.get('OPENAI_API_KEY')).toBe('env-ok');
  });

  it('writes mode 0600 even when the file already existed with looser perms', async () => {
    await writeFile(filePath, '{}\n', { mode: 0o644 });
    const secrets = new LocalSecretsProvider(filePath, {} as NodeJS.ProcessEnv);
    await secrets.set('OPENROUTER_API_KEY', 'sk-or-test');
    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o600);
    const body = JSON.parse(await readFile(filePath, 'utf8'));
    expect(body.OPENROUTER_API_KEY).toBe('sk-or-test');
  });
});
