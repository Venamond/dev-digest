# Frontend Architecture & Code Placement — Research & Sources

Research notes gathered 2026-08-03 for a planned `frontend-architecture` skill.

**Scope of the planned skill:** *where does code go* — folder structure, component
splitting, constants, utils/helpers, business-logic placement, import boundaries.

**Deliberately out of scope** (already covered by sibling skills, do not duplicate):

| Topic | Owned by |
|---|---|
| Hook rules, memoization, keys, conditional rendering, a11y, React 19 | [`react-best-practices`](../react-best-practices/SKILL.md) |
| Next.js *mechanics*: what a directive does, async `params`, metadata, bundling, images/fonts, hydration errors | [`next-best-practices`](../next-best-practices/SKILL.md) |
| Test structure, RTL queries, mocking | [`react-testing-library`](../react-testing-library/SKILL.md) |

Next.js is **partly** in scope: the *architectural* half — where the `'use client'` boundary
goes, which data architecture the project is on, what composes across the boundary — belongs
here (§9). The mechanical half stays with `next-best-practices`. The two overlap on RSC
boundaries and must be reconciled, not duplicated; see §9.8 for a live contradiction.

The existing `react-best-practices` skill devotes only ~10 lines ("Code Organization",
MEDIUM) to placement. That gap is what this research targets.

---

## 1. Verification status

Every source below was fetched and read unless marked otherwise.

- ✅ **Verified** — page fetched, claims quoted below come from the page itself.
- ⚠️ **Unverified** — surfaced in search results but the page could not be fetched
  (DNS failure at time of research); claims are from search snippets only and must
  be re-checked before being used in the skill.

---

## 2. Tier 1 — Primary/official sources

These are the load-bearing sources. Prefer them when the skill states a rule.

### 2.1 React official docs (react.dev)

| # | Source | What it settles |
|---|---|---|
| S1 | ✅ [Thinking in React](https://react.dev/learn/thinking-in-react) | Official criteria for **component boundaries** and **where state lives** |
| S2 | ✅ [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Official list of logic that belongs in render / event handlers, **not** in effects |
| S3 | ✅ [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | Official 5 principles for shaping state |
| S4 | ✅ [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | Official rule for **what may be a hook vs a plain function** |

**Key extracts:**

- **S1, component boundaries.** Three lenses for splitting: *programming* ("a component
  should ideally only be concerned with **one thing**"), *CSS* ("what you would make class
  selectors for"), *design* ("how you would organize the design's layers"). Plus data-model
  alignment: *"UI and data models often have the same information architecture — that is,
  the same shape. Separate your UI into components, where each component matches one piece
  of your data model."*
- **S1, state location algorithm** (verbatim structure): for each piece of state —
  (1) identify *every* component that renders based on it; (2) find their closest common
  parent; (3) put state in that common parent, or higher, or *"create a new component
  solely for holding the state"*.
- **S2**, cases that need **no** effect: transforming data for rendering (compute in render),
  handling user events (event handler), caching expensive calcs (`useMemo`), resetting state
  on prop change (`key`), adjusting state on prop change (adjust during render), sharing
  logic between handlers (plain function), notifying the parent (same event pass), chains of
  state updates (calculate all in the handler).
- **S3**, five principles: group related state · avoid contradictions · avoid redundant
  state (*"If you can calculate some information from the component's props or its existing
  state variables during rendering, you **should not** put that information into state"*) ·
  avoid duplication · avoid deeply nested state. Motto: *"Make your state as simple as it
  can be — but no simpler."*
- **S4**, the hook/function boundary: *"If it doesn't use Hooks internally, don't use the
  `use` prefix"* → `getSorted(items)`, not `useSorted(items)`. And:
  *"Keep custom Hooks focused on concrete high-level use cases. Avoid creating and using
  custom 'lifecycle' Hooks"* (`useMount`, `useEffectOnce`, `useUpdateEffect` are anti-patterns).
  Custom hooks share **stateful logic, not state** — each caller gets its own state.

### 2.2 Next.js official docs

| # | Source | What it settles |
|---|---|---|
| S5 | ✅ [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Official colocation rules for App Router (v16.2 at time of research) |

**Key extracts:**

- *"Next.js is **unopinionated** about how you organize and colocate your project files."*
- **Colocation is safe by default**: a route is not public until `page.js`/`route.js` exists,
  so *"project files can be safely colocated inside route segments in the `app` directory
  without accidentally being routable."*
- **Private folders** `_folder`: not required for colocation, but useful for *separating UI
  logic from routing logic*, consistent organization, editor sorting, and **avoiding naming
  conflicts with future Next.js file conventions**. ← This last one is the strongest argument
  for `_components/` and directly justifies this repo's existing convention.
- **Route groups** `(folder)`: organize by section/intent/team, enable nested and multiple
  root layouts, and scope `loading.tsx` without changing the URL.
- Three documented strategies, all sanctioned: (a) project files **outside** `app`,
  (b) top-level folders **inside** `app`, (c) **split by feature or route**.
  *"The simplest takeaway is to choose a strategy that works for you and your team and be
  consistent across the project."*
- Explicit disclaimer that `components`/`lib` are *"generalized placeholders, their naming
  has no special framework significance"*.

### 2.3 Feature-Sliced Design

| # | Source | What it settles |
|---|---|---|
| S6 | ✅ [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) | The most formalized layer/slice/segment methodology |
| S7 | ✅ [FSD documentation repo](https://github.com/feature-sliced/documentation) | Canonical spec source |

**Key extracts:**

- **Layers** (top → bottom): `app` · `processes` *(deprecated)* · `pages` · `widgets` ·
  `features` · `entities` · `shared`.
- **The one hard rule:** *"modules on one layer can only know about and import from modules
  from the layers strictly below."*
- **Slices** = business-domain partitions inside a layer. *"Slices cannot use other slices on
  the same layer, and that helps with high cohesion and low coupling."*
  (`app` and `shared` have no slices — only segments.)
- **Segments** = purpose-based subdivision inside a slice, standardized names:
  `ui` (components, formatters, styles) · `api` (backend interaction, request types) ·
  `model` (**data model, schemas, stores, business logic**) · `lib` (slice-local library
  code) · `config` (configuration, feature flags).
- ⚠️ Relevance caveat for this repo: FSD's full 7-layer form is heavy for a Next.js App
  Router project. Its *vocabulary* (`ui`/`api`/`model`/`lib`/`config` segments, the
  downward-only import rule) is the reusable part.

### 2.4 Redux Style Guide

| # | Source | What it settles |
|---|---|---|
| S8 | ✅ [Redux Style Guide](https://redux.js.org/style-guide/) | Feature folders + where state logic goes, with an explicit priority system |

**Key extracts:**

- Priority system worth copying into the skill: **A: Essential** / **B: Strongly Recommended**
  / **C: Recommended**. (`react-best-practices` already uses CRITICAL/HIGH/MEDIUM — align.)
- *"Structure Files as Feature Folders with Single-File Logic"* (B) — explicitly replaces the
  older folder-by-type (`/actions`, `/reducers`) layout.
- *"Put as Much Logic as Possible in Reducers"* (B) — state-transition logic belongs in the
  pure function, not in the click handler. Generalizes to: **compute in a pure, testable unit;
  the component only dispatches an event.**
- *"Keep State Minimal and Derive Additional Values"* (B) — derive with selectors.
- *"Model Actions as Events, Not Setters"* (B) + `domain/eventName` naming (C).

### 2.5 Clean Architecture

| # | Source | What it settles |
|---|---|---|
| S9 | ✅ [Robert C. Martin — Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) | The "why" behind feature-first over type-first folders |

**Key extract (verbatim):**

> *"So what does the architecture of your application scream? When you look at the top level
> directory structure, and the source files in the highest level package; do they scream:
> Health Care System, or Accounting System, or Inventory Management System? Or do they
> scream: Rails, or Spring/Hibernate, or ASP?"*

> *"Architectures are not (or should not) be about frameworks. Architectures should not be
> supplied by frameworks. Frameworks are tools to be used, not architectures to be conformed to."*

---

## 3. Tier 2 — Widely adopted community references

### 3.1 Bulletproof React

| # | Source | What it settles |
|---|---|---|
| S10 | ✅ [bulletproof-react/docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | The de-facto reference folder structure + enforceable import rule |

**Top-level folders with their stated purpose:**

| Folder | Purpose (quoted) |
|---|---|
| `app` | *"application layer containing… application routes / can also be pages"* |
| `assets` | *"all the static files such as images, fonts, etc."* |
| `components` | *"shared components used across the entire application"* |
| `config` | *"global configurations, exported env variables etc."* |
| `features` | *"feature based modules"* |
| `hooks` | *"shared hooks used across the entire application"* |
| `lib` | *"reusable libraries preconfigured for the application"* |
| `stores` | *"global state stores"* |
| `testing` | *"test utilities and mocks"* |
| `types` | *"shared types used across the application"* |
| `utils` | *"shared utility functions"* |

**Feature folder segments:** `api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`
— *"You don't need all of these folders for every feature. Only include the ones that are necessary."*

**Unidirectional codebase** — the single most actionable rule found in this research:
*"shared parts can be used by any part of the codebase, but the features can only import from
shared parts and the app can import from features and shared parts."*
Enforced with the ESLint rule **`import/no-restricted-paths`**.

**Barrel files:** explicitly discouraged — *"it can cause issues for Vite to do tree shaking
and can lead to performance issues. Therefore, it is recommended to import the files directly."*

### 3.2 Kent C. Dodds — colocation & abstraction timing

| # | Source | What it settles |
|---|---|---|
| S11 | ✅ [Colocation](https://kentcdodds.com/blog/colocation) | The governing placement principle |
| S12 | ✅ [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Placement of state, with a performance argument |
| S13 | ✅ [AHA Programming](https://kentcdodds.com/blog/aha-programming) | *When* to extract something into a util/hook/component |

**Key extracts:**

- **S11 principle (verbatim):** *"Place code as close to where it's relevant as possible."*
  Restated: *"Things that change together should be located as close as reasonable."*
  Colocate: comments, templates, styles, unit tests, component state, utility functions,
  images, and feature README files.
- **S11 exception:** **E2E tests stay at the project root** — they span components, don't map
  to `src/` layout, and refactoring source structure shouldn't force E2E changes.
  ← This is the published justification for this repo's separate `e2e/` package.
- **S12:** *"The best way to make something fast is to do less stuff."* State lifted too high
  invalidates the whole subtree on every update. Rule: state lives at the **closest common
  parent of all components that need it — but no higher**, and lifting should be revisited
  ("intentionally colocate during refactoring") as requirements change.
- **S13:** **AHA = "Avoid Hasty Abstractions."** Cites Sandi Metz —
  *"prefer duplication over the wrong abstraction"* ([The Wrong Abstraction](https://www.sandimetz.com/blog/2016/1/20/the-wrong-abstraction)).
  Practical rule (WET): *"You can ask yourself 'Haven't I written this before?' two times, but
  never three."*
- The two are meant to be applied together: **"Colocate everything until it hurts. Then abstract."**

### 3.3 TkDodo (Dominik Dorfmeister)

| # | Source | What it settles |
|---|---|---|
| S14 | ✅ [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | The `index.ts` question, with measured numbers |
| S15 | ✅ [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys) | Where API keys/constants live |
| S16 | ⚠️ [Deriving Client State from Server State](https://tkdodo.eu/blog/deriving-client-state-from-server-state) | Server-state vs client-state boundary *(snippet only)* |
| S17 | ⚠️ [React Query and Forms](https://tkdodo.eu/blog/react-query-and-forms) | Forms as the blurry edge of that boundary *(snippet only)* |

**Key extracts:**

- **S14, three concrete problems:** (1) **circular imports** — a module importing from its own
  directory's barrel creates a cycle that can crash bundlers; (2) **dev/test startup cost** —
  barrels force synchronous loading of every re-exported module; (3) they **disable Next.js
  `optimizePackageImports`** unless the file contains only re-exports.
- **S14, measured impact (quotable):** *"In our NextJs project, I have seen pages that were
  loading over 11k modules, which took 5-10 seconds to start-up the page. After we started to
  get rid of most of our internal barrel files, we got that down to about 3.5k modules — a
  reduction of 68%."*
- **S14, the one legitimate exception:** *"Where barrels are necessary is when you are writing
  a library"* — i.e. a real package entry point declared in `package.json`.
- **S15:** argues **against** a central `src/utils/queryKeys.ts`; keys belong *"next to their
  respective queries, co-located in a feature directory"*, via a per-feature **query key
  factory** object. Exports the custom hooks only; key + query fn stay module-local.
- **S16/S17 (unverified):** server state = *"state you do not own… you only see a snapshot"*;
  client state = *"the frontend has full control over… you know the accurate value at all
  times."* Rule: keep server state in the query cache, don't copy it into another store; track
  only user modifications as client state. Forms are the deliberate exception (treat server
  state as `initialData`).

### 3.4 Locality of Behaviour

| # | Source | What it settles |
|---|---|---|
| S18 | ✅ [htmx — Locality of Behaviour](https://htmx.org/essays/locality-of-behaviour/) | The counterweight to over-eager Separation of Concerns |

**Principle (verbatim):** *"The behaviour of a unit of code should be as obvious as possible by
looking only at that unit of code."*

Explicitly frames LoB as **in tension with both DRY and Separation of Concerns**, and argues
the tension should often be resolved in LoB's favour — the severity of a duplication depends
on proximity ("behavior nearby is less problematic than behavior pages away"). Useful as the
principled brake on "extract everything into `utils/`".

### 3.5 Robin Wieruch

| # | Source | What it settles |
|---|---|---|
| S19 | ✅ [React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) | A **progressive** structure — the anti-"design it upfront" source |

Five stages, each justified by the size at which the previous one breaks:
(1) single file → (2) multiple flat files → (3) one folder per component
(`index.js` / `component.js` / `test.js` / `style.css`) → (4) technical folders
(`components/`, `hooks/`, `context/`, `utils/`) → (5) domain/feature folders with generic UI
promoted upward.

Naming: components in kebab-case files, `component.test.js`, utilities named after the
function (`format-date.js`, `use-click-outside.js`). Notes index files are
*"increasingly discouraged for tree-shaking"* — consistent with S14.

Heuristic: *"whenever a React component becomes a reusable React component, I split it out as
a standalone file."*

### 3.6 Josh W. Comeau

| # | Source | What it settles |
|---|---|---|
| S20 | ✅ [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | The **dissenting** view — worth including for honest trade-offs |

Organizes **by function, not by feature**, with per-component directories:

```
src/
├── components/ComponentName/
│   ├── ComponentName.tsx
│   ├── index.ts
│   ├── ComponentName.helpers.ts
│   ├── ComponentName.types.ts
│   └── ComponentName.constants.ts
├── hooks/
├── helpers/
├── utils.ts
└── constants.ts
```

His **helpers vs utils distinction is the clearest one found in this research:**
- `helpers/` — *project-specific* functions (know about your domain), e.g. `category.helpers.ts`
- `utils.ts` — *generic, abstract* functions that could move to another project unchanged

Also: hooks that are generic → `src/hooks/`; component-specific hooks → beside the component.
Explicitly **does not** enforce one component per file — *"Files can contain as many components
as you'd like!"* — only one component *directory* per logical component.

⚠️ **Direct conflicts to resolve in the skill:** he *likes* barrel `index.ts` files (contradicts
S14/S10), and he rejects feature-based grouping *"because feature-based categorization creates
friction over time as products evolve and boundaries blur"* (contradicts S9/S10/S8).

### 3.7 Sergey Sova — the `utils/` critique

| # | Source | What it settles |
|---|---|---|
| S21 | ✅ [Why utils & helpers is a dump](https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo) | Why generic buckets rot, with a concrete alternative |

Argument: `utils`/`helpers` are semantically empty names, so nothing can ever be judged
"out of place" there → unbounded growth + duplication as team size grows.

Alternative: **named internal libraries** under `lib/` — `lib/datetime`, `lib/currency` — each
with *"a meaningful name, documentation and tests"*. The claimed payoff: refactoring, publishing
and **deleting** such a library become trivial, which is never true of a `utils/` dump.

### 3.8 React Handbook

| # | Source | What it settles |
|---|---|---|
| S22 | ✅ [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) | In-file ordering + a good anti-bikeshedding rule |

- Endorses bulletproof-react's structure for SPAs.
- **Anti-bikeshedding rule:** *"Don't spend more than 5 minutes trying to plan a folder
  structure."* Start flat in `src/`, refactor once there are 10+ files with distinct concerns.
  Pairs naturally with S19 (progressive structure).
- **In-file ordering** (fills a gap `react-best-practices` states only as "imports, constants,
  helpers, component, exports"): imports & constants → prop types → state (`useState`,
  `useContext`) → other hooks (`useMemo`, `useCallback`) → effects → component-scoped helpers →
  JSX return → abstracted JSX subcomponents.
- Prefers `export function MyComponent() {}` over `const`.
- Tooling: ESLint for code smells, Prettier for formatting, TypeScript/Storybook/JSDoc for docs.

---

## 4. Tier 3 — Enforcement tooling

Placement rules that aren't machine-checked decay. Sources for the enforcement chapter:

| # | Source | Notes |
|---|---|---|
| S23 | ✅ [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | The rule bulletproof-react (S10) names for the unidirectional rule |
| S24 | ⚠️ [`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries) | Declarative layer/element boundaries; *"not a replacement for eslint-plugin-import — using both together is recommended"* |
| S25 | ⚠️ [dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) | Detects cycles, orphaned files, and violations *outside* ESLint's module graph; can render the structure |
| S26 | ⚠️ [Nx — Enforce Module Boundaries](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries) | Tag-based boundaries, monorepo flavour |
| S27 | ✅ [ESLint `no-magic-numbers`](https://eslint.org/docs/latest/rules/no-magic-numbers) | Mechanical backstop for the constants chapter |

---

## 5. Tier 4 — Supporting / secondary

Usable for examples, **not** as the authority for a rule.

| # | Source | Use for |
|---|---|---|
| S28 | ✅ [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | The **retraction** (see below) — essential context |
| S29 | ⚠️ [profy.dev — React Folder Structure & Screaming Architecture](https://profy.dev/article/react-folder-structure) | Side-by-side comparison of flat / by-type / by-feature / atomic design. **DNS-unreachable during research — re-verify before citing** |
| S30 | ✅ [Smashing Magazine — Compound Components in React](https://www.smashingmagazine.com/2021/08/compound-components-react/) | The composition pattern for coordinated widgets (tabs, menus, accordions) |
| S31 | ⚠️ [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) | Hooks-as-the-seam framing |
| S32 | ⚠️ [profy.dev — Business Logic Separation (Clean React Architecture pt.6)](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) | The heavier "domain layer in React" position. Same DNS caveat as S29 |
| S33 | ⚠️ [Tailwind CSS — Theme variables](https://tailwindcss.com/docs/theme) | v4 `@theme` = CSS-first design tokens; the base → semantic → component token layering |

**S28 is important and often misquoted.** The original definitions still circulate, but Abramov
added a retraction:

> *"I wrote this article a long time ago and my views have since evolved. In particular, I don't
> suggest splitting your components like this anymore… I've seen it enforced without any
> necessity and with almost dogmatic fervor far too many times. The main reason I found it
> useful was because it let me separate complex stateful logic from other aspects of the
> component. Hooks let me do the same thing without an arbitrary division."*

⚠️ Note for the skill author: `react-best-practices/SKILL.md` currently states *"Container
components fetch data; presentational components receive props and render UI"* under **CRITICAL**.
That is the pattern its own originator withdrew. The new skill should reconcile this rather than
silently contradict it.

---

## 6. Where the sources disagree

The skill's value is largely in resolving these, not in restating consensus.

| Question | Position A | Position B | Notes toward a resolution |
|---|---|---|---|
| Group by **feature** or by **type**? | Feature — S8, S9, S10, S6 | Type — S20 ("boundaries blur over time"), S19 stages 3–4 | Size-dependent. S19 + S22 suggest by-type is correct *until* ~10+ files / distinct domains, then feature. Not a contradiction if framed as a progression. |
| **Barrel files** (`index.ts`) | Avoid — S14 (measured), S10, S19 | Use — S20 (clean imports, readable editor tabs) | S14 has data and a named exception (published libraries). S20's stated benefits are ergonomic and obtainable via path aliases. Lean A, cite the exception. |
| **`utils` vs `helpers`** | Distinct: helpers = domain-aware, utils = generic — S20 | Both are dumps; use named `lib/<domain>` — S21 | Compatible: adopt S20's *distinction* as the test for whether something is shared at all, and S21's *naming* once a bucket exceeds a handful of functions. |
| **Container/presentational** split | Original prescription — S28 (2015) | Retracted by the author — S28 (2019 note); hooks are the seam — S4, S31 | Settled. Use hooks as the seam; keep "dumb component" only as a description, never a mandated file split. |
| **Constants**: central file or colocated? | `src/constants.ts` for app-wide — S20; FSD `config` segment — S6 | Colocate with the feature; central key files are an anti-pattern — S15 | Split by *scope*: cross-app (env, routes, breakpoints) central; feature-scoped (query keys, enums, limits) colocated. S15 is specifically about the failure mode of the central version. |
| **Colocation** vs **Separation of Concerns** | Colocate — S11, S18 | Layered separation — S6, S9, S32 | S13 is the tiebreaker: colocate until duplication appears **three** times, then abstract upward one level. |
| Where does Next.js fetch data? | Server Components + Server Actions, direct DB — `next-best-practices/data-patterns.md` | External HTTP API from client hooks — `client/AGENTS.md`, sanctioned by S36/S37 | Not a real disagreement: S36 names **three** valid architectures and says pick one. This repo is on the "External HTTP APIs" branch. The existing skill documents a different branch as though it were the only one. See §9.4 and §9.8. |

---

## 7. Consensus points (safe to assert without hedging)

1. **Colocation is the default; distance must be earned.** (S11, S18, S5, S19, S15)
2. **Imports flow one way** — shared → features → app; features never import each other.
   (S10, S6, S8) Enforce with S23/S24.
3. **Derived data is computed, never stored.** (S2, S3, S8)
4. **State lives at the closest common parent of its consumers — and no higher.** (S1, S12)
5. **Abstract on the third occurrence, not the first.** (S13, S18)
6. **`use` prefix only if the function calls hooks.** (S4)
7. **Barrels are for package entry points, not for app-internal directories.** (S14, S10, S19)
8. **Server state and client state are different things with different homes.** (S16, S8)
9. **Structure should name the domain, not the framework.** (S9, S8, S6)
10. **Don't design the structure upfront; let it grow and refactor at known thresholds.**
    (S22, S19, S5)

---

## 8. Fit with this repo (`client/`)

The planned skill must not contradict the conventions already documented in
[`client/AGENTS.md`](../../../client/AGENTS.md). Current state, checked against the research:

| Existing convention | Backed by | Verdict |
|---|---|---|
| `src/app/**/_components/<Name>/` colocated with the route | S5 (private folders), S11, S19 | ✅ Well-supported |
| Colocated `<Name>.test.tsx` per component | S11 | ✅ Well-supported |
| `src/lib/hooks/*` — one TanStack Query hook per API resource | S4, S15 | ✅ Consistent, and S15's main warning does **not** apply — see below |
| `src/lib/api.ts` — single fetch chokepoint | S10 (`lib` = preconfigured libraries) | ✅ Well-supported |
| Cross-cutting chrome in `src/components/app-shell` | S10 (`components` = shared) | ✅ Well-supported |
| i18n copy in `messages/<locale>/*.json` | — | Project-specific; out of scope for the skill |
| `src/vendor/*` treated as read-only | — | Project-specific; the skill must not propose reorganizing it |

**Resolved (checked 2026-08-03):** `client/src/lib/hooks/` does **not** centralize query keys —
there is no `queryKeys.ts`. Keys are inline string literals inside each resource module
(`agents.ts`, `core.ts`, `reviews.ts`, `trace.ts`, `repo-intel.ts`), which is the colocation
S15 asks for. S15's warning does not apply here.

The *second* half of S15 — the **query key factory** — is not adopted, and one concrete
consequence is visible: keys are repeated as raw literals within and across modules, and one
invalidation crosses a module boundary by string. `core.ts:50` calls
`qc.invalidateQueries({ queryKey: ["provider-models"] })`, but that key is declared in
`agents.ts:86` as `["provider-models", provider]`. It works (TanStack Query matches by key
prefix), but the coupling is invisible from either file.

→ Good candidate for a worked "before/after" example in the skill: it is real code in this
repo, the fix is exactly S15's factory pattern, and the failure mode (rename in one file,
silent loss of invalidation in another) is concrete rather than hypothetical.

---

## 9. Next.js App Router — architecture

Scoped to *architecture only*: where the server/client boundary goes, where the data layer
lives, what composes with what. Performance topics (`next/image`, fonts, bundling, scripts)
stay with [`next-best-practices`](../next-best-practices/SKILL.md).

### 9.1 Sources

| # | Source | What it settles |
|---|---|---|
| S34 | ✅ [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Boundary semantics, interleaving, providers, env poisoning |
| S35 | ✅ [React — `'use client'`](https://react.dev/reference/rsc/use-client) | What the directive does to the **module graph**; serializable prop types |
| S36 | ✅ [How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) | The three sanctioned data-fetching architectures; DAL + DTO; audit checklist |
| S37 | ✅ [Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) | Limits of Next as a backend; Route Handler caveats |
| S38 | ✅ [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) | Layout nesting and state preservation across navigation |
| S39 | ⚠️ [Vercel Academy — Client/Server Boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries) | "Push the boundary to the leaves" framing *(snippet only)* |

### 9.2 The boundary is a **module graph** boundary, not a render-tree boundary

This is the single most misunderstood architectural fact, and both official sources state it
explicitly.

- S34: *"Once a file is marked with `\"use client\"`, **all of its imports and the components it
  directly renders are included in the client bundle**. This means you don't need to add the
  directive to every component that is intended for the client."*
- S34, the crucial exception: *"It does not apply to Server Components passed as children or
  other props. Those components are not imported into the Client Component's module graph.
  They are rendered on the server and passed to the Client Component as rendered output."*
- S35: *"A parent-child render relationship between components does not guarantee the same
  render environment."*

**Architectural consequence:** `children`/props are the only seam that survives the boundary.
A Server Component nested *visually* inside a Client Component stays a Server Component **iff**
it is passed in as a prop rather than imported. This is what makes the "slot" pattern
(`<ClientModal>{<ServerCart />}</ClientModal>`) the load-bearing composition primitive.

**Serializable props across the boundary** (S35): primitives, `Date`, plain objects, arrays,
`Map`/`Set`, `Promise`, JSX elements, and Server Functions — **not** classes, class instances,
or ordinary functions. Rules out passing ORM model instances or service objects downward.

### 9.3 Boundary placement

- Official direction (S34): *"To reduce the size of your client JavaScript bundles, add
  `'use client'` to specific interactive components instead of marking large parts of your UI
  as Client Components."* The doc's own example keeps `<Layout>` a Server Component and marks
  only `<Search />`.
- Providers (S34, "Good to know"): *"You should render providers as deep as possible in the
  tree — notice how `ThemeProvider` only wraps `{children}` instead of the entire `<html>`
  document."*
- Third-party client-only components: wrap them in a one-line local Client Component
  (`'use client'; export { Carousel } from 'acme-carousel'`) rather than making the consumer
  a Client Component (S34).
- ⚠️ S39 phrases the rule as "push the boundary to the leaves, not the root" and names the
  anti-pattern as *marking a parent layout client because one child needs interactivity* —
  same rule, catchier wording, but unverified source; prefer citing S34.

### 9.4 The three sanctioned data architectures — pick **one**

S36 is unusually prescriptive and is the key source for this repo. It names three approaches
and adds: *"We recommend choosing one data fetching approach and avoiding mixing them. This
makes it clear for both developers working in your code base and security auditors what to
expect."*

| Approach | S36's stated audience | Applies here? |
|---|---|---|
| **External HTTP APIs** | *"for existing large applications and organizations"* | ✅ **This is our architecture** |
| **Data Access Layer** | *"for new projects"* | ❌ Next never touches our DB |
| **Component-level data access** | *"for prototypes and learning"* | ❌ |

On the external-API branch S36 says: *"You should follow a **Zero Trust** model… You can
continue calling your existing API endpoints such as REST or GraphQL from Server Components
using `fetch`, just as you would in Client Components."* It works well when *"Separate backend
teams use other languages or manage APIs independently."*

**And S37 directly endorses the client-fetching variant we use.** After stating *"Fetch data in
Server Components directly from its source, not via Route Handlers"*, it continues:
*"Server Components cover most data-fetching needs. However, fetching data client side might be
necessary for: … **Frequently polled data**. For these, use community libraries like `swr` or
`react-query`."*

→ `client/AGENTS.md`'s rule — *"Data via TanStack Query hooks over the Fastify API — no server
actions, no direct DB access"* — is not a deviation from Next.js guidance. It is one of the
three documented architectures, applied consistently. **The skill should say so explicitly**,
because the default advice an agent reaches for is the DAL/Server-Actions branch.

### 9.5 For the branch we do *not* use (document, don't apply)

Worth recording so the skill can explain *why* it's excluded rather than ignoring it:

- **DAL** (S36) must: *"Only run on the server. Perform authorization checks. Return safe,
  minimal **Data Transfer Objects (DTOs)**."* Plus: *"only the Data Access Layer should access
  `process.env`."*
- **`server-only` / `client-only`** (S34, S36) — build-time error if a server module is pulled
  into the client graph. Installing them is *optional* in Next.js; the runtime handles the
  import internally.
- **Server Actions are a separate entry point** (S36): *"A page-level authentication check does
  not extend to the Server Actions defined within it."* Re-verify inside every action.
- **Route Handlers are public** (S37): *"Route Handlers are public HTTP endpoints. Any client
  can access them."* And Next is *"not a full backend replacement… an API layer that is
  publicly reachable."*
- **Server Actions are queued** (S37) — *"Using them for data fetching introduces sequential
  execution."* An architectural reason they are for mutations only.

### 9.6 Layouts as architecture

S38: *"On navigation, layouts preserve state, remain interactive, and do not rerender."*

Consequence for placement: state that must survive route changes within a section belongs in a
layout (or a provider rendered by one), not in a page. Conversely, anything that must reset per
navigation must not live there. `PageProps<'/route'>` / `LayoutProps<'/route'>` are globally
available generated types — no manual `params` typing.

### 9.7 What this repo actually does (measured 2026-08-03)

`client/`, Next 15.1.3 / React 19, 7 routes, 1 layout, **0 route handlers, 0 server actions,
0 `server-only`**, 63 files carrying `'use client'`.

`app/layout.tsx` is a textbook RSC composition: an async Server Component reads
`getLocale()`/`getMessages()` server-side and passes serializable data into
`NextIntlClientProvider`, with `{children}` flowing through as a slot — exactly the S34 pattern,
and the provider wraps `<body>`'s contents rather than `<html>` per S34's depth advice.

Below that, three different boundary placements coexist:

| Pattern | Routes | Assessment |
|---|---|---|
| Server `page.tsx` → client `_components/<View>` | `agents/`, `settings/[section]/` | ✅ Boundary one level in; matches S34 and `AGENTS.md`'s "routes kept thin" |
| `'use client'` on `page.tsx`, still delegates to a view | `onboarding/` | ◐ Thin, but the route entry is needlessly in the client graph |
| `'use client'` + full implementation inline in `page.tsx` | `/`, `pulls/`, `pulls/[number]/`, `agents/[id]/` | ❌ Contradicts `AGENTS.md`'s documented "routes, kept thin" |

This is a **documented-convention-vs-reality gap**, not a bug — nothing here is incorrect
Next.js. It is the best available worked example for the skill: same framework, same repo,
three placements, one of them already written down as the intended one.

⚠️ Note the interaction with §9.2: in an app that is client-rendered below the route entry,
moving `'use client'` from `page.tsx` into `_components/` buys **no bundle reduction** — the
view is imported by the page either way. The real argument for the thin-server-entry pattern
here is consistency and keeping the option of server-side `params`/`metadata` open, not
bundle size. The skill should not overclaim a performance benefit it cannot demonstrate.

### 9.8 Conflict with the existing `next-best-practices` skill

[`next-best-practices/data-patterns.md`](../next-best-practices/data-patterns.md) opens with a
decision tree whose first two branches are *"From a Server Component? → Fetch directly (no API
needed)"* with `await db.user.findMany()`, and *"Is it a mutation? → Use: Server Action"*,
listing *"Direct database access"* as a benefit.

Both are architecturally ruled out in this repo. An agent following that skill in `client/`
would propose exactly what `client/AGENTS.md` forbids. The generic advice is correct for the
DAL branch of S36 — it just isn't the branch this project is on. The new skill must state the
project's branch up front so the decision tree is entered at the right node.

## 10. Full URL list (for the README)

Tier 1 — official/primary:
1. https://react.dev/learn/thinking-in-react
2. https://react.dev/learn/you-might-not-need-an-effect
3. https://react.dev/learn/choosing-the-state-structure
4. https://react.dev/learn/reusing-logic-with-custom-hooks
5. https://nextjs.org/docs/app/getting-started/project-structure
6. https://feature-sliced.design/docs/get-started/overview
7. https://github.com/feature-sliced/documentation
8. https://redux.js.org/style-guide/
9. https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html

Tier 2 — community references:
10. https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
11. https://kentcdodds.com/blog/colocation
12. https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
13. https://kentcdodds.com/blog/aha-programming
14. https://tkdodo.eu/blog/please-stop-using-barrel-files
15. https://tkdodo.eu/blog/effective-react-query-keys
16. https://tkdodo.eu/blog/deriving-client-state-from-server-state
17. https://tkdodo.eu/blog/react-query-and-forms
18. https://htmx.org/essays/locality-of-behaviour/
19. https://www.robinwieruch.de/react-folder-structure/
20. https://www.joshwcomeau.com/react/file-structure/
21. https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo
22. https://reacthandbook.dev/project-standards

Tier 3 — enforcement tooling:
23. https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md
24. https://github.com/javierbrea/eslint-plugin-boundaries
25. https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/
26. https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries
27. https://eslint.org/docs/latest/rules/no-magic-numbers

Tier 4 — supporting:
28. https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0
29. https://profy.dev/article/react-folder-structure
30. https://www.smashingmagazine.com/2021/08/compound-components-react/
31. https://felixgerschau.com/react-hooks-separation-of-concerns/
32. https://profy.dev/article/react-architecture-business-logic-and-dependency-injection
33. https://tailwindcss.com/docs/theme

Next.js architecture (§9):
34. https://nextjs.org/docs/app/getting-started/server-and-client-components
35. https://react.dev/reference/rsc/use-client
36. https://nextjs.org/docs/app/guides/data-security
37. https://nextjs.org/docs/app/guides/backend-for-frontend
38. https://nextjs.org/docs/app/getting-started/layouts-and-pages
39. https://vercel.com/academy/nextjs-foundations/client-server-boundaries

Also cited inline:
- https://www.sandimetz.com/blog/2016/1/20/the-wrong-abstraction (via S13)
- https://www.npmjs.com/package/server-only · https://www.npmjs.com/package/client-only (via S34/S36)
