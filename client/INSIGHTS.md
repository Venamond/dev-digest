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

- **i18n namespace follows the component's location, not the feature it serves.**
  Shared components under `client/src/components/**` call
  `useTranslations("shell")` (10 of 13 call sites; the rest are `common` /
  `agents`), while feature components under
  `client/src/app/**/_components/**` call the feature namespace
  (`prReview`, `runs`, `prReview.intent`). Consequence when a feature adds copy
  to a *shared* component — e.g. a per-file badge inside
  `components/diff-viewer/` for a PR-review feature: the string must go in
  `client/messages/en/shell.json`, **not** in the feature's
  `prReview.json`. A key added to the wrong file is unreachable at runtime —
  `useTranslations` resolves only within the namespace the component itself
  declared, so the component renders the raw key path instead of the text, and
  `pnpm typecheck` does not catch it. A feature that touches both layers has to
  split its copy across two message files on purpose.
  (2026-08-14, Smart Diff planning)

- **Agent → Skills row order is frozen on load — never re-derive the sort per
  render.** `SkillsTab` used to compute its order every render as "linked rows
  first (by `order`), then unlinked (by name)". Ticking a checkbox links the
  skill, so the row instantly left the lower unlinked group for the end of the
  upper linked group — it jumped upward out from under the pointer, which
  reads as random reordering. A second re-sort followed a beat later because
  `useSetAgentSkills.onSuccess` does `qc.setQueryData(...)`, so fresh rows land
  in the cache and the `[data]` effect reseeds the draft. Fixed 2026-08-08:
  the order is state (`displayOrderIds` / `applyDisplayOrder` in
  `SkillsTab/helpers.ts`), seeded from the first load per agent and reseeded on
  exactly two events — switching agent, and a **drag** (where reordering is the
  user's intent, so the drop handler calls `setOrder(displayOrderIds(next))`).
  Ids absent from the frozen order (a skill created after the tab loaded) sort
  last by name. Any checkbox list here that groups by a flag the checkbox
  mutates needs this treatment; verify by ticking the LAST row and confirming
  its index is unchanged. **`SkillsTab` has no `.test.tsx` — only
  `helpers.test.ts` — so anything left inline in the component is untested.**
  That is how a broken drag-reorder survived: the drop handler's swap loop
  named `linked[i]` instead of the dragged row, so step 2 undid step 1 and a
  2-position drag moved nothing while a 3-position drag shuffled unrelated
  rows (only adjacent drags worked). Now `reorderLinked(rows, dragId,
  targetId)` in `helpers.ts`, covered by tests that pin the old wrong results.
  Put new SkillsTab logic in `helpers.ts`, not the JSX. **A second, independent
  cause of "drag is broken" here was a false affordance**, so check it before
  debugging reorder math: only linked rows are `draggable` (and only they accept
  a drop — `order` is meaningless for a skill that never reaches the prompt),
  yet the ☰ handle rendered with `cursor: grab` on every row, so dragging from
  the unlinked rows at the bottom silently did nothing. `s.dragHandle` is now a
  function of `canDrag`, dimmed with a `default` cursor and an explanatory
  `title` when reordering is unavailable. When a drag bug is reported for
  *specific* rows, first check whether those rows are draggable at all.
  (2026-08-08)

- **Rendered-markdown BLOCK styling lives in `app/globals.css` under `.dd-md`,
  not in the Markdown primitive.** `vendor/ui/primitives/Markdown.tsx`
  (react-markdown + remark-gfm) styles only inline nodes (`p`, `strong`,
  `code`, `a`) and emits a `.dd-md` wrapper; every block element
  (`h1..h4`, `ul/ol`, `pre`, `blockquote`, `hr`, GFM tables) is styled through
  that class in `app/globals.css` — added 2026-08-08, before which the hook had
  no rules at all and skill previews rendered headings with zero spacing and
  fenced code with an inline-pill look. Extend those rules there; do NOT add
  components to `Markdown.tsx` (`src/vendor/ui` is do-not-touch per root
  `AGENTS.md`). Two traps that make a naive rule silently half-work:
  (1) **`list-style` must be restated** (`.dd-md ul { list-style: disc }`) —
  `styles.css` imports tailwindcss and its preflight resets `ul, ol` to
  `list-style: none`, so bullets/numbers vanish and items read as plain
  indented text; (2) **overriding the look of code inside `pre` needs
  `!important`** — react-markdown routes fenced code through the same `code`
  component as inline code, which applies its pill styling via a React
  `style={}` attribute, and inline styles outrank class selectors. Also note
  `vendor/ui/styles.css:205-211` resets `h1..h4, p { margin: 0 }` globally, so
  heading margins must be set explicitly. Surfaces affected: skill editor
  Preview tab, `FindingCard` rationale/suggestion, PR `CommentCard`.
  Separately: markdown is rendered ONLY in the skill editor's Preview tab —
  the skill Config tab and the conventions create-skill modal use
  `MarkdownEditor` (a line-numbered textarea, not a renderer), and the **agent
  editor has no preview at all** (tabs are Config/Skills/Stats; the system
  prompt is a plain mono `<Textarea>`). (2026-08-08)

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

- **A "sidebar nav takes ~5s, then is fine, then slow again" report is NOT
  automatically a regression of the persistent-`AppShell` fix (see Codebase
  Patterns, 2026-08-07) — measure the environment before touching code.**
  Diagnosed 2026-08-08 on exactly that symptom: the app was innocent. API
  endpoints (`/agents`, `/skills`, `/repos`) answered in **2-8 ms** and warm
  Next dev pages in **37-311 ms**, but the machine was swap-thrashing —
  `next-server` held **~6 GB RSS after 10 days 17 hours uptime** (it grows
  through hot-reloads and never shrinks), leaving **~80 MB free of 48 GB**
  with **19.4 GB of 20 GB swap used**. Clicking a nav item faulted the evicted
  compiled-module pages back from SSD — multi-second block — then navigation
  was instant until the next eviction, which is what makes the stall look
  intermittent and code-shaped. CPU was NOT the tell (89 min total over 10
  days ⇒ no recompile loop). Diagnose in this order, it takes a minute:
  `curl -s -o /dev/null -w "%{time_total}" localhost:3001/agents` (API), the
  same against `:3000` twice per route (cold vs warm), then
  `ps -o pid,%cpu,rss,etime -p $(pgrep -f next-server)` and
  `sysctl vm.swapusage`. Restart `pnpm dev` when free RAM is the scarce
  thing — do not refactor navigation. Two calibration facts from the actual
  restart: a **fresh** `next-server` here is already **~2.4 GB RSS after
  compiling just 3 routes**, so RSS alone is a weak signal (multi-GB is
  normal for this app) — judge by *free RAM*, and treat a many-day-old
  process as suspect regardless of its number. And **`vm.swapusage` barely
  moves after the restart** (19.4 → 19.3 GB — macOS doesn't reclaim swap
  proactively), so it is useless as the after-check: verify with
  `memory_pressure | grep "Pages free"` instead, which went
  **5 116 → 173 172 pages (~80 MB → ~2.7 GB free)** and is what actually
  fixed the stalls. (2026-08-08)

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

- **Never run `pnpm build` in `client/` while `next dev` is running — they
  share one `.next/`.** The production build overwrites the dev server's
  chunks, and the next request fails with a misleading
  `Cannot find module './vendor-chunks/<pkg>.js'` naming a package that is
  installed and fine (seen with `recharts`). Nothing is wrong with the
  dependency, the code, or `node_modules` — it is purely a clobbered build
  directory. Fix: stop the dev server, `rm -rf client/.next` (a gitignored
  artifact, `.gitignore:8`), restart `./scripts/dev.sh`.

  This matters because verifying certain things *requires* a real production
  build — HTML that only a build emits, e.g. whether a `<script>` is inline
  in the streamed markup (see the `beforeInteractive` entry below). If you
  need that while `dev.sh` is up, stop the dev server first, or build with a
  separate `distDir` so the two never share a directory. (2026-08-15)

- **`pnpm test` passing does not mean the types are fine — vitest does not
  typecheck.** A type error living in a `*.test.tsx` file compiles away under
  the test runner and surfaces only in `pnpm typecheck` (i.e. in CI). After
  touching test files, run `pnpm typecheck` explicitly; a green test suite is
  not evidence for it.

  The concrete trap that caused this: **there are two different `Severity`
  types in this package.** `src/vendor/ui/primitives/tokens.ts:3` defines
  `"CRITICAL" | "WARNING" | "SUGGESTION" | "INFO"`, while the contract's
  `Severity` (`vendor/shared/contracts/findings.ts:11`) has only the first
  three — findings can never be `INFO`. Components that render severity
  (`SeverityCounters`, `FindingCard`, badges) type their props against the
  **UI** union, because that is what their real callers pass
  (`ReviewRunAccordion.tsx` holds `useState<Severity | null>` from
  `@devdigest/ui`). A test that redeclares such a prop as
  `FindingRecord["severity"]` looks more precise, compiles under vitest, and
  then fails `tsc` with "Type `'INFO'` is not assignable". Mirror the
  component's own import in the test rather than narrowing to the contract
  type. (2026-08-15)

- **Root layout must not render a manual `<head>`.** `export const metadata`
  already owns `<head>` (charset, title, viewport). A handwritten `<head>`
  with the no-FOUC theme `<script>` made Next emit `<meta charset="utf-8">`
  into `<body>`; hydration then failed with client=`<Suspense>` vs
  server=`<meta charset>` under `NextIntlClientProvider` in
  `src/app/layout.tsx`. It looked intermittent because Fast Refresh / a
  full reload retriggered the stream. Fix: no `<head>` tag; render the theme
  script as a **plain `<script dangerouslySetInnerHTML>` child of `<body>`**.
  Pass `now={new Date()}` from the server layout into
  `NextIntlClientProvider` so it does not mint a second `Date` on the client
  during hydrate. `suppressHydrationWarning` on `<html>`/`<body>` stays —
  that one is for extension-injected attributes, not this bug.
  (2026-08-15)

- **`next/script` `strategy="beforeInteractive"` does NOT put the script in
  `<head>` in the App Router — do not use it for anything that must run
  before first paint.** This entry previously claimed the opposite and the
  claim was wrong. Next rewrites such a script into a `self.__next_s` push
  that `app-bootstrap.js` evaluates only after the async `main-app` chunk
  loads, i.e. after the first paint. Using it for the no-FOUC theme script
  therefore silently reinstated the exact flash the script exists to
  prevent: a `dd-theme=light` user painted full dark on every cold load.
  Verified empirically against a production `next build` + `next start` —
  the emitted `<head>` contained no theme script. A plain inline `<script>`
  as a `<body>` child is emitted synchronously in the streamed HTML and
  runs before paint; React 19 keeps it inline rather than hoisting it.
  Neither `pnpm typecheck` nor `pnpm test` can see this class of bug — only
  a real build, or looking at the served HTML. (2026-08-15)

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

- **A second top-level key with the same name in one `messages/<locale>/*.json`
  file silently shadows the first — `JSON.parse` keeps only the last
  occurrence, and nothing catches it.** `useTranslations` then reports every
  key from the discarded block as `MISSING_MESSAGE` at runtime (raw key path
  rendered, `IntlError` logged) since `layout.tsx` sets no `onError` /
  `getMessageFallback`. `pnpm typecheck` does not see message files at all,
  and there is no i18n-key linter in this repo. Concrete trap: adding a new
  feature's copy under a key that already exists elsewhere in the same file
  (e.g. two unrelated features both naming their block `"smartDiff"`) is a
  silent no-op for the older or newer block depending on JSON key order, not
  a merge. Before adding a top-level key to a message file, grep that exact
  file for the key name first — `grep -n '"<key>":' client/messages/en/<file>.json`.
  (2026-08-14, Smart Diff implementation — caught by `architecture-reviewer`,
  not by any automated gate)

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
