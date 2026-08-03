# Frontend Architecture — Known Deviations

Where `client/`'s current code doesn't yet follow a rule in
[SKILL.md](SKILL.md). Listed so the pattern isn't copied into new code —
each entry is a worklist item for a future refactor, not something to fix
as a side effect of unrelated work.

## Thick route entries instead of thin + `_components/<View>`

**Rule:** [SKILL.md § Server/Client Boundary](SKILL.md#serverclient-boundary-critical) —
route entries stay Server Components and delegate to a `'use client'`
view under `_components/`.

**Violates:**

- `src/app/page.tsx`
- `src/app/repos/[repoId]/pulls/page.tsx`
- `src/app/repos/[repoId]/pulls/[number]/page.tsx`
- `src/app/agents/[id]/page.tsx`

All four carry `"use client"` directly on the route entry with the page's
full implementation inline, instead of following the pattern
`src/app/agents/page.tsx` and `src/app/settings/[section]/page.tsx`
already use correctly (see [examples.md](examples.md) for the two side by
side).

Note: because the app is already client-rendered below the route entry in
this codebase, moving `'use client'` into `_components/` here would not
by itself reduce the client bundle — the view is imported by the page
either way. The reason to still follow the rule is consistency and
keeping the option of server-side `params`/`metadata` open, not a
bundle-size win this skill can currently demonstrate.

**Do not copy this pattern into a new route.** Fixing these four is a
separate refactor task, not part of this skill.

## Query keys without a shared factory

**Rule:** [SKILL.md § Data Architecture](SKILL.md#data-architecture-project) —
query keys should live behind a per-feature factory, not as repeated
inline literals.

**Violates:** all of `src/lib/hooks/*` — keys are inline string arrays.
Concrete example already causing invisible coupling: `core.ts:50`
(`useTestConnection`) invalidates `["provider-models"]`, a key declared in
`agents.ts:86` (`useProviderModels`) — see
[examples.md](examples.md#query-keys-implicit-coupling-vs-a-factory) for
the full before/after. Recorded independently in `client/INSIGHTS.md`
under Tool & Library Notes (2026-08-03).

**Do not add a new query key as a bare literal expecting this to be fixed
first** — follow the existing inline-literal pattern for now, since a
partial migration (some hooks on a factory, most not) would be worse than
a consistent one. Introducing the factory repo-wide is a separate task.

## Styles: `react-best-practices`' Tailwind rule doesn't apply here

**Not a deviation from this skill** — `client/`'s `styles.ts` convention
*is* this skill's rule (see
[SKILL.md § Constants & Utils Placement](SKILL.md#constants--utils-placement-high)).
It's listed here because it's a deviation from the *sibling*
`react-best-practices` skill, which states under its Tailwind CSS section:
"Use utility classes for all styling — no inline `style={}` objects."

`client/` has `tailwindcss` v4 installed and configured, but the actual,
deliberate convention is colocated JS style objects in `styles.ts` beside
each component: 23 such files exist under `src/`, and files under
`src/app` use `style={` far more often than `className=`. Also recorded in
`client/INSIGHTS.md` under Tool & Library Notes (2026-08-03).

**If you're working from `react-best-practices` in `client/`, this
override supersedes its Tailwind section.** Do not convert an existing
`styles.ts` to Tailwind classes as an incidental cleanup.
