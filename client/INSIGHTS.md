# `client` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

## Codebase Patterns

- TanStack Query keys in `src/lib/hooks/*` are inline string literals with no
  key factory, and at least one invalidation crosses a module boundary by raw
  string: `core.ts:50` (`useTestConnection`) calls
  `qc.invalidateQueries({ queryKey: ["provider-models"] })`, but that key is
  declared in `agents.ts:86` (`useProviderModels`) as
  `["provider-models", provider]`. It works only because TanStack Query matches
  by key *prefix*, and nothing in either file points at the other. Before
  renaming or reshaping any `queryKey` in `src/lib/hooks/`, grep the literal
  across the whole directory — the compiler will not catch a missed
  invalidation, and the symptom is a stale cache (e.g. the agent editor's model
  picker keeping an empty list after a provider key is saved), not an error.
  Same applies to `["repos"]`, `["agents"]`, `["reviews", prId]` and
  `["pr-runs", prId]`, each repeated across several call sites. (Verified
  2026-08-03 by grep; no bug observed yet — this is a latent coupling.)

- `FindingsPanel` keyboard shortcuts (`j`/`k` focus, `a`/`d` accept/dismiss)
  used to listen on `window` whenever the Findings tab was mounted, so typing
  `a`/`d` elsewhere on the PR page silently mutated `shown[0]`. Fixed
  2026-08-04: shortcuts arm only after a `pointerdown` inside the panel
  (`panelActive`), and skip when the target is an editable field
  (`isTypingTarget` in `helpers.ts` — INPUT/TEXTAREA/SELECT/contentEditable)
  or when meta/ctrl/alt is held. Regression: `FindingsPanel.test.tsx` —
  "does not accept/dismiss via a/d until the panel is activated". There is
  still no "un-accept" to neutral in the UI (Accept ↔ Dismiss only); reset
  via DB if needed (`accepted_at`/`dismissed_at` = null).

## Tool & Library Notes

- The `next-best-practices` skill's decision tree
  (`.claude/skills/next-best-practices/data-patterns.md`) actively conflicts
  with this package's architecture: it recommends fetching in Server
  Components with direct `db.*` access ("Pattern 1: Preferred for Reads") and
  Server Actions for mutations ("Pattern 2: Preferred for Mutations"). Both are
  ruled out here — `client/` talks only to the Fastify API over TanStack Query
  hooks, and has 0 route handlers, 0 server actions, 0 `server-only` imports.
  An agent that loads that skill while working in `client/` will propose
  exactly what `client/AGENTS.md` forbids. This is not a defect in either
  document: the Next.js data-security guide names *three* valid data
  architectures (external HTTP APIs / Data Access Layer / component-level) and
  says to pick one and not mix them — this project is on the **external HTTP
  APIs** branch, which the same docs recommend for apps whose backend is a
  separate service. Next.js also explicitly endorses client-side fetching via
  `react-query` for frequently polled data. When applying `next-best-practices`
  here, use it for mechanics (directives, async `params`, metadata, hydration)
  and ignore its data-fetching decision tree. Full citations in
  `.claude/skills/frontend-architecture/references.md` §9.4 and §9.8.
  (Verified 2026-08-03.)

- Second conflict in the same family: the `react-best-practices` skill's
  Tailwind section says "Use utility classes for all styling — no inline
  `style={}` objects". `client/` does the opposite and does so deliberately —
  `tailwindcss` v4 is installed and wired through `postcss.config.mjs`, but the
  actual convention is JS style objects in a colocated `styles.ts` beside the
  component (23 such files; 37 files under `src/app` use `style={`, only 12 use
  `className=`). Do not "fix" a component by converting its `styles.ts` into
  utility classes — that fights the established pattern and, for `border*`
  props, walks into the shorthand/longhand rerender warning documented under
  Recurring Errors below. New components follow the surrounding `styles.ts`
  pattern. (Verified 2026-08-03 by grep.)

- Adding a `.nullable()` (not `.nullish()`) field to a shared Zod contract in
  `src/vendor/shared/contracts` makes that field REQUIRED at the TS level —
  every existing test fixture that types itself as that contract (e.g.
  `RunSummary`/`RunTrace` fixtures in `RunHistory.test.tsx`,
  `RunTraceDrawer.test.tsx`) fails `tsc --noEmit` until updated, even though
  the fixture's actual runtime value can legitimately be `null`. When a
  server-side task extends such a contract, expect to also patch every
  client fixture of that type in the same change, not just the server side.
  (2026-07-31, run-cost-ui feature; full explanation in `server/INSIGHTS.md`
  under the same date.)

## Recurring Errors & Fixes

- React DOM console warning "Updating a style property during rerender
  (borderColor) when a conflicting property is set (borderLeftColor)":
  `borderColor` in a React style object is itself CSS shorthand for all 4
  sides' color, so pairing it with `borderLeftColor` triggers the same
  "shorthand + non-shorthand" warning as pairing the `border` shorthand with
  `borderLeft` — going all-longhand for `border*` isn't enough by itself,
  the per-side `*Color`/`*Width`/`*Style` props must ALSO avoid mixing the
  4-side form with a 1-side form. Fix: expand to
  `borderTopColor`/`borderRightColor`/`borderBottomColor` individually
  instead of `borderColor`, keep `borderLeftColor` as the 4th (see
  `_components/FindingCard/styles.ts` `card()` for the fixed pattern,
  2026-07-31). Only surfaces on a rerender where the value actually changes
  (e.g. a `focused` prop toggling) — easy to miss if you only smoke-test the
  initial render.

## Session Notes

## Open Questions
