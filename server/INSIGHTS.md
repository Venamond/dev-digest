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

- `server/src/modules/pulls/status.ts`'s `rollupSeverities()` was already
  written, exported, and unit-tested (`server/test/pulls-status.test.ts`)
  before it was ever wired into a route — the file's own docstring says the
  PR list should show a findings breakdown, but `pulls/routes.ts` had a
  comment claiming that was "intentionally not surfaced." The comment was
  stale, not a real product decision. When a route's comment says a field is
  deliberately omitted, check whether a pure helper for exactly that field
  already exists elsewhere in the same module before assuming it needs to be
  built — this codebase accumulates ready-to-wire helpers that outlive the
  routes that were supposed to use them. (2026-07-31, PR-list Findings
  column)

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

- Deleting an `agent_runs` row or a `reviews` row (`deleteAgentRun`,
  `server/src/modules/reviews/repository/run.repo.ts`) does NOT clear
  `pull_requests.last_reviewed_sha`. Only `markReviewed()`
  (`server/src/modules/reviews/repository/pull.repo.ts`) ever writes that
  column, and nothing resets it. So once a PR's review status flips to
  `reviewed` (per `deriveReviewStatus` in `status.ts`), deleting its runs
  from the UI does NOT move it back to `needs_review` — it stays `reviewed`
  until a new commit changes `head_sha`. There is no app action that resets
  this; to force a PR back to `needs_review` for testing/demo purposes, null
  `last_reviewed_sha` directly: `UPDATE pull_requests SET
  last_reviewed_sha = NULL WHERE id = '<pr-id>';` — this does not touch
  `agent_runs`/`reviews`/`findings`. (2026-07-31)

## Session Notes

## Open Questions
