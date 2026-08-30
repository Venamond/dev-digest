# `@devdigest/web` — client (studio)

Next.js 15 App Router UI: import repos, browse PRs, run/read AI reviews,
author agents. Data via TanStack Query hooks over the Fastify API — no server
actions, no direct DB access from this package.

## Commands

```sh
pnpm dev         # next dev, :3000
pnpm build
pnpm test        # vitest + jsdom, fetch mocked — no API/DB needed
pnpm typecheck
```

## Structure

- `src/app/**/page.tsx` — routes, kept thin.
- `src/app/**/_components/<Name>/{<Name>.tsx,<Name>.test.tsx,...}` — feature
  logic lives colocated with its route, not in a shared `components/` dump.
- `src/lib/hooks/*` — one TanStack Query hook per API resource.
- `src/lib/api.ts` — the single fetch chokepoint; every hook goes through it.
- `src/vendor/shared`, `src/vendor/ui` — vendored packages (see root
  `AGENTS.md` do-not-touch).

## Non-default conventions

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`) is the only place
  the API origin is configured — don't hardcode `localhost:3001` in a
  component.
- i18n strings live in `messages/<locale>/*.json` (`next-intl`) — don't
  inline user-facing copy in JSX.
- Every `_components/<Name>` that renders meaningful logic ships with a
  colocated `.test.tsx` — this is enforced by convention, not a linter.

## Gotchas

- Component tests never hit a real API — `fetch` is mocked. If a test needs
  real client+API+DB behavior, it belongs in `../e2e`, not here.
- Cross-cutting chrome (nav, breadcrumbs, `g`-then-key shortcuts) lives in
  `src/components/app-shell` — don't reimplement navigation per-page.

## Do-not-touch

- `src/vendor/shared` — manually synced copy of the Zod contracts, must stay
  identical to `server/src/vendor/shared`. See root `AGENTS.md`.
- `src/vendor/ui` — vendored UI primitives; treat as read-only third-party
  code, patch upstream conventions instead of editing in place.

## Read when

| Doc | Read when |
|---|---|
| [README.md](README.md) | working here for the first time — UI route ↔ API map |
| [docs/](docs/README.md) | writing an ADR or architecture note for this package |
| [specs/](specs/README.md) | implementing against a written spec for a screen/flow |
| [INSIGHTS.md](INSIGHTS.md) | **as soon as a request makes clear it concerns `client`** — read before any other action |
| [../e2e/README.md](../e2e/README.md) | a change needs real browser coverage, not just a component test |
| [../TESTING.md](../TESTING.md) | writing a new test |

**On finishing work here: re-read `INSIGHTS.md`, then append only if
something genuinely new and non-trivial surfaced that isn't already
recorded** (via the `engineering-insights` skill or `/engineering-insights`).
Writing nothing is correct when nothing new cleared that bar.
