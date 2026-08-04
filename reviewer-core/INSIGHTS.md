# `reviewer-core` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

## Codebase Patterns

- `OpenRouterProvider` (`src/llm/openrouter.ts`) is the intentional sole
  concrete network client in `reviewer-core` — studio (`container.ts`) and
  the future CI runner share it. The review pipeline still takes an injected
  `LLMProvider`; unit tests stub that interface and never construct
  OpenRouter. Do not add openai/anthropic concrete providers here (they live
  under `server/src/adapters/llm`). Documented in `AGENTS.md` + onion
  `reviewer-core-purity.md` (2026-08-04, architecture plan F22).

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
