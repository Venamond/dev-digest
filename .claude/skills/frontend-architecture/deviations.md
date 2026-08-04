# Frontend Architecture — Known Deviations

Where `client/`'s current code doesn't yet follow a rule in
[SKILL.md](SKILL.md). Listed so the pattern isn't copied into new code —
each entry is a worklist item for a future refactor, not something to fix
as a side effect of unrelated work.

## Thick route entries — resolved (2026-08-04)

Route entries are now thin Server Components that delegate to `'use client'`
views (`HomeRedirectView`, `PullsListView`, `PrDetailView`,
`AgentEditorPageView`, plus the pre-existing Agents/Settings/AddRepo
pattern). Do not reintroduce `"use client"` on `page.tsx`.

## Query keys — resolved (2026-08-04)

All query keys / invalidations go through `src/lib/hooks/keys.ts`
(`queryKeys`). Do not add new inline string-array keys.

## Cross-route feature imports — resolved (2026-08-04)

`AgentCard` and FindingsPreview live under `src/components/`
(`agent-card/`, `findings-preview/`). Feature folders under one route must
not import from another route's `_components/`.

## App barrels — resolved (2026-08-04)

`src/app/**/index.ts` re-exports removed. Import the concrete file
(`./FindingsPanel/FindingsPanel`). The sanctioned barrel exception remains
vendored packages (`src/vendor/*`) and the existing `src/lib/hooks/index.ts`
re-export surface.

## Styles: `react-best-practices`' Tailwind rule doesn't apply here

**Not a deviation from this skill** — `client/`'s `styles.ts` convention
*is* this skill's rule (see
[SKILL.md § Constants & Utils Placement](SKILL.md#constants--utils-placement-high)).
It's listed here because it's a deviation from the *sibling*
`react-best-practices` skill, which states under its Tailwind CSS section:
"Use utility classes for all styling — no inline `style={}` objects."

`client/` has `tailwindcss` v4 installed and configured, but the actual,
deliberate convention is JS style objects in a colocated `styles.ts` beside
each component. Also recorded in `client/INSIGHTS.md` under Tool & Library
Notes (2026-08-03).

**If you're working from `react-best-practices` in `client/`, this
override supersedes its Tailwind section.** Do not convert an existing
`styles.ts` to Tailwind classes as an incidental cleanup.
