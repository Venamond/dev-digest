---
name: frontend-architecture
description: "Where code goes in DevDigest's client/ package — feature folder boundaries, constants vs utils placement, business logic location, state location, and the 'use client' server/client boundary as an architectural decision. Use when creating a new route or component, deciding where a piece of logic or a constant belongs, deciding whether something needs to be a Client Component, or reviewing a client/ diff for placement. States this project's specific architecture (TanStack Query against the Fastify API, no Server Actions, no direct DB access) as a decision, not a suggestion. Also carries the rule for building a component from a supplied mockup: build the mockup's element list and nothing else. Trigger terms: folder structure, where does this go, feature folder, use client boundary, barrel file, query key, colocation, client architecture, mockup, reference design, макет. For hook rules, memoization, keys, and accessibility use react-best-practices instead; for Next.js mechanics (async params, metadata, bundling, hydration) use next-best-practices instead — this skill carries only placement and architecture decisions, not mechanics."
metadata:
  tags: architecture, frontend, client, nextjs, react, folder-structure
---

# Frontend Architecture

Where does this code go? This skill answers placement and architecture
questions for `client/` — not hook mechanics (see `react-best-practices`)
and not Next.js mechanics like async `params` or metadata (see
`next-best-practices`). Full citations for every rule below:
[references.md](references.md).

## Severity Levels

- **PROJECT** — this repo's specific architectural decision. Not a general
  React/Next best practice; deviating means contradicting `client/AGENTS.md`.
- **CRITICAL** — will cause bugs, wrong bundle boundaries, or structural
  drift that's expensive to unwind later.
- **HIGH** — will hurt maintainability or make code hard to find/change.
- **MEDIUM** — will hurt build performance or developer experience.

---

## Data Architecture (PROJECT)

- ALL data access goes through TanStack Query hooks in `src/lib/hooks/*`
  calling the Fastify API via `src/lib/api.ts` — no Server Actions, no
  direct DB access, no Route Handlers used as a proxy to another backend.
- This is a deliberate choice, not an oversight: Next.js's own data-security
  guide names three sanctioned data architectures (External HTTP APIs / Data
  Access Layer / component-level) and recommends picking one. This project
  is on **External HTTP APIs** — the branch Next.js itself recommends when
  the backend is a separate service with its own team, and the branch it
  explicitly endorses client-side `react-query` fetching for. See
  [references.md §9.4](references.md#94-the-three-sanctioned-data-architectures--pick-one).
- `next-best-practices/data-patterns.md`'s decision tree (Server Component
  fetch, Server Actions, direct DB access) describes a *different*, equally
  valid branch — skip it when working in `client/`.
- Query keys currently live as inline literals beside their hook, not behind
  a shared factory. This works but is fragile — see
  [deviations.md](deviations.md) for the concrete coupling this has already
  produced.

## Server/Client Boundary (CRITICAL)

- `'use client'` marks a **module graph** boundary, not a render-tree
  boundary. A Server Component passed as `children` or another prop to a
  Client Component is NOT pulled into that component's client bundle — it
  still renders on the server. Only files actually imported by a
  `'use client'` module (and the components it renders directly) become
  part of the client bundle.
- Push the directive to the leaves of the tree: the route entry
  (`page.tsx`) should stay a Server Component and delegate to a
  `'use client'` view under `_components/`, not carry the directive itself.
- Providers wrap `{children}` only, as deep in the tree as possible — not
  the whole `<html>`/`<body>`. See `src/app/layout.tsx`'s
  `NextIntlClientProvider` for the pattern already used correctly in this
  repo.
- Props crossing the boundary must be serializable: primitives, `Date`,
  plain objects/arrays, `Map`/`Set`, `Promise`, JSX elements. Not classes,
  class instances, or ordinary functions.
- See [references.md §9.2–§9.3](references.md#92-the-boundary-is-a-module-graph-boundary-not-a-render-tree-boundary)
  for the full citations, and [deviations.md](deviations.md) for the four
  routes that don't yet follow this.

## Building From a Mockup (CRITICAL)

- Before writing `styles.ts`, list the mockup's elements — every label,
  chip, counter, divider, colour role and its position. Build that list and
  nothing else. This is the whole rule; the points below are its
  consequences.
- **What the mockup omits is a decision, not a gap to fill.** A background
  band, an uppercase section heading, a file path in a header, a "N more"
  line — if it is not in the mockup, it is not in the component. Adding it
  is not initiative, it is an unrequested change to a spec.
- Where the mockup is genuinely ambiguous (is this block a tab or a card?
  is this graph a picture or a live simulation?), ASK before building.
  One question costs a message; guessing costs the whole component twice.
- Colour comes from the mockup's role, not from a token that looks close.
  `--bg-primary` is the darkest token in this theme — reaching for it to
  raise a row inside an `--bg-elevated` card makes the row recede instead.
- Reviewing a `client/` diff against a mockup: every element in the diff
  that is absent from the mockup is a finding, and so is every mockup
  element absent from the diff.

## Feature Folder Structure (CRITICAL)

- A feature's UI, logic, styles, and tests live together under
  `src/app/**/_components/<Name>/{<Name>.tsx, styles.ts, <Name>.test.tsx, ...}`,
  colocated with the route that uses it — matches the existing
  `client/AGENTS.md` convention, not a new rule.
- Code used by more than one feature moves up: cross-cutting UI to
  `src/components/`, data hooks to `src/lib/hooks/`, the fetch chokepoint
  stays `src/lib/api.ts`.
- Imports flow one direction only: shared code → feature → route. A
  feature under one route must not import from a feature under another
  route — if two routes need the same thing, that thing belongs in shared
  code, not in either feature.
- No barrel files (`index.ts` re-exporting a directory) inside the app.
  They block tree-shaking and slow down dev-server startup at scale. The
  sanctioned exception is a vendored package's own entry point
  (`src/vendor/shared`, `src/vendor/ui`) — those are third-party-shaped by
  design, not application code.
- See [references.md §3.1, §3.3](references.md#31-bulletproof-react) for
  the sourcing (Bulletproof React's `import/no-restricted-paths` pattern,
  TkDodo's measured barrel-file cost).

## Constants & Utils Placement (HIGH)

- A constant used by one feature lives inside that feature's
  `_components/<Name>/` folder, not in a shared file. Promote it only when
  a second feature needs the same value.
- `utils/` is for generic, portable functions — code with no knowledge of
  this project's domain, the kind you could paste into a different project
  unchanged. `helpers` (however named locally) is for functions that do
  know the domain — name them for what they do, don't let them accumulate
  in one grab-bag file.
- Styling is colocated JS style objects in a `styles.ts` beside the
  component, not Tailwind utility classes — this is `client/`'s actual,
  deliberate convention (23 `styles.ts` files; `style={` used in far more
  `src/app` files than `className=`). This intentionally diverges from
  `react-best-practices`' Tailwind-only rule; see
  [deviations.md](deviations.md) for why that rule doesn't apply here.

## Business Logic Placement (HIGH)

- Derive, don't store: a value computable from existing props/state is
  computed during render, never mirrored into `useState`.
- A function gets the `use` prefix only if it calls other hooks internally.
  Logic that doesn't touch hooks is a plain function, not a custom hook —
  `getSorted(items)`, never `useSorted(items)`.
- Hooks are the seam between logic and rendering. This project does not
  mandate a container/presentational component split — treat that as a
  historical pattern, not a rule to enforce (its own originator retracted
  it once hooks existed; see
  [references.md §5, Tier 4](references.md#5-tier-4--supporting--secondary)).

## State Location (HIGH)

- State lives in the closest common parent of every component that reads
  it — and no higher. Lifting state further than that subtree needs it
  causes unrelated components to re-render.
- URL-dependent state (filters, active tab, sort order, pagination) belongs
  in `searchParams`, not `useState` — see the existing
  `?tab=`/`?status=`/`?sort=` pattern already used in
  `repos/[repoId]/pulls/page.tsx` and `agents/[id]/page.tsx`.
- Server state (anything fetched via a `src/lib/hooks/*` query) stays in
  the TanStack Query cache. Don't copy a query result into `useState` or
  another store — read the hook again where you need the value.

## Import Boundaries & Barrel Files (MEDIUM)

- Import directly from the file that defines what you need. Don't add an
  `index.ts` re-export file to make an import path shorter — see Feature
  Folder Structure above for the barrel-file rule and its one exception.
- Machine enforcement (an ESLint rule such as `import/no-restricted-paths`,
  matching what the backend's `onion-architecture` skill does with
  `dependency-cruiser`) is a reasonable future addition but is **not**
  configured in this repo today. Don't assume such a rule exists or will
  catch a violation — review placement by eye against this skill until one
  is added.

## Known Deviations

`client/`'s current code doesn't yet follow every rule above in every
file. [deviations.md](deviations.md) lists exactly where and why, so
copying the nearest existing example doesn't silently propagate the
pattern this skill argues against. Read it before adding a new route or
touching `src/lib/hooks/`.

## Examples

Before/after pairs from real `client/` code: [examples.md](examples.md).

## Sources

Full annotated source list, including where sources disagree with each
other and how this skill resolves each disagreement: [references.md](references.md).
