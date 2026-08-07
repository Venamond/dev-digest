# `client` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

- Do not put `sessionStorage` (or any client-only value) into sidebar `href`s
  during render to "skip" `/skills` → `/skills/:id` hops. SSR emits `/skills`,
  the client first paint emits `/skills/{uuid}` → React hydration mismatch.
  The real slow-nav fix is persistent `AppShell` (below); list pages already
  show list+editor. Last-id href overrides also made the browser status bar
  show long UUIDs on hover — removed; use static `/skills` and `/agents`.
  (2026-08-07)

## Codebase Patterns

- `AppShell` is mounted once under `lib/providers.tsx` (`CrumbProvider` +
  `AppShell`). Pages must NOT wrap themselves in `<AppShell>` — that remounted
  the sidebar on every route change and made Skills Lab nav feel multi-second.
  Publish breadcrumbs with `useSetCrumb([...])` from `@/components/app-shell`
  instead (`useSetCrumb` no-ops outside the provider so unit tests stay simple).
  (2026-08-07, slow left-nav switching)

- Crumb publish/subscribe is split: `SetCrumbContext` (stable setter) vs
  `CrumbStateContext` (current crumbs). `useSetCrumb` must depend only on the
  setter + a serialized crumb key — never on a combined `ctx` object that
  changes when crumbs update (that caused set→cleanup-clear→set infinite
  loops). See `components/app-shell/crumb-context.tsx`. (2026-08-07)

- Shell nav links go through `ShellLink` (`components/app-shell/ShellLink.tsx`)
  as `ctx.Link`: `span` + `router.push` / prefetch, not `next/link` `<a>`.
  Real anchors make the browser status bar flash the URL on hover; the product
  UI should not. (2026-08-07)

- `MarkdownEditor` with `fill` must still sync textarea height from
  `scrollHeight` / line count every value change (`MarkdownEditor.tsx`).
  Skipping sync in fill mode left the textarea at ~2 browser rows so only the
  tops of glyphs showed over an empty pane. Editor background token is
  `var(--bg-primary)` — `var(--bg)` is undefined and paints a black block.
  (2026-08-07, conventions Create-skill modal)

- Conventions Create-skill modal footer is
  `Saved as v{version} · added to Skills Lab` (`conventions.modal.footerHint` /
  `footerSaved`). Compute `version` as `1` for a new name, else
  `existing.version + 1` from `useSkills()` — do not ship a version-less
  "bumps its version" hint; the design/spec require the number.
  (`CreateSkillModal` under `repos/[repoId]/conventions/`). (2026-08-07)

- TanStack Query keys previously were inline string literals with cross-file
  invalidation by raw string (e.g. `useTestConnection` → `["provider-models"]`).
  Fixed 2026-08-04: every key / invalidation goes through
  `src/lib/hooks/keys.ts` (`queryKeys`). When adding a new query, extend that
  factory — do not introduce a bare string-array `queryKey`.

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

- **The Playwright MCP browser tool's `browser_type` (and `.fill()` generally)
  REPLACES an `<input>`/`<textarea>`'s entire value — it does not append.**
  Used against a real running dev server + real Postgres data (not a test
  fixture), calling it on the Skill body textarea to "add a character" wiped
  the whole 2000+-char body to one space, live, before Save was clicked.
  Recovered only because the change was still client-side (reload discarded
  it; verified via `GET /skills/:id` that the DB body was untouched) — had
  Save been clicked first, that would have been a real, saved data loss. When
  verifying UI behavior live against this app's dev server: use
  `browser_press_key` (`End` then a single key, or `Backspace`) for
  incremental edits to existing content, never `browser_type`/fill, unless
  you intend to replace the field's entire value. (2026-08-07)

- **The local dev server (`localhost:3000`/`:3001`) and its Postgres are
  live, shared state — a real user's own browser session can mutate the same
  rows an agent is live-testing against, mid-investigation, with no warning.**
  Observed twice in one session: a skill's version jumped from v2 to v6
  between two browser-tool checks (a real conventions-extractor re-run
  happened concurrently), and an unrelated agent's `skill_count` changed
  1→3 while verifying a fix on a *different* agent's card. Neither was
  caused by the agent's own actions. When live-verifying a fix here: assert
  on the specific row/field the fix targets (re-fetch it explicitly before
  and after your own action), never assume an unrelated row's value stayed
  constant just because you didn't touch it — cross-checking against a
  snapshot taken seconds earlier can show a false regression. (2026-08-07)

- `apiFetch` used to set `Content-Type: application/json` whenever `init.body`
  was non-null. Multipart skill import (`FormData` via `api.postForm`) needs the
  browser to set the boundary — forcing JSON breaks Fastify multipart parsing.
  Fixed 2026-08-05: skip the JSON content-type when `body instanceof FormData`
  (`src/lib/api.ts`). Use `api.postForm(path, form)` for file uploads, not
  `api.post`.

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

- `useSetCrumb` Maximum update depth: if the effect depends on a crumb `ctx`
  that is rebuilt whenever crumbs change, `setCrumb` → new ctx → effect
  cleanup clears crumbs → effect runs again. Depend on the stable setter from
  `SetCrumbContext` only (see Codebase Patterns). (2026-08-07)

- Mocking a TanStack Query hook that returns a fresh `data: [...]` array on
  every call will infinite-loop any component whose `useEffect` depends on
  that `data` identity (e.g. Agent → SkillsTab syncing editor rows into local
  draft state). Hoist a stable array/object with `vi.hoisted` and return the
  same reference from the mock. Regression: `AgentEditor.test.tsx` Skills tab.
  (2026-08-05, Track C agent skills bind)

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
