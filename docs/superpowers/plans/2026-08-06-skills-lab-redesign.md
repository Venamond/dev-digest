# Skills Lab redesign — implementation plan

> Spec: `docs/superpowers/specs/2026-08-06-skills-lab-redesign-design.md`
> **Do not commit** unless the user asks — leave the tree for review.

**Goal:** `/skills` matches the design source (`screen_skills.jsx` →
`ScreenSkillsLab`, decoded from the standalone design bundle) — usage-bearing
list cards + tabbed detail pane (Config · Preview · Stats · Versions) with real
per-skill stats, a Config danger zone and labelled version history.
`SkillWorkspace` retired. Nothing eval-related ships.

**Stack:** Fastify 5, Drizzle, Zod shared contracts, Next.js 15, TanStack Query,
Vitest.

---

## File ownership (parallel after Foundation)

| Track | Owns | Must NOT touch |
|---|---|---|
| **Foundation** (first, alone) | `0013_skill_stats_and_version_notes.sql`, `meta/_journal.json`, `schema/runs.ts`, `schema/skills.ts`, `db/schema.ts`, `db/rows.ts`, both `vendor/shared/contracts/{knowledge,observability}.ts` | anything else |
| **A — Server** | `modules/skills/**`, `modules/agents/helpers.ts`, `modules/reviews/{repository,run-executor}.ts`, `modules/conventions/repository.ts`, `server/test/**` | client/ |
| **B — Client shared** | `client/src/components/markdown-editor/**`, `lib/hooks/skills.ts`, `lib/hooks/keys.ts` | app/skills, server/ |
| **C — Client Skills Lab** | `app/skills/**`, `messages/en/skills.json` | server/, components/markdown-editor (consumes only) |
| **D — Conventions modal** | `app/repos/[repoId]/conventions/_components/CreateSkillModal/**` | everything else |

## Tasks

### Foundation

- [ ] Migration `0013_skill_stats_and_version_notes.sql` — the spec's Data model
      SQL verbatim (`run_skills` + `skill_id` index + `skill_versions.note`);
      journal `idx: 13`, same tag.
- [ ] `schema/runs.ts`: `runSkills` pgTable (`runId` → `agentRuns` cascade,
      `skillId` → `skills` cascade, `skillVersion` integer notNull, PK
      `[runId, skillId]`); import `primaryKey` + `skills`.
- [ ] `schema/skills.ts`: `note: text('note')` on `skillVersions`.
- [ ] `db/schema.ts`: add `runSkills` to the import list and the `schema` object.
      `db/rows.ts`: `export type RunSkillRow = typeof t.runSkills.$inferSelect;`
- [ ] Contracts — `contracts/knowledge.ts`: `SkillVersion.note`
      (`z.string().nullable()`), `SkillListItem.pull_rate` / `.accept_rate`
      (`z.number().nullable()`). `contracts/observability.ts`: `SkillStatsAgent`
      + `SkillStats` verbatim from the spec, placed after `AgentStats`.
      Copy into **both** `vendor/shared`; run `./scripts/check-shared-sync.sh`.
- [ ] `cd server && pnpm db:migrate` (manual, never on boot).

### A1 — Version notes (server)

- [ ] Test first — `server/test/skills-versions.test.ts`: `bodyHeadingDelta`
      (added / removed / reworded), `bodyLineDelta('a\nb', 'a\nc')` →
      `{ added: 1, removed: 1 }`, then `skillVersionNote` per spec row —
      `Initial version` / `Extracted from codebase scan` (`extracted`) /
      `Imported skill` (`imported_url`, `community`) · `Restored from v3` ·
      `Added Tests section` · `Removed Tests section` ·
      `Reworded Correctness` · `Body +1/-1 lines` · `Renamed from pr-rubric` ·
      `Type rubric → security` · `Description updated` · parts joined ` · `.
- [ ] `modules/skills/helpers.ts`: `bodyHeadingDelta(from, to)` over
      `/^#{1,6}\s+(.*)$/` (added / removed / reworded heading names);
      `bodyLineDelta(from, to)` counting `+`/`-` lines of the existing
      `diffBodies`; `skillVersionNote({ previous?, next, restoredFrom? })`
      applying the spec's rules first-match-wins (initial note keyed on
      `next.source`); `toSkillVersionDto` maps `note: row.note ?? null`.
- [ ] `modules/skills/repository.ts`: `snapshotVersion(row, version, note)`;
      `insert` → `skillVersionNote({ next: row })`; `update` →
      `skillVersionNote({ previous: existing, next: row })`; `restoreVersion` →
      `skillVersionNote({ previous: existing, next: row, restoredFrom: version })`.
- [ ] `modules/conventions/repository.ts` (`upsertExtractedSkill` writes
      `skill_versions` itself): pass
      `note: 'Updated from conventions extractor'` on the update path,
      `'Extracted from codebase scan'` on the insert path.
- [ ] Extend `server/test/skills.it.test.ts`: body update → `v2` with
      `note: 'Body +1/-0 lines'`; restore v1 → `note: 'Restored from v1'`.
- [ ] `cd server && pnpm test skills` → green.

### A2 — `run_skills` recording (server)

- [ ] Test first — extend `server/test/agents-skills-prompt.test.ts`:
      `promptSkillRefs` returns `[{ skillId, skillVersion }]` only for links
      where `link.enabled && skill.enabled`, preserving `order` ASC.
- [ ] `modules/agents/helpers.ts`: `PromptSkillRef` + `promptSkillRefs(links)`
      next to `promptSkillBodies` (same filter, different projection).
- [ ] `modules/reviews/repository.ts`: `recordRunSkills(runId, refs)` —
      multi-row insert with `.onConflictDoNothing()`, no-op on empty.
- [ ] `modules/reviews/run-executor.ts` (~line 186, right after
      `promptSkillBodies`): `promptSkillRefs(linked)` → `recordRunSkills`, in a
      try/catch that warns through `runLog` — a stats write never fails a review.
- [ ] Extend `server/test/reviews.it.test.ts`: stubbed-LLM run with one enabled
      linked skill writes exactly one `run_skills` row carrying the skill's
      current `version`; a globally-disabled skill writes none.

### A3 — Stats (server)

- [ ] `modules/skills/constants.ts`: `SKILL_FINDINGS_WINDOW_DAYS = 30` (findings
      only — runs and pull rate are all-time, per the design's labels).
- [ ] Test first — `server/test/skills-stats.test.ts`: `buildSkillStats` (union
      denominator, `accept_rate` excluding pending, blank category → `other`,
      null rates on empty input) and `buildSkillUsageRates` (per-skill map; a
      pulled run whose agent was since unlinked keeps the rate ≤ 1).
- [ ] `modules/skills/stats-helpers.ts` — pure, no DB types, mirroring
      `modules/agents/stats-helpers.ts`. Inputs
      `SkillAgentInput { id, name, enabled, linkEnabled }`,
      `SkillRunInput { id, pulled }`,
      `SkillFindingInput { category, acceptedAt, dismissedAt }`; list variant
      over `{ links, runs, pulls, findings }` → `Map<skillId, { pullRate,
      acceptRate }>`.
- [ ] `modules/skills/repository.ts` (import `gte`): `listLinkedAgents(skillId)`
      (`agent_skills ⋈ agents`, name ASC), `listRunsForSkillStats(skillId)`
      (all-time: runs of linked agents ∪ runs in `run_skills`, `pulled` flag),
      `listFindingsForSkillStats(skillId, since)` (`findings ⋈ reviews ⋈
      run_skills`, `gte(reviews.createdAt, since)`),
      `listUsageInputs(workspaceId, since)` (workspace-scoped selects for links /
      runs / pulls all-time + findings windowed, feeding the list variant).
- [ ] `modules/skills/service.ts`: `stats(workspaceId, id)` →
      `buildSkillStats(...)` with `findings_window_days:
      SKILL_FINDINGS_WINDOW_DAYS`, `undefined` when the skill is not in the
      workspace; `list` also loads `listUsageInputs` and passes rates into
      `toSkillListItemDto(row, agentCount, rates)`.
- [ ] `modules/skills/routes.ts`: `GET /skills/:id/stats` (`IdParams`, `404`
      `Skill not found`); document it in the module's route comment block.
- [ ] `server/test/skills-stats.it.test.ts`: agent + skill + link, two runs with
      `run_skills` on one, one accepted + one dismissed finding → `pull_rate: 0.5`,
      `accept_rate: 0.5`, `agent_count: 1`, `agents[0].name`,
      `findings_window_days: 30`; an out-of-window finding is excluded while its
      run still counts toward `pull_rate`; `404` cross-workspace;
      `DELETE /skills/:id` leaves no `run_skills` rows.
- [ ] `server/src/db/seed.ts` (+ `seed-skills.ts` if it belongs with the bodies):
      demo `agent_runs` for the seeded agent, `run_skills` on a subset so
      `PULL FREQUENCY` < 100%, findings across several categories mixing
      accepted / dismissed / pending. Idempotent (skip when the demo runs exist);
      verify with `cd server && pnpm db:seed`.

### B — Client shared

- [ ] `client/src/components/markdown-editor/{MarkdownEditor.tsx,styles.ts}` —
      props `{ value, onChange, fileName, tokensLabel, unsavedLabel?, dirty?,
      ariaLabel, fill?, minLines? }`. No `useTranslations` — labels arrive
      translated, so the component is namespace-agnostic. Chrome as drawn: boxed
      shell, meta bar (`FileText` · mono `<name>.md` · lowercase `unsaved`
      `Badge` when `dirty` · right-aligned thousands-separated `{n} tokens`),
      gutter + mono textarea sharing `line-height: 21px`. `fill` → shell flexes
      and the pane scrolls internally; else the textarea auto-grows via a
      `scrollHeight` effect keyed on `value`.
- [ ] `MarkdownEditor.test.tsx`: gutter renders `minLines` numbers when the
      value is short and one per line when it is long; typing calls `onChange`.
- [ ] `lib/hooks/keys.ts`: `skillStats: (id) => ["skill-stats", id]`.
      `lib/hooks/skills.ts`: `useSkillStats(id)` (`GET /skills/:id/stats`,
      `enabled: !!id`); `useDeleteSkill` additionally
      `qc.removeQueries(queryKeys.skillStats(id))`.

### C — Client Skills Lab

- [ ] i18n `messages/en/skills.json` — the key set listed in the spec's i18n
      section (adds / rewords / removals). Reword `card.deleteConfirm` to name
      the consequences (`Delete skill "{name}" and all {count} of its versions?
      Agents using it lose it immediately. This cannot be undone.`).
- [ ] `SkillCard` + styles — type-coloured `iconBox`, name, `Toggle`, trash
      button shaped after `components/agent-card/AgentCard.tsx`
      (`stopPropagation` → `window.confirm` → `useDeleteSkill`, spinner while
      pending), one-line description, type label + source tag
      (`Manual`/`Extracted`/`Community`/`Imported` + icon), stats footer
      `{n} agents · {p}% pull · {a}% accept` (`className="tnum"`, `—` for null
      rates, accept `--ok` at ≥ 60% else `--warn`) **only** when
      `agent_count > 0`. Always bordered; active `--border-strong` +
      `--bg-hover`; `opacity: 0.6` when `!skill.enabled`.
- [ ] `SkillCard.test.tsx`: footer shows `3 agents`, is absent at
      `agent_count: 0`, `—` when rates are null, trash click confirms and fires
      the delete mutation.
- [ ] `SkillEditor/constants.ts`: `VALID_TABS` and `TABS` reordered to
      `config · preview · stats · versions` (no `evals`).
- [ ] `SkillEditor.tsx`: header row above the tabs — type-coloured
      `Icon.Sparkles` box, mono name, type label badge, `Badge icon="GitCommit"`
      `v{version}`; no `disabled` badge, no header buttons; then
      `Tabs pad="0 24px"`; then the tab body. `StatsTab` now receives `skill`.
- [ ] `SkillsListView.tsx`: read/write `?tab=` (default `config`, validate
      against `VALID_TABS`, preserve `q` on tab change and on select), render
      `<SkillEditor skill tab onTab />`, drop the `SkillWorkspace` import, and
      after a delete of the active skill route to the first remaining skill or
      `/skills`.
- [ ] `ConfigTab.tsx`: `Configuration` + `v{version}` chip left, `Enabled`
      toggle right; Name (required) · Description (drop `descriptionHint`) ·
      Type; `Skill body *` via `MarkdownEditor` (`fileName` from the edited name,
      `tokens` from `estimateTokens`, `dirty` from the existing dirty check) with
      the design's `config.bodyHint`; `Save skill` / `Cancel` keep today's
      mutation + `config.savedToast`, plus the right-aligned
      `config.snapshotHint` (`v{version + 1}`); then the danger zone —
      `config.dangerTitle` in `--crit`, `config.dangerBody`, `Button kind="danger"
      size="sm" icon="Trash"` → same confirm + `useDeleteSkill` + post-delete
      routing as the card.
- [ ] `ConfigTab.test.tsx`: danger-zone `Delete` confirms and fires the delete
      mutation.
- [ ] `VersionsTab.tsx` + styles: `Version history` + `{n} versions` badge +
      subtitle; rows = mono `v{n}` chip · note as title (fallback
      `versions.noteFallback`) · date beneath; right side `Current` badge for the
      current version, else `Diff` (`Eye`) + `Restore` (`History`). Keep the
      existing diff panel and restore confirm.
- [ ] `VersionsTab.test.tsx`: note renders as the row title, fallback when
      `note` is null, `Current` badge only on the current version.
- [ ] `StatsTab/{StatsTab.tsx,helpers.ts,styles.ts}`: four KPI tiles
      (`USED BY` + ` agent(s)` suffix · `PULL FREQUENCY` · `ACCEPT RATE` with
      `CircularScore` top-right · `FINDINGS (30D)`), then a `1fr 1fr` grid:
      `SectionLabel icon="Cpu"` `stats.agentsUsing` (row per agent, `MonoLink`
      `Open` → `/agents/{id}?tab=skills`, muted when the agent or link is
      disabled) and `SectionLabel icon="Tag"` `stats.byCategory`
      (`Donut size={120}`, counts, no value prefix). No caption row — the
      attribution caveat is a `title` tooltip (`stats.attributionHint`) on the
      `ACCEPT RATE` and `FINDINGS (30D)` tiles. `EmptyState icon="BarChart"`
      (`stats.emptyTitle`/`emptyBody`) when `agents.length === 0`; `—` per tile
      when a rate is null. `helpers.ts` holds local `categorySegments` + `pct`
      (do not import the agents copy).
- [ ] `SkillEditor.test.tsx`: four tabs render, header shows `v1`, Stats tab
      renders KPI values from a mocked `useSkillStats`.
- [ ] `client/src/vendor/ui/nav.ts`: reorder the `SKILLS LAB` items to Skills →
      Agents → Conventions as drawn (no `Eval Dashboard`); keys, hrefs and
      `gKey`s unchanged so `SHORTCUTS` and the pathname→nav mapping stay valid.
      Mirror the file in
      `server/src/vendor/…` only if the sync script flags it (nav is client-only).
- [ ] Delete `SkillWorkspace/{SkillWorkspace.tsx,styles.ts,SkillWorkspace.test.tsx}`
      and grep for stragglers (`estimateTokens` / `SKILL_TYPE_VALUES` imports
      that pointed through it).

### D — Conventions modal reuse

- [ ] `CreateSkillModal.tsx`: replace the inline gutter/textarea block with
      `<MarkdownEditor fill … />`, keep `bodyScroll={false}` on the `Modal` so
      only the editor pane scrolls; delete the now-dead editor styles.
- [ ] `cd client && pnpm test conventions` → still green.

### Integrate

- [ ] `cd server && pnpm test`, `cd client && pnpm test`, both `tsc` clean,
      `./scripts/check-shared-sync.sh`.
- [ ] Manual pass against the design's five Skills artboards: tab switching keeps
      `?tab=` and `q`; card trash *and* the Config danger zone each remove skill
      + versions + agent bindings; a fresh review run makes `PULL FREQUENCY`
      non-`—`; saving a body adds a version row whose title is the generated note.
- [ ] Re-read `client/INSIGHTS.md` and `server/INSIGHTS.md`; append only if
      something genuinely new surfaced.
- [ ] `pr-self-review` skill before `gh pr create`.

## Constraints

- Labels, tile order and card footer are verbatim from the design source. The
  attribution caveat is a `title` tooltip — never a renamed tile, a dropped
  figure or a caption row. The donut plots counts; no currency on this screen.
- Windows follow the labels: findings 30-day (`findings_window_days`), pull and
  accept all-time.
- Stats are honest or absent: no `run_skills` backfill, `—` not `0%` when nothing
  was recorded. The populated screen comes from `pnpm db:seed`.
- Version notes are server-generated English strings, shaped like the design's
  history rows; no note input field anywhere. Client falls back to `Version {n}`
  when `note` is null (pre-migration rows).
- Nothing eval-related until an eval module exists: no `Evals` tab, no
  `Run on evals` button, no `Eval Dashboard` nav item, no "eval runs" copy.
- `run_skills` stores `skill_version` so a past run stays reproducible, and
  recording it must never fail a review run.
- The line-numbered editor exists exactly once after this change.
- ESM: relative imports carry `.js` (server). `server/src/vendor/shared` ≡
  `client/src/vendor/shared`. No git commits unless the user asks.
