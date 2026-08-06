/**
 * Shared formatting for model-picker dropdowns: turns a model's live pricing +
 * context window into a compact label like
 *   `deepseek-v4-flash — $0.14/$0.28 per 1M · 1M ctx`
 *
 * Used by the agent editor (ConfigTab) and the Settings → Feature Models picker
 * so both render OpenRouter prices identically. Display always strips the
 * vendor prefix from OpenRouter-style ids (`deepseek/deepseek-v4-flash`).
 */

/** A model with optional live pricing (USD per 1M tokens) and context window. */
export interface PricedModel {
  id: string;
  pricing?: { promptPerM: number; completionPerM: number } | null;
  contextLength?: number | null;
}

/**
 * Strip vendor prefix from OpenRouter-style ids for UI display.
 * `deepseek/deepseek-v4-flash` → `deepseek-v4-flash`; bare ids unchanged.
 * Stored value stays the full id — only labels use this.
 */
export function displayModelName(model: string): string {
  const i = model.indexOf("/");
  return i >= 0 ? model.slice(i + 1) : model;
}

/** Compact USD-per-1M formatter for the model price label. */
const fmt = (n: number) => (n === 0 ? "0" : n < 1 ? n.toFixed(3) : n.toFixed(2));

/** Compact token-count formatter for the context window (e.g. 1048576 → "1M"). */
const ctx = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : `${Math.round(n / 1000)}k`);

/** Build the model dropdown label: price + context window when available. */
export function modelLabel(m: PricedModel): string {
  const name = displayModelName(m.id);
  const parts: string[] = [];
  if (m.pricing) parts.push(`$${fmt(m.pricing.promptPerM)}/$${fmt(m.pricing.completionPerM)} per 1M`);
  if (m.contextLength) parts.push(`${ctx(m.contextLength)} ctx`);
  return parts.length ? `${name} — ${parts.join(" · ")}` : name;
}

/** Build SearchableSelect/SelectInput options: priced models get a rich label. */
export function toModelOptions(
  models: PricedModel[] | undefined,
): { value: string; label: string }[] {
  return (models ?? []).map((m) => ({ value: m.id, label: modelLabel(m) }));
}
