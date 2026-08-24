import { describe, it, expect } from 'vitest';
import type { ModelInfo } from '@devdigest/shared';
import { PriceBook } from '../src/platform/price-book.js';

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek/deepseek-v4-flash',
    provider: 'openrouter',
    pricing: { promptPerM: 0.14, completionPerM: 0.28 },
    contextLength: 1_000_000,
  },
  {
    id: 'openai/gpt-4.1',
    provider: 'openrouter',
    pricing: { promptPerM: 2.0, completionPerM: 8.0 },
    contextLength: 128_000,
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    provider: 'openrouter',
    pricing: { promptPerM: 3.0, completionPerM: 15.0 },
    contextLength: 200_000,
  },
];

describe('PriceBook (live OpenRouter pricing for cost attribution)', () => {
  it('uses the fallback until the cache is warm, then live OpenRouter prices', async () => {
    const t = 0;
    // Fallback only knows the static deepseek price; live price will differ.
    const fallback = (m: string) => (m === 'deepseek/deepseek-v4-flash' ? 0.999 : null);
    const pb = new PriceBook(async () => MODELS, fallback, 1000, () => t);

    // Cold cache → fallback value.
    expect(pb.estimate('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)).toBe(0.999);

    await pb.refresh();
    // Warm: 1e6 * 0.14 (in) + 1e6 * 0.28 (out) = 0.42.
    expect(pb.estimate('deepseek/deepseek-v4-flash', 1_000_000, 1_000_000)).toBeCloseTo(0.42, 9);
  });

  it('resolves bare openai/anthropic ids to namespaced OpenRouter prices', async () => {
    const pb = new PriceBook(async () => MODELS, () => null);
    await pb.refresh();
    // 1e6 in * 2.0 + 1e6 out * 8.0 = 10.0
    expect(pb.estimate('gpt-4.1', 1_000_000, 1_000_000)).toBeCloseTo(10.0, 9);
    // 1e6 in * 3.0 + 1e6 out * 15.0 = 18.0
    expect(pb.estimate('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBeCloseTo(18.0, 9);
  });

  it('falls back when neither the live map nor the static table knows the model', async () => {
    const pb = new PriceBook(async () => MODELS, (m) => (m === 'local-only' ? 12.34 : null));
    await pb.refresh();
    expect(pb.estimate('local-only', 0, 0)).toBe(12.34);
    expect(pb.estimate('mystery/model', 0, 0)).toBe(null);
  });

  it('rejects ambiguous bare-id suffix matches and uses the fallback', async () => {
    const ambiguous: ModelInfo[] = [
      {
        id: 'openai/shared-model',
        provider: 'openrouter',
        pricing: { promptPerM: 1, completionPerM: 2 },
        contextLength: 1,
      },
      {
        id: 'anthropic/shared-model',
        provider: 'openrouter',
        pricing: { promptPerM: 9, completionPerM: 9 },
        contextLength: 1,
      },
    ];
    // "shared-model" matches openai/ via PROVIDER_PREFIXES first — use a
    // suffix that is NOT under a known prefix so only the unique-suffix
    // path applies, then make it ambiguous with two custom namespaces.
    const custom: ModelInfo[] = [
      {
        id: 'acme/widget-x',
        provider: 'openrouter',
        pricing: { promptPerM: 1, completionPerM: 1 },
        contextLength: 1,
      },
      {
        id: 'other/widget-x',
        provider: 'openrouter',
        pricing: { promptPerM: 9, completionPerM: 9 },
        contextLength: 1,
      },
    ];
    const pb = new PriceBook(async () => [...ambiguous, ...custom], () => 0.5);
    await pb.refresh();
    // openai/ wins via PROVIDER_PREFIXES for shared-model
    expect(pb.estimate('shared-model', 1_000_000, 0)).toBeCloseTo(1.0, 9);
    // widget-x is ambiguous across non-prefix namespaces → fallback
    expect(pb.estimate('widget-x', 0, 0)).toBe(0.5);
  });

  it('never throws when the model list fetch fails (stays on the fallback)', async () => {
    const pb = new PriceBook(
      async () => {
        throw new Error('network down');
      },
      (m) => (m === 'deepseek/deepseek-v4-flash' ? 0.5 : null),
    );
    await pb.refresh(); // swallows the error
    expect(pb.estimate('deepseek/deepseek-v4-flash', 0, 0)).toBe(0.5);
  });
});
