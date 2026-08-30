# `client` — insights

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

- **One message serving two modes is a bug when the modes invert what its
  numbers mean — and it type-checks, renders, and passes tests.** The eval case
  row and the editor's result strip both filled
  `expected {expected} finding, got {actual}` for every case. On a `must_find`
  case those are "findings owed" and "of them produced". On a `must_not_flag`
  case `expected` counts **forbidden locations** and `actual` counts everything
  the agent produced anywhere in the diff, most of it irrelevant — so a
  correctly-failing negative case rendered **"expected 1 finding, got 3"**,
  which reads as "should have found one, found three", the opposite of what
  happened. Reported by the human on 2026-08-30 as "у меня всё нормально
  отрабатывает".
  **Why nothing catches it:** both modes supply the same two integers, so the
  placeholder always fills. The string is grammatical, the numbers are real, and
  a test asserting the row shows counts passes for both. Only a test that
  compares the TWO wordings against each other fails on the shared version.
  **Do:** when a component renders one sentence for a discriminated union, check
  each variant's meaning for every placeholder, not just its type. A shared
  string is safe when the variants differ in *degree* and wrong when they differ
  in *direction* — `must_find` wants the number high, `must_not_flag` wants it
  zero. Split the key, and comment each site with the other's path, because the
  copy lives in two files (`EvalsTab/EvalCaseRow.tsx` and
  `components/eval-case-editor/`) that no test mounts together.

- **A formatter copied out of a mockup inherits the mockup's fixture, and a
  round fixture hides that the field has no formatter at all.** The design's
  `CompareMetric` formats a non-percentage value as `` `${v}` `` — correct-looking
  on its `cost: 0.21` fixture, and we ported it verbatim. Real eval runs cost
  `0.0009258000000000001`, which the card printed in full, with a delta of
  `Math.abs(d).toFixed(2)` = **`0.00`** — a display that actively claimed
  nothing had changed between the two runs being compared. Reported by the human
  on 2026-08-29; typecheck and 545 tests were green, because every fixture in
  them was as round as the mockup's.
  **Do:** when porting a design component, treat every field it renders *raw*
  as an unwritten formatter, and check it against a real value from the database
  before believing the port. Distinct from the `CostBadge` entry below: there the
  values changed scale under a working formatter; here there was never one.
  **A badge rule is not automatically the right rule for a comparison surface,
  and the unit is part of the rule.** `formatUsd`'s `< $0.001` is right for a
  badge and wrong for the run-compare card — it collapses `$0.000868` and
  `$0.000811` to one token and erases the only thing that card exists to show.
  Six decimals fixed that and were rejected as unreadable, correctly: dollars
  cannot state a sub-cent difference in the width the design draws. **Cents
  can** — `0.09¢ → 0.08¢ ▼ 0.01¢` is the same width as the design's
  `0.21 → 0.23`. Hence `formatUsdCompact` beside `formatUsd`: one authority,
  two ranges, switching unit only below $0.01.
  **A "did anything change" epsilon is unit-bound too, and it fails silently.**
  The design's single `Math.abs(d) > 0.0001` is a percentage-point epsilon; on a
  cost of $0.0009 it swallows every real delta, so a run that got 6% cheaper drew
  no arrow at all — not a wrong number, an absent one. Any shared threshold
  needs one value per unit, at the point where that unit's own formatter still
  prints something.

- **A component forked from a sibling keeps the sibling's PRE-FIX shape, and the
  fix rounds land on one of them only.** `SkillEvalCaseEditor` was written from
  the same design as `EvalCaseEditor`. The agent editor's `Actual output` panel
  then took several rounds of human-reported corrections — full-height instead of
  a 190px strip, an inner `--code-bg` box instead of bare text under the heading,
  a label matching `Expected output` instead of an uppercase micro-caption. None
  of them reached the skill editor, so on 2026-08-29 the human reported the same
  defect a second time, in the second editor, after the first was signed off.
  Nothing catches this: both files typecheck, both have colocated tests, and each
  test asserts its own component renders *something*.
  **Do:** when a visual fix lands on a component that has a twin, grep for the
  twin in the same edit (`grep -rl <styleKey> src`) and fix both, then leave a
  comment in each style block naming the other and saying they change together.
  A shared style object would be better still where the two are meant to be
  identical — a pointer comment is the cheap version, not the right one.
  **The drift runs BOTH ways, so neither twin is the canonical one.** Hours
  later the same pair produced the mirror defect: `SkillEvalCaseEditor` had an
  `Expectation` picker and `EvalCaseEditor` did not, because the agent editor
  computed the value — `evalCase?.expectation ?? seed?.expectation ??
  'must_find'` — instead of holding it in state. The server had accepted
  `expectation` on create and update the whole time; a hand-authored agent case
  simply could not be a `must_not_flag` one, which is a whole capability
  missing, not a style difference.
  **A derived value is a silently removed control**, and no gate can see it: a
  test can assert a control renders, but nothing asserts a control that was
  never designed *should* exist. Both editors typechecked, 546 tests passed,
  and the absence surfaced only by comparing the two editors side by side.
  When one twin holds something in `useState` and the
  other derives the same field, that asymmetry is the bug — check it directly:
  `grep -n "useState" ` both files and diff the lists.
  **Converting a derived value into a control leaves a second bug behind: every
  element gated on where the value USED to come from.** `EvalCaseEditor`'s
  kind banner rendered under `{seed && …}` because the kind could only come
  from a seed. Making it choosable did not change that guard, so the one screen
  where the kind is now picked — a hand-authored case — showed nothing
  confirming the choice. **Do:** after moving a field into state, grep for its
  old source (`seed`, `evalCase?.`) and re-read every conditional that mentions
  it; the ones that meant "we know the kind" now mean the wrong thing.

- **A comment citing an acceptance criterion is not evidence it read it, and an
  over-applied one silently disables the criteria it did not cite.** The agent
  case editor's input pane carried `/* Read-only: the stored input is what the
  case ran against (AC-53). */` above the `Diff`, `Files` and `PR meta` tabs.
  AC-53 names **only** `Files` and `PR meta`. Making the diff read-only too
  meant `New eval case` — AC-7, "a case can be authored without a finding to
  start from" — could only ever save an empty `input_diff`, and AC-8's
  hand-written benign and fabrication-pressure cases were unreachable. Three
  criteria, one comment, and the two that broke are not mentioned anywhere near
  the code that broke them. Reported by the human on 2026-08-29 as "не понятно
  куда вставлять" — they were looking for a field that did not exist.
  **The tell was an orphaned message key.** `caseEditor.diffPlaceholder`
  (`"--- a/src/config.ts"`) sat in `messages/en/eval.json` used by nothing: a
  placeholder exists only for an input, so an unused one is the fingerprint of a
  control that was designed and never built. The check is one line per suspect
  key: `grep -rn '<key>' src --include='*.tsx' | grep -v messages` returning
  nothing means the string is defined and never rendered.
  **Do:** when a comment cites an AC to justify a restriction, open the AC and
  compare its list to what the code restricts — the citation makes the code look
  reviewed and is exactly why nobody re-reads it. And treat an unused
  `*Placeholder`, `*Label` or `*Hint` message as a missing control until proven
  otherwise. Sibling of the twin-drift entry above: both are capabilities that
  no test can miss, because nothing asserts a control that was never designed.

- **A formatter's precision is a promise about the range of values it will be
  given, and changing the system's scale can silently break it.** `CostBadge`
  had rounded to three decimals since it was written, which was right while a
  run cost cents. On 2026-08-24 the brief's blast map was deduplicated, its
  input fell roughly threefold, and real costs of `$0.000145` began rendering
  as **`$0.000`** — a paid call reading as free, on four screens at once. The
  optimisation was the trigger; nothing about the badge changed.
  **Do:** when a change makes a measured quantity smaller or larger by an order
  of magnitude, look at every place that formats it before believing the screen.
  A rounding rule cannot say "too small to show" on its own — `< $0.001` can,
  and an exact zero must stay `$0.000`, because "nothing was spent" and "less
  than a tenth of a cent" are different claims.

- **Two model-returned strings rendered side by side need a deterministic join,
  not a space.** `{brief.what} {brief.why}` produced "Add external webhook
  sharing for reviews To allow sharing reviews to an external webhook" — a
  run-on with a capital in the middle, because a model does not punctuate the
  end of a field it was never told is the end of a sentence, and the schema
  cannot make it. Reported 2026-08-24 on the PR brief banner.
  **Do:** join in a pure helper that supplies the terminator when the first
  half lacks one and adds none when it has one (`joinWhatWhy` in
  `BriefBanner/helpers.ts`), and keep it testable — asking the prompt for
  "complete sentences" is a request, while the helper is a guarantee. This
  applies to any two adjacent fields of one structured answer, not just these.

- **Do not gate a control on a response's STATE when the server guards on its
  CONTENT.** `BlastCard` offered `Explain` whenever `state` was `ok` or
  `partial`, while `BlastService.summarize` refuses any map with
  `symbols.length === 0` (`empty_map`). `ok` with zero symbols is a real,
  correct state — a pull request touching only paths the indexer excludes
  (`vendor` is in `EXCLUDED_DIRS`, `server/src/modules/repo-intel/
  constants.ts:24`) indexes to nothing at all. The button was therefore offered
  in the one case where its only possible outcome was an error, and the card
  already had the number on screen: `0 symbols`. Reported 2026-08-24 on a pull
  request whose two changed files were both under `src/vendor/shared/`.
  **Do:** when a route can refuse, find its guard and mirror the same predicate
  in whatever enables the control. A state enum answers "did this succeed",
  never "is there anything here" — and a user should not spend a click to learn
  what the screen is already showing.

- Do not put `sessionStorage` (or any client-only value) into sidebar `href`s
  during render to "skip" `/skills` → `/skills/:id` hops. SSR emits `/skills`,
  the client first paint emits `/skills/{uuid}` → React hydration mismatch.
  The real slow-nav fix is persistent `AppShell` (below); list pages already
  show list+editor. Last-id href overrides also made the browser status bar
  show long UUIDs on hover — removed; use static `/skills` and `/agents`.
  (2026-08-07)

## Codebase Patterns

- **A `maxWidth` copied out of a mockup is a property of the ARTBOARD, not of
  the design — and it surfaces as several unrelated-looking bugs.** The Evals
  tab carried `maxWidth: 720` because `screen_agents.jsx` draws it on a 720px
  artboard. On a real screen that produced three separate reports: the case
  name wrapped to two lines, the `MUST NOT FLAG` badge broke mid-phrase into a
  two-line box, and the row's actions bunched in the middle of an otherwise
  empty pane. Each was chased on its own before the shared cause was found.
  **Do:** when porting a mockup, treat fixed widths and heights as suspect —
  the artboard has a size, the design usually does not. And when three
  complaints arrive about one component's layout, look for one container before
  fixing three children; `whiteSpace: nowrap` on a badge is a real fix only
  after the width is right. (2026-08-29)

- **When two controls produce results that land in different places, the empty
  state has to say which one feeds the number on screen.** The agent Evals tab
  computes its metric strip from **set runs** (`eval_run_batches`), while the
  per-row `Play` writes a single-case trial with `batch_id NULL` that
  deliberately never enters run history (AC-62). So a user who ran four cases
  individually sees four passing rows above four em dashes, and reports the
  metrics as broken — correctly, from what the screen told them. Reported
  2026-08-29.
  **Do:** an empty state that is *right* is still a defect when it is silent.
  Where a value has one source and the screen offers another action that looks
  like it should fill it, name the difference in place ("these come from a run
  of the whole set"). The em dash alone says "no data" when the truth is "not
  measured this way yet". (2026-08-29)

- **A create-or-update form that acts before saving must ADOPT the row it just
  created, or every further press creates another one.** `EvalCaseEditor`
  decides between create and update from its `evalCase` prop. When `Run case`
  was made to work on an unsaved seeded case — save first, then run — the
  create path never fed the new row back into that decision, so the form stayed
  "unsaved" and each press created a fresh case. Three identical rows reached
  the set from one finding before anyone noticed, and the duplicate guard did
  not catch it: that guard reads the seed when the editor OPENS, not on each
  action inside it.
  **Do:** any "save then do X" path holds the created entity in state and every
  later action reads `props.entity ?? created`. Test it by pressing the action
  twice and asserting exactly **one** create request — asserting that the
  action worked passes either way. (2026-08-29)

- **To check whether a component reached the build, grep the message KEY, not
  the copy.** User-facing strings live in `messages/<locale>/*.json` and are
  resolved by `next-intl` at runtime; the compiled chunk carries
  `t("neverRunYet")`, never the words "Never run yet". So
  `grep -r "Never run yet" client/.next` returns **0 files for code that is
  perfectly present**, and the opposite trap exists too: a page's SSR payload
  embeds the whole messages bundle, so grepping the copy across the served HTML
  matches the dictionary and "proves" a component that was never rendered.
  Both misfires happened on 2026-08-29, and the second one produced a confident
  wrong diagnosis ("the dev server is serving a stale build") that cost a
  restart and a round of the human's time.
  **Do:** `grep -rl 'neverRunYet' client/.next` — the key. For "is this
  component rendered", the payload grep is worthless; use a component test for
  presence and a real browser for visibility. (2026-08-29)

- **Adding a panel under a `flex: 1` sibling makes it vanish, and every jsdom
  test still passes — the element IS in the DOM, it just has no space.** The
  eval-case editor's right column is a flex column whose expected-output
  textarea carries `flex: 1`. A flex child defaults to `min-height: auto`, so
  it refuses to shrink below its content and eats the column; the new `Actual
  output` panel below it was pushed past the modal's edge. Reported 2026-08-29
  as "there is no Actual output" while `getByText("Actual output")` passed.
  **Fix the CONTAINER first, not the children.** Two rounds were spent adding
  `minHeight: 0` / `flexShrink: 0` to the textarea and the panel and the screen
  did not change, because the thing actually growing was the column itself:
  `body` is a grid with a fixed `height: 480`, and a **grid item also defaults
  to `min-height: auto`**, so `right` expanded to fit its children and spilled
  past the modal instead of constraining them. What worked: `minHeight: 0` +
  `overflow: hidden` on the column, a `minHeight` floor on the flexing
  textarea, and a `maxHeight` ceiling on the new panel — a height budget, not a
  shrink hint.
  **The same default silently disables `overflow: auto`.** The modal's diff
  pane (`tabBody`) carried `flex: 1` *and* `overflow: "auto"` and still had no
  scrollbar — it was simply cut off at the modal's edge. `overflow` can only
  act once something constrains the height, and `min-height: auto` means
  nothing ever does. `minHeight: 0` is what turns an existing `overflow: auto`
  from decoration into a scrollbar.
  **Do:** when something inside a fixed-height container is pushed out, check
  the container's own `min-height: auto` before touching any child. Prefer
  `overflow: auto` over `hidden` on such a column: `hidden` turns a layout
  miscalculation into content the user cannot reach at all, `auto` degrades to
  a scrollbar. And do not
  read a passing render test as evidence the thing is visible: jsdom computes
  no layout, so presence tests cover removal and nothing else. Visibility is a
  human check, or a real browser. (2026-08-29)
  **The mirror failure is TWO scrollbars, and it arrives when a read-only pane
  becomes editable.** `tabBody` is not a wrapper — it is itself the bordered
  `--code-bg` frame *and* the scroll container, sized for the `<pre>` it was
  built around. Swapping in a `<textarea>` that carried its own border,
  background, padding and `overflow` produced a box inside a box: doubled
  border, two scrollbars, and the focus ring trapped between them
  (`img/12.png`, 2026-08-29). **A textarea always scrolls itself**, so the two
  cannot both be scroll containers.
  **Do:** before styling a control you are dropping into an existing pane, read
  the pane's own style — in this codebase `tabBody`, `actualBox` and
  `previewPre` all already supply frame, background, padding and overflow. The
  control should fill it (`width/height: 100%`, no border, transparent
  background, its own padding) and the parent should hand scrolling over
  (`overflow: hidden`). Filling edge to edge also puts the browser's focus ring
  on the frame's own outline instead of inset inside it, which is what made the
  first attempt look unfinished. (2026-08-30)

- **`Button`'s `active` prop is read by exactly ONE kind — `tertiary`. Pass it
  with `secondary`, `ghost`, `primary` or `danger` and it is silently
  inert.** `src/vendor/ui/primitives/Button.tsx:45-58`: the `kinds` map builds
  a style per kind, and only `tertiary` (`:52-55`) mentions `active`;
  `secondary` is a fixed `var(--bg-elevated)` and `ghost` a fixed
  `transparent`. `FindingCard` passed `active={accepted}` / `active={dismissed}`
  on a `secondary` and a `ghost` button for weeks — accepting or dismissing a
  finding changed nothing on either control, and because `secondary` is
  elevated while `ghost` is flat, `Accept` also *looked* pre-selected before
  anything was clicked. TypeScript is no help: the prop exists on the component,
  it is just unused for that variant.
  **Do:** before relying on a vendored primitive's state prop, open its style
  map and confirm the variant you pass actually reads it. Where it does not,
  carry the state in the `kind` itself — `kind={dismissed ? "ghost" : "secondary"}`
  — which is also how the reference design renders a chosen action. Test it by
  comparing the two buttons' rendered `style.background` across states and
  asserting they are **equal while undecided**; asserting a button "is in the
  document" passes with the broken version. (2026-08-29)

- **`Modal` (`src/vendor/ui/kit/Modal.tsx:23`) is `position: fixed` but does
  NOT portal, so mounting one inside a card that dims itself paints the whole
  dialog translucent.** `FindingCard` sets `opacity: 0.6` while the finding is
  accepted or dismissed (`FindingCard/styles.ts:21`) and `overflow: hidden`
  (`:19`); the eval-case editor was rendered as a child of that card, so it
  inherited the opacity, and — because any opacity below 1 creates a stacking
  context — its `position: fixed` resolved against the card instead of the
  viewport. The user's report was "the form opens with a semi-transparent
  background". Worse, the common path hit it: a *dismissed* finding is exactly
  the one that seeds a `must not flag` case.
  **Do:** render a `Modal` through `createPortal(…, document.body)` whenever
  any ancestor sets `opacity`, `filter`, `transform` or `contain` — all four
  create a containing block for `fixed`. Guard with
  `typeof document !== "undefined"` so SSR does not touch `document`. And write
  the test as a containment assertion — `expect(card.contains(dialog)).toBe(false)`
  — because `expect(dialog).toBeInTheDocument()` passes in both layouts and
  proves nothing. (2026-08-29)

- **A sidebar entry's `key` must be the exact string `activeKeyFor` derives
  from its route — the plural/singular slip costs two bugs at once, and the
  obvious test does not catch either.** Adding the Eval Dashboard with
  `{ key: "evals", href: "/evals" }` (`src/vendor/ui/nav.ts`) broke both
  consumers of that key: `activeKeyFor` maps `/evals` → `"eval"`
  (`src/components/app-shell/helpers.ts:35`), so the item never highlighted,
  and `useShellCommands` looks up `nav.${it.key}` (`hooks/useShellCommands.ts:24`),
  so `next-intl` threw `MISSING_MESSAGE: Could not resolve shell.nav.evals` on
  **every** render of every page. `shell.json` already had `nav.eval`, and so
  did the mockup. Typecheck, 493 unit tests, `arch:check` and both reviewers
  were green throughout; the only thing that surfaced it was starting the app
  and reading the dev log.
  **Do:** when adding a nav entry, grep `activeKeyFor` first and use the key it
  returns for the href you are adding, then check `messages/en/shell.json` has
  `nav.<key>`. In its test, **derive** the key —
  `activeKey: activeKeyFor("/evals")` — instead of typing it; a test that
  hardcodes the key renders the label happily while both consumers are broken.
  Assert the active state itself (the row's `fontWeight` is `600`), not just
  that the link exists. (2026-08-29)

- **Optimistic local state that is never cleared must win on the data's own
  timestamp, not on being applied last.** `EvalsTab` merges three sources into
  one result map — the newest batch's rows, the server's `last_run`, then a
  component-local `trials` map holding results of single-case runs fired in
  this mount. `trials` is written on each trial and never cleared, so applying
  it last unconditionally meant a trial fired at 10:00 displaced the server's
  11:00 set-run result for the same case, forever, in that mount. The screen
  then reported a *stale* result while the newer one sat in the very query the
  completion effect had just refetched. Both the bug and its mirror were
  shipped one fix apart: the first version dropped the server value entirely,
  the fix for that overwrote it unconditionally.
  **Do:** when a local map fronts server data, either clear it in the effect
  that refetches, or compare (`r.ran_at >= held.ran_at`) before overwriting —
  and write the test as a *precedence* test with a negative assertion ("the
  older value is NOT shown"), because a presence test passes under both
  orderings and proves nothing. (2026-08-29)

- **A feature with no page and no server route is still probably not
  greenfield — grep four places before saying so.** (2026-08-23) Scoping the
  Project Context feature I checked `src/app` (no `context` route) and
  `server/src/modules/index.ts` (no `context` module) and reported it as
  starting from zero. Wrong: four independent caches of scaffolding for it
  already existed, each wired to nothing and each invisible from the two
  places I looked.
  1. **Shared contracts** — `src/vendor/shared/contracts/platform.ts:259-274`
     defines `SpecFile` and `IndexStatus` under a literal
     `// ---- Project Context ----` comment heading. The feature name appears
     only in that comment, so grepping module folders for it finds nothing.
  2. **Query hooks** — `src/lib/hooks/core.ts:123-136` already declares
     `useContextFiles` (`GET /repos/:id/context`) and `useReindexContext`
     (`POST /repos/:id/context/reindex`) under
     `// ---- Project Context (A3 contract; safe to call once API exposes it) ----`.
     They compile and are callable; only the API side is missing.
  3. **i18n** — `messages/en/context.json` is fully populated (title, empty
     state, `mode.preview`/`mode.edit`, `editor.save`) with **zero**
     `useTranslations("context")` callers anywhere in `src`.
  4. **Server-side twins** — the same convention runs through the DB schema
     and `reviewer-core`'s prompt slots; `reviewer-core/AGENTS.md` states it
     outright ("accepted today but unused by the starter server — a later
     lesson wires them, don't assume 'unused' means 'dead code'"), and the
     root `CLAUDE.md` says it of the schema's empty tables.

  The cost of missing it is not just wasted implementation: an unconsumed
  contract silently constrains the feature (here `IndexStatus` describes
  embedding indexing, which the spec had listed as a non-goal — a planner
  reading the hook would have built it).

  **Do this:** before calling anything greenfield, grep the feature's words
  as a *comment heading* — `grep -rn "Project Context" src/vendor/shared
  src/lib/hooks messages/` — not just as a directory or symbol name.

- **`BlastCard`'s tree opens nothing on arrival — do not "helpfully" restore
  `defaultOpen={i === 0}`.** Removed on 2026-08-19 at the user's explicit
  request: auto-opening the first symbol presumes it is the one the reader
  came for, and on a map of 10+ changed symbols it usually is not. Same
  positional-default family as the `=== 0` accordion defect below, but this
  one is a product decision, not a bug — a future "improvement" that reopens
  the first row is a regression. Consequence for tests: nine assertions in
  `BlastCard.test.tsx` silently depended on the first subtree being mounted.
  Any test asserting on callers/importers/chips must click the disclosure
  first — the file has an `expandSymbol(name)` helper for exactly this.
  (2026-08-19)

- **A card on the PR Overview tab gets HALF the width of the mockup it was
  drawn from, and raising the grid's `minmax` floor to fix that is a trap.**
  `OverviewTab/styles.ts` lays `IntentCard` and `BlastCard` out in
  `repeat(2, minmax(0, 1fr))`. It reached that value the long way round:
  `auto-fit, minmax(360px, 1fr)` let `BlastCard`'s counter row (four counters
  plus the Tree|Graph control, ~520px of content) wrap on every two-column
  layout; raising the floor to 600px stopped the wrap and instead collapsed
  the grid to ONE column on ordinary laptop widths, stacking the two cards —
  a worse outcome, and the thing the pairing exists to avoid. `auto-fit` has
  no setting that both keeps two columns and guarantees a wide one.
  **The binding constraint is the PAGE, not the grid.** `PrDetailView` caps the
  whole PR detail column at `maxWidth: 1240` (raised from 1080 on 2026-08-19
  for exactly this reason, and sized to the counter row rather than rounded up
  — a wider page is a product decision, not a layout fix) with 32px side padding, so an Overview card gets
  `(cap − 64 − 16) / 2` minus its own 20px padding. At 1080 that was ~460px,
  under the ~520px the Blast counter row needs — no amount of tightening
  inside the card could fix it. Check that number before restyling a card that
  does not fit.
  **Do:** size Overview card content for ~half the content width, not for the
  picture. Keep the track unconditional (`styles.ts` objects cannot carry
  media queries) and let the content degrade instead of the layout. When a row
  must keep one element pinned right, put `flexWrap: "wrap"` on the LEFT group
  and `flexShrink: 0` on that element — `flexWrap: "wrap"` on the row itself
  drops the whole right-hand element onto its own line, which reads as "the
  button moved" and sends you looking in the wrong file.
  **Equal WIDTHS inside a column have the mirror trap: the cross axis of a
  column flex is the width, so `align-items: flex-start` sizes every row to its
  own content and no `flexGrow` inside a row can widen it.** The row itself is
  already narrow; growing a child of a narrow row changes nothing. Both levels
  are needed — `alignItems: "stretch"` on the column, `flexGrow: 1` on the box
  inside each row. Cost one round on `IntentCard`'s risk list, 2026-08-24,
  where the fix looked applied and the rows stayed ragged.
  **Equal heights need three levels, not one.** Each card component renders
  `<section>` around its card `<div>`, so the SECTION is the grid item.
  `align-items: stretch` on the grid stretches the section and nothing else —
  putting `height: 100%` on the card alone does nothing, because its parent
  still has no height of its own. All three are required: `stretch` on the
  grid, `display: flex; flex-direction: column` on the `<section>`, and
  `height: 100%` on the card. (Column, not row: in a row flex box the card's
  main-axis size stays content-based and it can end up narrower than its
  cell.)
  **A long title that jumps to its own line is a `minWidth` bug, not a
  wrapping bug.** A flex item will not break below min-content, so a
  `flexWrap: "wrap"` row containing a long heading pushes the WHOLE heading
  to the next line rather than wrapping it in place — `#8` rendered as a bare
  number above its own title. Give the text `flexGrow: 1; flexShrink: 1;
  minWidth: 0` and `flexShrink: 0` to the fixed chips beside it.
  **A repo path overflowing a card needs BOTH `overflow-wrap: anywhere` and
  `minWidth: 0` on every flex column above it.** Paths in this product run to
  90+ characters with no spaces (`client/src/app/repos/[repoId]/pulls/…`), and
  `break-word` only breaks BETWEEN words — with no space to use it does
  nothing, so the text runs past the card edge. `anywhere` is the value that
  breaks inside a token. Fixing only that is still not enough: a flex column
  will not shrink below its widest child, so the unbroken path widens the
  whole card instead of wrapping in it. Any card rendering file paths
  (findings, diff, blast) needs both.
  **Wrapping is not enough on its own — a list of real paths has to be
  TRUNCATED to stay legible.** A design drawn against the demo repo
  (`src/api/public/index.ts`) collapses on this one, where a path is
  `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`:
  every row shares the same six leading segments and the part that tells the
  rows apart is off the end. Render the TAIL (`shortPath` in
  `BlastCard/helpers.ts`, last 3 segments behind `…/`) and keep the whole path
  in the link `href` and a `title` tooltip, so nothing is lost. Judge any
  path-rendering design against a real path from this repo before believing
  it — three rounds of "the design is completely different" here were volume,
  not styling.

- **`styles.ts` objects are INLINE styles: no `:hover`, no `:focus`, no media
  queries. The escape hatch is `app/globals.css` plus a `dd-` class.** Two
  precedents live there already — `.dd-md` for rendered-markdown blocks
  (2026-08-08) and `.dd-fileref` for the file-link hover in `BlastCard`
  (2026-08-19). Reach for it only for what inline styles genuinely cannot
  express; everything static stays in the colocated `styles.ts`, and a
  responsive layout is better solved by making the content fit than by
  smuggling a breakpoint into CSS.
  **Any property such a rule overrides needs `!important`.** The element's
  resting value comes from a React `style={}` attribute, and an inline style
  outranks every class selector — the rule parses, matches, and does nothing.
  I hit this twice: `pre > code` in the markdown entry below, and
  `.dd-fileref:hover`, which shipped without `!important` after I had read that
  very entry. Put the reason in a comment beside the declaration as well as
  here: this file is read when work starts, and the mistake is made later,
  while writing the rule. **(Now enforced by
  `src/test/globals-css.test.ts`** — it fails on any interaction-state rule
  whose declarations lack `!important`, so this half of the entry no longer
  depends on being remembered. The `dd-` escape-hatch guidance above is not
  machine-checkable and still applies.)

- **A total can be correctly derived and still lie, when the SET it sums
  includes rows a later row superseded. Name the scope on screen.** The PR
  severity bar (`SeverityCounters` under `FindingsTab`) sums
  `reviews.flatMap(r => r.findings)` — every review ever run. Re-running one
  agent does not replace its earlier review, so a real PR read `4 CRITICAL`
  while only three were still reported by anyone: Performance Reviewer had
  re-run and dropped its critical, and the bar kept counting it. Meanwhile
  `get_findings` in `mcp/` answers the same question with the newest review
  per agent (D5) and returned 9 against the page's 11 — two surfaces, two
  scopes, neither labelled. Fixed 2026-08-19 by captioning the bar ("across
  every run", full text in `title`) and by a `hint` on the MCP side. **The
  rule: whenever an aggregate spans rows that supersede one another, the
  surface states which set it counted** — the arithmetic being right is not
  the same as the number being true. The caption is a prop supplied by the
  caller, not baked into `SeverityCounters`, because the same component also
  renders a single run's tally, which needs no caveat.

- **Every number on a card must be derived from the array the card renders —
  a count computed independently WILL drift from what is on screen.** Three
  times in one feature (`BlastCard`, 2026-08-19) a counter and the body
  disagreed on the same screen, each time because they were computed from
  different places:
  1. the per-symbol heading counted `callers_total` (distinct caller FILES,
     from SQL) while the list rendered call sites — different units, so
     "1 caller" sat above two rows;
  2. the heading counted callers while the body listed callers AND importers,
     so an interface read "0 callers" with a row underneath it;
  3. the tree was gated on `totals.callers > 0` while `partitionSymbols`
     already treated endpoints, crons and importers as impact — so a symbol
     reaching two endpoints was replaced by "no downstream callers found",
     directly under a counter saying "2 endpoints".
  None of these is caught by typecheck or by a test that renders one fixture:
  every one needs a fixture where the two sources *disagree*.
  **Do:** compute the rendered collection once, then derive counts, headings
  and empty-state gates from THAT — never re-ask the payload. When a payload
  total must also be shown (`totals.callers_found`), label the unit, and add a
  test whose fixture makes the two numbers differ.

- **`--bg-primary` is the page BACKDROP, not the main surface — it is the
  darkest token, and using it to raise something makes that thing darker than
  what it sits on.** The dark scale in `vendor/ui/styles.css:11-14` runs
  `--bg-primary` #0a0a0a → `--bg-surface` #141414 → `--bg-elevated` #1c1c1c →
  `--bg-hover` #242424. Cards use `--bg-elevated`, so a row inside a card that
  wants to look raised needs `--bg-hover`; `--bg-primary` there renders as a
  black slab cut out of the card. The name is the trap — "primary" reads like
  "the main surface" and it means "the thing everything else sits on". Picked
  wrongly twice in one session on `BlastCard`.
  **Do:** to raise a surface, move UP this list from whatever the parent uses.
  Check the parent's token first; there is no single "raised" token, only a
  next one.

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

- **That same `SkillsTab` reorder is pointer-only — copying it satisfies no
  accessibility requirement.** (2026-08-23) It is plain HTML5 drag-and-drop
  (`draggable` / `onDragStart` / `onDragOver` / `onDrop`,
  `SkillsTab.tsx:101-118`) with no `onKeyDown`, no `tabIndex` and no `role`,
  and the ☰ handle at `:123` is `aria-hidden`. There is no keyboard path to
  reordering at all. It is the obvious thing to reuse — it is the only
  ordered-list reorder in the client — so a spec that asks for drag ordering
  *and* keyboard operability is asking for one thing that exists and one that
  does not. Budget the keyboard affordance as new work (move-up/move-down
  buttons, or arrow keys on a focusable row), and do not let "we already have
  drag reorder" stand in for it.

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
  **Adding the key is half the job — the other half is every mutation that
  changes what the new query DERIVES from, and those live in files the new
  feature never touches.** Invalidation lists are written per-mutation, so a
  query added by a later track is orphaned by construction: nothing fails, the
  cache simply keeps answering. Measured 2026-08-30 on `findingEvalSeed`, which
  the server computes from a finding's disposition (`accepted` → a `must_find`
  case, `dismissed` → `must_not_flag`) and from whether a case already exists.
  It is fetched once when the finding card expands — i.e. while the finding is
  still undecided — and `useFindingAction` invalidated only
  `queryKeys.reviews(prId)`. Pressing Dismiss then `Turn into eval case`
  produced a case of the **wrong kind**, named `must-find-…` for a dismissed
  finding, with `seeded_from.disposition: 'open'` written into the row. The
  same stale field carries `existing_case_id`, so the duplicate guard did not
  fire either and a twin case reached the set.
  **Do:** for each new query, write down what its response is computed from,
  then `grep -rn "useMutation" src/lib/hooks` and add the key to every mutation
  that writes one of those inputs. Test it on the CACHE, not on requests —
  `qc.setQueryData(key, …)`, run the mutation, assert
  `qc.getQueryState(key)?.isInvalidated`; a request-count assertion passes
  against the broken version. Confirm the test fails with the invalidation
  removed before believing it. (2026-08-30)

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

- **Adding a query hook to an existing component breaks that component's test
  with an error naming neither, because the test's `fetch` stub answers unknown
  URLs with `{}` — and `data ?? []` does NOT guard against it.** These tests stub
  one `fetch` with a URL-matching chain ending in a catch-all
  `return jsonResponse({})`. A newly added hook falls into that catch-all, so
  `data` is `{}` — not `undefined` — the nullish coalesce passes it straight
  through, and `.filter`/`.map` throws.
  What makes it cost a cycle: the thrown render surfaces as **five** failures
  reading `Unable to find an element with the text …`, because nothing rendered
  at all. The real cause is a `TypeError` in stderr, above the assertion output.
  Measured 2026-08-23 adding `useAgents()` to `ProjectContextView`:
  `(agents.data ?? []).filter is not a function`.
  **Do:** when a component test fails with several "unable to find" errors at
  once, read stderr before the assertions. When adding a hook to a component
  that already has a test, extend that test's stub chain with the new URL in the
  same change. And guard list payloads with `Array.isArray(x) ? … : []` rather
  than `x ?? []` — a wrong-shaped body is reachable in production too, not only
  under a stub. (2026-08-23, Project Context COVERAGE ring)

- **The frozen-display-order pattern has a second failure mode: a row the
  frozen order does not know was dumped at the END, which silently broke the
  grouping the list exists to show.** The entry below records freezing the order
  so a ticked row does not jump, and says ids absent from it "sort last by
  name". That is wrong once the grouping is itself a requirement. Attach a
  document that appeared in the repository after the tab loaded and it lands
  **fiftieth**, below every unattached row — the human ticks the box, nothing
  visibly happens, and they report the reorder as broken. Reported exactly that
  way on 2026-08-23; the server had returned the row first all along.
  **Do:** place an unknown row by its KIND (attached / inherited / available, or
  linked / unlinked), never at the end. Rows the frozen order DOES know still
  must not move — that is the anti-jump rule and it is unaffected. Both lists
  carry the fix: `applyDisplayOrder` in `@/lib/project-context` and in
  `SkillsTab/helpers.ts`, each with three tests — newcomer up, unattached
  newcomer down, known row unmoved. The third is what stops a future "fix" of
  one from breaking the other.

- **REVERSED 2026-08-23 — a ticked row now RISES to the top; the frozen-order
  entry below is superseded on this point.** That entry records freezing the row
  order so a ticked row cannot jump out from under the pointer, after exactly
  that was reported as a defect. The human reversed it: in a fifty-row list the
  opposite complaint is stronger — you tick something and then have to hunt for
  it — and the instruction was explicit, "все выделенные айтемы должны
  автоматически перемещаться в начало списка… это касается всех подсистем".
  Now in all three lists (both `Context` tabs and `SkillsTab`), toggling
  reseeds the display order, so the ticked rows form a group at the top and the
  newest joins that group's end.
  **Do:** do not "restore" the frozen index as a bug fix — it is a decision, and
  reversing it again needs the human. `ContextTab.test.tsx`'s
  "ticking the LAST row hoists it to the top" carries the same warning inline.
  Everything else in the entry below still holds: the order is state, not
  re-derived per render, and a drag still reseeds it.

- **Two affordances for the same action must compute "can I act" from ONE
  expression — arrows read a frozen order array, drag read the row, and they
  disagreed.** `ContextTab` offers move buttons and drag-and-drop for the same
  reorder. The buttons asked a separately-held `order: string[]` for the row's
  position; the drag handler asked the row itself. A document added to the
  repository **after the tab loaded** was never inserted into that array, so
  `indexOf` returned −1 → no buttons, while the drag still engaged. Reported as
  "ты убираешь кнопки, но при этом drag and drop работает", which is exactly
  what it looks like from outside: random.
  **The same applies across COMPONENTS that must behave alike.** The agent and
  skill Context tabs each kept their own gate for the identical control —
  `kind !== "inherited"` in one, `row.attached` in the other. They were aligned
  by hand three times in one session and drifted anyway; the divergence surfaced
  only when a test broke, never from reading either file. If two lists are
  required to behave identically, the predicate belongs in the shared module
  (`@/lib/project-context`) and each tab calls it — copying it into both is a
  promise no one can keep.

  **Do:** derive both from the same predicate, and make the state they read
  cover every row — `reconcileOrder` now inserts a newcomer instead of leaving
  it out, and drops a path whose document is gone. When a component holds a
  denormalised copy of a list (a frozen order, a selection set, an expanded-ids
  set), reconcile it on every data change; seeding it once and reading it
  forever is the same defect wearing different clothes.
  (2026-08-23, Project Context)

- **One visual channel, one meaning — a background fill that encoded BOTH "you
  ticked this" and "this arrives from a skill" made untouched rows look
  selected.** `ContextTab`'s row used `background: kind === "available" ? … : …`,
  so attached AND inherited rows shared the lighter fill. The human ticked one
  box, saw several rows change shade, and reported the list as broken — reading
  the fill as selection, which is what a fill after a click means to everyone.
  The two states are not alike: one is the human's action, the other is a
  property of the data.
  **Do:** give the state the human CAUSED the strongest channel (here the fill,
  driven by `attached` alone) and put every intrinsic property on a different
  one — border style, a badge, an icon. When a row can be in two states at once,
  check what the combination looks like before shipping: `attached` and
  `inherited` were individually fine and indistinguishable together.
  Both tabs now fill on `attached` only; inherited keeps its dashed border.
  (2026-08-23, Project Context)

- **A reorder test that asserts the MUTATION PAYLOAD can pass while the list on
  screen never moves.** `ContextTab`'s "reorders the LAST own row by keyboard"
  checked the `POST` body carried `["a","c","b"]` — and nothing else. Ordering
  here goes through two independent things: `moveAttached` rewrites each row's
  `order` field, and a separately-held frozen `order` array decides the rendered
  sequence (`applyDisplayOrder`). A handler that updates the first and forgets
  the second sends a perfect request and renders an unchanged list — which is
  precisely how `SkillsTab`'s drag shipped broken, in the version that had no
  component test at all.
  **Do:** for any ordered list, assert the **rendered sequence** after the
  interaction, not only what was sent. Read it off the DOM in a way that
  survives restyling — the rows' accessible names in document order — and assert
  the before AND the after, so a test that never re-renders cannot pass:

  ```ts
  const paths = () => screen.getAllByRole("checkbox")
    .map((el) => (el.getAttribute("aria-label") ?? "").replace(/^.*?(?=\S+\/)/, ""));
  expect(paths()).toEqual([...before]);
  fireEvent.click(screen.getByRole("button", { name: "Move docs/broken.md up" }));
  await waitFor(() => expect(paths()).toEqual([...after]));
  ```

  (2026-08-23 — added to `ContextTab.test.tsx`; the payload-only test was green
  the whole time.)

- **A component test that asserts a full i18n sentence turns every copy edit
  into a red suite, and the failure reads like a regression.** Measured across
  2026-08-23's Project Context work: **four separate fix rounds** were spent on
  tests that were never wrong — the criteria still held, only the wording had
  changed. Worse, the failures print as `Unable to find an element with the
  text: …`, which is what a genuinely broken render prints too, so each one cost
  a diagnosis before it cost a fix.
  **Do:** pin what the criterion requires, not the sentence that carries it.
  - the smallest fragment that would be false if the behaviour were wrong
    (`/not what a run sends/i`), never the whole string;
  - structure over prose — `getByRole("link", { name })`, `within(getByRole(
    "dialog"))`, `aria-current`, a count badge's own text;
  - when a test really must pin exact copy — a legal notice, a format the
    feature exists to display — say so in a comment, so the next person edits
    the message file and the test together on purpose.
  A test that breaks on every rewording is not protecting the criterion; it is
  protecting the draft. (2026-08-23, Project Context)

- **You can screenshot the running app yourself — headless Chrome is on the
  machine, and this repo has no Playwright or Puppeteer to look for.** When the
  Claude Chrome extension answers `Browser extension is not connected`, this is
  the fallback, and it needs no install:

  ```sh
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless --disable-gpu --hide-scrollbars \
    --window-size=1600,1000 --virtual-time-budget=10000 \
    --screenshot=/tmp/page.png "http://localhost:3000/<route>"
  ```

  `--virtual-time-budget` is the load-bearing flag: this app renders through
  TanStack Query after hydration, so a smaller budget captures the skeleton or
  an empty pane. 8–10s produced a fully populated page here. It prints unrelated
  `task_policy_set` and `externally_managed_app_manager` errors on macOS and
  still writes the file — check the file exists rather than trusting the exit
  output.
  Why it matters: this is the only way to verify a screen against its design.
  Measured 2026-08-23 — after `typecheck` clean and 348 green tests, the first
  screenshot immediately showed four defects no test could see: file names
  wrapping to two lines, an empty detail pane where the mockup opens a document,
  the document body never loading (the view derived `docs[0]` for display but
  still fetched by the unset `selectedPath`), and the selected row not
  highlighted for the same reason. Three screenshot rounds fixed all of them.
  **Size the window to the PAGE, not to a laptop — or you will report a block
  as missing when it is merely below the fold.** The PR Overview tab on a real
  pull request runs about **7,000px** tall, because `BlastCard` renders every
  changed symbol and a repository-sized PR has 117 of them. At
  `--window-size=1440,2400` the capture ends inside the blast list, and the
  `REVIEW FOCUS` block and the description below it are simply absent from the
  image — measured 2026-08-24, where that is exactly the wrong conclusion I
  drew for a minute. Shoot `--window-size=1500,7000`, then crop with
  **`sips`** (`sips -c <height> <width> --cropOffset <top> <left> in.png --out
  out.png`) — Python's PIL is not installed on this machine, and a 7,000px
  image read whole is downscaled past legibility.
  **Check a row's LONGEST real string, not that the block exists.** A screenshot
  read for structure — is the block present, in the right order, with its
  count — passes while the rows inside it render nothing like the design.
  Measured 2026-08-24 on `ReviewFocusCard`: the block was confirmed present and
  correctly placed, and every row was in fact wrapping its reason onto a second
  line, because the mockup's demo reasons are short and this repository's are
  not. Same family as the path rule above: judge any row-rendering design
  against the longest string real data produces. `flexWrap: "nowrap"` plus
  `minWidth: 0` and `textOverflow: "ellipsis"` is the one-line shape — without
  `minWidth: 0` a flex item never shrinks below its content and the ellipsis
  never fires.
  **Its one real limit: you cannot carry app state between two runs.**
  `--virtual-time-budget` exits Chrome the moment the budget is spent, before
  `localStorage` is flushed to the profile, so the usual trick — warm one URL
  with `--user-data-dir` to set state, then screenshot a second URL with the
  same profile — silently produces the un-warmed page. Tried on 2026-08-23 to
  switch the active repo (`dd-repo` in localStorage) before shooting an editor
  tab; both attempts rendered the default repo, and one hung for five minutes
  until `--no-first-run --no-default-browser-check` was added.
  So: a screen whose content depends on state you can only set through the UI
  is not screenshot-verifiable this way. Shoot the routes that carry their input
  in the URL path, and say plainly that the rest is unverified rather than
  implying it was seen.

  **Do:** for any UI change with a design, screenshot before saying it is done,
  and re-screenshot after each fix — reading the JSX back finds none of this.
  (2026-08-23, Project Context)

- **No gate in this repo can see a mockup, so a screen that matches no design
  passes everything.** Measured 2026-08-23 on the Project Context page: 42
  acceptance criteria MET, 342 client tests green, `architecture-reviewer`
  CLEAR, `plan-verifier` 58 MET — and the page still had a layout the mockup
  does not contain (a page-level `<h1>` and subtitle the design has none of,
  two rounded cards where the design is a rail plus a divider, a labelled
  `Refresh` button where the design has an icon toolbar, the full path where
  the design shows a bare file name). Every reviewer was *correct*: no
  criterion describes layout, so nothing was violated.
  The upstream cause is that a mockup is consumed once — to write the criteria
  — and then nothing carries it. The spec cites it as a design source, the plan
  step paraphrases it in prose, and neither the criteria nor the tests can
  encode "what nests inside what".
  **Do:** when a screen has a mockup, turn it into an explicit **element
  checklist** (region tree, each control's exact label, its position) and put
  that checklist in the plan step, so `plan-verifier` can check it item by item.
  Record every intentional departure from the design as its own line with the
  criterion or non-goal that forced it — otherwise a departure and a drift look
  identical in review. Reviewing UI against criteria alone will not catch
  drift, and asking a reviewer to "check it matches the design" cannot work:
  the subagents receive text, never images. (2026-08-23, Project Context)

- **`src/vendor/ui/nav.ts` is this app's own route configuration, not a
  vendored primitive — a new page's sidebar entry is one line there, and every
  attempt to avoid touching it edits MORE vendored code.** `client/AGENTS.md:47`
  says "vendored UI primitives; treat as read-only third-party code", which
  reads as covering the whole folder. But `nav.ts` contains only DevDigest
  routes (`/repos/:repoId/pulls`, `/skills`, `/agents`,
  `/repos/:repoId/conventions`, `/settings/api-keys`) and DevDigest's own
  `SHORTCUTS` registry; `Conventions` was added there the same way. There is no
  seam to reach it from outside: `Sidebar.tsx:3` imports `NAV` directly and
  `Sidebar({ ctx })` takes no nav prop, so an "override" approach means editing
  `Sidebar.tsx` **and** `ShellContext` — strictly more of the same folder.
  Cost of getting this wrong, measured 2026-08-23: a plan told an implementer to
  add the entry in `src/components/app-shell` (where no nav exists), the step
  came back PARTIALLY MET, both review rounds classified it unfixable, and the
  page shipped reachable only by typing its URL.
  **Do:** to add a page to the sidebar, add one `NavItemDef` to the right `NAV`
  group and one row to `SHORTCUTS`. That single line also yields the ⌘K command
  and the `g <key>` shortcut for free — `components/app-shell/hooks/
  useShellCommands.ts:21` and `useGlobalShortcuts.ts:45` both read `NAV`. Check
  `grep -oE 'gKey: "[a-z]"' src/vendor/ui/nav.ts` for a free letter first.
  (2026-08-23, Project Context)

- **A `<` in a `messages/**.json` string makes next-intl throw `INVALID_TAG`
  and render NOTHING — and no gate can see it.** ICU parses `<name>` as the
  opening of a rich-text tag, so copy that quotes markup or a placeholder —
  `<path>`, `<untrusted source="...">`, `<T>` — kills the whole message at
  runtime. `pnpm typecheck` does not read message files, `pnpm test` only
  catches it if a test asserts that exact rendered string, and the visible
  symptom is an empty element rather than an error. Same blind-spot family as
  the duplicate-top-level-key entry below.
  **Do:** never put a literal `<` in a message value. Write the shape in prose,
  or quote it with apostrophes/backticks instead of angle brackets, and pin the
  rendered text with a test when the string exists precisely to show a format.
  Found 2026-08-23 writing the skill Context tab's caption, which had to
  describe a `<untrusted source="…">` wrapper. (2026-08-23, Project Context S13)

- **Asserting a token colour in jsdom: read `element.style.color`, not
  `toHaveStyle`.** jsdom computes no cascade, so a CSS custom property resolves
  to the UA default — `expect(el).toHaveStyle({ color: "var(--warn)" })` fails
  with `+ color: canvastext`, which reads like the component lost its colour
  when the inline style is in fact exactly right. The inline value is on the
  element: `expect(screen.getByText("Negative case").style.color).toBe("var(--warn)")`
  passes and pins the token by name. Cost one cycle on 2026-08-30 pinning the
  eval case editor's kind banner.
  **Pin BOTH branches when a colour distinguishes two states** — an assertion
  that the negative banner is amber passes just as well on a version that
  painted both kinds amber. (2026-08-30)

- **Mermaid: style nodes with literal hex, never `var(--token)`, and expect
  silence when the chart is wrong.** `classDef`/`class` values are written into
  SVG presentation attributes, where a CSS custom property does not resolve —
  `stroke:var(--accent-text)` yields an unstyled box with no error anywhere.
  Mirror the token's value from `vendor/ui/styles.css` and pin it with a test
  asserting no `var(` reaches the chart string (`BlastCard/helpers.test.ts`).
  Related failure mode from the same component: `MermaidDiagram` validates with
  `mermaid.parse` and renders NOTHING on a parse failure, so a malformed chart
  is a blank area rather than an error — build the string in a pure helper with
  its own tests (`BlastCard/helpers.ts`) instead of inline in JSX.
  Mermaid ships as a client dependency already; a graph view here does not need
  a new library.
  **And it drags the whole of D3 in with it — check before arguing about a new
  visualisation dependency.** `mermaid@11 → d3@7 → 31 `d3-*` packages`,
  including `d3-force` and `d3-quadtree` (`pnpm why d3-force` in `client/`).
  So a force-directed graph costs a `package.json` line pinning something
  already in the bundle, not a new download — and `d3-force` run headlessly
  (`simulation.tick()` N times, read the coordinates) is a pure
  nodes+edges→positions function, as testable as any other helper here.
  I argued against it on "no new dependency" grounds without running that one
  command, and recommended hand-rolling a physics loop instead.
  **Driving a LIVE d3 simulation (draggable nodes) has three traps, all silent:**
  (1) `simulation.tick()` does NOT dispatch the `tick` event — it is the
  headless entry point, so a test that steps the sim by hand and listens via
  `sim.on("tick")` sees nothing; own the listener set and notify yourself.
  (2) a pinned node's position lives in `fx`/`fy`, and d3 copies it into
  `x`/`y` only on the FOLLOWING tick — read `fx ?? x` or the dragged node
  trails the cursor by a frame. (3) jsdom never drives d3-timer's
  requestAnimationFrame, so a live simulation produces no ticks under test at
  all; make `drag()` notify synchronously, which is also correct in a browser
  because a simulation cooled to alpha 0 has stopped ticking.
  **And d3's drag examples clear `fx`/`fy` on drop — do not copy that into an
  explorable graph.** Their demos exist to show physics, so a released node
  springing back is the point. In a map a reader drags apart to READ, it means
  every node you place undoes itself and the graph cannot be arranged at all
  (reported as "I can't pin a node"). Keep `fx`/`fy` set on release, release
  explicitly (double-click, plus a reset that unpins everything), and mark
  pinned nodes — otherwise nothing distinguishes a node the reader placed from
  one the simulation settled there.
  And when the view has a rotation, the screen→layout inverse must undo it:
  a drag that tracks perfectly at 0° and drifts at every other angle is that
  missing step (`viewport.ts`, round-trip test at five angles).

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

- **"Nothing changed in the browser" after a correct edit = a `next dev` that
  has been up too long, not a bug in your code.** A `pnpm dev` server left
  running for many hours (14h in the 2026-08-19 Blast Radius session) keeps
  serving a stale build: the file watcher stops picking up edits, so the code
  on disk, the committed tree and the tests are all right while the page is
  unchanged.
  **The tell, and it is easy to misread:** `pnpm typecheck` fails once with
  `.next/types/validator.ts(…): error TS2304: Cannot find name 'LayoutProps'`
  and passes on a plain re-run. That is not a flake to shrug off — it is the
  same stale `.next` speaking. I dismissed it as a transient artifact and lost
  a full round trip to "nothing changed".
  **Do:** before re-editing anything, check the server's age
  (`lsof -ti :3000`, then `ps -o pid,lstart,command -p <pid>`). Note `lsof`
  also lists browser PIDs holding connections — the server is the
  `next-server` one; its parent shows the real `next dev -p 3000` command.
  Then restart: kill the `pnpm dev` process tree, `rm -rf client/.next/types`,
  start again, and reload the browser with a cache bypass. Verify the code
  first (`git status`, grep the changed selector) so a restart is a diagnosis,
  not a guess.

- **Never call a parent's setState from inside your own state updater.** The
  natural way to add "tell the parent when this changes" is to wrap
  `setOpen` and fire the callback inside the updater, where you already have
  the previous value to compare against:

  ```tsx
  setOpenRaw((o) => { const v = next(o); if (v !== o) onOpenChange?.(v); return v; }); // ✗
  ```

  React may invoke an updater during render (and does, under StrictMode's
  double-invoke), so this throws *Cannot update a component (`Parent`) while
  rendering a different component (`Child`)*. Report from an effect instead,
  guarded by a ref so it only fires on real transitions:

  ```tsx
  const reported = React.useRef(defaultOpen);                                        // ✓
  React.useEffect(() => {
    if (reported.current === open) return;
    reported.current = open;
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  ```

  Detection gap worth remembering: `pnpm typecheck` was clean and all 205
  tests passed with the broken version — the existing tests never render the
  parent and child together. It showed up only as a runtime overlay when a
  human opened the page. Adding a cross-component callback is a "click
  through it in the browser" change, not a "tests are green" change.
  (2026-08-15, `ReviewRunAccordion` → `PrDetailView` open-state reporting)

- **This app scrolls an inner `<main overflow-y:auto>`, NOT the window — so
  window-level scroll reasoning does not apply here.** Measured in the
  running app: `document.body.scrollHeight === window.innerHeight` (838) and
  `window.scrollY` is always 0, while `main.scrollHeight` is 3775 with
  `clientHeight` 786. Before theorising about a scroll bug, measure
  `main.scrollTop` in the browser — `window.scrollY` will read 0 and tell you
  nothing.

  Two consequences that cost real time here:

  1. `router.push`/`replace` default to `ScrollBehavior.Default`
     (scroll-to-top) and `{ scroll: false }` disables it — true in general,
     and it is what the Next docs and source say. **But it is inert in this
     app**, because the window never scrolls. A "jump to X lands at the top"
     bug here is *not* caused by it, and adding `{ scroll: false }` will not
     fix one. (An earlier version of this entry prescribed exactly that fix
     on doc-reading alone; it changed nothing.)
  2. Switching tabs unmounts the outgoing tab's content, `<main>` shrinks to
     the new content's height, and the browser clamps `scrollTop`. Coming
     back remounts and the position is gone — measured 2587 → 244 on the PR
     detail view. `PrDetailView/use-tab-scroll.ts` saves the offset per tab
     and restores it, **but restoring an offset is only half the problem**:
     any collapse/expand state inside the tab is local `useState` and dies
     with the unmount too. Measured with `ReviewRunAccordion` #8 expanded:
     leaving at 2587 and returning gives 2061, because the accordion came
     back collapsed, the content lost 870px, and the browser clamped the
     restored offset. Restoring scroll without restoring the state that
     determines content height cannot work.

     Fixed by `PrDetailView/preserved-toggle.tsx`: a tiny context whose
     provider sits **above** the loading/error branches (those unmount the
     tab subtree too) holding a ref-backed `Record<key, boolean>`.
     `usePreservedToggle(key, fallback)` is a drop-in for
     `useState(fallback)` that seeds from the store and writes back. Consumers
     stay *uncontrolled*, so `ReviewRunAccordion`'s own auto-open effects
     (`targetRunId`, `containsFinding`) keep working untouched.

     **The same defect existed at two levels, and the root cause is a
     positional default.** `ReviewRunAccordion` had `defaultOpen={i === 0}`
     and `FindingCard` had `defaultExpanded={i === 0}` — so returning to the
     tab re-opened the *first* row while the row the user actually opened
     came back collapsed. Fixing only the accordion looked like nothing had
     changed, because the visible symptom was the finding card. Grep for
     `=== 0` defaults before assuming one fix covers it.

     Two rules that make this work:
     - **Key by id, never by index** (`finding:${f.id}`, `run:${review.id}`).
       An index re-applies the positional default after any reorder.
     - **Seed the store on mount, not only on change.** A store holding only
       the rows the user clicked lets untouched rows fall back to the
       positional default and resurrect it.

     Measured after: expanding the *last* finding, switching tabs and
     returning restores all four cards' exact states and both open
     accordions; scroll 2587 → 2587.

     Testing note: the verification that missed this asserted only that the
     *opened* accordion came back open. Assert the negative too — the ones
     that should stay closed.

     Two more traps when driving this from a browser tool:
     - **Do not read the DOM synchronously after a click.** React has not
       re-rendered yet, so `getBoundingClientRect()` returns the *previous*
       state and the run looks like the click did nothing. Wait a tick
       between acting and measuring.
     - **A slow page invalidates the whole experiment.** While
       `GET /pulls/:id` still took 30 s, the detail screen sat in its loading
       branch and no client fix could be observed at all — the behaviour
       under test never got to run. Fix the latency first, then verify the
       UI, or you will "confirm" a fix that was never exercised.

     **Testing trap that hid this:** the first verification scrolled to an
     accordion without expanding it, so total height was identical before
     and after and the restore looked perfect (2117 → 2117). A scroll
     restoration test is only meaningful when the content height actually
     changes across the round trip — expand something first.

  Reaching the container: `<main>` is rendered by
  `vendor/ui/shell/AppFrame.tsx`, which is read-only vendored code, so you
  cannot put a ref on it. Take a ref on your own root and walk up with
  `rootRef.current?.closest("main")`. Restoring also has to survive the
  incoming tab still growing (async query rows) — set `scrollTop`, then
  re-apply over a few `requestAnimationFrame`s until it sticks, or the
  browser clamps it back to a smaller `scrollHeight` on the first pass.

  Navigating straight to `?tab=findings&finding=<id>` *does* scroll correctly
  (measured `main.scrollTop` 2790, card in view) — that path works and is
  unrelated to the tab round-trip. (2026-08-15)

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
  a merge.

  **Check it by parsing, not by grepping.** A bare
  `grep -n '"<key>":' client/messages/en/<file>.json` also matches *nested*
  keys of the same name and reports a duplicate that does not exist — e.g.
  `"timeline"` appears both as a top-level block and as
  `findingsTab.timeline`, so the grep says 2 and nothing is wrong. Use the
  parser, which is exact:

  ```sh
  python3 -c "import json,collections,sys
  d=[]
  json.load(open('client/messages/en/prReview.json'),object_pairs_hook=lambda p:(d.extend(k for k,c in collections.Counter(x for x,_ in p).items() if c>1),dict(p))[1])
  print('duplicates:', d or 'none')"
  ```

  (2026-08-14, Smart Diff implementation — caught by `architecture-reviewer`,
  not by any automated gate; grep caveat added 2026-08-15 after it produced a
  false positive)

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
