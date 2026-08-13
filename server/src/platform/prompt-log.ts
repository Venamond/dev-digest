import { createHash } from 'node:crypto';
import type { PromptAssembly } from '@devdigest/shared';
import type { PromptAssemblySummary } from '@devdigest/reviewer-core';

export type PromptLogMode = 'off' | 'summary' | 'verbose';

/** Minimal pino-compatible logger: (obj, msg). */
export type PromptLogPino = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

/** RunLogger.info shape: (msg, data). */
export type PromptLogSink = {
  info: (msg: string, data?: unknown) => void;
};

export type PromptLogPayloadInput = {
  correlationId: string;
  model: string;
  prompt: 'review' | 'intent';
  summary: PromptAssemblySummary;
  chunk?: string;
};

/**
 * Compact structured log of prompt assembly. Never includes section bodies.
 * `verbose` is local-only: production always degrades to `summary`.
 */
export function resolvePromptLogMode(nodeEnv: string, raw?: string): PromptLogMode {
  const v = raw?.trim().toLowerCase();
  if (v === 'off' || v === '0' || v === 'false' || v === 'silent') return 'off';
  if (v === 'verbose' || v === 'debug') {
    return nodeEnv === 'production' ? 'summary' : 'verbose';
  }
  return 'summary';
}

export function toPromptLogPayload(input: PromptLogPayloadInput): Record<string, unknown> {
  return {
    correlationId: input.correlationId,
    model: input.model,
    prompt: input.prompt,
    ...(input.chunk !== undefined ? { chunk: input.chunk } : {}),
    sections: input.summary.sections,
    totalChars: input.summary.totalChars,
    tokensApprox: input.summary.tokensApprox,
  };
}

export function promptAssemblyFingerprints(assembly: PromptAssembly): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(assembly)) {
    if (typeof value === 'string' && value.length > 0) {
      out[key] = fingerprint(value);
    }
  }
  return out;
}

export function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

const ASSEMBLY_KEYS: (keyof PromptAssembly)[] = [
  'system',
  'skills',
  'memory',
  'specs',
  'callers',
  'repo_map',
  'pr_description',
  'intent',
  'user',
];

export function omittedPromptSlots(assembly: PromptAssembly): string[] {
  return ASSEMBLY_KEYS.filter((key) => {
    const value = assembly[key];
    return value == null || value.length === 0;
  });
}

export function emitPromptAssemblyLog(opts: {
  mode: PromptLogMode;
  runLog?: PromptLogSink;
  logger?: PromptLogPino;
  payload: PromptLogPayloadInput;
  fingerprints?: Record<string, string>;
  omitted?: string[];
  /** When the summary was already streamed (review engine onEvent), only emit verbose extras. */
  skipSummary?: boolean;
}): void {
  if (opts.mode === 'off') return;
  const body = toPromptLogPayload(opts.payload);
  const n = opts.payload.summary.sections.length;
  const msg = `Prompt assembled (${n} section(s), ~${opts.payload.summary.tokensApprox} tokens)`;
  if (!opts.skipSummary) {
    if (opts.runLog) opts.runLog.info(msg, body);
    else opts.logger?.info(body, msg);
  }
  if (opts.mode === 'verbose' && opts.logger) {
    opts.logger.info(
      {
        correlationId: opts.payload.correlationId,
        model: opts.payload.model,
        prompt: opts.payload.prompt,
        fingerprints: opts.fingerprints ?? {},
        omitted: opts.omitted ?? [],
      },
      'prompt assembly fingerprints',
    );
  }
}
