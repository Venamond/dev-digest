# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows driven by Vercel **agent-browser** (native Rust+CDP
CLI). No Playwright, no LLM, no API key — every assertion is a deterministic
`wait --url` / `wait --text` / `find role|text|label`.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
../scripts/e2e.sh          # hermetic — isolated stack, safe alongside dev
npm test                   # against your OWN running stack (see precondition)
npm run typecheck
```

## Structure

- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser
  commands (see any existing spec for the shape before writing a new one).
- `run.ts` — executes flows in order against one shared browser session.
- `lib/assert.ts` — shared assertion helpers.

## Non-default conventions

- **Never use the AI `chat` command.** Locators must be deterministic
  (`--url`, `--text`, `find role|text|label`) or runs become flaky and
  key-dependent — the whole point of this suite is zero-LLM determinism.
- **Flows target read-only seeded data only** (`acme/payments-api`, PR #482,
  seeded agents) — a flow that triggers a real model call doesn't belong
  here.
- A non-zero exit from any `cmd` fails the step and the flow; `wait` steps
  *are* the assertions, there's no separate assert-only step type unless you
  need a stdout substring check (`"assert": {"stdoutIncludes": "…"}`).

## Gotchas

- **Precondition: freshly-seeded DB, exactly one repo.** Flow `02` assumes
  the seeded demo repo is the only one in the DB. Your normal dev DB usually
  has more — run the hermetic runner (`../scripts/e2e.sh`), not `npm test`
  directly, unless you know your dev DB is clean.
- **Never `docker compose down -v`** to "reset" — `-v` deletes the
  `devdigest_pgdata` volume, taking every real imported repo/review with it.
  The hermetic runner uses its own ephemeral Postgres instead.
- Failure screenshots land in `test-results/` (git-ignored, uploaded as a CI
  artifact) — check there first when a flow fails in CI but not locally.

## Do-not-touch

- Don't add the AI `chat` locator to a flow — see Non-default conventions.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | working here for the first time — flow format, coverage table |
| [docs/](docs/README.md) | writing an ADR or architecture note for this package |
| [specs/](specs/) | writing or editing a flow — see an existing spec for the shape first |
| [LEARNINGS.md](LEARNINGS.md) | **as soon as a request makes clear it concerns `e2e`** — read before any other action |
| [../TESTING.md](../TESTING.md) | understanding how this suite fits the overall test strategy |

**On finishing work here: re-read `LEARNINGS.md`, then append only if
something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
