# Plan Verification — round 2 (scoped)

## Plan
`docs/plans/2026-08-23-project-context-folder.md`, Status: `approved — the human
approved this plan on 2026-08-23`

Requirements source: `specs/2026-08-23-project-context-folder.md`
(SPEC-2026-08-23-project-context-folder, `approved`, AC-1…AC-42).

**Scope of this round.** Round 1's report
(`docs/reports/2026-08-23-plan-verify-project-context-folder-r1.md`,
57 MET / 2 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY) stands for every row not
listed below; those rows were not re-derived and are not restated here. This
round verifies only the seven items the brief named, plus the fix round's own
deviation, against the source and against commands run here. Fix round under
review: `docs/reports/2026-08-23-implementer-project-context-folder-fix-r1.md`
— treated as a claim, not as evidence.

## Verdict table

| Item | Verdict | Evidence | Note |
|---|---|---|---|
| **AC-35** — "WHERE the system shows how many agents use a document (AC-8) — on the Project Context page **and in the preview drawer** — it shall also name those agents and shall let the human open each of them" (`specs/…:142-145`) | **MET** (was PARTIALLY MET) | **Agent tab drawer:** `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx:339-357` — `row.usedBy.length === 0` renders `context.previewUsedByNone`, otherwise each `u` renders `<a href={"/agents/" + u.agent_id}>{u.agent_name}</a>` (`:345`) with the `via {skill}` note at `:349-351`. **Skill tab drawer:** the identical block at `…/skills/[id]/…/ContextTab/ContextTab.tsx:337-355`. **Project Context page** (unchanged, re-cited): `…/ProjectContextView/ProjectContextView.tsx:198-210`. Copy exists in both namespaces: `client/messages/en/agents.json:165-166`, `client/messages/en/skills.json:234-235`. Behaviour asserted through the role, not the markup: agent `ContextTab.test.tsx:300` `names every using agent in the preview drawer, each openable (AC-35)` asserts `getByRole("link", {name:"Security Reviewer"}).href === "/agents/ag1"`, the skill-provenance link `"/agents/ag2"`, and `/via House Style/`; `:317` asserts the empty state. Skill twin at `…/ContextTab.test.tsx:254` and `:269`. All pass — see CLIENT-CTX below. | The count remains in the meta line (`ContextTab.tsx:320`), so AC-16's requirement is not displaced; the names are additive. Both surfaces the criterion names now satisfy both of its verbs (name, open). |
| **AC-18** — the agent tab shows the approximate total token count of the attached documents and states they are injected as an untrusted `## Project context` block (`specs/…:191-193`) | **MET** (re-derived after the ceiling refactor) | The total is unaffected by F2: it is `injectedTokens(rows)` over the rendered rows (`client/src/lib/project-context.ts:203-207`, moved verbatim from the old tab helpers), rendered at `ContextTab.tsx:130-133` as `context.injectedTotal` + `context.injectedCaption`. `data.token_ceiling` is read only for the warning (`:106`, `:135`), never for the total. Tests: agent `ContextTab.test.tsx:147` `totals the tokens over the rows it renders, counting the both-ways row once (AC-18, AC-34)` and `:155` `states that the documents are injected as an untrusted ## Project context block (AC-18)`; skill `:217`. All pass. | The refactor touched the ceiling, not the total; the both-ways-counted-once property still comes from `rowKind` (`project-context.ts:47-56`), not from a de-duplication step. |
| **AC-24** — WHILE the attached documents exceed the project-context ceiling, warn on that editor's `Context` tab (`specs/…:249-252`) | **MET** (re-derived; now stronger than r1) | The client literal is gone: `grep -rn "PROJECT_CONTEXT_TOKEN_CEILING\|32_000" client/src` returns only test stubs and `project-context.test.ts` arguments — no production constant. `overCeiling(total, ceiling)` requires its argument (`client/src/lib/project-context.ts:226`), and the docstring at `:218-225` records why no default is allowed. Both tabs take the ceiling from the payload: `agents/…/ContextTab.tsx:106` (`data?.token_ceiling ?? null`) → `:135`; `skills/…/ContextTab.tsx:109` → `:143`. **The agreement the two criteria exist for is now structural, not coincidental:** the tab's number is `ContextService.tokenCeiling(workspaceId)` (`server/src/modules/context/service.ts:180-182`, called from `withCeiling` at `:194-200`) and the run's number is the *same call* — `server/src/modules/reviews/run-executor.ts:539` `const ceiling = await context.tokenCeiling(workspaceId)`, applied at `:558-562`. One function, `ContextRepository.readCeiling` (`repository.ts:48-53`), reads settings key `context.token_ceiling`. Proven for an overriding workspace on both sides: `server/test/context-routes.it.test.ts:255` `serves the tab the ceiling the RUN caps against, not the default` asserts `token_ceiling === 32_000` by default and `=== 4_000` on **both** the agent and skill endpoints once the setting exists (`:263`, `:275`); `server/test/context-run.it.test.ts:263` runs with `setCeiling(100)` and skips against 100, not 32 000. Browser side: agent `ContextTab.test.tsx:283` and skill `:238` `warns against the ceiling THIS workspace runs with, not the default (AC-24)` assert the copy reads `exceeds the 4,000-token project-context ceiling`. | Round 1 scored this MET against a hardcoded client 32 000, which happened to match only because no workspace had overridden the setting. The verdict is the same; the evidence is no longer contingent. |
| **AC-28** — the ceiling defaults to 32 000 approximate tokens and is configurable (`specs/…:266-268`) | **MET**, default survived on both sides | **Server:** `server/src/modules/context/constants.ts:27` `DEFAULT_PROJECT_CONTEXT_TOKEN_CEILING = 32_000`; override key `SETTINGS_KEY_TOKEN_CEILING = 'context.token_ceiling'` (`:36`); `repository.ts:48-53` returns the setting only when it is a positive integer, else the default. Asserted at `server/test/context-constants.test.ts` and `server/test/context-run.it.test.ts:282-288` (`uses the 32 000-token default when the workspace sets no ceiling`, asserting the constant **and** that a ~1000-token document fits). **Client:** the default deliberately no longer exists there — it is *served*, and `server/test/context-routes.it.test.ts:263` pins that the served default is `32_000`. `token_ceiling: z.number().int().positive()` in both vendored copies (`server/src/vendor/shared/contracts/platform.ts:326`, mirrored — sync check green). | "Both sides" is now server-default + served-value rather than two independent constants. That is the point of F2: a second client-side default would be a second source of truth, which is what round 1 flagged. |
| **AC-1** — list every markdown document found recursively under the configured search roots, by repository-relative path (`specs/…:107-110`) | **MET**, no legitimate root dropped | The new guard is `walkMarkdown` → `isRealDirInside` (`server/src/modules/context/walk.ts:82-92`, helper at `:99-106`). It drops a root only when `fs.realpath(absRoot)` resolves outside the resolved clone base. Enumerated the ways a *legitimate* root reaches it: (a) an ordinary existing directory resolves to itself under `realBase` → kept; (b) a clone path that is itself a link (`/var` on macOS) is handled because `realBase` is `await fs.realpath(clonePath)` (`:84`) and both sides are compared in resolved form; (c) a root that is a symlink resolving **back inside** the clone is kept — pinned by `server/test/context-walk.test.ts:178` `keeps a root that only LOOKS linked — one resolving back inside the clone`, which yields `docs/api.md`; (d) a root that does not exist contributes `[]` exactly as before, and the roots that do exist are unaffected — `context-walk.test.ts:138`. The escape case is dropped: `:159` `ignores a search root that is a symlink out of the clone` yields `[]` while `specs/api.md` still enumerates in the same fixture. **Ordinary-repository evidence is not only the in-memory fixture:** `server/test/context-routes.it.test.ts` builds a real git clone on disk (`test/context-run.it.test.ts:84-89` for the run side) and `context-routes.it.test.ts:146` `lists the clone's markdown with root and tokens` passes against `nodeCloneFs` and the real `realpath` — 9 tests green. | The guard is a filter on roots only; nothing about recursion or path form changed (`walkDir`, `walk.ts:108-141`, is untouched in shape). |
| **AC-2** — with no configured roots, search `specs/`, `docs/`, `insights/` (`specs/…:111-113`) | **MET** | `constants.ts` `DEFAULT_ROOTS`; `repository.ts:37` falls back to it. The realpath guard does not interact with the default set except to drop a physically-escaping one: `context-walk.test.ts:138` and `:159` both re-run with `DEFAULT_ROOTS` and get `['specs/api.md']`, i.e. a missing `insights/` and an escaping `docs/` leave the legitimate root enumerating. `server/test/context-constants.test.ts` green (SERVER-UNIT-CTX below). | |
| **AC-3** — show both file name and containing folder for every document in every list (`specs/…:114-116`) | **MET** after F3's move | Server half unchanged: `context-walk.test.ts:93` `finds the same file name under two roots, each with its own root (AC-3)`. Client half now has **one** implementation instead of three: `fileNameOf`/`folderOf` at `client/src/lib/project-context.ts:66-75`, consumed by the page (`ProjectContextView.tsx:13,98,100,169`) and by both tabs. The page's own `helpers.ts:3-5` records that the two functions deliberately moved out. Assertions: `ProjectContextView.test.tsx:125` `renders one distinguishable row per document, name and folder (AC-3)`, skill `ContextTab.test.tsx:281` `shows each row's file name and its OWN containing folder (AC-3)`, plus the moved unit suite `client/src/lib/project-context.test.ts`. 10 client files / 90 tests green. | `folderOf` now takes the structural `{path, root}` (the fix's own deviation), which is what lets `SpecFile` and `ContextDraftRow` share it without either module importing the other's type. No behaviour change: the body is the same `lastIndexOf("/")` rule. |
| **S11** — Project Context page **and** the sidebar nav entry | **PARTIALLY MET — unchanged from round 1** | Re-checked, not assumed. `grep -rn "repos/\[repoId\]/context\|/context\"" client/src/app client/src/components client/src/vendor/ui/nav.ts` returns no navigation link to the page — only the page's own test, and `client/src/components/app-shell/helpers.ts:30` (`pathname.includes("/context")` → active-key mapping), a **pre-existing, unmodified** file absent from `git status --porcelain`. `NAV` at `client/src/vendor/ui/nav.ts:21-35` still lists `pulls`, `skills`, `agents`, `conventions` and no `context` item. The page itself remains present (`client/src/app/repos/[repoId]/context/…`, 12 tests green). | **Deliberately not fixed**, and correctly so. The plan directed the entry into `client/src/components/app-shell` (plan:266-268), where no nav array exists; `NAV` lives in `client/src/vendor/ui/`, which `client/AGENTS.md:47` declares read-only vendored code. Plan defect, carried forward — see `## Plan defects`. No acceptance criterion requires a sidebar entry, so no `AC` row moves. **Consequence unchanged: the page has no entry point in the UI.** |
| **Fix deviation** — the two `POST` editor responses changed as well as the two `GET`s | **MET / consistent, breaks no criterion** | All four editor endpoints now declare `response: { 200: ContextDocsResponse }` (`server/src/modules/context/routes.ts:108,125,147,164`), produced by the one private `withCeiling` (`service.ts:194-200`). The client matches on both halves of each query key: `useAgentContextDocs` types `api.get<ContextDocsResponse>` (`client/src/lib/hooks/core.ts:186-188`) and `useSetAgentContextDocs` types `api.post<ContextDocsResponse>` and writes that same value with `qc.setQueryData(queryKeys.agentContext(...), docs)` (`core.ts:213-219`); skill twin at `:229-243`. So one query key holds one shape — which is exactly the mismatch the deviation exists to avoid. Both mutations still `invalidateQueries({queryKey: queryKeys.context(repoId)})` (`:218`, `:244`), so r1's S10 evidence is intact. No criterion constrains the response envelope; AC-9/AC-13/AC-14 are asserted through rendered rows, and the integration suites destructure `.rows` (`context-routes.it.test.ts:231,244,324,339`, `context-attach.it.test.ts`) and pass. | Judged consistent. The only cost is documentation drift, which the fix report already hands to `doc-writer`: `server/README.md`'s route map describes neither the six endpoints nor the envelope. |
| **AC-27** | **CANNOT VERIFY** (carried forward, not attempted) | Manual-only by the plan's own `## 5` (plan:870-874): a human must attach a document stating an invariant, open a PR that violates it, run the review against the real model and read whether the finding references the document. The hermetic suites drive a mock LLM whose output the test author wrote. | Unchanged by this fix round. |
| **DoD-1** | **CANNOT VERIFY** (carried forward) | Same reason as AC-27 — it is the same behaviour stated as a definition of done. | |

## Verification commands

| Package | Command | Result |
|---|---|---|
| shared contracts | `./scripts/check-shared-sync.sh` | pass — `vendor/shared in sync` |
| server (types) | `cd server && pnpm typecheck` | pass (rc=0) |
| client (types) | `cd client && pnpm typecheck` | pass (rc=0) |
| server (architecture) | `cd server && pnpm arch:check` | pass — 0 violations |
| reviewer-core purity | `cd server && pnpm arch:check:core` | pass — 0 violations |
| server (unit, scoped) | `cd server && pnpm exec vitest run test/context-walk.test.ts test/context-constants.test.ts test/repo-intel-resync.test.ts` | pass — 3 files / 19 tests |
| server (integration, scoped) | `cd server && pnpm exec vitest run test/context-routes.it.test.ts test/context-run.it.test.ts test/context-attach.it.test.ts` | pass — 3 files / 25 tests (Docker available) |
| client (scoped) | `cd client && pnpm exec vitest run src/lib/project-context.test.ts 'src/app/agents/[id]' 'src/app/skills/[id]' 'src/app/repos/[repoId]/context'` | pass — 10 files / 90 tests |

```
vendor/shared in sync
=SHARED rc=0=
=SERVER-TYPECHECK rc=0=
=CLIENT-TYPECHECK rc=0=
✔ no dependency violations found (209 modules, 697 dependencies cruised)
=ARCH rc=0=
✔ no dependency violations found (25 modules, 55 dependencies cruised)
=ARCH-CORE rc=0=
```

```
 ✓ test/context-walk.test.ts (12 tests) 3ms
 ✓ test/repo-intel-resync.test.ts (3 tests) 2ms

 Test Files  3 passed (3)
      Tests  19 passed (19)
=SERVER-UNIT-CTX rc=0=
```

```
DOCKER_OK
 ✓ test/context-attach.it.test.ts (7 tests) 2363ms
 ✓ test/context-routes.it.test.ts (9 tests) 3082ms
 ✓ test/context-run.it.test.ts (9 tests) 3384ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
=SERVER-IT-CTX rc=0=
```

```
 ✓ src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx (12 tests) 294ms
 ✓ src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx (16 tests) 340ms

 Test Files  10 passed (10)
      Tests  90 passed (90)
=CLIENT-CTX rc=0=
```

## Unrequested work

Beyond what round 1 already listed (unchanged), this fix round added:

- `client/src/lib/project-context.ts` and `client/src/lib/project-context.test.ts`
  — new files, named by no plan step. They are a **move**: the agent tab's
  `helpers.ts`/`helpers.test.ts` relocated so the skill tab stops importing
  across a route boundary, and the page's third copy of `fileNameOf`/`folderOf`
  folded in. Necessary to fix a CRITICAL finding, outside the plan's file list.
- `server/src/adapters/clone-fs.ts` gained `realpath` on the port and on
  `nodeCloneFs` (`:24`, `:34`), plus the stub in
  `server/test/repo-intel-resync.test.ts:52`. Required by F1; S5 named neither
  file. The port grew for one consumer (`context/walk.ts`) — the fix report has
  already routed that question to `architecture-reviewer`.
- `client/messages/en/{agents,skills}.json` gained
  `context.previewUsedByNone` / `context.previewUsedByVia`; both tabs'
  `styles.ts` gained four `drawerUsedBy*` entries. Consequences of the AC-35
  rendering, named by no step.
- A round-1 bookkeeping correction, not a change: r1's S11 row said
  "13 `ProjectContextView.test.tsx` cases". The file has **12** `it(` blocks
  (`:125,136,145,151,163,177,186,194,202,210,220,231`), every AC r1 cited is
  still present at the line it cited, and all 12 pass. r1 miscounted; no test
  was removed by the fix.
- Still outside this verification, as in round 1: `img/`, `specs/`,
  `docs/retro/`, `docs/superpowers/`, `AGENTS.md`, `.claude/skills/**`
  (including the new `workflow-retro/`) — unrelated concurrent work.

## Plan defects

Round 1's eight defects stand unamended (the plan file was not edited — correct,
and required of both the implementer and me). The one that still has an open
consequence:

6. **S11 places the nav entry in `client/src/components/app-shell`**
   (plan:266-268, plan:582), where no nav array exists. `NAV` is at
   `client/src/vendor/ui/nav.ts:21`, declared read-only by
   `client/AGENTS.md:47`. Both reviewers and the fix round independently reached
   the same reading, and the work was correctly left undone rather than forced
   into vendored code. **This is the one item of the plan that remains
   unexecuted, and it needs a human decision** — either amend the plan to a
   reachable location, or accept that `/repos/:repoId/context` is reachable only
   by typing the URL and is absent from the command palette
   (`useShellCommands.ts:21` builds from `NAV`).

No new plan defect surfaced this round: nothing the fix did contradicted a step.

## What I could not verify

- **AC-27 and DoD-1** — manual by the plan's own `## 5`, carried forward from
  round 1 and not attempted per the brief. No automated evidence is possible:
  the hermetic suites drive a mock LLM whose output the test author wrote.
- **The full suites.** This round ran the scoped subsets listed above, not
  `cd server && pnpm test` or `cd client && pnpm test` in full. The fix report
  claims 320 server-unit / 121 server-integration / 342 client tests green; I
  did not re-derive those totals, and they are not evidence for any verdict here
  — every verdict above rests on a suite I ran or a `file:line` I read.
- **Round 1's other 51 rows.** Out of scope by instruction; their verdicts stand
  as recorded in
  `docs/reports/2026-08-23-plan-verify-project-context-folder-r1.md`.
- **`server/INSIGHTS.md`, `client/INSIGHTS.md`** and whether the developer's own
  database has the migration applied — unchanged from round 1, still unverified.
- **Runtime behaviour in a browser.** No stack was started. The drawer's new
  links, the served ceiling reaching the warning, and the new message strings
  are proven by jsdom component tests and source citation, not by sight.

## Summary line

**This round (scoped):** 8 MET / 1 PARTIAL / 0 NOT MET / 2 CANNOT VERIFY

**Cumulative across r1 + r2 (61 rows):** 58 MET / 1 PARTIAL / 0 NOT MET /
2 CANNOT VERIFY — AC-35 moves PARTIALLY MET → MET; S11 remains the single
PARTIAL, for the plan-defect reason above.
