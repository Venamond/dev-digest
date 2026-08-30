# Frontend Architecture skill — design

**Date:** 2026-08-04
**Status:** approved, ready for implementation planning
**Scope:** `.claude/skills/frontend-architecture/`, plus targeted fixes to
`react-best-practices` and `next-best-practices`. `server/` and
`reviewer-core/` are out of scope (covered by the separate
`onion-architecture` skill).

## Problem

`react-best-practices` and `next-best-practices` cover React/Next
*mechanics* well — hook rules, memoization, directives, async APIs — but
neither answers "where does this code go?" `react-best-practices` gives the
placement question ~10 lines under "Code Organization" (MEDIUM severity).
Nothing documents feature-folder boundaries, constants/utils placement,
business-logic location, or the `'use client'` boundary as an architectural
(not just mechanical) decision.

Worse, both sibling skills currently give advice this project does not
follow, and an agent that loads them while working in `client/` will
propose exactly what `client/AGENTS.md` forbids:

- `react-best-practices` states, under **CRITICAL**, that "Container
  components fetch data; presentational components receive props and
  render UI" — the container/presentational split Dan Abramov, its
  originator, publicly retracted in 2019 ("I don't suggest splitting your
  components like this anymore… Hooks let me do the same thing without an
  arbitrary division").
- `react-best-practices`' Tailwind section says "no inline `style={}`
  objects" — `client/` deliberately does the opposite: 23 colocated
  `styles.ts` files, 37 files using `style={` against 12 using
  `className=`.
- `next-best-practices/data-patterns.md` opens with a decision tree whose
  first two branches are "Server Component → fetch directly,
  `await db.user.findMany()`" and "mutation → Server Action", listing
  direct DB access as a benefit. `client/` has 0 route handlers, 0 server
  actions, 0 `server-only` imports — it talks only to the Fastify API via
  TanStack Query hooks, by explicit `client/AGENTS.md` convention.

None of these are defects in the sibling skills considered generically —
Next.js's own data-security guide names three valid data architectures and
says to pick one; this project is on "External HTTP APIs," which the docs
themselves recommend for apps with a separate backend team. The problem is
that the skills state one branch as if it were the only one, with no
pointer to the branch this project actually uses.

A full research pass (39+ sources: React docs, Next.js docs, Bulletproof
React, Feature-Sliced Design, Kent C. Dodds, TkDodo, Redux Style Guide,
Screaming Architecture, and others) is already written up at
`.claude/skills/frontend-architecture/references.md`, including a section
resolving where these sources disagree with each other.

## Goal

A project skill that answers "where does this code go?" for `client/`,
states this project's specific architectural decisions as decisions (not
generic advice), and removes the two live contradictions from the sibling
skills — without demanding a rewrite of existing code that doesn't yet
follow the rule.

**Non-goals:** rewriting `client/` to match the rules (tracked separately
in `deviations.md`, fixed later as its own task); introducing machine
enforcement (ESLint import boundaries, dependency-cruiser) — recommended as
future work, not wired up now, unlike the backend `onion-architecture`
skill's `dependency-cruiser` setup; touching `server/`, `reviewer-core/`, or
`e2e/`; duplicating content already owned by `react-best-practices`,
`next-best-practices`, or `react-testing-library`.

## Decisions taken

1. **Project-specific, not a generic React/Next primer.** Every rule that
   has a project-specific answer (data architecture, feature folder
   pattern, barrel files) states DevDigest's actual decision, cites why,
   and points at `references.md` for the source. Chosen over a
   universal/portable skill because the research showed the placement
   questions are exactly the ones where "it depends on the project"
   dominates — a universal skill would hedge on every rule that matters
   most here.
2. **Track deviations explicitly, don't silently enforce or silently
   ignore them.** `deviations.md` lists where `client/`'s current code
   doesn't follow a stated rule (e.g. four `page.tsx` files carry full
   `'use client'` implementations instead of delegating to
   `_components/<View>`; query keys have no factory). This prevents an
   agent from copying the nearest example verbatim, and doubles as the
   worklist for a later refactor task. Mirrors, in spirit, what
   `onion-architecture`'s baseline JSON does with `dependency-cruiser` —
   but as prose, since no enforcement tool is being introduced here.
3. **Fix the two sibling skills in place, narrowly.** `react-best-practices`
   keeps its content but drops the CRITICAL container/presentational rule
   in favor of "hooks are the seam" and gets a one-line pointer on Tailwind
   noting `client/`'s deliberate deviation. `next-best-practices/
   data-patterns.md` gets a project note before its decision tree, pointing
   to the branch this project is actually on. Neither file's existing
   content is rewritten wholesale — both stay useful for the mechanics they
   already cover.
4. **No enforcement tooling in this pass.** `onion-architecture` wired up
   `dependency-cruiser` because that was its own scoped plan. Introducing
   equivalent tooling for `client/` (e.g. `eslint-plugin-boundaries`) is a
   comparable-sized effort and stays out of scope here; the skill states
   the recommendation and defers to future work.

## Skill contents

```text
.claude/skills/frontend-architecture/
  SKILL.md          # principles + rules with severity levels, PROJECT rules called out
  examples.md        # before/after on real client/ code
  deviations.md       # registry of where client/ doesn't yet follow a stated rule
  references.md       # already written — 39+ sources, disagreements, consensus
```

### `SKILL.md` sections

Severity levels follow `react-best-practices`' CRITICAL/HIGH/MEDIUM
convention, plus a fourth: **PROJECT** — for this repo's specific
architectural decisions, to distinguish them from portable React/Next
practice.

1. **Data Architecture (PROJECT)** — all data access via TanStack Query
   hooks against the Fastify API; no Server Actions, no direct DB access,
   no Route Handlers as a proxy. States which of Next.js's three sanctioned
   data architectures this is ("External HTTP APIs") and why.
2. **Server/Client Boundary (CRITICAL)** — `'use client'` is a module-graph
   boundary, not a render-tree boundary; a Server Component passed as
   `children`/props stays server-rendered even when nested visually inside
   a Client Component. Push the directive to the leaves; providers wrap
   `{children}`, not the whole tree.
3. **Feature Folder Structure (CRITICAL)** — colocate under
   `_components/<Name>/`; shared code (>1 consumer) moves to
   `src/components/`, `src/lib/hooks/`, `src/lib/`; one-directional imports
   (shared → feature → route); no barrel files inside the app (the vendored
   packages' entry points are the sanctioned exception).
4. **Constants & Utils Placement (HIGH)** — feature-scoped constants stay
   with the feature; `utils/` = generic/portable, `helpers` = project-aware
   (named, not dumped); styles are colocated `styles.ts` (project convention,
   documented as a deliberate deviation from `react-best-practices`'
   Tailwind-only rule).
5. **Business Logic Placement (HIGH)** — derive, don't store; a hook only
   if it calls hooks (`use` prefix reserved for that); hooks are the seam
   between logic and rendering, not a mandated container/presentational
   file split.
6. **State Location (HIGH)** — state lives at the closest common parent and
   no higher; URL-dependent state goes in `searchParams`; server state
   stays in the TanStack Query cache, not copied into another store.
7. **Import Boundaries & Barrel Files (MEDIUM)** — direct imports over
   barrels; `import/no-restricted-paths` named as a future recommendation,
   not configured now.
8. **Known Deviations** — pointer to `deviations.md`, with the explicit
   instruction not to copy a deviation into new code.

### `examples.md`

Before/after pairs drawn from real `client/` files, matching the pattern
`onion-architecture/examples.md` uses (`modules/pulls/routes.ts` as the bad
case) rather than abstract samples — e.g. the `core.ts:50` /
`agents.ts:86` query-key mismatch as a "before," a key-factory version as
"after."

### `deviations.md`

Three entries:

1. **Thick route entries** — `app/page.tsx`,
   `pulls/page.tsx`, `pulls/[number]/page.tsx`, `agents/[id]/page.tsx` carry
   `'use client'` with the full implementation inline instead of
   delegating to `_components/<View>`.
2. **Query keys without a factory** — inline literals across
   `src/lib/hooks/*`; the `core.ts:50` ↔ `agents.ts:86`
   (`["provider-models", ...]`) cross-module coupling as the concrete
   example (already recorded in `client/INSIGHTS.md`).
3. **Styles note** — not a deviation from *this* skill (it codifies
   `styles.ts` as the norm); a cross-reference explaining why
   `react-best-practices`' Tailwind-only rule is intentionally not applied
   in `client/`.

Each entry: rule → who violates it → "do not copy this pattern into new
code; refactor is separate work."

## Sibling skill fixes

**`react-best-practices/SKILL.md`:**

- Under "Component Design" (CRITICAL), replace the container/presentational
  line with: prefer hooks as the seam between logic and rendering over a
  mandated container/presentational file split (cite the 2019 retraction).
- Under "Tailwind CSS" (MEDIUM), add a note that `client/` deliberately
  uses colocated `styles.ts` instead, pointing at
  `frontend-architecture/deviations.md`.

**`next-best-practices/data-patterns.md`:**

- Insert a project note before the decision tree: this tree assumes
  Next.js owns the data layer; `client/` is on a different, equally valid
  architecture ("External HTTP APIs") — see
  `frontend-architecture/SKILL.md` § Data Architecture, skip this tree in
  `client/`, use TanStack Query hooks against the Fastify API instead.

Both fixes are insertions with a pointer to the new skill — neither
rewrites the sibling's existing content.

## Documentation integration

- `.claude/skills/README.md` — new catalog row for `frontend-architecture`,
  matching the format of the existing rows (skill / scope / description).
- `client/AGENTS.md` — no changes planned; its existing conventions (e.g.
  "`src/lib/hooks/*` — one TanStack Query hook per API resource") already
  agree with the new skill. Confirm this holds during implementation; if a
  gap surfaces, add a pointer the same way `server/AGENTS.md` points at
  `onion-architecture`.
- `client/INSIGHTS.md` — already carries two relevant entries from this
  session's research (the `next-best-practices` data-pattern conflict, the
  Tailwind/`styles.ts` conflict); the skill's `deviations.md` cites them
  rather than duplicating their content.

## Verification

The work is done when: `SKILL.md`, `examples.md`, `deviations.md` exist and
`references.md` is linked from `SKILL.md`; every code reference in
`examples.md`/`deviations.md` points at a real, current file/line in
`client/`; the two sibling-skill edits are applied and don't remove any
content unrelated to the two named contradictions; `.claude/skills/
README.md` lists the new skill; no runtime code in `client/` is modified
(this is a documentation-only change, consistent with the "no enforcement
tooling in this pass" non-goal).

## Risks

- **Skill overlap with `react-best-practices` / `next-best-practices`
  re-emerges over time** as those skills evolve independently. Mitigation:
  each file states its delegation boundary explicitly (this skill: *where*
  code goes; siblings: *how* to write it), same pattern
  `onion-architecture` uses against `clean-ddd-hexagonal`.
- **`deviations.md` goes stale** if the four thick route entries get fixed
  without updating the file. Mitigation: the entry says explicitly it's a
  worklist, and `client/INSIGHTS.md`'s "on finishing work here" convention
  already prompts a re-read of related docs.
- **Sibling-skill edits are contentious** if `react-best-practices` is also
  used outside this repo (it isn't marked as project-specific the way
  `frontend-architecture` will be). Mitigation: both edits are narrow
  (one bullet, one project note) and don't touch content that would be
  wrong in a different project.

## Sources

Full annotated list with per-claim citations already at
`.claude/skills/frontend-architecture/references.md` (39+ sources across
four tiers, plus a section on where sources disagree and how this design
resolves each disagreement). Not duplicated here.
