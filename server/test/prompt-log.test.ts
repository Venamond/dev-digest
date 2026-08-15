import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { summarizePromptAssembly } from '@devdigest/reviewer-core';
import {
  emitPromptAssemblyLog,
  promptAssemblyFingerprints,
  resolvePromptLogMode,
  toPromptLogPayload,
} from '../src/platform/prompt-log.js';
import { loadConfig } from '../src/platform/config.js';

const PLANTED_SECRET = 'sk_live_PLANTED_SECRET_DO_NOT_LOG';
const PLANTED_DIFF = 'diff --git a/x b/x\n+PLANTED_DIFF_BODY_UNIQUE';
const PLANTED_SPEC = 'PLANTED_PRIVATE_SPEC_CONTENTS unique';

describe('resolvePromptLogMode', () => {
  it('defaults to summary (safe structured log on)', () => {
    expect(resolvePromptLogMode('development', undefined)).toBe('summary');
    expect(resolvePromptLogMode('test', undefined)).toBe('summary');
    expect(resolvePromptLogMode('production', undefined)).toBe('summary');
  });

  it('honours off', () => {
    expect(resolvePromptLogMode('development', 'off')).toBe('off');
    expect(resolvePromptLogMode('production', 'off')).toBe('off');
  });

  it('enables verbose only outside production', () => {
    expect(resolvePromptLogMode('development', 'verbose')).toBe('verbose');
    expect(resolvePromptLogMode('test', 'verbose')).toBe('verbose');
    expect(resolvePromptLogMode('production', 'verbose')).toBe('summary');
  });

  it('loadConfig clamps verbose in production', () => {
    const cfg = loadConfig({ NODE_ENV: 'production', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(cfg.promptLog).toBe('summary');
  });

  it('loadConfig honours verbose in development', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', DEVDIGEST_PROMPT_LOG: 'verbose' });
    expect(cfg.promptLog).toBe('verbose');
  });
});

describe('toPromptLogPayload', () => {
  it('carries correlation id, model, and section stats — never bodies', () => {
    const { assembly } = assemblePrompt({
      system: `sys ${PLANTED_SECRET}`,
      specs: [PLANTED_SPEC],
      diff: PLANTED_DIFF,
    });
    const summary = summarizePromptAssembly(assembly, { diffChars: PLANTED_DIFF.length });
    const payload = toPromptLogPayload({
      correlationId: 'run-abc',
      model: 'deepseek/deepseek-v4-flash',
      prompt: 'review',
      summary,
    });
    expect(payload.correlationId).toBe('run-abc');
    expect(payload.model).toBe('deepseek/deepseek-v4-flash');
    expect(payload.prompt).toBe('review');
    const dumped = JSON.stringify(payload);
    expect(dumped).not.toContain(PLANTED_SECRET);
    expect(dumped).not.toContain(PLANTED_DIFF);
    expect(dumped).not.toContain(PLANTED_SPEC);
  });
});

describe('promptAssemblyFingerprints', () => {
  it('hashes section bodies without returning the bodies', () => {
    const { assembly } = assemblePrompt({
      system: `sys ${PLANTED_SECRET}`,
      specs: [PLANTED_SPEC],
      diff: PLANTED_DIFF,
    });
    const prints = promptAssemblyFingerprints(assembly);
    expect(prints.system).toBe(
      createHash('sha256').update(assembly.system).digest('hex').slice(0, 12),
    );
    expect(prints.user).toBe(
      createHash('sha256').update(assembly.user).digest('hex').slice(0, 12),
    );
    const dumped = JSON.stringify(prints);
    expect(dumped).not.toContain(PLANTED_SECRET);
    expect(dumped).not.toContain(PLANTED_DIFF);
    expect(dumped).not.toContain(PLANTED_SPEC);
  });
});

describe('emitPromptAssemblyLog', () => {
  const summary = summarizePromptAssembly(
    assemblePrompt({ system: 'sys', diff: 'D' }).assembly,
    { diffChars: 1 },
  );
  const payload = {
    correlationId: 'cid-1',
    model: 'gpt-4.1',
    prompt: 'review' as const,
    summary,
  };

  it('does nothing when mode is off', () => {
    const info = vi.fn();
    emitPromptAssemblyLog({
      mode: 'off',
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      payload,
    });
    expect(info).not.toHaveBeenCalled();
  });

  it('emits summary to the run logger without verbose fingerprints', () => {
    const runInfo = vi.fn();
    const debug = vi.fn();
    emitPromptAssemblyLog({
      mode: 'summary',
      runLog: { info: runInfo },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug },
      payload,
      fingerprints: { system: 'deadbeef' },
    });
    expect(runInfo).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
    const data = runInfo.mock.calls[0]![1];
    expect(data).not.toHaveProperty('fingerprints');
  });

  it('in verbose mode, fingerprints go to pino.info only — not the run log', () => {
    const runInfo = vi.fn();
    const pinoInfo = vi.fn();
    emitPromptAssemblyLog({
      mode: 'verbose',
      runLog: { info: runInfo },
      logger: { info: pinoInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      payload,
      fingerprints: { system: 'abc123def456' },
      omitted: ['skills', 'specs'],
    });
    expect(runInfo).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(runInfo.mock.calls[0]![1])).not.toContain('abc123def456');
    expect(pinoInfo).toHaveBeenCalledTimes(1);
    const verbose = pinoInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(verbose.fingerprints).toEqual({ system: 'abc123def456' });
    expect(verbose.omitted).toEqual(['skills', 'specs']);
    expect(verbose.correlationId).toBe('cid-1');
  });
});
