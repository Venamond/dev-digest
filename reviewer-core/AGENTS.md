# `@devdigest/reviewer-core` — review engine

Pure review logic: diff → prompt → LLM → grounded findings. No database,
GitHub, or filesystem access. The review *pipeline* (`reviewPullRequest`)
only talks to an **injected** `LLMProvider` — that is what makes it
mock-testable. The package also ships one concrete adapter,
`OpenRouterProvider` (`llm/openrouter.ts`), shared by the studio server and
the future CI runner (L06); openai/anthropic providers stay in
`server/src/adapters/llm`.

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
- `llm/structured.ts` — Zod → JSON Schema + parse-with-repair helpers.
- `llm/openrouter.ts` — **sole concrete LLM adapter** in this package
  (OpenAI SDK → OpenRouter). Intentional exception to pipeline purity so CI
  and server share one OpenRouter client; do not add a second concrete
  provider here.

## Non-default conventions

- **Pipeline I/O is injected only.** `reviewPullRequest` must not construct
  providers, touch DB/fs, or call GitHub — the caller injects `LLMProvider`.
  Unit tests stub that interface; they never hit the network.
- **`OpenRouterProvider` is the only allowed concrete network client** in
  this package. Further adapters (openai/anthropic direct, GitHub, fs)
  belong in `server/src/adapters` (or a future CI package), not here.
- **Purity is enforced, not just documented.** `cd ../server && pnpm
  arch:check:core` fails the build on any Node builtin or any dependency
  outside `openai`/`zod`. See
  `.claude/skills/onion-architecture/rules/reviewer-core-purity.md`.
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
- Don't relocate `OpenRouterProvider` into `server` without also updating
  the CI-runner plan (L06) — it lives here so both callers share one client.
  Don't add parallel concrete providers beside it.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | working here for the first time — pipeline diagram, public API |
| [docs/](docs/README.md) | writing an ADR or architecture note for this package |
| [specs/](specs/README.md) | implementing against a written spec for the engine |
| [INSIGHTS.md](INSIGHTS.md) | **as soon as a request makes clear it concerns `reviewer-core`** — read before any other action |
| [../TESTING.md](../TESTING.md) | writing a new test |

**On finishing work here: re-read `INSIGHTS.md`, then append only if
something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
