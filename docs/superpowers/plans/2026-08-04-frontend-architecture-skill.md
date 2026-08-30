# Frontend Architecture Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task in this session. Do NOT use
> subagent-driven-development or any per-task implementer+reviewer subagent
> pair — the user explicitly requested a single straightforward execution
> path for this volume of work. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Ship a project skill at `.claude/skills/frontend-architecture/`
that documents where code goes in `client/` (feature folders, constants,
business logic, state, the `'use client'` boundary, the data architecture),
and fix two live contradictions in the sibling `react-best-practices` /
`next-best-practices` skills that currently tell an agent to do the
opposite of what this project does.

**Architecture:** Documentation-only. No runtime code changes, no new
tooling or enforcement (unlike the backend `onion-architecture` skill,
which wired up `dependency-cruiser` — that is explicitly out of scope
here, see the design spec's Non-goals). Four new/existing files in
`.claude/skills/frontend-architecture/` (`references.md` already exists
from this session's research; `SKILL.md`, `examples.md`, `deviations.md`
are created by this plan), two narrow edits to existing sibling skills, one
new catalog row.

**Tech Stack:** Markdown only. No code, no build, no test runner involved.

## Global Constraints

- **No runtime code changes.** Every file this plan touches is markdown
  under `.claude/skills/` or `docs/`. `client/`'s actual source is read
  for verification only, never modified.
- **No new tooling.** Do not add `eslint-plugin-boundaries`,
  `dependency-cruiser`, or any config file. The skill states enforcement
  as a future recommendation in prose only.
- **Every code reference must point at a real, current file/line.** This
  plan's steps include the exact grep/read commands to re-verify each
  citation before it's written down, because source files can drift
  between planning and execution.
- **Sibling-skill edits are insertions, not rewrites.** Do not reformat,
  reorder, or restate any existing content in `react-best-practices` or
  `next-best-practices` beyond the exact lines named in each task.
- **Module docs are named `AGENTS.md`**, each directory has a `CLAUDE.md`
  symlink to it (repo-wide convention from root `CLAUDE.md`). This plan
  does not touch any `AGENTS.md`/`CLAUDE.md` file, so no symlink is at
  risk — noted here only because Task 5's verification sweep confirms it.
- **Full source citations already exist** at
  `.claude/skills/frontend-architecture/references.md` (committed this
  session, 39+ sources, §1–§10). Every task below cites the exact
  `references.md` section backing its content instead of re-deriving
  claims.

## File structure

| File | Responsibility |
| --- | --- |
| `.claude/skills/frontend-architecture/SKILL.md` | Create — frontmatter, 8 rule sections with severity, pointers to the other 3 files |
| `.claude/skills/frontend-architecture/examples.md` | Create — 3 before/after pairs from real `client/` code |
| `.claude/skills/frontend-architecture/deviations.md` | Create — 3 entries: thick route entries, query-key factory gap, styles cross-reference |
| `.claude/skills/frontend-architecture/references.md` | Already exists — no changes in this plan |
| `.claude/skills/react-best-practices/SKILL.md` | Modify — replace 1 bullet (container/presentational), add 1 line (Tailwind note) |
| `.claude/skills/next-best-practices/data-patterns.md` | Modify — insert 1 project-note block before the decision tree |
| `.claude/skills/README.md` | Modify — add 1 catalog row |

---

### Task 1: `SKILL.md` — frontmatter and the 8 rule sections

The skill's entry point. Every later task's content is referenced from
here, so this is written first even though `examples.md` and
`deviations.md` don't exist yet — their sections just link forward to
files Task 2/3 will create.

**Files:**

- Create: `.claude/skills/frontend-architecture/SKILL.md`

**Interfaces:**

- Produces: the skill name `frontend-architecture`, referenced by
  `.claude/skills/README.md` (Task 5) and the two sibling-skill edits
  (Task 4).
- Consumes: nothing — this is the first task.

- [ ] **Step 1: Re-verify the four cited facts before writing them down**

Run each command and confirm the expected output — source files can drift
between spec-writing and implementation.

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/client/src

# Expect: agents.ts:86 declares ["provider-models", provider]; core.ts:50 invalidates ["provider-models"]
grep -n 'provider-models' lib/hooks/agents.ts lib/hooks/core.ts

# Expect: all four files below still contain "use client" on an early line
grep -l '"use client"' app/page.tsx "app/repos/[repoId]/pulls/page.tsx" "app/repos/[repoId]/pulls/[number]/page.tsx" "app/agents/[id]/page.tsx"

# Expect: 23 (or note the new count if it has changed — update Step 3 below to match)
find . -name "styles.ts" | wc -l
```

If any of these no longer matches, update the numbers in Step 3 before
writing them — do not commit stale citations.

- [ ] **Step 2: Write the frontmatter**

```markdown
---
name: frontend-architecture
description: "Where code goes in DevDigest's client/ package — feature folder boundaries, constants vs utils placement, business logic location, state location, and the 'use client' server/client boundary as an architectural decision. Use when creating a new route or component, deciding where a piece of logic or a constant belongs, deciding whether something needs to be a Client Component, or reviewing a client/ diff for placement. States this project's specific architecture (TanStack Query against the Fastify API, no Server Actions, no direct DB access) as a decision, not a suggestion. Trigger terms: folder structure, where does this go, feature folder, use client boundary, barrel file, query key, colocation, client architecture. For hook rules, memoization, keys, and accessibility use react-best-practices instead; for Next.js mechanics (async params, metadata, bundling, hydration) use next-best-practices instead — this skill carries only placement and architecture decisions, not mechanics."
metadata:
  tags: architecture, frontend, client, nextjs, react, folder-structure
---
```

- [ ] **Step 3: Write the body, section by section**

```markdown
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
```

- [ ] **Step 4: Verify the frontmatter parses and internal links resolve**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
head -5 .claude/skills/frontend-architecture/SKILL.md
```

Expected: starts with `---`, second line `name: frontend-architecture`.

```bash
grep -oE '\]\([a-zA-Z0-9_.#-]+\)' .claude/skills/frontend-architecture/SKILL.md | sort -u
```

Expected output includes `](references.md)`, `](references.md#92-...)`,
`](references.md#94-...)`, `](references.md#31-bulletproof-react)`,
`](references.md#5-tier-4--supporting--secondary)`, `](deviations.md)` (x3),
`](examples.md)`. The `deviations.md` and `examples.md` links won't
resolve to files yet (created in Tasks 2–3) — that's expected at this
point; Task 3's Step 4 does the final link check once both files exist.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/frontend-architecture/SKILL.md
git commit -m "docs(skills): add frontend-architecture skill entry point"
```

---

### Task 2: `examples.md` — before/after pairs from real code

**Files:**

- Create: `.claude/skills/frontend-architecture/examples.md`

**Interfaces:**

- Consumes: the section names from Task 1's `SKILL.md` (this file's
  headings should map onto those sections so a reader can jump straight
  from a rule to its worked example).

- [ ] **Step 1: Re-verify the query-key example still matches the source**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/client/src/lib/hooks
sed -n '80,91p' agents.ts
sed -n '38,55p' core.ts
```

Confirm `agents.ts` still declares `useProviderModels` with
`queryKey: ["provider-models", provider]` around line 86, and `core.ts`
still has `useTestConnection`'s `onSuccess` invalidating
`queryKey: ["provider-models"]` around line 50. If line numbers moved,
update Step 2 below to match the current numbers.

- [ ] **Step 2: Write the file**

```markdown
# Frontend Architecture — Examples

Real before/after pairs from `client/`. See
[SKILL.md](SKILL.md) for the rules these illustrate.

## Query keys: implicit coupling vs. a factory

**Before** (current state — `src/lib/hooks/agents.ts` and
`src/lib/hooks/core.ts`):

\`\`\`ts
// agents.ts:84-91
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// core.ts:38-54 (useTestConnection)
onSuccess: (res) => {
  if (res.ok) {
    qc.invalidateQueries({ queryKey: ["provider-models"] });
    qc.invalidateQueries({ queryKey: ["secrets-status"] });
  }
},
\`\`\`

This works — TanStack Query matches `["provider-models"]` as a prefix of
`["provider-models", provider]` — but nothing in `core.ts` points at
`agents.ts`, or vice versa. Rename the key in one file and the
invalidation in the other silently stops working; nothing catches it at
compile time.

**After** (factory pattern, per
[references.md §3.3](references.md#33-tkdodo-dominik-dorfmeister)):

\`\`\`ts
// agents.ts — near the top, exported so other modules can reference it
export const agentKeys = {
  all: ["agents"] as const,
  providerModels: (provider: Provider | null | undefined) =>
    ["provider-models", provider] as const,
  providerModelsAll: () => ["provider-models"] as const,
};

export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: agentKeys.providerModels(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// core.ts
import { agentKeys } from "./agents";

onSuccess: (res) => {
  if (res.ok) {
    qc.invalidateQueries({ queryKey: agentKeys.providerModelsAll() });
    qc.invalidateQueries({ queryKey: ["secrets-status"] });
  }
},
\`\`\`

Now a rename is a TypeScript error in every consumer, not a silent gap.
Not yet applied in this repo — see [deviations.md](deviations.md).

## Server/client boundary: thick route entry vs. thin route entry

**Before** (current state — `src/app/agents/[id]/page.tsx`, first 12 lines):

\`\`\`tsx
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { AgentCard } from "../_components/AgentCard";
import { AgentEditor } from "./_components/AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "../../../lib/hooks/agents";
\`\`\`

The route entry itself is a Client Component with the full page assembled
inline below this excerpt.

**After** (the pattern already used correctly elsewhere in this repo —
`src/app/agents/page.tsx`, in full):

\`\`\`tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
\`\`\`

`AgentsPage` stays a Server Component; `'use client'` lives one level down
in `AgentsListView`. `agents/[id]/page.tsx` doesn't yet follow this — see
[deviations.md](deviations.md).

## Constants & styles: colocated `styles.ts`, not Tailwind classes

`react-best-practices` says "no inline `style={}` objects." `client/` does
the opposite on purpose — e.g.
`src/app/agents/_components/AgentsListView/styles.ts` defines style objects
consumed by the component next to it, rather than Tailwind utility classes
in the JSX. Follow the `styles.ts` pattern for new components in this
package; see [deviations.md](deviations.md) for why the generic rule is
overridden here.
```

- [ ] **Step 3: Confirm the fenced code blocks are balanced**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
grep -c '```' .claude/skills/frontend-architecture/examples.md
```

Expected: an even number (each opened fence has a matching close).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/frontend-architecture/examples.md
git commit -m "docs(skills): add frontend-architecture before/after examples"
```

---

### Task 3: `deviations.md` — the registry, and closing the link check

**Files:**

- Create: `.claude/skills/frontend-architecture/deviations.md`

**Interfaces:**

- Consumes: Task 1's `SKILL.md` (this file is linked from three of its
  sections) and Task 2's `examples.md` (cross-referenced for the worked
  version of two of these entries).
- Produces: the last piece `SKILL.md`'s internal links depend on — this
  task's Step 3 is where the full link check from Task 1 Step 4 finally
  passes end-to-end.

- [ ] **Step 1: Write the file**

```markdown
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
```

- [ ] **Step 2: Re-verify the styles.ts count one more time**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/client/src
find . -name "styles.ts" | wc -l
```

If the count differs from 23, update the number in `deviations.md` before
committing.

- [ ] **Step 3: Full internal-link check across all three files**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/.claude/skills/frontend-architecture
for f in SKILL.md examples.md deviations.md; do
  grep -oE '\]\(([a-zA-Z0-9_.#-]+)\)' "$f" | sed -E 's/^\]\(([^)#]+).*/\1/' | sort -u
done | sort -u | while read -r target; do
  [ -z "$target" ] && continue
  [ -f "$target" ] || echo "BROKEN LINK TARGET: $target"
done
```

Expected: no `BROKEN LINK TARGET` lines — `SKILL.md`, `examples.md`,
`deviations.md`, `references.md` all resolve to files in this directory.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/frontend-architecture/deviations.md
git commit -m "docs(skills): add frontend-architecture known-deviations registry"
```

---

### Task 4: Fix the two sibling-skill contradictions

Two files, three total edits, each a narrow insertion — no existing
content is rewritten.

**Files:**

- Modify: `.claude/skills/react-best-practices/SKILL.md`
- Modify: `.claude/skills/next-best-practices/data-patterns.md`

**Interfaces:**

- Consumes: the skill name `frontend-architecture` and file names from
  Tasks 1–3 (this task links to specific sections that must already
  exist).

- [ ] **Step 1: Replace the container/presentational bullet in `react-best-practices`**

Current text (verify it's still there before editing — `SKILL.md:20-24`):

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
sed -n '20,24p' .claude/skills/react-best-practices/SKILL.md
```

Expected: line 24 reads
`- Container components fetch data; presentational components receive props and render UI`

Then replace that exact line:

Old:

```markdown
- Container components fetch data; presentational components receive props and render UI
```

New:

```markdown
- Prefer hooks as the seam between logic and rendering over a mandated
  container/presentational file split — the pattern's own originator
  (Dan Abramov) retracted it in 2019: "I don't suggest splitting your
  components like this anymore... Hooks let me do the same thing without
  an arbitrary division." See `frontend-architecture/SKILL.md` § Business
  Logic Placement for how this project applies that.
```

- [ ] **Step 2: Add the Tailwind cross-reference**

Current text — verify `SKILL.md:115-121` still reads as expected:

```bash
sed -n '115,121p' .claude/skills/react-best-practices/SKILL.md
```

Expected: starts with `## Tailwind CSS (MEDIUM)`, first bullet
`- Use utility classes for all styling — no inline \`style={}\` objects`.

Add one line immediately after the `## Tailwind CSS (MEDIUM)` heading
(before the first bullet):

```markdown
> **Project note:** `client/` deliberately does the opposite of this
> section — colocated `styles.ts` JS style objects, not Tailwind utility
> classes. See `frontend-architecture/deviations.md` for why. If you're
> working in `client/`, follow that convention instead of this section.
```

- [ ] **Step 3: Verify both edits landed correctly and nothing else changed**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
git diff .claude/skills/react-best-practices/SKILL.md
```

Expected: exactly one line removed (the container/presentational bullet),
one multi-line bullet added in its place, and one blockquote line added
after the Tailwind heading. No other lines touched.

- [ ] **Step 4: Insert the project note in `next-best-practices/data-patterns.md`**

Current text — verify lines 1-6 still match:

```bash
sed -n '1,6p' .claude/skills/next-best-practices/data-patterns.md
```

Expected:

```markdown
# Data Patterns

Choose the right data fetching pattern for each use case.

## Decision Tree
```

Insert this block immediately after `Choose the right data fetching
pattern for each use case.` and before `## Decision Tree`:

```markdown
> **Project note:** this decision tree assumes Next.js owns the data layer
> (direct DB access, Server Actions). `client/` in this repo is on a
> different, equally valid Next.js data architecture — see
> `frontend-architecture/SKILL.md` § Data Architecture. In `client/`, skip
> this tree: use TanStack Query hooks against the Fastify API instead.
```

- [ ] **Step 5: Verify this edit landed correctly**

```bash
git diff .claude/skills/next-best-practices/data-patterns.md
```

Expected: exactly one new block inserted, nothing else changed —
`## Decision Tree` and everything below it byte-identical to before.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/react-best-practices/SKILL.md .claude/skills/next-best-practices/data-patterns.md
git commit -m "docs(skills): reconcile react/next-best-practices with client/'s actual architecture"
```

---

### Task 5: Catalog row and final verification sweep

**Files:**

- Modify: `.claude/skills/README.md`

- [ ] **Step 1: Confirm `client/AGENTS.md` doesn't need a pointer**

The design spec expects this to already hold — `client/AGENTS.md`'s
existing conventions (`_components/<Name>/` colocation, one hook per API
resource, `src/lib/api.ts` as the single fetch chokepoint) were read and
confirmed consistent with this skill's rules during design. Re-confirm
here, since the file could have changed since then:

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
grep -n '_components\|lib/hooks\|lib/api\.ts' client/AGENTS.md
```

Expected: still shows the `_components/<Name>/` colocation line, the
`src/lib/hooks/*` line, and the `src/lib/api.ts` line, none of which
contradict `frontend-architecture/SKILL.md`. If any of these lines is
gone or now says something that contradicts the new skill, add a one-line
pointer to `frontend-architecture/SKILL.md` in `client/AGENTS.md`'s
"Read when" table (same pattern `server/AGENTS.md` uses for
`onion-architecture`) before continuing — otherwise, no edit needed here.

- [ ] **Step 2: Add the catalog row**

Current table — verify row order/format first:

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest
sed -n '7,19p' .claude/skills/README.md
```

Expected: header row, separator row, then 10 skill rows ending with
`mermaid-diagram`.

Insert a new row. Match the existing table's grouping by inserting it
next to the other two Frontend-scoped rows (after `react-testing-library`,
before `zod`'s Full-stack group):

Old (the line immediately before the insertion point):

```markdown
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
```

New (same line, plus the new row after it):

```markdown
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | Where code goes in `client/` — feature folders, constants, business logic, state, `use client` boundary |
```

- [ ] **Step 3: Verify the table still renders as valid markdown**

```bash
grep -c '^|' .claude/skills/README.md
```

Expected: one more than before the edit (12 → 13, since the file had 12
`|`-prefixed lines: 1 header + 1 separator + 10 rows).

- [ ] **Step 4: Full sweep — every new/edited file, every reference resolves**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest

# All four skill files exist
ls .claude/skills/frontend-architecture/{SKILL.md,examples.md,deviations.md,references.md}

# Frontmatter is well-formed
head -1 .claude/skills/frontend-architecture/SKILL.md

# Every client/ file path cited anywhere in the new skill actually exists
grep -ohE 'src/(app|lib|components)/[a-zA-Z0-9_/.\[\]-]*\.tsx?' \
  .claude/skills/frontend-architecture/{SKILL.md,examples.md,deviations.md} \
  | sort -u | while read -r f; do
    [ -f "client/$f" ] || echo "MISSING: client/$f"
  done

# No runtime code was touched
git diff --stat -- client/ server/ reviewer-core/ e2e/
```

Expected: all four skill files present; frontmatter starts with `---`; no
`MISSING:` lines; the last command produces **no output** (empty diff —
confirms this plan touched documentation only).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/README.md
git commit -m "docs(skills): add frontend-architecture to the skill catalog"
```

---

## Out of scope

Deliberately not in this plan, per the design spec's Non-goals: fixing the
four thick route entries or introducing a query-key factory in
`src/lib/hooks/` (tracked in `deviations.md` as follow-up work, not done
here); any ESLint or `dependency-cruiser` enforcement for `client/`;
changes to `client/AGENTS.md` (the spec notes its existing conventions
already agree with this skill — if a gap is found during Task 5's
verification sweep, report it, don't silently add a fix outside this
plan's file list); anything in `server/`, `reviewer-core/`, or `e2e/`.
