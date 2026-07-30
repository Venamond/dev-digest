# `@devdigest/reviewer-core` — review engine

Pure review logic: diff → prompt → LLM → grounded findings. No database,
GitHub, or filesystem access — the only side effect is an LLM call through an
**injected** `LLMProvider`. This is what makes it mock-testable and what
lets the server and the future CI runner (L06) share one engine.

## Commands

```sh
npm test         # vitest, hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck  # also the build; this package never emits JS
```

## Structure

- `prompt.ts` — `assemblePrompt` / `wrapUntrusted` / `INJECTION_GUARD`.
- `grounding.ts` — `groundFindings`, the mandatory citation gate.
- `review/run.ts` — `reviewPullRequest`, the entrypoint; picks single-pass vs
  map-reduce.
- `review/reduce.ts` — `reduceReviews`, `scoreFromFindings`, `sliceDiff`.
- `llm/*` — `LLMProvider` contract + structured-output parsing (Zod → JSON
  Schema, parse-with-repair).

## Non-default conventions

- **No I/O beyond the injected LLM call.** Do not add DB/fs/network access
  here — that logic belongs in the caller (server or CI runner).
- **The package never compiles to JS.** `build` is `tsc --noEmit`; consumers
  (server) import the TypeScript source directly via a tsconfig path alias.
- **Score is always recomputed from surviving findings**
  (`scoreFromFindings`), never trusted from the model's self-reported number.
  Any change here must keep the displayed score and the findings list unable
  to contradict each other.
- **`INJECTION_GUARD` is the one shared defense** against prompt injection —
  don't add keyword/regex scanning of untrusted content as a second layer;
  it only ever catches one phrasing.

## Gotchas

- `groundFindings` treats `kind` in `{secret_leak, lethal_trifecta, phantom,
  hook}` as full-file (no line-range check) — everything else must intersect
  a real diff hunk or it's dropped. Don't "fix" a dropped finding by loosening
  this without checking which kind it is.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are accepted
  today but unused by the starter server — a later lesson wires them, don't
  assume "unused" means "dead code."

## Do-not-touch

- Don't introduce a DB, GitHub, or filesystem dependency into this package —
  that breaks the mock-testability the whole engine relies on.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | working here for the first time — pipeline diagram, public API |
| [docs/](docs/README.md) | writing an ADR or architecture note for this package |
| [specs/](specs/README.md) | implementing against a written spec for the engine |
| [LEARNINGS.md](LEARNINGS.md) | **as soon as a request makes clear it concerns `reviewer-core`** — read before any other action |
| [../TESTING.md](../TESTING.md) | writing a new test |

**On finishing work here: re-read `LEARNINGS.md`, then append only if
something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
