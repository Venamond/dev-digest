# `server` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

- A `z.object({ field: z.number().nullable() })` field is REQUIRED at the TS
  level, not optional — `.nullable()` only unions in `null`, it does not add
  `?`. Adding such a field to a shared contract (`vendor/shared/contracts`)
  breaks `tsc --noEmit` at every existing object-literal construction site of
  that shape (route handlers, `run-executor.ts`'s `trace.stats`, test
  fixtures), even though the underlying nullable DB column needs no such
  field everywhere. Before adding a `.nullable()` field to a contract, grep
  for every existing literal of that type across `server/`, `client/`, and
  both packages' tests — they all need the field added in the same change,
  or `pnpm typecheck` fails in files the PR didn't intend to touch. Use
  `.nullish()` instead when the field should also be omittable (e.g.
  `PrMeta.score`, `PrMeta.cost_usd` — absent until first computed);
  `.nullable()` when it must always be present with `null` as a valid value
  (e.g. `RunStats.cost_usd`, `RunSummary.cost_usd` — always set, sometimes to
  null). (2026-07-31, run-cost-ui feature)

- `PriceBook.estimate(model, tokensIn, tokensOut)`
  (`server/src/platform/price-book.ts`) does an EXACT string match against a
  price map keyed by OpenRouter's provider-namespaced model IDs (e.g.
  `"openai/gpt-4.1"`). `OpenAIProvider`/`AnthropicProvider` pass their own
  bare model IDs (e.g. `"gpt-4.1"`), which never match that map — so
  injecting `PriceBook.estimate` as their cost estimator (as
  `container.ts`'s `buildLlm` does) never actually returns a live price for
  those two providers; it always falls through to the static `estimateCost`
  table, identical to the pre-wiring behavior. Only the `openrouter`
  provider's model IDs are already OpenRouter-namespaced, so only that path
  benefits from live pricing today. Fixing this needs ID normalization
  inside `PriceBook.estimate` (e.g. try the bare ID, then
  `"<provider>/<model>"`) — not implemented as of 2026-07-31; documented as
  a known limitation in `container.ts`'s `buildLlm` comment rather than
  fixed, per product decision.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
