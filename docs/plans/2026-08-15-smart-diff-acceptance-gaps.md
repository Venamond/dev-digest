# Development Plan: Smart Diff — closing the 3 unmet acceptance criteria

- **Date:** 2026-08-15
- **Author:** planner
- **Status:** draft — the human flips this to `approved` before implementation

## 0. Context & scope

- **Task:** Smart Diff (`docs/plans/2026-08-14-smart-diff.md`, approved and
  implemented) meets 2 of the course's 5 acceptance criteria. Close the other
  three — **per-line finding markers in Smart mode (#1)**, a **large-file
  highlight (#3)**, and **click-a-finding → that finding's card in the runs
  tab (#4)** — as a **client-only** change.

- **In scope** (all under `client/`):
  - **#4, the load-bearing one.** A new URL param `?finding=<id>` on the PR
    detail route. Clicking any finding affordance in the diff performs a real
    route change (`router.replace`) to `?tab=findings&finding=<id>`; the runs
    tab force-opens the owning `ReviewRunAccordion`, force-expands the
    `FindingCard`, focuses it and scrolls it into view.
  - **#1.** A `FindingMarker` rendered directly beneath the code line whose
    `newNo` equals the finding's `start_line`, in **Smart order only**.
  - **#3.** A per-file "Large file" highlight on the `FileCard` header, driven
    by a new named constant in `client/src/components/diff-viewer/constants.ts`.
  - **Deletion** of the now-purposeless in-diff jump machinery: `target.ts`
    (`DiffLineTarget`), the `target` / `nonce` props on `DiffViewer`,
    `DiffGroupSection`, `FileCard`, the `anchorRef` on `CodeLine`, the
    `onJumpToLine` callback and the `findingLines` prop (§2b).

- **Out of scope:**
  - **Any edit to `server/`.** No route, no service, no `pure/` constant, no
    test. The gap analysis found #2 (zero tokens) already proven by
    `server/test/smart-diff.it.test.ts`; nothing this plan does can spend a
    token, and the cheapest proof of that is that `git diff --stat server/`
    stays empty.
  - **Any edit to `vendor/shared` (either copy).** Verified: `Finding`
    (`client/src/vendor/shared/contracts/findings.ts:46-61`) already carries
    `id: z.string()`, `file: z.string()`, `start_line: z.number().int()`, and
    `FindingRecord` (`contracts/review-api.ts:15-20`) extends it with
    `review_id` / `accepted_at` / `dismissed_at`. `PrDetailView.tsx:63-66`
    already computes `allFindings`. The `(path, line) → finding.id` join is
    entirely client-side. **No resync, no contract edit.**
  - Any DB migration, any `reviewer-core` change, any `e2e/` flow.
  - Criteria **#2** and **#5** — already met (§5 traceability table cites the
    existing green tests that must stay green).
  - Persisting the Smart/Original toggle, the `SmartDiffViewer` banner, and
    `SmartDiffFile.finding_lines` as a *server* concern — the contract field
    stays, the client simply stops reading it (§2b).
  - LEFT-side (deleted-line) anchoring. Findings carry new-file line numbers;
    a finding anchored only to a `del` line gets no marker, only the header
    badge (§2c Data sources).

- **Definition of done:**
  1. `cd client && pnpm test` and `cd client && pnpm typecheck` both exit 0.
  2. Every row of the §5 acceptance-criteria table is green.
  3. `grep -rn "DiffLineTarget\|onJumpToLine\|findingLines" client/src`
     returns **nothing** — the replaced machinery is deleted, not orphaned.
  4. `git diff --stat -- server reviewer-core e2e '*/vendor/shared'` is empty.
  5. `./scripts/check-shared-sync.sh` prints its in-sync message — because
     nothing changed there, not because a resync was run.
  6. `cd server && pnpm verify:l03` and
     `cd server && pnpm exec vitest run smart-diff` still pass unchanged.

## 1. Affected modules

| Module | Package manager | Layer / area | Constraint from INSIGHTS.md |
|---|---|---|---|
| `client/src/components/diff-viewer/**` | pnpm | shared component | `client/INSIGHTS.md`, Codebase Patterns: components under `src/components/**` call `useTranslations("shell")` — every new string goes in `client/messages/en/shell.json` under `diffViewer.*`, **never** `prReview.json`, or it renders as a raw key path and `pnpm typecheck` says nothing. Styling is colocated JS objects in `styles.ts`, never Tailwind. |
| `client/src/app/.../_components/{FindingCard,FindingsPanel,ReviewRunAccordion,FindingsTab,PrDetailView,DiffTab}` | pnpm | feature-colocated UI | `client/AGENTS.md`: every `_components/<Name>` with real logic ships a colocated `.test.tsx`; copy goes in `messages/en/prReview.json`. |
| `client/messages/en/{shell,prReview}.json` | pnpm | i18n | `client/INSIGHTS.md`, Recurring Errors: a **second top-level key of the same name** silently shadows the first (`JSON.parse` keeps the last). `diffViewer` and `findingsTab` blocks already exist — add **sub-keys inside them**. Verify first with `grep -n '"diffViewer":' client/messages/en/shell.json` (must print exactly one line). |
| `client/src/app/.../_components/FindingCard/styles.ts` | pnpm | styles | `client/INSIGHTS.md`, Recurring Errors: never pair `borderColor` (a 4-side shorthand) with `borderLeftColor`. `FindingCard/styles.ts` `card()` is the already-fixed reference pattern; `diff-viewer/styles.ts` `fileCard` must adopt it when it gains a state-dependent border (S4). |
| **`server/**` — NOT edited** | pnpm | all rings | #2 is already met and proven server-side; touching the server would put the "zero tokens" evidence at risk for no gain. `server/INSIGHTS.md`'s two live traps (`.nullable()` response-schema → `500`; a cruiser regex that matches nothing reports 0 violations) are therefore both moot here. |
| **`client/src/vendor/shared/**` and `server/src/vendor/shared/**` — NOT edited** | — | ring 0 | The contract already carries `id`, `file`, `start_line`. §0. |
| **`reviewer-core/**`, `e2e/**`, `server/src/db/**` — NOT edited** | npm / pnpm | — | No engine slot, no browser flow, no migration. |
| **`client/src/app/.../_components/SmartDiffViewer/**` — NOT edited** | pnpm | feature UI | The Smart/Original toggle and the `too_big` banner already satisfy their half of #1 and #5; `SmartDiffViewer.test.tsx` must stay green untouched. |
| **`client/src/app/.../RunTraceDrawer/_components/FindingsSection/**` — NOT edited** | pnpm | feature UI | It renders findings inside the trace **drawer** — i.e. exactly the "popup" criterion #4 forbids as a destination. |
| **`client/src/components/findings-preview/**` — NOT edited** | pnpm | shared component | `FindingsPreviewPanel` renders findings in a hover popover on the Timeline (`RunHistory/RunRow.tsx:82`). Also a popup; also not the destination. |

## 2. Constraints

- **dependency-cruiser rules touched: none.** `client/` has no
  `.dependency-cruiser.cjs` (verified: the file does not exist) and no
  `arch:check` script (`client/package.json:5-11` has exactly `dev`, `build`,
  `start`, `typecheck`, `test`). `server/.dependency-cruiser.cjs` and
  `reviewer-core/.dependency-cruiser.cjs` are untouched because no server file
  changes, so `.dependency-cruiser-known-violations.json` cannot move.
- **`vendor/shared` mirroring required: no.** Nothing under `vendor/shared`
  changes. `./scripts/check-shared-sync.sh` runs in §5 purely as a guard.
- **DB migration required: no.**
- **`reviewer-core` purity affected: no** — untouched.
- **Client import direction** (`frontend-architecture`, Feature Folder
  Structure; **not machine-enforced in this repo** — review by eye):
  `client/src/components/diff-viewer/**` must **not** import anything from
  `client/src/app/**/_components/**`. Concretely, `FindingMarker` must **not**
  import `SEV_COLOR` from
  `_components/FindingCard/constants.ts` — see §2b for the sanctioned
  duplicate.
- **`'use client'`**: every file this plan touches already carries the
  directive or is a non-component module (`constants.ts`, `styles.ts`,
  `helpers.ts`). No route `page.tsx` gains one.
- **Other constraints:** `client/tsconfig.json` — narrow indexed access rather
  than `!`-asserting; the existing code already does (`findingLines[0]` guarded
  with `if (first !== undefined)` in `FileCard.tsx:122-123`).

## 2b. Decisions and rejected alternatives

| Decision | Alternative considered | Why rejected |
|---|---|---|
| **Every finding affordance in the diff navigates to the runs tab** — both the per-line `FindingMarker` and the existing "N findings" header badge call the same `onOpenFinding(findingId)`. | Keep the badge doing the in-diff `onJumpToLine` scroll and give only the new per-line marker the navigation. | Criterion #4 says "clicking **a finding**" without naming an affordance. A grader who clicks the most visible one (the header badge) and gets an in-diff scroll instead of a navigation fails the criterion, and the reviewer has no way to know which affordance was meant. One rule for both is the only reading that cannot fail. It is also the answer to the "reconcile #1 and #4" question: #1 decides *where a finding is visible*, #4 decides *what clicking it does*, and they compose without conflict. |
| **Delete** `DiffLineTarget` / `target` / `nonce` / `anchorRef` / `onJumpToLine` / `findingLines` outright. | Leave them in place "in case the in-diff jump is wanted later". | Once both affordances navigate, nothing constructs a `DiffLineTarget`: the entry point is gone, so the two force-expand effects in `FileCard.tsx:71-80`, the one in `DiffGroupSection.tsx:39-42`, the `anchorRef` plumbing in `CodeLine.tsx:24,44` and the whole of `target.ts` become unreachable code that four test files still pin. Leaving them is dead weight that will read as an unfinished feature to the next agent. The cost of the deletion is that a collapsed boilerplate file with a finding now needs two clicks to reveal its line — acceptable, because the badge on that same collapsed header already navigates. |
| **The client renders both the badge and the markers from `allFindings`** (`PrDetailView.tsx:63-66`, `runs.flatMap(r => r.findings)`), joined by `finding.file` / `finding.start_line`; **`SmartDiffFile.finding_lines` is no longer read by the client.** | Keep rendering counts and markers from `finding_lines`, and look the finding id up separately when a click happens. | **`finding_lines` is `number[]`** (`contracts/brief.ts`, `SmartDiffFile.finding_lines`) — it carries line numbers and **no finding id at all**, while criterion #4 requires navigating to a specific `finding.id`. Only `allFindings` has ids. That settles it on its own; no argument about set membership is needed. **Consequence the implementer must know: this changes no rendered value.** `smart-diff/repository.ts`'s `findingLinesByFile` filters `eq(t.reviews.kind, 'review')`, and `reviewsForPull` (`server/src/modules/reviews/repository/review.repo.ts:58-74`) is `select().from(t.reviews).where(eq(t.reviews.prId, prId))` with **no `kind` predicate**, so `finding_lines ⊆ allFindings` — and the subset is not proper today, because the only writer of a review row is `run-executor.ts:342`, which hardcodes `kind: 'review'` (the seeds do too, `seed.ts:143`, `:493`, `:508`). **The two sets are identical.** Every existing badge-count expectation stays valid; there is no count drift to hunt for, and nothing to "fix" server-side. See §8 for the hypothetical divergence. |
| The URL patch is `{ tab: "findings", finding: <id>, severity: null }`, applied in **one** `router.replace`. | Two successive `setParam` calls (`setParam("tab","findings")`, then `setParam("finding", id)`). | `setParam` (`PrDetailView.tsx:54-59`) rebuilds `URLSearchParams` from the `search` snapshot captured on that render, so two calls in one handler both read the pre-navigation snapshot and the second overwrites the first — the `tab` change would be lost. Hence a new `setParams(patch)` and `setParam` delegating to it. Clearing `severity` is load-bearing: `visibleFindings` (`FindingsPanel/helpers.ts:14-25`) drops every finding whose severity ≠ the active `?severity=` filter, so arriving with a stale filter would land on an empty panel. |
| Navigation uses `router.replace`, not `router.push`. | `push`, so browser Back returns to the diff tab. | `?tab=` has always been a `replace` in this view (`PrDetailView.tsx:58`); making one tab transition push would give the PR page two inconsistent history behaviours. Consistency with the app's existing routing is what "through the app's standard routing" means here. |
| `setTab` clears `?finding=`: `setTab = (t) => setParams({ tab: t, finding: null })`. | Leave `finding` in the URL until it is overwritten. | Otherwise every later manual return to the runs tab re-fires the scroll and re-focuses a card the user did not ask for, and the "finding not available" notice can outlive its cause. Clearing on an explicit tab click also makes clicking the *same* finding twice work with no `nonce`: the round trip diff → findings → diff wipes the param, so the second click is a real param change. |
| Arrival marking reuses the **existing** `focused` treatment: `FindingsPanel` sets `focusIdx` to the target's index, `FindingCard` renders `s.card(focused, …)` (`FindingCard/styles.ts:5-23`). | A new "just arrived" highlight style with its own timer/fade. | The severity-coloured ring + `boxShadow` already exists and already means "this is the card in play"; it also hands the j/k keyboard navigation (`FindingsPanel.tsx:52-65`) a sensible starting index instead of resetting to 0. A second, competing highlight would be a new style for a state the component already models. |
| `visibleFindings` gains a 4th arg `keepId?: string | null` that exempts one finding from both filters. | An effect in `FindingsPanel` that force-toggles `hideLow` off on arrival. | The filter is already a pure, testable function; adding an exemption there is one line per filter and is unit-testable in `FindingsPanel/helpers.test.ts`. Mutating `hideLow` behind the user's back silently changes an unrelated, user-set toggle and is untestable without rendering. |
| The **per-line marker** and the **large-file highlight** are **Smart-order only**, gated on one explicit `smart?: boolean` prop threaded `DiffViewer → DiffGroupSection → FileCard`. The **header findings badge** stays visible in **both** orders. | (a) Derive "am I in Smart mode" implicitly from `role !== undefined`. (b) Show the highlight in both orders. | (a) is exactly the kind of implicit coupling that breaks the next time `role` is passed for another reason; `smart` is greppable and testable directly. (b): criterion #1 defines Original as the plain mode and the previous plan pinned "Original order is exactly today's behaviour"; the header badge is the one exception that already shipped in both orders and is *not* "on a line", so #1's literal wording ("findings are NOT visible **on lines**") is satisfied. See §8 for the one-line change if the course intends #3 in both modes. |
| `LARGE_FILE_CHANGED_LINES = 300`, a **new** constant beside `AUTO_EXPAND_MAX_LINES` in `client/src/components/diff-viewer/constants.ts`. | Reuse `AUTO_EXPAND_MAX_LINES = 200` for the highlight too. | Two different questions — "too big to auto-expand" and "big enough to flag as risky" — that must be able to move independently; reusing one constant makes every collapsed file also a flagged file and drains the flag of meaning. Keeping `LARGE > AUTO_EXPAND` also makes the two rules nest rather than conflict (§4 S4's test pins both on one example). The number itself is a project choice, not something the course states — §8. |
| The highlight renders on the **`FileCard` header** (a chip + a 3px left border), not on the group row. | Mark the whole `DiffGroupSection` header when it contains a large file. | The criterion is about *a file*. A group-level mark cannot say *which* file, and the `core` group would be flagged almost always. |
| `ReviewRunAccordion` force-**opens** for a target finding but does **not** `scrollIntoView`. | Scroll the accordion too, mirroring its existing `targetRunId` effect (`ReviewRunAccordion.tsx:52-58`). | Two scrolls race and the last one wins non-deterministically; the card's own scroll is the one the criterion asks for ("navigate to that specific finding's **card**", not to the top of its run). The existing `targetRunId` effect is untouched and still scrolls, because *that* feature does target the run. |
| A `?finding=<id>` that matches no finding renders a notice in `FindingsTab` and nothing else happens. | Silently ignore it, or fall back to opening the first finding. | "Record it, don't invent it": a deleted run or a shared stale link must not be indistinguishable from a working one, and must never scroll the user to a *different* finding than the one in the URL. |

## 2c. Architecture of the change

### Layers / ownership

- **ring 0 (`vendor/shared`, both copies)** — **unchanged.** Supplies
  `FindingRecord`, `Finding.id/file/start_line`, `SmartDiff`, `SmartDiffRole`.
- **`server/` (all rings)** — **unchanged.**
- **`reviewer-core/`** — gains **nothing.** No slot, no type, no I/O.
- **client shared (`src/components/diff-viewer/`)** — owns the per-line
  `FindingMarker`, the large-file threshold and its styling, and the
  `path → findings` grouping. Emits `onOpenFinding(findingId)` upward; knows
  nothing about routing, tabs or `next/navigation`.
- **client feature (`_components/DiffTab`)** — a pass-through: hands
  `findings` and `onOpenFinding` from its parent into `DiffViewer`. Loses its
  `target` state.
- **client feature (`_components/PrDetailView`)** — the **only** place that
  touches the URL. Owns `setParams`, reads `?finding=`, and is the closest
  common parent of the two tabs (`frontend-architecture`, State Location).
- **client feature (`_components/{FindingsTab,ReviewRunAccordion,FindingsPanel,FindingCard}`)** —
  the arrival leg: thread `targetFindingId` down and open/focus/scroll.

### Unchanged

`server/**` (every ring), `server/src/vendor/shared/**`,
`client/src/vendor/shared/**`, `reviewer-core/**`, `e2e/**`,
`server/src/db/**`, `client/src/lib/hooks/**` (no new query, no new key —
`queryKeys.smartDiff` at `keys.ts:36` and `useSmartDiff` at
`reviews.ts:164-170` are already correct), `_components/SmartDiffViewer/**`,
`RunTraceDrawer/_components/FindingsSection/**`,
`client/src/components/findings-preview/**`. Reasons in §1 and §2b.

### Data sources

| Read | From | Notes |
|---|---|---|
| The finding set | `allFindings` in `PrDetailView.tsx:63-66` — `React.useMemo(() => runs.flatMap((r) => r.findings), [reviews])`, type `FindingRecord[]` | Already exists. Passed **down** into `DiffTab` (new prop) as well as `FindingsTab` (already passed, `PrDetailView.tsx:129`). It is the **same list the runs tab renders cards from**, which is what guarantees every marker and badge has a destination. |
| Anchor line | `FindingRecord.start_line` (`contracts/findings.ts:52`, `z.number().int()`, non-optional) | Matched against `Line.newNo` from `parsePatch` (`diff-viewer/helpers.ts:4-9,21-37`). |
| Anchor file | `FindingRecord.file` (`contracts/findings.ts:51`) matched by **exact string equality** against `PrFile.path`. | No normalization. A non-matching `file` yields no badge and no marker; the finding still has a card in the runs tab. |
| Finding id | `FindingRecord.id` (`contracts/findings.ts:47`) | The value put into `?finding=`. **`SmartDiffFile.finding_lines` cannot supply this** — it is `number[]` — which is why the client reads `allFindings` instead (§2b). |
| File size for #3 | `PrFile.additions` + `PrFile.deletions` (`contracts/platform.ts:186-192`, both `z.number().int()`, non-optional) | These are **changed** lines, not the file's total length — the full file is never fetched. The constant is named `LARGE_FILE_CHANGED_LINES` to say so. |
| Smart-mode flag | `grouped && !!smartDiff` inside `DiffViewer` | Same expression the existing grouped/flat branch already uses (`DiffViewer.tsx:49`), hoisted to a `const smart`. |
| Target finding | `useSearchParams().get("finding")` in `PrDetailView` | `null` when absent. |

- **Never sent to a model:** nothing. This change makes no network request at
  all; it renders data two existing queries already fetched.
- **Missing / unavailable, recorded not invented:**
  - `PrFile.patch` is `.nullish()` (`contracts/platform.ts:190`) →
    `parsePatch` returns `[]` → `diffViewer.noDiffText` renders as today, no
    markers. The header badge still renders and still navigates.
  - A finding whose `start_line` matches **no** rendered line — because it is
    outside every hunk, or anchored to a `del` line (`del` lines carry
    `oldNo` only, `helpers.ts:28`) — produces **no marker**. It is not moved to
    a nearby line and not dropped from the count: the header badge still
    counts it and still navigates to its card.
  - `findings` empty or `undefined` → no badge, no markers, no highlight
    change.
  - `?finding=<id>` present but matching no `allFindings` entry (deleted run,
    stale shared link) → `FindingsTab` renders
    `prReview.findingsTab.findingNotFound`; no accordion opens, no scroll, no
    throw.
  - `smartDiff` still loading or errored → `grouped` already falls back to the
    flat list (`DiffViewer.tsx:49`); `smart` is `false`, so no markers and no
    highlight, and the badge still works.

### Call sequence

No network hop. `?finding=` is the only new state, and it lives in the URL.

```mermaid
sequenceDiagram
  autonumber
  participant M as FindingMarker.tsx (or FileCard header badge)
  participant FC as FileCard.tsx
  participant DV as DiffViewer.tsx
  participant DT as DiffTab.tsx
  participant PV as PrDetailView.tsx
  participant R as next/navigation router
  participant FT as FindingsTab.tsx
  participant RA as ReviewRunAccordion.tsx
  participant FP as FindingsPanel.tsx
  participant CD as FindingCard.tsx
  M->>FC: onOpenFinding(f.id)
  FC->>DV: onOpenFinding(f.id)
  DV->>DT: onOpenFinding(f.id)
  DT->>PV: onOpenFinding(f.id)
  PV->>PV: setParams(OPEN_FINDING_PATCH(id))  %% tab=findings, finding=id, severity=null
  PV->>R: router.replace(`/repos/:repoId/pulls/:number?` + patchedSearch(...))
  R-->>PV: re-render, search.get("tab")==="findings", search.get("finding")===id
  PV->>FT: targetFindingId=id (+ existing allFindings, runs)
  Note over FT: id ∉ allFindings → render findingNotFound notice, stop here
  FT->>RA: targetFindingId=id  (each accordion)
  RA->>RA: containsFinding → setOpen(true)   %% no scrollIntoView here
  RA->>FP: targetFindingId=id
  FP->>FP: visibleFindings(findings, hideLow, severityFilter, keepId=id); setFocusIdx(index)
  FP->>CD: targeted={f.id === id}, focused={i === focusIdx}
  CD->>CD: setExpanded(true); rootRef.current.scrollIntoView({block:"center"})
```

- **LLM calls: 0.** No `client/src/lib/api.ts` call is added; no query key, no
  hook, no mutation. The only new client state is a URL search param.
- **The inner component that does the diff-side work is `FileCard`**, not
  `DiffViewer`. `DiffViewer` groups `findings` by `path` once
  (`React.useMemo`); `FileCard` groups its own slice by `start_line` and passes
  the per-line slice into `CodeLine` as a named `findings` prop.
- **The inner component that does the arrival work is `FindingCard`**, not
  `FindingsTab`. The new value is threaded as a named prop at every hop:
  `targetFindingId` on `FindingsTab` → `ReviewRunAccordion` → `FindingsPanel`,
  then narrowed to a boolean `targeted` on `FindingCard`.

### Schema

**Unchanged.** No table, no column, no `ALTER`, no file under
`server/src/db/migrations/`. This change reads only data the client already
holds in the TanStack Query cache.

### API

**Unchanged.** No new endpoint, no changed response, no new query key. The
existing `GET /pulls/:id/smart-diff` (`queryKeys.smartDiff`,
`useSmartDiff`) and `GET /pulls/:id/reviews` (`usePrReviews`) are both already
called by `PrDetailView` / `DiffTab`. Navigation is a client-side
`router.replace` on the same route — no HTTP request, no status code.

### Prompt builder

**Unchanged.** No `assemblePrompt`, no `PromptParts` slot, no `wrapUntrusted`
decision — this change is entirely presentational and touches no server file.

### UI

- **Screen:** the PR detail page, both tabs —
  `client/src/app/repos/[repoId]/pulls/[number]/`.
- **New shared component:**
  `client/src/components/diff-viewer/FindingMarker/{FindingMarker.tsx,index.ts}`
  (mirrors the sibling `CodeLine/`, `FileCard/`, `DiffGroupSection/` layout,
  each of which ships an `index.ts`). Rendered by `CodeLine` **beneath** the
  code row, inside the existing `cs.rowWrap` wrapper, above any comment
  threads. Content: `<SeverityBadge severity={f.severity as Severity} compact />`
  + the finding title + `Icon.ArrowRight`, inside a `<button type="button">`
  with `aria-label={t("diffViewer.openFinding", { title: f.title })}`. Multiple
  findings on one line render as multiple markers, in the order they appear in
  `findings`.
- **Changed shared components:** `CodeLine` (gains `findings` +
  `onOpenFinding`, loses `anchorRef`), `FileCard` (gains `smart`, `findings`,
  `onOpenFinding`; loses `findingLines`, `target`, `onJumpToLine` and both
  target effects; badge now navigates; header gains the large-file chip),
  `DiffGroupSection` and `DiffViewer` (thread the new props, drop `target`).
- **Deleted:** `client/src/components/diff-viewer/target.ts`, and its
  re-export from `client/src/components/diff-viewer/index.ts:5`.
- **Large-file highlight (#3):** on the `FileCard` header — a 3px left border
  in `var(--warn)` on the card plus a `diffViewer.largeFile` chip beside the
  `+/−` stat, with a `title` of `diffViewer.largeFileTitle`. Smart order only.
- **Empty parent states:** the runs tab already renders `EmptyState` when
  `runs.length === 0` (`FindingsTab.tsx:181-188`); a `?finding=` that lands
  there shows the not-found notice **above** it and never a blank screen. A
  boilerplate group is collapsed by default (#5) — the marker inside it exists
  in the DOM only once both the group and the card are opened; the header badge
  is the affordance that works while collapsed.
- **Query keys:** none added, none changed.
- **i18n split** (`client/INSIGHTS.md`, namespace follows component location):
  - `client/messages/en/shell.json`, **inside the existing `diffViewer`
    block**: `openFinding` = `"Open finding: {title}"`,
    `largeFile` = `"Large file"`,
    `largeFileTitle` = `"{count} changed lines — review with extra care"`.
  - `client/messages/en/prReview.json`, **inside the existing `findingsTab`
    block**: `findingNotFound` = `"That finding is no longer available — its
    review run may have been deleted."`
  - **Before editing either file**, run
    `grep -n '"diffViewer":' client/messages/en/shell.json` and
    `grep -n '"findingsTab":' client/messages/en/prReview.json`; each must
    print exactly one line. Adding a *second* block of the same name is a
    silent no-op, not a merge.
- **Backward compatibility:** every new prop is optional, so each step below
  typechecks on its own.

### Logging / observability

**Unchanged, and deliberately so.** `RunLogger`
(`server/src/platform/run-logger.ts`) — real signatures
`event(kind: RunEventKind, msg: string, data?: unknown): void`,
`info(msg: string, data?: unknown): void`,
`tool(msg: string, data?: unknown): void` (**`tool` takes a human message, not
a tool id**) — is a *server* API over a `runId`; this change has no run and
constructs no logger. The persisted `run_traces.log` / `trace.tool_calls[]`
channel is likewise a server write from `run-executor.ts`; **no
`tool_calls` entry is appended**, which is the mechanical form of "Smart Diff
still spends no tokens". No `console.*` is added on the client.
**Must never appear anywhere:** finding rationale/evidence text or patch bodies
in a URL, a `title` attribute or a log line — the `?finding=` param carries a
uuid and nothing else. **Token / cost fields:** none; `agent_runs.cost_usd`,
`RunStats.cost_usd` and `trace.stats` are not touched.

## 3. Skill routing

| Step | Files | Skills the implementer must apply |
|---|---|---|
| S1 | `_components/FindingCard/{FindingCard.tsx,styles.ts,FindingCard.test.tsx}` | `frontend-architecture`, `react-best-practices`, `react-testing-library` |
| S2 | `_components/FindingsPanel/{helpers.ts,helpers.test.ts,FindingsPanel.tsx,FindingsPanel.test.tsx}` | `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert` |
| S3 | `_components/ReviewRunAccordion/{ReviewRunAccordion.tsx,ReviewRunAccordion.test.tsx}`, `_components/FindingsTab/{FindingsTab.tsx,styles.ts,FindingsTab.test.tsx}`, `client/messages/en/prReview.json` | `frontend-architecture`, `react-best-practices`, `react-testing-library` |
| S4 | `components/diff-viewer/{constants.ts,styles.ts}`, `components/diff-viewer/FileCard/{FileCard.tsx,FileCard.test.tsx}`, `client/messages/en/shell.json` | `frontend-architecture`, `react-best-practices`, `react-testing-library` |
| S5 | `components/diff-viewer/FindingMarker/*` (new), `components/diff-viewer/{CodeLine/CodeLine.tsx,FileCard/FileCard.tsx,FileCard.test.tsx,styles.ts,constants.ts}`, `client/messages/en/shell.json` | `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert` |
| S6 | `components/diff-viewer/{DiffViewer/DiffViewer.tsx,DiffViewer/DiffViewer.test.tsx,DiffGroupSection/DiffGroupSection.tsx,index.ts,target.ts (deleted)}`, `_components/DiffTab/DiffTab.tsx` | `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert` |
| S7 | `_components/PrDetailView/{PrDetailView.tsx,helpers.ts,helpers.test.ts,PrDetailView.test.tsx}` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library` |

Verified against `.claude/skills/*/SKILL.md` on 2026-08-15: the available set is
unchanged from the 2026-08-14 plan — `drizzle-orm-patterns`,
`engineering-insights`, `fastify-best-practices`, `frontend-architecture`,
`mermaid-diagram`, `next-best-practices`, `onion-architecture`,
`postgresql-table-design`, `pr-self-review`, `react-best-practices`,
`react-testing-library`, `security`, `typescript-expert`, `zod`. No new skill
appeared. **Not routed and why:** `onion-architecture`,
`fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`,
`zod` — no server, DB or contract file changes. `security` — the change adds no
auth path, no upload, no secret; the one new input is a `?finding=` search
param used solely for an `===` comparison against ids the client already holds,
never interpolated into a URL, a query or `dangerouslySetInnerHTML`.

## 4. Steps

Every new prop below is **optional**, so each step compiles and its tests pass
on its own. Track **A** (S1→S2→S3) is the *arrival* leg inside the runs tab;
track **B** (S4→S5→S6) is the *departure* leg inside the diff. Their file sets
are disjoint, neither reads the other's output, and neither touches
`vendor/shared`, the DB schema or any contract — so they may run in parallel.
**S7 joins them** and must run last.

### S1. `FindingCard` opens, scrolls and marks itself when targeted

- **Files:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` (existing)
  - `.../FindingCard/styles.ts` (existing)
  - `.../FindingCard/FindingCard.test.tsx` (existing)
- **Change:** add one optional prop to the existing signature
  (`FindingCard.tsx:26-42`), which today is
  `{ f, focused, defaultExpanded, onAction, pending, repoFullName, headSha }`:
  `targeted?: boolean`. Keep `data-finding-id={f.id}` (`FindingCard.tsx:55`).
  - Add `const rootRef = React.useRef<HTMLDivElement | null>(null);` and
    `ref={rootRef}` on the same root `<div>` that carries `data-finding-id`.
  - Add:
    ```tsx
    React.useEffect(() => {
      if (!targeted) return;
      setExpanded(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [targeted]);
    ```
    `expanded` is already `React.useState(defaultExpanded ?? false)`
    (`FindingCard.tsx:44`) — a mount-time seed only, which is why a prop-driven
    effect is required rather than a changed default.
  - In `styles.ts`, add `scrollMarginTop: 16` to the object returned by
    `card(focused, sevColor, muted)` (`FindingCard/styles.ts:5-23`) so the
    scrolled card does not sit flush under the sticky header. **Do not** add a
    new border property: that function is the repo's reference fix for the
    `borderColor` + `borderLeftColor` shorthand warning
    (`client/INSIGHTS.md`, Recurring Errors) and must stay all-longhand.
  - The arrival ring is the **existing** `focused` treatment; no new style.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Test:** `FindingCard.test.tsx` (existing file, new `describe` block). Add
  `Element.prototype.scrollIntoView = vi.fn();` at module scope (jsdom has no
  implementation — same guard as `FileCard.test.tsx:11`).
  - `targeted` with `defaultExpanded` **omitted** → the rationale text
    (`"A **live** Stripe key is committed in source."` renders as
    `A live Stripe key is committed in source.`) is in the document, and
    `scrollIntoView` was called once. *This is the trap case:* the card's
    collapsed default must not survive the target.
  - `targeted` **absent** → the card is collapsed and `scrollIntoView` was
    called zero times.
  - the two existing smoke tests still pass unchanged.
- **Definition of done:** `cd client && pnpm exec vitest run FindingCard` exits 0
  with the two new cases plus the three existing ones.
- **Depends on:** none
- **Track:** A

### S2. `FindingsPanel` exempts and focuses the target finding

- **Files:**
  - `.../_components/FindingsPanel/helpers.ts` (existing)
  - `.../_components/FindingsPanel/helpers.test.ts` (**new**)
  - `.../_components/FindingsPanel/FindingsPanel.tsx` (existing)
  - `.../_components/FindingsPanel/FindingsPanel.test.tsx` (existing)
- **Change:**
  - `helpers.ts` — the real current signature is
    `export function visibleFindings(findings: FindingRecord[], hideLow: boolean, severityFilter?: string | null): FindingRecord[]`
    (`FindingsPanel/helpers.ts:14-25`). Add a 4th parameter
    `keepId?: string | null` and exempt it from **both** filters:
    ```ts
    if (hideLow) shown = shown.filter((f) => f.id === keepId || f.confidence >= LOW_CONFIDENCE_THRESHOLD);
    if (severityFilter) shown = shown.filter((f) => f.id === keepId || f.severity === severityFilter);
    ```
    The final `sort` by `SEVERITY_ORDER` is unchanged. `isTypingTarget` is
    untouched.
  - `FindingsPanel.tsx` — add `targetFindingId?: string | null` to the props
    (currently `{ findings, prId, repoFullName, headSha, severityFilter }`,
    `FindingsPanel.tsx:15-28`). Pass it as `keepId` into the existing
    `React.useMemo` at `:36-39`, adding `targetFindingId` to the dep array.
    Add, after that memo:
    ```tsx
    React.useEffect(() => {
      if (!targetFindingId) return;
      const i = shown.findIndex((f) => f.id === targetFindingId);
      if (i >= 0) setFocusIdx(i);
    }, [targetFindingId, shown]);
    ```
    and pass `targeted={f.id === targetFindingId}` to `FindingCard` at
    `:81-90`. Do **not** touch the `panelActive` / j-k / a-d effects
    (`:43-65`) — those are the shortcut-scoping fix recorded in
    `client/INSIGHTS.md` and regressed by an existing test.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Test:**
  - `helpers.test.ts` (new): `visibleFindings([crit(0.2), warn(0.9)], true, null)`
    drops the 0.2-confidence finding; the same call with
    `keepId = <that finding's id>` **keeps** it. And
    `visibleFindings(FINDINGS, false, "WARNING", "f1")` returns both `f1`
    (CRITICAL, exempted) and `f2` (WARNING). *These are the trap cases:* a
    target the user's own filters would otherwise hide.
  - `FindingsPanel.test.tsx` (existing): add — rendering with
    `severityFilter="WARNING"` **and** `targetFindingId="f1"` shows
    `"Hardcoded secret"` (CRITICAL) as well as `"N+1 query"`; and after
    `pointerDown` inside the panel, `keyDown "a"` mutates **`f1`**, not `f2`,
    proving `focusIdx` moved to the target. The existing five cases stay green.
- **Definition of done:** `cd client && pnpm exec vitest run FindingsPanel` exits 0.
- **Depends on:** S1
- **Track:** A

### S3. `ReviewRunAccordion` force-opens; `FindingsTab` threads the target and reports a stale one

- **Files:**
  - `.../_components/ReviewRunAccordion/ReviewRunAccordion.tsx` (existing)
  - `.../_components/ReviewRunAccordion/ReviewRunAccordion.test.tsx` (**new**)
  - `.../_components/FindingsTab/FindingsTab.tsx` (existing)
  - `.../_components/FindingsTab/styles.ts` (existing)
  - `.../_components/FindingsTab/FindingsTab.test.tsx` (existing)
  - `client/messages/en/prReview.json` (existing)
- **Change:**
  - `ReviewRunAccordion.tsx` — add `targetFindingId?: string | null` to the
    props (currently `{ review, prId, defaultOpen, repoFullName, headSha,
    targetRunId, targetNonce, severityFilter }`, `:27-48`). Add:
    ```tsx
    const containsFinding = !!targetFindingId && review.findings.some((f) => f.id === targetFindingId);
    React.useEffect(() => {
      if (containsFinding) setOpen(true);
    }, [containsFinding, targetFindingId]);
    ```
    **Do not** call `rootRef.current?.scrollIntoView` here (§2b) and **do not**
    modify the existing `targetRunId` effect at `:52-58`, which legitimately
    both opens and scrolls for the Timeline feature. Forward
    `targetFindingId={targetFindingId}` to `FindingsPanel` at `:167-173`.
  - `FindingsTab.tsx` — add `targetFindingId?: string | null` to
    `FindingsTabProps` (`:17-34`). Compute
    `const targetMissing = !!targetFindingId && !allFindings.some((f) => f.id === targetFindingId);`
    and, when true, render a notice `<div style={s.findingNotFound}>` with
    `t("findingsTab.findingNotFound")` immediately after the `lethalTrifecta`
    block (`:138-146`) and before the timeline. Pass
    `targetFindingId={targetFindingId}` into each `ReviewRunAccordion`
    (`:192-202`).
  - `FindingsTab/styles.ts` — add `findingNotFound`, a
    `satisfies CSSProperties` object in the same idiom as the neighbouring
    `lethalTrifecta`: muted border/background, `fontSize: 13`,
    `color: "var(--text-muted)"`. **No Tailwind classes.**
  - `client/messages/en/prReview.json` — add `findingNotFound` **inside** the
    existing `findingsTab` block. Confirm with
    `grep -n '"findingsTab":' client/messages/en/prReview.json` that exactly
    one such block exists before editing.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Test:**
  - `ReviewRunAccordion.test.tsx` (new). Mock the one hook it imports:
    `vi.mock("../../../../../../../lib/hooks/reviews", () => ({ useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }), useFindingAction: () => ({ mutate: vi.fn(), isPending: false }) }))`
    — both names are required because `FindingsPanel` imports the second from
    the same module and Vitest throws on a missing named export from a mocked
    module. `Element.prototype.scrollIntoView = vi.fn();`. Render with
    `defaultOpen={false}` and a `ReviewRecord` whose `findings` contains `f1`.
    - **The headline case for criterion #4:** with `targetFindingId="f1"`, the
      collapsed accordion opens, `f1`'s title is in the document, its
      *rationale* is in the document (the card auto-expanded), and
      `scrollIntoView` was called. *Trap:* with `targetFindingId` absent the
      accordion stays closed and the title is absent.
    - `targetFindingId` naming a finding that belongs to a **different** run
      leaves this accordion closed.
  - `FindingsTab.test.tsx` (existing, `ReviewRunAccordion` already mocked at
    `:18-20`): with `targetFindingId="ghost"` and a non-empty `allFindings`
    that does not contain it, the not-found notice renders; with
    `targetFindingId` equal to a real id, it does not. The two existing smoke
    tests stay green.
- **Definition of done:** `cd client && pnpm exec vitest run ReviewRunAccordion FindingsTab`
  exits 0, and `grep -c '"findingsTab":' client/messages/en/prReview.json`
  prints `1`.
- **Depends on:** S2
- **Track:** A

### S4. Large-file highlight (#3) — constant, styles, `FileCard` header

- **Files:**
  - `client/src/components/diff-viewer/constants.ts` (existing)
  - `client/src/components/diff-viewer/styles.ts` (existing)
  - `client/src/components/diff-viewer/FileCard/FileCard.tsx` (existing)
  - `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (existing)
  - `client/messages/en/shell.json` (existing)
- **Change:**
  - `constants.ts` (today: `AUTO_EXPAND_MAX_LINES = 200` and
    `HUNK_HEADER_RE`) — add:
    ```ts
    /** A file whose changed-line count (additions + deletions) exceeds this is
     *  highlighted in Smart order. Deliberately above AUTO_EXPAND_MAX_LINES so
     *  a highlighted file is always also collapsed, never the reverse. */
    export const LARGE_FILE_CHANGED_LINES = 300;
    ```
  - `styles.ts` — convert the static `s.fileCard` object (`styles.ts:8-13`,
    currently `border: "1px solid var(--border)"`) into
    `fileCard: (large: boolean): CSSProperties => ({ ... })`, written
    **all-longhand** exactly like `FindingCard/styles.ts:5-23`:
    `borderStyle: "solid"`, `borderWidth: 1`,
    `borderTopColor` / `borderRightColor` / `borderBottomColor`:
    `"var(--border)"`, `borderLeftWidth: large ? 3 : 1`,
    `borderLeftColor: large ? "var(--warn)" : "var(--border)"`, plus the
    existing `borderRadius: 7`, `overflow: "hidden"`,
    `background: "var(--bg-elevated)"`. Never pair `borderColor` with
    `borderLeftColor` (`client/INSIGHTS.md`). Add a `largeChip` style: small
    pill, `fontSize: 12`, `color: "var(--warn)"`, transparent background.
    `s.fileCard` has exactly one consumer (`FileCard.tsx:98`).
  - `FileCard.tsx` — add `smart?: boolean` to the props (currently
    `{ file, commenting, role, findingLines, target, onJumpToLine }`, `:38-52`).
    Compute
    `const changedLines = (file.additions ?? 0) + (file.deletions ?? 0);`
    (reuse the same expression the collapse seed at `:57-61` already uses) and
    `const large = !!smart && changedLines > LARGE_FILE_CHANGED_LINES;`.
    Apply `style={s.fileCard(large)}` on the root, and render, right after the
    `+/−` stat span (`:105-108`):
    ```tsx
    {large && (
      <span style={s.largeChip} title={t("diffViewer.largeFileTitle", { count: changedLines })}>
        {t("diffViewer.largeFile")}
      </span>
    )}
    ```
    `t` is the existing `useTranslations("shell")` at `:53`.
  - `client/messages/en/shell.json` — add `largeFile` and `largeFileTitle`
    **inside** the existing `diffViewer` block. Confirm with
    `grep -n '"diffViewer":' client/messages/en/shell.json` first.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Test:** `FileCard.test.tsx` (existing file, new `describe`). **One example,
  both rules** — the two thresholds must nest, not conflict:
  - a file with `additions: 250, deletions: 0` and `smart` → the card is
    **collapsed** (250 > `AUTO_EXPAND_MAX_LINES`) and **not** highlighted
    (`queryByText("Large file")` is null);
  - the same file with `additions: 350` and `smart` → **collapsed and**
    highlighted;
  - `additions: 350` with `smart` **omitted** (Original order) → no chip. *This
    is the byte-identical-Original trap.*
  - the existing role-collapse and badge tests stay green.
- **Definition of done:** `cd client && pnpm exec vitest run FileCard` exits 0,
  and `grep -c '"diffViewer":' client/messages/en/shell.json` prints `1`.
- **Depends on:** none
- **Track:** B

### S5. Per-line `FindingMarker` (#1) + both affordances navigate (#4, diff side)

- **Files:**
  - `client/src/components/diff-viewer/FindingMarker/FindingMarker.tsx` (**new**)
  - `client/src/components/diff-viewer/FindingMarker/index.ts` (**new**)
  - `client/src/components/diff-viewer/constants.ts` (existing)
  - `client/src/components/diff-viewer/styles.ts` (existing)
  - `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` (existing)
  - `client/src/components/diff-viewer/FileCard/FileCard.tsx` (existing)
  - `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (existing)
  - `client/messages/en/shell.json` (existing)
- **Change:**
  - `constants.ts` — add a **local** severity→token map. It duplicates
    `SEV_COLOR` in `_components/FindingCard/constants.ts` **on purpose**: that
    file lives in a feature folder and a shared component must not import from
    `src/app/**/_components/**` (`frontend-architecture`, §2). Name it
    distinctly so the duplication is visible:
    ```ts
    /** Duplicated from _components/FindingCard/constants.ts — a shared
     *  component may not import from a feature folder. Keep in step. */
    export const MARKER_SEVERITY_COLOR: Record<string, string> = {
      CRITICAL: "var(--crit)", WARNING: "var(--warn)",
      SUGGESTION: "var(--sugg)", INFO: "var(--info)",
    };
    export const MARKER_SEVERITY_COLOR_FALLBACK = "var(--text-muted)";
    ```
  - `styles.ts` — add `findingMarker(sevColor: string): CSSProperties`
    (full-width `<button>` reset: `display: "flex"`, `alignItems: "center"`,
    `gap: 8`, `width: "100%"`, `textAlign: "left"`, `cursor: "pointer"`,
    `border: "none"`, `borderLeft` avoided — use
    `borderLeftWidth: 3` + `borderLeftStyle: "solid"` +
    `borderLeftColor: sevColor`, `background: "var(--bg-surface)"`,
    `padding: "4px 12px 4px 10px"`, `fontSize: 12.5`) and
    `findingMarkerTitle` (`color: "var(--text-primary)"`, `fontWeight: 500`,
    ellipsis).
  - `FindingMarker.tsx` (`"use client"`):
    ```tsx
    export function FindingMarker({ finding, onOpenFinding }: {
      finding: FindingRecord;
      onOpenFinding?: (findingId: string) => void;
    })
    ```
    Renders one `<button type="button">` with
    `onClick={(e) => { e.stopPropagation(); onOpenFinding?.(finding.id); }}`,
    `aria-label={t("diffViewer.openFinding", { title: finding.title })}` where
    `t = useTranslations("shell")`, containing
    `<SeverityBadge severity={finding.severity as Severity} compact />`
    (`SeverityBadge` is exported from `@devdigest/ui`, signature
    `{ severity: Severity; count?: number; compact?: boolean }`,
    `src/vendor/ui/primitives/Badge.tsx:52-60`; the `as Severity` cast mirrors
    `FindingCard.tsx:57`), the title in `s.findingMarkerTitle`, and
    `<Icon.ArrowRight size={12} />`. **No `window.open`, no `href`, no modal** —
    the only thing it does is call the callback (criteria #4: not GitHub, no
    popup). `index.ts` re-exports it, matching the sibling folders.
  - `CodeLine.tsx` — the current props are
    `{ ln, path, threads, commenting, anchorRef }` (`:13-25`). **Remove
    `anchorRef`** and the `ref={anchorRef}` at `:44`; **add**
    `findings?: FindingRecord[]` and `onOpenFinding?: (findingId: string) => void`.
    Render, between the `lineRowFor` row (`:49-70`) and the comment threads
    (`:72-76`):
    ```tsx
    {findings?.map((f) => (
      <FindingMarker key={f.id} finding={f} onOpenFinding={onOpenFinding} />
    ))}
    ```
    The early `ln.kind === "hunk"` return at `:30-36` stays, so hunk headers
    never carry markers.
  - `FileCard.tsx` — **remove** `findingLines`, `target` and `onJumpToLine`
    from the props, the `rootRef` / `lineRef` / `isTarget` / `targetIndex`
    block (`:64-70`), **both** `React.useEffect`s (`:71-80`) and the
    `anchorRef` prop passed at `:143`. **Add**
    `findings?: FindingRecord[]` and
    `onOpenFinding?: (findingId: string) => void`. Then:
    ```tsx
    const findingsByLine = React.useMemo(() => {
      const m = new Map<number, FindingRecord[]>();
      for (const f of findings ?? []) {
        const list = m.get(f.start_line);
        if (list) list.push(f); else m.set(f.start_line, [f]);
      }
      return m;
    }, [findings]);
    ```
    Pass to each `CodeLine` (`:136-144`):
    `findings={smart && ln.newNo != null ? findingsByLine.get(ln.newNo) : undefined}`
    and `onOpenFinding={onOpenFinding}`. **`smart` is the gate** — in Original
    order `CodeLine` receives `undefined` and renders exactly as today.
    Rewrite the header badge (`:117-129`) to be driven by `findings` in **both**
    orders and to **navigate**:
    ```tsx
    {findings && findings.length > 0 && (
      <button type="button"
        onClick={(e) => { e.stopPropagation(); const first = findings[0]; if (first) onOpenFinding?.(first.id); }}
        style={s.findingsBadge}>
        {t("diffViewer.findingsBadge", { count: findings.length })}
      </button>
    )}
    ```
    `e.stopPropagation()` is load-bearing: without it the click bubbles to the
    header's `onClick={() => setOpen((o) => !o)}` at `:99` and toggles the card.
    The existing `diffViewer.findingsBadge` key is reused unchanged.
    **Consumers of the removed `findingLines` that must switch to `findings`:**
    the badge's count *and* the badge's click target — both above; there is no
    third consumer (`grep -rn "findingLines" client/src` must end empty after
    S6). **The count does not change** when the source switches from
    `finding_lines` to `findings`: the two sets are identical in this codebase
    (§2b), so do not expect — or "fix" — any drift in the badge's number.
  - `client/messages/en/shell.json` — add `openFinding` **inside** the existing
    `diffViewer` block.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Test:** `FileCard.test.tsx` — **delete** the entire
  `"FileCard — target force-expand + scroll"` describe (four cases,
  `:90-135`) and the `import type { DiffLineTarget }` at `:5`; **rewrite** the
  `"FileCard — findings badge"` describe (`:60-88`). New cases, with a
  `FindingRecord` fixture on `start_line: 2` of a patch
  `"@@ -1,1 +1,3 @@\n+one\n+two\n-old"` (so `newNo` is 1 for `one`, 2 for
  `two`, and the `-old` line carries **no** `newNo`):
  - `smart` + `findings=[f@2]` → the finding's title is rendered once, and
    clicking it calls `onOpenFinding("f1")` exactly once **and the card is
    still open** (`stopPropagation`).
  - `smart` **omitted** (Original order) + the same `findings` → the title is
    **absent**, while the `"1 findings"` badge is still present. *This is
    criterion #1's negative half.*
  - clicking the badge calls `onOpenFinding("f1")` and does not toggle the
    card.
  - `findings=[f@999]` (a `start_line` in no hunk) with `smart` → **no marker
    is rendered**, the badge is still present and still navigates. *Trap: the
    unanchorable finding must not be dropped from the count nor mapped to a
    nearby line.*
  - a `file` whose `patch` is `null` + `findings=[f@2]` with `smart` → renders
    `"No diff text available (binary or unfetched patch)."`, no marker, badge
    present. *Trap: the nullable patch.*
  - two findings sharing `start_line: 2` → two markers on that line.
  - the S4 highlight cases and the role-collapse cases stay green.
- **Definition of done:** `cd client && pnpm exec vitest run FileCard` exits 0
  and `grep -rn "anchorRef" client/src` returns nothing.
- **Depends on:** S4
- **Track:** B

### S6. Thread `findings` / `onOpenFinding` / `smart`; delete the target machinery

- **Files:**
  - `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` (existing)
  - `client/src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (existing)
  - `client/src/components/diff-viewer/DiffGroupSection/DiffGroupSection.tsx` (existing)
  - `client/src/components/diff-viewer/index.ts` (existing)
  - `client/src/components/diff-viewer/target.ts` (**deleted**)
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` (existing)
- **Change:**
  - `DiffViewer.tsx` — current props are
    `{ files, commenting, target, smartDiff, grouped = false, onJumpToLine }`
    (`:20-34`). **Remove** `target` and `onJumpToLine`; **add**
    `findings?: FindingRecord[]` and
    `onOpenFinding?: (findingId: string) => void`.
    - Replace the `meta` memo (`:37-43`), which today carries
      `{ role, findingLines }`, with **two** memos:
      `roleByPath: Map<string, SmartDiffRole>` built from `smartDiff.groups`
      (unchanged logic, minus `findingLines`), and
      ```tsx
      const findingsByPath = React.useMemo(() => {
        const m = new Map<string, FindingRecord[]>();
        for (const f of findings ?? []) {
          const list = m.get(f.file);
          if (list) list.push(f); else m.set(f.file, [f]);
        }
        return m;
      }, [findings]);
      ```
    - Hoist the mode flag: `const smart = grouped && !!smartDiff;` and reuse it
      for the existing early-return branch at `:49` (`if (!smart) { …flat… }`).
    - Flat branch (`:52-65`): pass
      `findings={findingsByPath.get(f.path)}` and `onOpenFinding`; **do not**
      pass `smart` (so it defaults to `false`). Drop `findingLines` and
      `target`.
    - Grouped branch: pass `smart`, `roleByPath`, `findingsByPath`,
      `onOpenFinding` into `DiffGroupSection`; drop `target` / `onJumpToLine`.
      The `leftovers` / "Other files" section (`:90-105`) is unchanged apart
      from the same prop swap — a file absent from every smart-diff group still
      gets its findings, because `findingsByPath` is keyed off `finding.file`,
      not off the smart-diff payload.
  - `DiffGroupSection.tsx` — replace the `meta` prop
    (`Map<string, { role; findingLines }>`, `:27`) with
    `roleByPath: Map<string, SmartDiffRole>` and
    `findingsByPath: Map<string, FindingRecord[]>`; add
    `smart?: boolean` and `onOpenFinding?`; **remove** `target`,
    `onJumpToLine` and the `containsTarget` effect (`:36-42`). The
    `useState(defaultOpen ?? role !== "boilerplate")` seed at `:34` — which is
    what satisfies criterion #5 — is **unchanged**. Forward `smart`,
    `role={roleByPath.get(f.path) ?? null}`,
    `findings={findingsByPath.get(f.path)}` and `onOpenFinding` to `FileCard`.
  - `index.ts` — delete line 5, `export type { DiffLineTarget } from "./target";`.
    Delete `target.ts`.
  - `DiffTab.tsx` — delete the `target` state and `onJumpToLine`
    (`:30-32`), the `DiffLineTarget` import (`:6`) and the `target` /
    `onJumpToLine` props passed to `DiffViewer` (`:80-81`). Add two optional
    props to `DiffTabProps` (`:13-19`): `findings?: FindingRecord[]` and
    `onOpenFinding?: (findingId: string) => void`, and forward both to
    `DiffViewer`. Everything else — the `SectionLabel` with
    `t("diffTab.sectionLabel", { count: filesCount })` that satisfies criterion
    #2, the comments toggle, `SmartDiffViewer`, the `order` state — is
    **unchanged**.
- **Skills:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Test:** `DiffViewer.test.tsx` — **delete** the
  `"a target pointing at a file inside a collapsed group force-expands that
  group"` case (`:96-104`) and the `DiffLineTarget` import (`:6`). Add, using a
  `FindingRecord` whose `file === CORE_FILE.path` and `start_line === 1` (so it
  anchors to `+coreLine`):
  - `grouped` + `findings` → the finding's title renders inside the core
    group's file card, and clicking it calls `onOpenFinding` with that id.
  - `grouped={false}` + the same `findings` → the title is **absent** and the
    `"1 findings"` badge is present. *Criterion #1's negative half at the
    viewer level.*
  - `grouped` + a finding whose `file` is `LEFTOVER_FILE.path` → the marker
    renders inside the **"Other files"** section. *Trap: findings must not
    depend on the smart-diff payload knowing the path.*
  - the three existing group-order / other-files / `smartDiff=null` cases stay
    green **unmodified** — they are what pins criterion #5. The existing
    fixtures' `finding_lines: []` entries stay as they are: the field is now
    unread by the client but is still part of the `SmartDiff` type.
- **Definition of done:** `cd client && pnpm test` exits 0 and
  `grep -rn "DiffLineTarget\|onJumpToLine\|findingLines" client/src` returns
  nothing.
- **Depends on:** S5
- **Track:** B

### S7. `PrDetailView` — the URL param, the navigation, the join

- **Files:**
  - `.../_components/PrDetailView/helpers.ts` (**new**)
  - `.../_components/PrDetailView/helpers.test.ts` (**new**)
  - `.../_components/PrDetailView/PrDetailView.tsx` (existing)
  - `.../_components/PrDetailView/PrDetailView.test.tsx` (**new**)
- **Change:**
  - `helpers.ts` (pure, no `"use client"` needed, no React import):
    ```ts
    /** Apply a search-param patch (null deletes) and return the query string
     *  without a leading "?" — "" when no params remain. */
    export function patchedSearch(current: URLSearchParams, patch: Record<string, string | null>): string {
      const sp = new URLSearchParams(current.toString());
      for (const [k, v] of Object.entries(patch)) { if (v == null) sp.delete(k); else sp.set(k, v); }
      return sp.toString();
    }

    /** Opening a finding: switch to the runs tab, name the finding, and clear
     *  the severity filter — visibleFindings() would otherwise hide a target
     *  of a different severity. */
    export const openFindingPatch = (findingId: string): Record<string, string | null> =>
      ({ tab: "findings", finding: findingId, severity: null });
    ```
  - `PrDetailView.tsx` — replace `setParam` (`:54-59`) with:
    ```tsx
    const setParams = (patch: Record<string, string | null>) => {
      const qs = patchedSearch(search, patch);
      router.replace(`/repos/${repoId}/pulls/${number}${qs ? `?${qs}` : ""}`);
    };
    const setParam = (key: string, val: string | null) => setParams({ [key]: val });
    const setTab = (t: string) => setParams({ tab: t, finding: null });
    ```
    `setParam` keeps its existing two call sites (`onOpenTrace`, the drawer's
    `onClose`) working unchanged. Add
    `const targetFindingId = search.get("finding");` beside
    `const traceRunId = search.get("trace");` (`:53`).
    - `<FindingsTab … targetFindingId={targetFindingId} />` (`:124-148`).
    - `<DiffTab … findings={allFindings} onOpenFinding={(id) => setParams(openFindingPatch(id))} />`
      (`:152-157`). `allFindings` already exists at `:63-66` and is already
      passed to `FindingsTab` — reuse it, do not build a second memo.
    - The `onRunDone` handler at `:140-147`, including the
      `queryKeys.smartDiff(prId)` invalidation, is **unchanged**.
- **Skills:** `frontend-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`
- **Test:**
  - `helpers.test.ts` (new) —
    `patchedSearch(new URLSearchParams("tab=diff&severity=WARNING&trace=r1"), openFindingPatch("f1"))`
    parses back to exactly `{ tab: "findings", trace: "r1", finding: "f1" }`
    with **no** `severity` key. *Traps:* `severity` really is dropped, and
    `trace` really is preserved. Also
    `patchedSearch(new URLSearchParams("tab=findings&finding=f1"), { tab: "diff", finding: null })`
    → `"tab=diff"` (the `setTab` clearing rule).
  - `PrDetailView.test.tsx` (new) — the one test that proves criterion #4's
    departure through the real component tree. Mock:
    - `next/navigation`: `useParams: () => ({ repoId: "r1", number: "1" })`,
      `useSearchParams: () => new URLSearchParams("tab=diff")`,
      `useRouter: () => ({ replace })` with a hoisted `replace = vi.fn()`.
    - `@/lib/repo-context`: `useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } })`,
      `useRepoNotFound: () => false`.
    - `@/lib/hooks` and `@/lib/hooks/reviews` with
      `async (importOriginal) => ({ ...(await importOriginal<object>()), … })`
      so unlisted exports keep working, overriding exactly:
      `usePulls`, `usePullDetail`, `usePrReviews`, `usePrActiveRuns`,
      `usePrRuns`, `useDeleteRun`, `useCancelRun`, `usePrComments`,
      `useCreatePrComment`, `useSmartDiff`. `usePullDetail` returns a `PrDetail`
      whose `files` contains one core file with a patch; `usePrReviews` returns
      one `ReviewRecord` whose `findings` contains `f1` on that file's
      `start_line`; `useSmartDiff` returns a `SmartDiff` putting that file in
      the `core` group.
    - Wrap in `QueryClientProvider` (`useQueryClient` at `:38` needs one) and
      `NextIntlClientProvider` with **both** namespaces:
      `messages={{ prReview, shell }}`. `useSetCrumb` no-ops outside its
      provider (`client/INSIGHTS.md`) — no mock needed.
    - Assert: clicking the rendered marker calls `replace` **once** with
      `"/repos/r1/pulls/1?tab=findings&finding=f1"`. Assert additionally that
      `window.open` was **not** called and that no `dialog`/`drawer` role
      appeared — criterion #4's "not GitHub, no popup".
- **Definition of done:** `cd client && pnpm test && pnpm typecheck` both exit
  0; the `replace` assertion above passes.
- **Depends on:** S3, S6
- **Track:** A (join point — must run after both tracks)

## 5. Test & verification plan

| Package | Command | Docker needed | Migrations needed |
|---|---|---|---|
| `client` | `cd client && pnpm test` | no | no |
| `client` | `cd client && pnpm typecheck` | no | no |
| repo root | `./scripts/check-shared-sync.sh` | no | no |
| `server` (regression guard only) | `cd server && pnpm verify:l03` | no | no |
| `server` (regression guard only) | `cd server && pnpm exec vitest run smart-diff` | yes (`*.it.test.ts` uses testcontainers) | applied by the test harness |
| repo root (guard) | `git diff --stat -- server reviewer-core e2e '*/vendor/shared'` — must print nothing | no | no |

Every command above is copied from a real `scripts` block:
`client/package.json:9-10`, `server/package.json:11,18`. `client/` has **no**
`arch:check` script and no dependency-cruiser config — do not invent one.

Run order: per-step `pnpm exec vitest run <name>` while implementing → after
S7, `cd client && pnpm test` then `cd client && pnpm typecheck` → the two
server regression commands → `./scripts/check-shared-sync.sh` → the `git diff`
guard.

**Acceptance criteria traceability**

| Acceptance criterion | Step | What proves it |
|---|---|---|
| **#1a** Files-changed tab has a Smart Diff mode toggle | none — already met | `SmartDiffViewer.test.tsx` (untouched) asserts the two `aria-pressed` order buttons; `DiffTab.tsx:74` renders it |
| **#1b** In Original mode findings are **not** visible on lines | S5, S6 | `FileCard.test.tsx` "`smart` omitted → the finding title is absent while the badge remains"; `DiffViewer.test.tsx` "`grouped={false}` + `findings` → title absent" |
| **#1c** In Smart mode findings are visible **on the relevant line of the relevant file** | S5, S6 | `FileCard.test.tsx` "marker renders under the line whose `newNo === start_line`, and on no other line"; `DiffViewer.test.tsx` "the marker renders inside the core group's file card" |
| **#2** File count shown at the top | none — already met | `DiffTab.tsx:72` renders `t("diffTab.sectionLabel", { count: filesCount })` → "Files changed · N files"; unchanged by S6, which touches only the props below it |
| **#2** Building Smart Diff spends **no tokens** | none — already met | `server/test/smart-diff.it.test.ts` asserts `MockLLMProvider.calls.length === 0`, re-run in §5; plus the guard `git diff --stat -- server …` printing nothing, so that evidence cannot have moved |
| **#3** A file over a line threshold is **highlighted** | S4 | `FileCard.test.tsx`: 350 changed lines + `smart` → the `"Large file"` chip renders; 250 changed lines → it does not; the threshold is the named constant `LARGE_FILE_CHANGED_LINES` in `client/src/components/diff-viewer/constants.ts` |
| **#4** Clicking a finding navigates to that finding's card in the runs tab | S5, S6, S7 | `PrDetailView.test.tsx`: clicking the marker calls `router.replace("/repos/r1/pulls/1?tab=findings&finding=f1")` exactly once; `PrDetailView/helpers.test.ts` pins the patch (`tab` switched, `finding` set, `severity` cleared, `trace` preserved) |
| **#4** …to **that specific card**, expanded and scrolled to | S1, S2, S3 | `ReviewRunAccordion.test.tsx`: with `targetFindingId="f1"` a `defaultOpen={false}` accordion opens, `f1`'s **rationale** (i.e. the card is expanded, not merely present) is in the document and `scrollIntoView` was called; `FindingsPanel.test.tsx` proves the target survives an active `severityFilter` |
| **#4** NOT to GitHub, NOT a popup | S5, S7 | `FindingMarker` contains no `href` and no `window.open` (S5); `PrDetailView.test.tsx` asserts `window.open` was not called and no `dialog` role appeared |
| **#4** Stale / deleted finding id | S3 | `FindingsTab.test.tsx`: `targetFindingId="ghost"` renders the `findingNotFound` notice, opens no accordion and throws nothing |
| **#5** Three categories, Core+Wiring expanded, Boilerplate collapsed | none — already met | `DiffViewer.test.tsx` "renders group sections in server-provided order, boilerplate group collapsed by default" (kept green, unmodified, by S6); `DiffGroupSection.tsx:34` `useState(defaultOpen ?? role !== "boilerplate")`; labels at `shell.json` → `diffViewer.role.{core,wiring,boilerplate}` |

## 6. Risks & rollback

| Risk | Likelihood | How it shows up | How to roll back |
|---|---|---|---|
| A new i18n key is added as a **second** top-level `diffViewer` / `findingsTab` block instead of inside the existing one | medium | The whole earlier block silently disappears; components render raw key paths (`diffViewer.role.core`) at runtime. `pnpm typecheck` says nothing and no linter exists (`client/INSIGHTS.md`) | `grep -c '"diffViewer":' client/messages/en/shell.json` must print `1`; merge the blocks |
| The implementer expects the badge count to change when its source moves from `finding_lines` to `allFindings`, and "fixes" something to chase the difference | low | A spurious edit to `smart-diff/repository.ts`'s `kind` filter, or a test fixture bent to a number that was never wrong | It cannot drift: `finding_lines ⊆ allFindings` by construction, and the subset is not proper today because `run-executor.ts:342` is the only writer of a review row and hardcodes `kind: 'review'` (§2b). Revert any server edit; `git diff --stat server/` in §5 catches it |
| Deleting `target.ts` breaks an unnoticed consumer | low | `pnpm typecheck` fails with an unresolved import | `grep -rn "DiffLineTarget\|onJumpToLine" client/src` before and after S6; `git checkout -- client/src/components/diff-viewer` reverts track B wholesale |
| `PrDetailView.test.tsx`'s mock surface drifts (a hook added to the subtree later) | medium | "No `useX` export is defined on the mock" at test time | The `importOriginal` spread in S7 is chosen precisely to survive this; if it still breaks, add the name to the override object |
| `scrollIntoView` is undefined in jsdom | high without the guard | `TypeError` inside the S1/S3 effects | Every affected test file sets `Element.prototype.scrollIntoView = vi.fn();` at module scope (existing precedent `FileCard.test.tsx:11`) |
| Two markers on one line make a dense diff noisy | low | Visual only | The marker is one compact row per finding; if it becomes a problem, cap the render at the first N and add a "+k more" — a follow-up, not this plan |
| `LARGE_FILE_CHANGED_LINES = 300` is the wrong number for the course | medium | A grader's example file is not highlighted | One-line change to the named constant; §8 |

## 7. Out of scope / handoff

- **To `architecture-reviewer`:** did `client/src/components/diff-viewer/**`
  stay free of imports from `src/app/**/_components/**` (specifically, is
  `MARKER_SEVERITY_COLOR` a local duplicate rather than an import of
  `_components/FindingCard/constants.ts`)? Did `'use client'` stay off every
  `page.tsx`? Is `PrDetailView` still the only component that touches
  `next/navigation` for these params? Confirm `server/`, `reviewer-core/` and
  both `vendor/shared` copies are byte-unchanged. **You do not run this agent.**
- **To `plan-verifier`:** re-derive this file's §0 Definition-of-done items 3–6
  and every row of the §5 traceability table from source, not from the step
  text — in particular that criterion **#3**'s threshold really is a named
  constant in `client/src/components/diff-viewer/constants.ts` and that
  criterion **#4** is proven by an assertion on `router.replace`, not by a
  render smoke test. **You do not run this agent.**
- **To `doc-writer`:** after the change, `?finding=<id>` is a public URL
  contract of the PR detail route and is documented nowhere; `client/README.md`'s
  UI-route ↔ API map and the diff-viewer's own header comment
  (`DiffViewer.tsx:1-7`, which still points at the 2026-08-14 plan) both
  predate it. **You do not run this agent.**
- **To the `security` skill pass / `/pr-self-review`:** `?finding=` is
  attacker-controllable text. Confirm it is only ever compared with `===`
  against ids the client already holds and never interpolated into a request
  path, an `href`, or `dangerouslySetInnerHTML`. Confirm no finding title,
  rationale or patch text reaches the URL. Treat the `security` skill's
  Express/Mongo/JWT examples as illustrative — this repo's stack is different.
- **To the human:** no migration is needed. Run `implementer` against this
  plan; then `plan-verifier` / `architecture-reviewer` / `doc-writer` as
  needed; then commit, `/pr-self-review`, PR. **The planner never launches any
  of those, and `git push` / `gh pr create` stay blocked until
  `/pr-self-review` returns `CLEAR`.**

## 8. Open questions

- **The exact value of `LARGE_FILE_CHANGED_LINES` (chosen: 300).** The course
  criterion says "if a file exceeds a certain line count" without naming the
  count, and no document in this repository states one — the neighbouring
  `AUTO_EXPAND_MAX_LINES = 200` is a *collapse* threshold, a different setting,
  and is not evidence about this one. **Assumption taken:** 300 changed lines,
  deliberately above 200 so the two rules nest rather than compete. It does not
  block the plan: it is a single named constant with its own test, and changing
  it is a one-line edit plus one fixture number.
- **"Line count" means *changed* lines, not the file's total length.** The
  client never fetches whole files — `PrFile` carries only `additions`,
  `deletions` and `patch` (`contracts/platform.ts:186-192`). **Assumption
  taken:** `additions + deletions`, and the constant is named
  `LARGE_FILE_CHANGED_LINES` so the limitation is visible at every call site.
  Measuring true file length would require a new server read and a contract
  change — both explicitly out of scope.
- **Whether criterion #3's highlight should also appear in Original order.**
  The criterion does not scope itself to a mode; criterion #1 does scope
  *findings* to Smart mode, and the previous plan pinned Original as "exactly
  today's behaviour". **Assumption taken:** Smart order only. If the course
  intends both, the change is to stop gating `large` on `smart` in
  `FileCard.tsx` (S4) and to invert one test case — no other file moves.
- **A `kind='summary'` review row would produce a card with no diff marker.**
  This is hypothetical, not current: **no code creates such a row today** — the
  only writer of a review row is `run-executor.ts:342`, which hardcodes
  `kind: 'review'`, and the seeds do the same (`seed.ts:143`, `:493`, `:508`);
  the enum permits `'summary'` (`db/schema/reviews.ts:21`) and the only insert
  of one anywhere is the fixture in `server/test/smart-diff.it.test.ts:172`,
  which exists precisely to prove the server-side filter. If such a row is ever
  produced, its findings would render a card in the runs tab (because
  `reviewsForPull` has no `kind` predicate) but no diff marker (because
  `smart-diff/repository.ts` filters `kind='review'`) — a one-line change to
  that repository filter, not a blocker, and not something this plan should
  pre-empt.
- **`SmartDiffFile.finding_lines` becomes unread by the client** (§2b). The
  field stays in the contract and stays covered by the server tests, so nothing
  breaks; but it is now server-only data. Removing it would be a
  `vendor/shared` edit, which this plan refuses to make. Flagging it so a later
  reader does not mistake the client's `allFindings` join for a bug.
