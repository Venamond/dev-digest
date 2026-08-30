# Plan Verification

## Plan
`docs/plans/2026-08-23-project-context-folder.md`, Status: `approved — the human approved this plan on 2026-08-23`

Requirements source: `specs/2026-08-23-project-context-folder.md`
(SPEC-2026-08-23-project-context-folder, `approved`, AC-1…AC-42). Every `AC-<n>`
row below was verified against the criterion's own text in that file, not
against the step that claims it.

## The six known divergences — classified first

| # | Divergence | Verdict | Reasoning |
|---|---|---|---|
| 1 | `RunTrace.specs_omitted` is `.optional()`, not `.default([])` | **Plan defect** — work complete | The plan's own §2b/§6 goal was "a required field added to `RunTrace` must not break every existing literal". `trace.ts:96-111` records that a Zod `.default()` strips `undefined` from `z.infer`, so the key becomes REQUIRED at the TS level — the opposite of the intent. `.optional()` achieves what the plan wanted; `server test/contracts.test.ts:287` pins that a trace without the field still parses, and `TraceBody.tsx:24-27` reads it as `?? []`. Both typechecks are green with no fixture edited, which is S1's stated DoD. |
| 2 | `GitClient.writeFile(repo, path, content)` takes a repository-relative path | **Plan defect** — work complete | The plan contradicts itself: S1 specifies the signature `writeFile(repo: RepoRef, path: string, content: string)` (plan:321) while S4's prose asks for "the already-resolved absolute path" (plan:392). The signature shipped, and `simple-git.ts:137-175` re-validates the relative path itself (absolute, `..` on raw separators, containment after `realpath`), which is *stronger* than trusting a caller-resolved absolute path. `test/adapters.test.ts:49,68` pins both the write and the refusal. |
| 3 | `resolveInsideClone` is lexical only; the symlink assertion moved to `walkMarkdown` | **Plan defect** — work complete | The plan gave the helper a synchronous signature (`(clonePath, relPath): string \| null`, plan:410) and forbade `node:fs` in that ring; `CloneFs` (`adapters/clone-fs.ts`) has no `realpath`. The two constraints make symlink resolution unrepresentable in that function. The protection is not lost: `walk.ts:98-99` skips every symlink so a link is never enumerable as a document, and `simple-git.ts:170-175` re-resolves through `realpath` on the write path. `test/context-walk.test.ts:121` ("never emits a symlink") and `:132` (a root escaping the clone) cover it. |
| 4 | `getRepo(workspaceId, repoId)` instead of `getRepo(repoId)` | **Plan defect** — work complete | `repoId` arrives from the URL, so an unscoped lookup would be a cross-workspace read. `repository.ts:28` is workspace-scoped and `test/context-used-by.it.test.ts:187` ("getRepo is workspace-scoped and carries clone_path") plus `:177` ("does not leak attachments from another workspace") pin it. Strictly better than the plan's text. |
| 5 | No `400` for "a request that tries to position an inherited entry" | **Plan defect** — work complete | `SetContextDocsBody = { repo_id, paths }` (`platform.ts:316-321`) carries only the owner's own ordered paths, so an inherited entry has no position in the request to set — the rejection the plan asks for has no representable input. Rejecting a path a skill also contributes would contradict AC-20/AC-34, which explicitly allow the both-ways case. The reasoning is recorded at `service.ts:213-226`. AC-41's browser half is implemented and tested (see the AC-41 row). |
| 6 | S11's sidebar nav entry not implemented | **Plan defect on the location, real gap on the artefact — but no criterion requires it** | The plan told the implementer to add the entry in `client/src/components/app-shell` (plan:266-268), where no nav array exists: `NAV` lives at `client/src/vendor/ui/nav.ts:21`, and `client/AGENTS.md:47` declares `src/vendor/ui` read-only vendored code. So the plan named an unreachable location — a plan defect. The work is nonetheless genuinely absent: `grep -rn "/context" client/src/app client/src/components --include="*.tsx"` returns **no** link to `/repos/:repoId/context`, so the page is reachable only by typing the URL, and the command palette (`useShellCommands.ts:21`, built from `NAV`) has no entry either. Since **no acceptance criterion mentions a sidebar** (verified by reading AC-1…AC-42; the nav appears only on mockup M1), this is a **plan defect, not an unmet criterion** — it costs S11 a full `MET`, not any `AC` row. |

## Verdict table

### Steps

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| S1 | MET | `server/src/vendor/shared/contracts/platform.ts:267-328` (`ContextDocUser`, extended `SpecFile` with required `root`/`approx_tokens`/`used_by_agents`/`used_by`, `ContextDocEditorRow`, `SetContextDocsBody`, `SaveContextDocBody`); `contracts/trace.ts:102-111`; `adapters.ts:235` (`writeFile`). `./scripts/check-shared-sync.sh` → `vendor/shared in sync`. `test/contracts.test.ts:232,238,243,254,266,287`. Both typechecks green. | Divergence 1 (plan defect) |
| S2 | MET | `server/src/db/schema/context.ts:144-179` (both tables, `integer('order')`, composite PK); `migrations/0017_project_context_attachments.sql` (idempotent, inline `ON DELETE CASCADE`, `"order"` quoted, no statement-breakpoint); `meta/_journal.json` idx 17, version 7, `when` monotonic. `test/context-attachments.it.test.ts` 2 tests pass. | The DoD's second clause (a second `pnpm db:generate` prints "No schema changes") was **not run** — it writes into `src/db/migrations/`, outside a read-only verification. See `## What I could not verify`. |
| S3 | MET | `server/src/modules/context/constants.ts` — `DEFAULT_ROOTS`, `MARKDOWN_EXTENSION`, `DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING = 32_000`, both settings keys, and `export { approxTokens } from '@devdigest/reviewer-core/prompt-log.js'`. `test/context-constants.test.ts` 4 tests pass; server typecheck resolves the alias. | |
| S4 | MET | `server/src/adapters/git/simple-git.ts:137-175`; `server/src/adapters/mocks.ts:311`. `test/adapters.test.ts:49,68` pass. Server typecheck green with every `GitClient` implementation updated. | Divergence 2 (plan defect) |
| S5 | MET | `server/src/modules/context/walk.ts:48` (`resolveInsideClone`), `:65` (`walkMarkdown`); `server/.dependency-cruiser.cjs:53` now reads `(service\|helpers\|walk\|resolve\|facade\|run-executor\|diff-loader\|feature-models)\.ts$`. `test/context-walk.test.ts` 10 tests pass; `pnpm arch:check` → `no dependency violations found (209 modules, 697 dependencies cruised)`. | Divergence 3 (plan defect) |
| S6 | MET | `server/src/modules/context/repository.ts:28` (`getRepo`), `:37` (`readRoots`), `:48` (`readCeiling`), `:69` (`usedByAgents`). `test/context-used-by.it.test.ts` 8 tests pass, including `:160` "has NO entry for a document nobody uses — the caller must default it". | Divergence 4 (plan defect) |
| S7 | MET | `service.ts:108-128` / `:140-156` (`setAgentDocs`/`setSkillDocs`), `repository.ts:240,255` (`replaceAgentDocs`/`replaceSkillDocs`), validation at `service.ts:229-248`. `test/context-attach.it.test.ts` 7 tests pass, incl. `:151` (no `agent_versions` row), `:177` (AC-42 restore), `:212` (400s), `:238` (broken attachment re-submittable). | Divergence 5 (plan defect) |
| S8 | MET | `server/src/modules/context/resolve.ts:56-89` (pure, no I/O); `facade.ts` re-exports `resolveEffectiveDocs` + `createContextService`. `test/context-resolve.test.ts` 8 tests pass, incl. `:29` (overlap emitted once at the agent's index) and `:133` (reachable through the facade). `arch:check` green, so `no-cross-module-internals` holds. | |
| S9 | MET | `server/src/modules/context/routes.ts:46,55,75,97,114,136,153` — the six routes, explicit Zod `response` schemas, no drizzle/`db/schema` import; registered at `modules/index.ts:10,38`. `test/context-routes.it.test.ts` 8 tests pass, incl. `:140` (`200 []` for a never-cloned repo), `:177` (traversal `400` on GET and PUT), `:196` (PUT changes bytes, no commit). `arch:check` green. | |
| S10 | MET | `client/src/lib/hooks/keys.ts:11,12,19,26`; `core.ts:142,160,176,189,206,228` — all six hooks; every mutation does `setQueryData` on its own key **and** `invalidateQueries({ queryKey: queryKeys.context(repoId) })` (`core.ts:168,215,237`). `useContextFiles` (`:125`) and `useReindexContext` (`:133`) untouched. Client typecheck + 248 tests green. | |
| S11 | PARTIALLY MET | Present: `client/src/app/repos/[repoId]/context/page.tsx`, `_components/ProjectContextView/{ProjectContextView.tsx,helpers.ts,styles.ts}`; rewritten `client/messages/en/context.json` (no `"chunks"`, no `.devdigest/specs/`, `totals.line` + `totals.caption`, `mode.preview`/`mode.edit` kept); 13 `ProjectContextView.test.tsx` cases pass. **Absent:** the nav entry — `NAV` (`client/src/vendor/ui/nav.ts:21`) has no `context` item, and `grep -rn "/context" client/src/app client/src/components --include="*.tsx"` finds no link to the page. | Divergence 6. The page is unreachable through the UI. No AC requires it — see the divergence table. |
| S12 | MET | `AgentEditor/constants.ts:14` (`{ key: "context", labelKey: "editor.tabs.context", icon: "Folder" }`) and `:18` (`VALID_TABS`); `AgentEditor/_components/ContextTab/{ContextTab.tsx,helpers.ts,styles.ts}`. `ContextTab.test.tsx` 14 cases + `helpers.test.ts` 20 cases pass, incl. the frozen-order case `:220` and the keyboard move `:203`. | |
| S13 | MET | `SkillEditor/constants.ts:10,16`; `SkillEditor/_components/ContextTab/{ContextTab.tsx,styles.ts}` importing `helpers` from the agent tab (`ContextTab.tsx:34`) rather than a second copy. 12 test cases pass, incl. `:167` "does not claim the panel shows the serialization". | |
| S14 | MET | `reviewer-core/src/prompt.ts:69-76` (notice), `:160-165` (`wrapUntrusted(doc.path, "### " + path + "\n" + text)`), `:191` (`## Project context` section), `:210` (`assembly.specs`); `review/run.ts:65,143`. `npm test` → `Test Files 4 passed (4) / Tests 35 passed (35)`. `pnpm arch:check:core` → `no dependency violations found (25 modules, 55 dependencies cruised)`. | |
| S15 | MET | `run-executor.ts:301-305` (the pass, before the `reviewPullRequest` call at `:311`), `:512-585` (`loadProjectContext`: facade resolve, in-order read, `unreadable`, whole-or-nothing ceiling with skip-and-continue, `currentHead`, non-fatal catch), `:326` (`specs` passed only when non-empty). `test/context-run.it.test.ts` 9 tests pass. | |
| S16 | MET | `run-executor.ts:453-455` (success trace) and `:727-729` (failure-path trace) populate `specs_read`, `specs_omitted`, `specs_revision`; call order preserved — `saveRunTrace` at `:461`, `completeAgentRun` at `:462`. `test/context-run.it.test.ts:355` "persists the project-context trace BEFORE the run reads as finished" passes, and the whole 120-test integration suite is green. | |
| S17 | MET | `RunTraceDrawer/_components/TraceBody/TraceBody.tsx:49-89` (`Specs read`, `Specs omitted` with per-reason text, `Specs revision`) and `:123-124` (the prompt slot). Keys in `client/messages/en/runs.json` — the namespace the component declares. `RunTraceDrawer.test.tsx` 5 new cases pass. | |

### Definition of done (`## 0`)

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| DoD-1 — "a review run against a diff that violates an invariant stated in an attached document produces a finding that references that document" | CANNOT VERIFY | No mechanised check exists; the hermetic suites use a mock LLM whose output the test author wrote. The plan's `## 5` itself declares this manual-only. | Same reason as AC-27. A human must run it once against the real model. |
| DoD-2 — "the run's trace names every document read, every attached document left out with which of the two reasons applied, and the revision they were read at" | MET | `run-executor.ts:453-455`; `test/context-run.it.test.ts:243` (read + `unreadable`), `:263` (`over_ceiling` skip-and-continue), and the revision asserted in the same suite; `TraceBody.tsx:49-89` renders all three. Integration suite: `Test Files 19 passed (19) / Tests 120 passed (120)`. | |

### Acceptance criteria (`specs/2026-08-23-project-context-folder.md`)

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| AC-1 | MET | `walk.ts:65-81` enumerates recursively, repository-relative; `routes.ts:46-53`. `test/context-routes.it.test.ts:146` "lists the clone's markdown with root and tokens" passes. | covered by S5, S9 |
| AC-2 | MET | `constants.ts:16` `DEFAULT_ROOTS = ['specs','docs','insights']`; `repository.ts:37` falls back to it. `test/context-constants.test.ts:12` and `test/context-used-by.it.test.ts:192` ("falls back to the defaults, then honours a settings override") pass. | S3, S5 |
| AC-3 | MET | Server: `test/context-walk.test.ts:66` — same file name under two roots, each with its own `root`. Client: `ProjectContextView.test.tsx:125`, skill `ContextTab.test.tsx:214` ("shows each row's file name and its OWN containing folder"), agent tab row renders `fileNameOf` + `folderOf` (`ContextTab.tsx:264-272`). | S11, S12, S13 |
| AC-4 | MET | `ProjectContextView.test.tsx:151` "refetches the list from the refresh control" passes; `context.json` `refresh`/`refreshing`. | S11 |
| AC-5 | MET | `ProjectContextView.test.tsx:194` "renders the document's markdown in Preview" passes. | S11 |
| AC-6 | MET | `test/context-routes.it.test.ts:196` "PUT changes the bytes on disk and makes no commit" passes; `simple-git.ts:137-141` writes UTF-8 only, creates no directory, no remote call. | S4, S9, S11 |
| AC-7 | MET | `ProjectContextView.test.tsx:210` "warns in Edit mode that a save is local, lost on resync and never reaches GitHub" passes; copy at `context.json` `editor.localOnly`. | S11 |
| AC-8 | MET | `repository.ts:69` `usedByAgents`; `test/context-used-by.it.test.ts:121` passes; `ProjectContextView.tsx:192-207` renders the count; both tabs render `agents: row.usedBy.length` (`ContextTab.tsx:270`). | S6, S11 |
| AC-9 | MET | agent `ContextTab.test.tsx:112` "renders one row per document with an N of M attached count" passes. | S12 |
| AC-10 | MET | skill `ContextTab.test.tsx:100` "renders the N of M count and the inheritance sentence" passes. | S13 |
| AC-11 | MET | `test/context-attach.it.test.ts:118` "stores only the path, in the given order, and reordering persists" passes; the schema has no text column (`schema/context.ts:144-179`). | S7 |
| AC-12 | MET | `test/context-attach.it.test.ts:151` "writes no agent_versions row and does not bump the agent" passes — asserted as a count, not as an absence of code. | S7 |
| AC-13 | MET | Order persisted: `test/context-attach.it.test.ts:118`, over HTTP `test/context-routes.it.test.ts:224`. Used as the prompt order: `test/context-run.it.test.ts:222` "sends every attached document, in the agent's order". Browser: agent `ContextTab.test.tsx:203` keyboard reorder fires the mutation. | S7, S12 |
| AC-14 | MET | agent `ContextTab.test.tsx:142`; skill `ContextTab.test.tsx:108` "orders attached above unattached, unattached grouped by root"; pure rule at `helpers.test.ts:108`. | S12, S13 |
| AC-15 | MET | agent `ContextTab.test.tsx:158`, skill `:124`, `helpers.test.ts:245` ("narrows on path and on root, and is a no-op when blank"). | S12, S13 |
| AC-16 | MET | agent `ContextTab.test.tsx:236` "opens a preview drawer with path, root, tokens, using agents, markdown and attach" passes; drawer at `ContextTab.tsx:296-345`; skill tab has the same drawer (`ContextTab.tsx:177-181`). | The drawer shows the **count** of using agents, which AC-16 requires. AC-35's additional naming requirement is scored on its own row. |
| AC-17 | MET | skill `ContextTab.test.tsx:141` (exact attached paths under root headings, empty root omitted), `:167` (caption does not claim to show the serialization and states the real block's shape), `:183` (nothing attached → says so); pure grouping at `helpers.test.ts:212-241`. | The spec's AC-17 text still says "shall show how the attached documents serialize"; the human's 2026-08-23 M8 decision changed it to a grouped index. Plan §8 already flags that the spec text should be amended. Judged against the human's decision, which the spec revision has not yet caught up with. |
| AC-18 | MET | agent `ContextTab.test.tsx:128` (total over the rendered rows, both-ways row counted once) and `:136` (the untrusted `## Project context` sentence). | S12 |
| AC-19 | MET | `test/context-run.it.test.ts:222` "sends every attached document, in the agent's order (AC-19, AC-39)" passes; `run-executor.ts:326` passes `specs: [{path,text}]`; `prompt.ts:160-165` identifies each by path. | S15 |
| AC-20 | MET | Pure rule: `resolve.ts:74-85` (own list walked first; inherited pass only adds provenance), `test/context-resolve.test.ts:29` "emits an overlapping document once, at the AGENT's index". End to end: `test/context-run.it.test.ts:293` "a document attached to the agent AND an enabled skill is sent once". | S8 |
| AC-21 | MET | `prompt.ts:69-76` notice + `:164` `wrapUntrusted` per document, under `INJECTION_GUARD` (`prompt.ts:16-33`). `reviewer-core/test/prompt.test.ts:144` asserts one section, the notice, and one `<untrusted source="…">` block per document; `:175` "cannot be broken out of by a document body or by its own path". | S14 |
| AC-22 | MET | `run-executor.ts:545-549` records `unreadable` and continues; `readContextDoc` (`:596-615`) treats missing/empty/NUL-bearing as unreadable. `test/context-run.it.test.ts:243` "skips a document deleted from the clone and still completes" passes. | S15 |
| AC-23 | MET | `run-executor.ts:558-565` — whole-or-nothing, `continue` rather than `break`, each skip recorded `over_ceiling`, never truncated. `test/context-run.it.test.ts:263` "skips a document that does not fit and still considers the ones after it" passes — the skip-and-continue case, not merely a cap. | S15 |
| AC-24 | MET | agent `ContextTab.test.tsx:249` and skill `:200` "warns above the ceiling and does not warn just under it"; pure boundary at `helpers.test.ts:205`. | S12, S13 |
| AC-25 | MET | Trace side: `run-executor.ts:453-455`, `test/context-run.it.test.ts:243`. Reader side: `TraceBody.tsx:66-81` renders each omission with `omittedUnreadable` ("could not be read") or `omittedOverCeiling` ("did not fit"); `RunTraceDrawer.test.tsx:71` "names every document read, every one omitted with its reason, and the revision". | S16, S17 |
| AC-26 | MET | `runs.json` `trace.prompt.specs` = `Project context — attached specs (untrusted)`; rendered at `TraceBody.tsx:123-124` from `prompt_assembly.specs`; `PromptBlock.tsx:1,79` gives copy, `PromptModalBody.tsx:43-66` gives the line search. `RunTraceDrawer.test.tsx:94` "expands the project-context slot to the exact prompt_assembly.specs string". | S14, S17 |
| AC-27 | CANNOT VERIFY | **Manual-only by the plan's own `## 5`** (plan:870-874): a human must attach a document stating an invariant, open a PR that violates it, run the review against the real model and read whether the finding references the document. The hermetic suites use a mock LLM whose output the test author wrote, so no automated evidence can stand in. | S15 (mechanism only). Not attempted. |
| AC-28 | MET | `constants.ts:27` `= 32_000`; override key `context.token_ceiling` (`:35`), read at `repository.ts:48`. `test/context-constants.test.ts:17` and `test/context-run.it.test.ts:282` ("uses the 32 000-token default when the workspace sets no ceiling") pass. | S3, S15 |
| AC-29 | MET | `ProjectContextView.test.tsx:186` "shows THAT document's own containing folder when selected" passes; copy `detail.folder` = `Folder: {folder}`. | S11 |
| AC-30 | MET | `ProjectContextView.test.tsx:231` "keeps the typed text in the editor when the save fails" passes — asserts the text is still present, not merely that an error shows; copy `editor.saveError`. | S11 |
| AC-31 | MET | Plain FK cascade, no application code: `schema/context.ts:144-179` + `migrations/0017…sql` `REFERENCES "repos"("id") ON DELETE CASCADE`. `test/context-attachments.it.test.ts:57` "drops both tables' rows when the repo goes, and a same-name repo starts empty" and `:117` (cascade from agent and skill) pass. | S2 |
| AC-32 | MET | `run-executor.ts:326` omits `specs` entirely when nothing is readable; `prompt.ts:160` omits the section for an empty array (`reviewer-core/test/prompt.test.ts:170`). Two distinguishable states: `test/context-run.it.test.ts:325` (no section at all) and `:337` ("an attached-but-unusable set is NOT the same state as nothing attached"). Reader side: `TraceBody.tsx:30,52-56` picks `specsNoneAttached` vs `specsAllOmitted`; `RunTraceDrawer.test.tsx:113`. | S16, S17 |
| AC-33 | MET | `run-executor.ts:567-570` `currentHead(...).catch(() => null)`, written to `specs_revision` at `:455`; asserted in `test/context-run.it.test.ts`; rendered at `TraceBody.tsx:83-87`, tested `RunTraceDrawer.test.tsx:71` and `:132` (omitted when there was no clone). | S16 |
| AC-34 | MET | Same resolver as the run (`service.ts:166-174` → `resolve.ts`), so the tab cannot disagree. agent `ContextTab.test.tsx:119` "renders ONE row for a document that is both attached and inherited", `:128` totals it once; inherited rows badged (`ContextTab.tsx:275-281`); over HTTP `test/context-routes.it.test.ts:284`. | S8, S12 |
| AC-35 | **PARTIALLY MET** | **Present** on the Project Context page: `ProjectContextView.tsx:200-208` renders each user as `<a href={"/agents/" + u.agent_id}>` with the `via skill` note; `ProjectContextView.test.tsx:163` "names every using agent as a link". **Missing in the preview drawer of both `Context` tabs**: `agents/[id]/…/ContextTab/ContextTab.tsx:318-322` and `skills/[id]/…/ContextTab/ContextTab.tsx:318` render only `agents: row.usedBy.length` — a count, no names and no link. `grep -n "usedBy" …/ContextTab/ContextTab.tsx` returns exactly those two count sites. | The criterion is explicit: "on the Project Context page **and in the preview drawer** — it shall also name those agents and shall let the human open each of them". The data is already on the row (`helpers.ts:39` carries `used_by`), so only the rendering is absent. |
| AC-36 | MET | Server marks it: `ContextDocEditorRow.readable` (`platform.ts:311`), `test/context-attach.it.test.ts:238` (a broken attachment stays re-submittable). Client: agent `ContextTab.test.tsx:172` and skill `:136` "marks an attached document that can no longer be read"; badge at `ContextTab.tsx:283-287`. | S5, S7, S12, S13 |
| AC-37 | MET | `ProjectContextView.test.tsx:220` "states how many agents use the document after a successful save"; copy `editor.saved` carries both the local-only statement and the plural agent count. | S11 |
| AC-38 | MET | `ProjectContextView.test.tsx:136` "footers the count and the SUMMED token total, not any single document's" and `:145` "captions the total as the repository's, not as what a run sends"; copy `totals.caption`. | S11 |
| AC-39 | MET | `resolve.ts:56-89` — own paths first in the human's order, then enabled skills sorted by `agent_skills.order` (name as tiebreaker) and, within a skill, by its own order. `test/context-resolve.test.ts:51` (two skills ordered by `agent_skills.order`) and `test/context-run.it.test.ts:222` (the assembled prompt's order). **Same resolver as the tab**: `service.ts:166-174` (`effectiveDocsForAgent`) is what `buildAgentRows` (`service.ts:250-256`) and `run-executor.ts:536` (via `facade.ts`) both call — one implementation, two surfaces. | S8, S15 |
| AC-40 | MET | `resolve.ts:67-70` filters `linkEnabled && skillEnabled`. `test/context-resolve.test.ts:88` "contributes nothing while either switch is off"; run side `test/context-run.it.test.ts:309` "disabling the skill link removes only the skill's documents"; tab side `test/context-used-by.it.test.ts:138,150` (link off, then `skills.enabled` off). Tab and run share the one resolver — see the AC-39 row. | S8, S15 |
| AC-41 | MET | Browser: agent `ContextTab.test.tsx:177` "gives an own row a move control and an inherited row none" and `:187` "makes own rows draggable and inherited rows not". Server: unrepresentable by construction — `SetContextDocsBody` carries only the owner's own paths (`platform.ts:316-321`), reasoning recorded at `service.ts:213-226`. | Divergence 5; the criterion's own wording ("shall not let the human drag that row") is a UI obligation and is met. |
| AC-42 | MET | `test/context-attach.it.test.ts:177` "restoring an earlier skill version leaves the attachments untouched" passes — the restore is exercised, not merely argued from the schema. | S7 |

## Verification commands

| Package | Command | Result |
|---|---|---|
| shared contracts | `./scripts/check-shared-sync.sh` | pass — `vendor/shared in sync` |
| server (types) | `cd server && pnpm typecheck` | pass (exit 0) |
| client (types) | `cd client && pnpm typecheck` | pass (exit 0) |
| reviewer-core | `cd reviewer-core && npm test` | pass — 4 files / 35 tests |
| server (unit) | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` | pass — 34 files / 318 tests |
| server (integration) | `cd server && pnpm exec vitest run .it.test` | pass — 19 files / 120 tests (Docker available) |
| client | `cd client && pnpm exec vitest run src/app/repos/[repoId]/context src/app/agents src/app/skills src/app/repos/[repoId]/pulls` | pass — 37 files / 248 tests |
| server (architecture) | `cd server && pnpm arch:check` | pass — 0 violations |
| reviewer-core purity | `cd server && pnpm arch:check:core` | pass — 0 violations |

```
vendor/shared in sync

 Test Files  4 passed (4)
      Tests  35 passed (35)
=SERVER-UNIT rc=0=

 Test Files  34 passed (34)
      Tests  318 passed (318)
=rc=0=

✔ no dependency violations found (209 modules, 697 dependencies cruised)
=rc=0=

✔ no dependency violations found (25 modules, 55 dependencies cruised)
=rc=0=
```

```
DOCKER_OK
 ✓ test/context-used-by.it.test.ts (8 tests) 2556ms
 ✓ test/context-attach.it.test.ts (7 tests) 9128ms
 ✓ test/context-run.it.test.ts (9 tests) 11087ms
 ✓ test/context-routes.it.test.ts (8 tests) 11685ms
 ✓ test/context-attachments.it.test.ts (2 tests) 3866ms

 Test Files  19 passed (19)
      Tests  120 passed (120)
```

```
 Test Files  37 passed (37)
      Tests  248 passed (248)
```

```
> @devdigest/api@0.0.0 typecheck
> tsc --noEmit -p tsconfig.json
=server rc=0=
> @devdigest/web@0.0.0 typecheck
> tsc --noEmit
=client rc=0=
```

## Unrequested work

- `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` and
  `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx` were
  modified. Neither is in S12's or S13's file list (the plan names only
  `constants.ts` and the new `ContextTab/` directory). Mounting the new tab in
  the editor is a necessary consequence of adding it to `TABS`, so this reads as
  omission from the plan's file list rather than scope creep — but it is work no
  plan item asked for by name.
- `client/…/RunTraceDrawer/{helpers.ts,styles.ts}` and
  `_components/TraceBody/TraceBody.tsx` were modified; S17 names only
  `RunTraceDrawer.tsx` and its test. The component was already split into
  `_components/`, so the plan's file list is stale rather than the work being
  out of scope. `RunTraceDrawer.tsx` itself is **not** in the modified set.
- `server/test/{prompt-callers,prompt-log,prompt-structured}.test.ts` and
  `reviewer-core/test/prompt-log.test.ts` were modified. S14 says only "the
  prompt suite"; these are the callers that had to follow the `specs` shape
  change. Consistent with the plan's intent, outside its named files.
- `server/INSIGHTS.md` and `client/INSIGHTS.md` were modified — expected
  post-work practice per root `CLAUDE.md`, named by no plan step.
- Everything under `img/`, `specs/`, `docs/retro/`, `AGENTS.md`,
  `.claude/skills/**` was excluded from this verification as unrelated
  concurrent work, per the brief.

## Plan defects

1. **S1's `.default([])` prescription is self-defeating** (plan:315). In Zod 3 a
   default strips `undefined` from `z.infer`, making the key required on the
   output type — precisely the breakage §2b line 161 and §6 wanted to avoid. The
   plan should say `.optional()`.
2. **S4 contradicts itself** — the signature at plan:321 takes a
   repository-relative `path`, the prose at plan:392 asks for "the
   already-resolved absolute path from the service". Two incompatible
   instructions for one method.
3. **S5 asks for symlink resolution inside a synchronous, `node:fs`-free
   helper** (plan:410-413). Unimplementable as specified: `CloneFs` has no
   `realpath`. The plan should place the physical check in the adapter, which is
   where it ended up.
4. **§2c's call sequence names `getRepo(repoId)` unscoped** (plan:194). `repoId`
   comes from the URL, so this would be a cross-workspace read.
5. **S7 requires a `400` for "a request that tries to position an inherited
   entry"** (plan:479-480) against a body that cannot express one
   (`{ repo_id, paths }`, plan:312). The criterion it cites, AC-41, is a UI
   obligation; enforcing it as the plan words it would contradict AC-20/AC-34.
6. **S11 places the nav entry in `client/src/components/app-shell`**
   (plan:266-268, plan:582), where no nav array exists — `NAV` is at
   `client/src/vendor/ui/nav.ts:21`, declared read-only by `client/AGENTS.md:47`.
   The instruction cannot be followed as written, and no acceptance criterion
   covers a sidebar entry, so the plan asked for unbudgeted work at an
   impossible address. **Consequence for the human to decide:** the Project
   Context page currently has no entry point in the UI at all.
7. **AC-17's spec text and the human's M8 decision disagree.** The plan already
   records this (§8) and asks `/spec-creator` to amend the criterion. Until then
   `specs/…:187-190` says "shall show how the attached documents serialize"
   while the shipped panel is a grouped index — verified against the human's
   decision, not the stale sentence.
8. **`## 0` has no `Requirements (verified)` `R<n>` table.** Four decisions in
   the interview table are marked `planner default, unanswered` (search roots
   and the ceiling in `settings`; two attachment tables; "used by" counts the
   effective set; I/O through ports). All four shipped as decided, but **none was
   ever confirmed by the human** — a plan defect, not a code defect, and the same
   thing an unconfirmed `R<n>` row would have flagged.

## What I could not verify

- **AC-27 and DoD-1** — manual by the plan's own `## 5`. No automated evidence is
  possible: the hermetic suites drive a mock LLM whose output the test author
  wrote. A human must attach a document stating an invariant, open a PR
  violating it, run a real review, and read the finding.
- **S2's second DoD clause** — that a further `cd server && pnpm db:generate`
  prints "No schema changes, nothing to migrate". Not run: `db:generate` writes
  into `server/src/db/migrations/`, which is outside a read-only verification.
  The integration suite proves the migration chain runs (testcontainers applies
  it), so the risk this clause guards against is drift in the drizzle snapshot,
  not a broken migration.
- **Whether the human has applied the migration to their persistent database**
  (`cd server && pnpm db:migrate`). The integration evidence above comes from
  testcontainers, which applies the chain itself; nothing here proves the
  developer's own database is up to date.
- **Runtime behaviour of any surface end-to-end in a browser.** No stack was
  started; every client verdict rests on source citation plus jsdom component
  tests.

## Summary line
57 MET / 2 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY
