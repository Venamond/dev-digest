# PR list: total review cost + findings hover preview

Status: approved (2026-08-02)

## Context

`GET /repos/:id/pulls` (`server/src/modules/pulls/routes.ts`) drives the PR
list table. Two of its per-PR columns were already fixed once this session
for the same underlying issue — a review run fans out to one `reviews` /
`agent_runs` row per reviewer agent (General/Security/Performance/…), and
several list columns picked only the single "latest" row instead of
aggregating:

- `findings` (severity counts) — fixed in a prior change: now summed across
  every `reviews` row for the PR.
- `cost_usd` — still "latest run's cost" (`latestCostByPr`, `orderBy(desc(ranAt))`,
  first seen per PR). Not yet fixed.

Separately, the PR list's findings badge shows only counts (2 critical, 1
warning, …) with no way to see *what* they are without opening the PR. A
provided mockup shows a hover popover on that badge listing the individual
findings (severity icon, title, category tag, `file:line`, confidence %,
truncated description).

This spec covers both: (1) sum cost across all runs like findings already
are, and (2) add the findings hover preview.

## 1. Total cost per PR

### Change

In `server/src/modules/pulls/routes.ts`, replace `latestCostByPr` (keeps the
first-seen-newest cost per PR) with a sum across every `agent_runs` row for
the PR:

- Query `{ prId, costUsd }` for `agent_runs` where `prId IN (...)`.
- Group by `prId`; sum `costUsd`, **ignoring `null` rows** (a run whose model
  has no known price).
- If a PR has at least one run with a known cost, return the sum of the
  known ones (matches how `SUM()` in SQL treats NULL — this is done in JS
  since the existing pattern already pulls rows into a Map instead of a SQL
  aggregate, for consistency with the sibling `findingsByPr` block).
- If a PR has runs but **all** of them have `null` cost, return `null` (cost
  is unknown, not zero — don't let missing prices masquerade as "free").
- If a PR has no runs at all, return `null` (unchanged from today).

No contract/type change: `PrMeta.cost_usd` stays `number | null`.

### Out of scope

- Scoping cost to "runs against the current head_sha" — `agent_runs` doesn't
  record which commit it reviewed, so this isn't derivable without a schema
  change. Matches the same scoping decision already made for `findings`.
- Changing `score` — still latest-review semantics, untouched (not reported
  as wrong).

### Test

Extend `server/test/reviews.it.test.ts` (same shape as the existing findings
regression test): run 2 agents with different mock costs against one PR,
assert the list endpoint's `cost_usd` equals their sum.

## 2. Findings hover preview

### Data source

No new backend endpoint. The existing `GET /pulls/:id/reviews` (used by the
PR-detail page to build `allFindings`) already returns every review + its
findings for a PR, in the same `ReviewDtoFinding` shape `FindingCard`
consumes. The popover fetches this on demand and flattens it the same way
the detail page does (`reviews.flatMap(r => r.findings)`) — guaranteeing the
preview's contents always match the badge's counts (both are now "every
finding across every review for the PR").

### Trigger & lifecycle

- Hover target: the **findings cell** in `PRRow`
  (`client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`), not
  the whole row (the row's own `onClick` already navigates to the PR).
- On `mouseEnter`, start a ~200ms timer before firing the fetch (avoids
  firing on fast mouse-throughs while scanning the list).
- Fetch via a new TanStack Query hook, e.g. `usePrReviews(prId)`
  (`src/lib/hooks/`), `enabled: false` until hover, `staleTime` long enough
  (e.g. 60s) that re-hovering the same row within a browsing session doesn't
  refetch.
- Dismiss: close when the pointer leaves both the cell AND the popover
  itself — implement with a shared small grace delay (~150ms) on
  `mouseLeave` of a wrapping container so moving from the badge into the
  popover to scroll doesn't flicker-close it.
- Only one popover open at a time (closing any previous one when a new cell
  is hovered) — same as any single-instance tooltip.

### Popover content

- Header: `{count} FINDINGS` (new i18n key, see below), where `{count}` is
  the same total already shown in the badge (critical+warning+suggestion).
- Loading state: brief skeleton/spinner while the debounced fetch is in
  flight (usually invisible — findings are small payloads).
- Empty state: shouldn't normally occur (the badge is only rendered when
  `findings` has a nonzero total), but if the fetch resolves to zero findings
  (race with a delete), just don't render the popover.
- List: every finding, sorted by severity (critical → warning → suggestion),
  each rendered as a **new compact, read-only** component (not a reuse of
  `FindingCard`, which carries accept/dismiss actions and click-to-expand
  irrelevant here):
  - severity icon + color (reuse `SEV` tokens, same as the badge)
  - title (bold)
  - `CategoryTag` (existing component)
  - `file:line` (existing `MonoLink`/`lineLabel` helpers, monospace, muted —
    **not a clickable GitHub link** here, since MVP has no click behavior)
  - confidence % (existing `ConfidenceNum`)
  - `rationale`, truncated (CSS line-clamp, ~2 lines — no "read more", this
    is a preview, not the full finding view)
- No accept/dismiss actions, no expand-on-click, no navigation on click
  (confirmed MVP scope — clicking a finding does nothing).
- Scrollable if the list is tall (`max-height` + `overflow-y: auto`), so PRs
  with many findings don't produce an oversized popover.

### New component

`client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/`
(colocated with `PRRow`, per this package's `_components/<Name>` convention)
— owns the hover/debounce/dismiss state, the query, and rendering the compact
finding rows.

### i18n

Add to `client/messages/en/prReview.json` under `list`:
```json
"findingsPreview": {
  "title": "{count} FINDINGS"
}
```
(Loading/empty states use existing generic strings if any fit, otherwise
inline minimal fallback text is acceptable for a transient loading spinner —
no new keys needed for a state that's usually invisible.)

### Tests

- `FindingsPreviewPopover.test.tsx`: renders findings sorted by severity,
  truncates rationale, shows the count in the header, renders nothing when
  the resolved list is empty.
- `PRRow.test.tsx` (existing file): hovering the findings cell triggers the
  debounced fetch (fake timers), popover appears with mocked data.

## Non-goals

- Click-through from a popover finding to the PR detail page (explicitly
  deferred per this session's discussion — future enhancement if requested).
- Scoping cost or findings to a specific commit/head — out of scope, same
  reasoning as the earlier findings fix.
- Any change to `score`'s "latest review" semantics.
