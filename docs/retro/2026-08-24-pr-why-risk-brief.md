# PR Why + Risk Brief — 2026-08-24

24 agents · 903k agent output · 94% cache hit · 7h05m wall · $412 at list price
(agents $151.50 + conversation $260.34) · rework 37%, of which 29 points accidental.

Measured with `.claude/skills/workflow-retro/scripts/metrics.py 837b5ff7-975b-42c9-8f29-1924121650ad`.

## The narrative worth keeping

The designed pipeline ran cleanly and produced a wrong product.

Agents 1–11 did everything the method asks for: a researcher sweep that found
half the mockup already shipped, a spec, a plan, three implementation tracks,
an architecture review, a plan verification, a fix round and a re-review. Every
gate was green — 419 tests, 0 architecture violations, 89 verified plan items,
`CLEAR` from the reviewer. The spec was `approved`.

Then the first real model call ran, and in one sequence produced:

1. **401** — `risk_brief` defaulted to a provider this machine has no key for.
   The default shipped in the repository's first commit and had never executed.
2. **422** — the grounding check rejected a factually correct brief naming seven
   references, all seven real paths.
3. **551 tokens** of prompt the budget fitter never counted.
4. A request **2× over its cap**, with the fitter returning it silently.
5. A blast map spending **28,000 tokens** to write 33 endpoint names 1,845 times.

None of it was reachable by the hermetic suite, because every test drove a mock
whose fixtures the implementer had written — the suite confirmed the shapes its
author had already imagined. Seven of the 24 agents, 176k output and roughly $31
exist to repair what that one call exposed, and an approved acceptance criterion
(AC-15) had to be inverted after the fact.

**The lesson is not "test more".** It is that a feature whose output is a model's
answer has exactly one integration point that matters, and the plan had no step
that crossed it. Every other verification was a rehearsal.

## The second cost, which is mine

19 of the human's 66 turns were `не понял` / `ничего не понял` / `что от меня
требуется` — 29% of all round-trips spent telling me an explanation had failed.
The session idled 3h50m, 54% of its wall. The memory that prescribes the fix
(a two-line concrete contrast) existed the whole time and fired only *after*
each failure, never as the default shape.

For contrast, from the ledger: `run-plan: project-context` took 1 round-trip
across 85 minutes and idled 7%.

## What held from the previous retro

- Tracks stayed file-disjoint across 32 and 27 parallel minutes; no overlap.
- The per-track extract kept agents off the 842-line plan.
- The stalled `plan-verifier` — completed, wrote nothing — was caught by the
  disk check and resumed rather than replaced, at no extra dispatch.

## Proposals

P1 make one live model call a required plan step for any feature that calls a
model; P2 lead every explanation with the two-line contrast rather than
recovering with it; P3 screenshot the client surface as the last step of the
client track. Full text in the chat retro of 2026-08-24.
