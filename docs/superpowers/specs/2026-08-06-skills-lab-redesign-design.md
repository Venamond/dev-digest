# Skills Lab redesign — design

> Date: 2026-08-06 · Extends the Skills feature
> (`2026-08-05-skills-feature-design.md`) · Mockups: Skills Lab Config /
> Preview / Stats / Versions (4 screens).
>
> **Source of truth:** the mockups are renders of the interactive design bundle
> `DevDigest Design (standalone).html` — a base64+gzip asset manifest whose
> `screen_skills.jsx` (`ScreenSkillsLab`) and `chrome.jsx` (`NAV`) modules carry
> the literal labels. Every quoted string below is copied from that source; the
> `SKILLS LAB` artboards are `skill-config`, `skill-preview`, `skill-evals`,
> `skill-stats`, `skill-versions`, `skill-community`.

## Problem

The shipped Skills Lab detail pane (`SkillWorkspace`) is a single scroll with a
custom toolbar: name/type/description on top, then a line-numbered body, then
Preview and Versions as toggle buttons that push content down. The mockups
specify a tabbed editor with a persistent skill header — the same shape the
Agent editor already uses. Three further gaps:

1. A tabbed `SkillEditor` (Config / Preview / Versions / Stats) already exists in
   the tree but is **dead code** — nothing renders it except its own test. Two
   implementations of the same screen have been drifting.
2. The list card shows no usage signal, and no screen offers a way to delete a
   skill, even though `DELETE /skills/:id` and `useDeleteSkill` both exist — the
   design puts a delete affordance in a Config-tab danger zone that we never
   built.
3. Every number on the Stats mockup — pull frequency, accept rate,
   findings (30d), findings-by-category — has **no source in the database**.
   Nothing records which skills entered a run's prompt: the trace stores the
   assembled skills block as one string, and `findings` carries no skill
   attribution. Only `USED BY: N agents` is real today (`agent_count`).
   Likewise the version titles in the Versions mockup ("Tightened scope rule;
   cap at 5 high-signal findings") have nowhere to live — `skill_versions` is
   `(skill_id, version, body, created_at)`.

## Goal

Bring `/skills` to the mockups: master list with usage-bearing, deletable cards
plus a tabbed detail pane (Config / Preview / Stats / Versions) with real,
honestly-derived stats and labelled version history. Retire the duplicate
implementation.

## Decisions

1. **`SkillEditor` becomes the one detail pane; `SkillWorkspace` is deleted.**
   The mockups are tab-based, tab state lives in `?tab=` like the Agent editor,
   and the skill header (name · type badge · version chip) sits above the tabs
   inside `SkillEditor` so both `/skills` and `/skills/:id` — which render the
   same `SkillsListView` — get it from one place.
2. **Nothing eval-related ships.** There is no eval module on the server
   (`eval_cases` / `eval_runs` tables exist, no routes). The design's five tabs
   are `["Config", "Preview", "Evals", "Stats", "Versions"]`; we ship four in
   the same order minus `Evals`. Dropped with it: the header's
   `Run on evals` button (the design's only header button), the
   `Eval Dashboard` nav item that closes the design's `SKILLS LAB` group, and
   the "eval runs" phrasing in the Versions subtitle. Shipping a dead tab would
   be a lie in the UI; the design's Evals column is a later lesson.
3. **Per-run skill attribution is recorded, not guessed.** New table
   `run_skills (run_id, skill_id, skill_version)` written by the run executor at
   prompt assembly — exactly the skills that passed both enable gates and became
   prompt text. Pull frequency then means something checkable.
4. **Findings are attributed to a skill through the run, and the UI says so.**
   A finding has no per-skill provenance (the model does not tell us which rule
   fired), so accept rate and findings counts aggregate the findings of runs
   whose prompt contained the skill. The Stats tab labels this explicitly
   ("Findings from runs where this skill was in the prompt"). Real attribution
   would require the reviewer engine to tag findings with the rule that fired —
   out of scope, and not something we can fake honestly.
5. **Windows follow the mockup's own labels.** `FINDINGS (30D)` is windowed;
   `PULL FREQUENCY` and `ACCEPT RATE` carry no window label in the mockup, so
   they are all-time. Only the findings window travels in the payload
   (`findings_window_days`), and no tile needs a caption to explain itself.
6. **Seeded workspaces look like the mockup; live ones stay honest.**
   Historical runs have no `run_skills` rows and cannot be reconstructed, so a
   freshly-migrated real workspace shows `—` until the next review — inventing
   rows would poison the only honest number on the screen. `pnpm db:seed`
   instead plants demo runs, `run_skills` links and findings for the seeded
   skills, so the course starter opens on a populated screen exactly like the
   mockup, with data that is transparently seed data.
7. **Version notes are server-generated in the mockup's own phrasing.** New
   nullable `skill_versions.note`, derived from the markdown-heading diff so the
   rows read like the design's history ("Added Tests dimension", "Reworded
   Correctness checks", "Extracted from codebase scan"), never from a user input
   field — the Config screen has no place to type one, and asking for a commit
   message on every save would put a prompt in front of a Save button the design
   draws bare. The design's notes are hand-authored prose, so the generator
   approximates their shape, not their exact words (`Added {heading} section`
   where the design wrote "Added Tests dimension").
8. **Delete ships in both places the product needs it.** The design's only
   delete affordance is a Config-tab danger zone — `Delete skill` /
   "Removes it from all agents. This can't be undone." / a danger `Delete`
   button — and that is built as drawn. A trash icon on the list card is added
   on top of it (user request, mirroring `AgentCard`) so deletion sits in the
   same place across Agents and Skills. Both paths run one confirm →
   `useDeleteSkill`. `DELETE /skills/:id` already cascades `skill_versions`,
   `agent_skills` and (new) `run_skills`, so one click removes the skill, its
   whole history, and its agent bindings; the confirm copy names those
   consequences.
9. **The line-numbered markdown editor becomes a shared component.** It exists
   twice already (`SkillWorkspace`, conventions `CreateSkillModal`) and the
   Config tab is the third caller. One `client/src/components/markdown-editor/`
   with the mockup's chrome (boxed meta bar: `<name>.md` · `unsaved` badge ·
   token count) — the modal switches to it in the same change so the count of
   copies goes 2 → 1.

## Architecture

```
run:  run-executor ── promptSkillRefs(linked) ──▶ run_skills (run_id, skill_id, skill_version)
                                                        │
stats: GET /skills/:id/stats                             │
  ├─ linked agents        agent_skills ⋈ agents          │
  ├─ eligible runs        agent_runs of linked agents ∪ runs in run_skills (30d)
  ├─ pulled runs          run_skills for this skill (30d)
  ├─ findings             findings ⋈ reviews ⋈ run_skills (30d)
  └─ buildSkillStats()    pure aggregation (unit-tested, no DB types)

list:  GET /skills → SkillListItem + pull_rate + accept_rate (same window)
```

Server work stays inside `modules/skills/` (new pure `stats-helpers.ts`, new
repository queries, one route) plus two small edits outside it: the run executor
records the refs, and `modules/agents/helpers.ts` gains the pure
`promptSkillRefs` next to the existing `promptSkillBodies`. No new adapters, no
new module.

## Data model

Migration `0013_skill_stats_and_version_notes.sql` (additive):

```sql
CREATE TABLE IF NOT EXISTS "run_skills" (
  "run_id" uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "skill_version" integer NOT NULL,
  CONSTRAINT "run_skills_pk" PRIMARY KEY ("run_id", "skill_id")
);
CREATE INDEX IF NOT EXISTS "run_skills_skill_idx" ON "run_skills" ("skill_id");
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "note" text;
```

`skill_version` is denormalised onto the link so a run stays reproducible after
the skill is edited — the run used *that* body, not today's. `ON DELETE CASCADE`
on both sides keeps decision 8 honest: deleting a skill erases its usage trail
with it (the skill is gone, so per-skill stats are meaningless), while deleting
a run erases only its own row.

## Contracts (both `vendor/shared` copies, byte-identical)

`contracts/knowledge.ts`:
- `SkillVersion` gains `note: z.string().nullable()`.
- `SkillListItem` gains `pull_rate: z.number().nullable()` and
  `accept_rate: z.number().nullable()` — nullable, not `0`, so "never ran" is
  distinguishable from "ran and nothing was accepted".

`contracts/observability.ts` (next to `AgentStats`):

```ts
export const SkillStatsAgent = z.object({
  id: z.string(),
  name: z.string(),
  /** Agent's own enabled flag. */
  enabled: z.boolean(),
  /** Per-agent link toggle (agent_skills.enabled). */
  link_enabled: z.boolean(),
});

export const SkillStats = z.object({
  skill_id: z.string(),
  skill_name: z.string(),
  /** Window applied to findings only — runs / pull rate are all-time. */
  findings_window_days: z.number().int(),
  agent_count: z.number().int(),
  agents: z.array(SkillStatsAgent),
  /** Runs that could have pulled the skill (denominator). */
  runs_total: z.number().int(),
  /** Runs whose prompt actually contained it. */
  runs_pulled: z.number().int(),
  pull_rate: z.number().nullable(),
  findings_total: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  findings_by_category: z.record(z.string(), z.number().int()),
});
```

## Server API

| Route | Behaviour |
|---|---|
| `GET /skills` | unchanged shape plus all-time `pull_rate` / `accept_rate` |
| `GET /skills/:id/stats` | `SkillStats`; `404` when the skill is not in the workspace |
| `DELETE /skills/:id` | unchanged (cascade now also clears `run_skills`) |
| `GET /skills/:id/versions` | unchanged shape plus `note` |

### Aggregation semantics (pure, unit-tested)

`runs_total` is the size of the union of (a) runs by agents currently linked to
the skill and (b) runs recorded in `run_skills` for it — the union keeps
`pull_rate ≤ 1` after a skill is unlinked from an agent that used to run it.
Runs are all-time; only findings are filtered to the last
`findings_window_days`. `pull_rate = runs_pulled / runs_total`, `null` when
`runs_total = 0`.
`accept_rate = accepted / (accepted + dismissed)`, `null` when nothing was acted
on; pending findings are counted but never in the denominator (same rule as
`buildAgentStats`). `findings_by_category` keys are raw finding categories,
`'other'` when blank.

### Version notes (pure, unit-tested)

`skillVersionNote({ previous, next, restoredFrom })`, first matching rule wins.
The heading rules exist so the history reads like the design's rows ("Added
Tests dimension", "Reworded Correctness checks", "Added Supabase service_role
pattern") without a note input field:

| Case | Note |
|---|---|
| no previous, `source: 'extracted'` | `Extracted from codebase scan` |
| no previous, `source: 'imported_url' \| 'community'` | `Imported skill` |
| no previous | `Initial version` |
| `restoredFrom: 3` | `Restored from v3` |
| markdown heading added | `Added {heading} section` (`+ N more` when several) |
| heading removed | `Removed {heading} section` |
| lines changed under exactly one heading | `Reworded {heading}` |
| body changed with no heading signal | `Body +{added}/-{removed} lines` via `bodyLineDelta` (counts `+`/`-` lines of the existing `diffBodies`) |
| name changed | `Renamed from {old}` |
| type changed | `Type {old} → {new}` |
| description changed | `Description updated` |

Heading extraction is a pure `bodyHeadingDelta(from, to)` over lines matching
`/^#{1,6}\s+(.*)$/`, comparing heading sets and the line blocks beneath them.

Multiple parts join with ` · `. Written by the repository at every snapshot site:
`insert`, `update`, `restoreVersion`, and the conventions module's
`upsertExtractedSkill` (which writes `skill_versions` itself — its insert path
gets the source-derived `Extracted from codebase scan`, its update path
`Updated from conventions extractor`). Notes are English strings from the
server, not i18n keys (decision 7); the client falls back to `Version {n}` when
`note` is null so pre-migration rows still render.

## Client

### Layout

The list header already matches the design and is not touched: `Skills` heading,
`Add Skill` primary dropdown (`Import from file` · `Import from URL` ·
`Search community skills…` · divider · `Create from scratch`) and the
`Search skills…` box. The design's `skill-community` artboard (a
`Search community skills` drawer over `COMMUNITY_SKILLS`) has no server route, so
that menu item stays muted — out of scope here.

`SkillsListView` stays the shell: 290px list column + detail pane, both routes
(`/skills`, `/skills/:id`). It gains `?tab=` handling (`VALID_TABS`, default
`config`, `q` preserved on tab change and on select) and renders
`<SkillEditor skill tab onTab />`. `SkillWorkspace` and its styles/test are
deleted; `SkillEditorPageView` is unchanged.

### Skill header (in `SkillEditor`, above the tabs)

As drawn: 26px type-coloured icon box (`Icon.Sparkles`) · name in mono · type
label badge in the type colour · `Badge icon="GitCommit"` reading `v{version}`.
No `disabled` badge — the design signals off-state on the card (see below) and
through the Config tab's `Enabled` toggle. The design's right-hand
`Run on evals` button is dropped (decision 2), leaving the header button row
empty. Tabs bar below with `pad="0 24px"`, order Config · Preview · Stats ·
Versions.

### List card (`SkillCard`)

As drawn: type-coloured icon box, name (mono, ellipsis), enabled `Toggle`,
description (one line, ellipsis), then type label + source tag
(`Manual` / `Extracted` / `Community` / `Imported` with its icon). Cards always
carry a border (`--border`, active `--border-strong` + `--bg-hover`) instead of
today's transparent-until-active, and a disabled skill renders the whole card at
`opacity: 0.6`.

Stats footer, above a `--border` top rule: `{N} agents · {P}% pull ·
{A}% accept` (`tnum`; `1 agent` singular; `—` for a null rate). The accept
figure is `--ok` at ≥ 60% and `--warn` below, as drawn. The footer renders only
when the skill has at least one linked agent — a never-used skill shows tags and
nothing more.

**Trash button** in the header row, right of the toggle: the one addition to the
card (decision 8). Confirm → `useDeleteSkill`; when the deleted skill is the
selected one, route to the first remaining skill or `/skills`.

### Config tab

`Configuration` heading + `Badge icon="GitCommit"` `v{version}` on the left,
`Enabled` + `Toggle` right. Fields as drawn: `Name` (required, mono input) ·
`Description` (no hint — the design has none) · `Type` select
(`rubric` / `convention` / `security` / `custom`) · `Skill body` (required) with
the design's hint, "The only text sent to the model. Editing the body is the
entire skill — everything else is metadata."

Body rendered by the shared `MarkdownEditor`: boxed meta bar with `FileText`
icon, mono `{name}.md`, a lowercase `unsaved` badge while dirty, and a
right-aligned thousands-separated `{tokens} tokens` (no `~`); line-number
gutter; mono textarea. Below it `Save skill` (primary, `Check`) and `Cancel`
(ghost), Save disabled while clean or in-flight, plus the design's right-aligned
note `Saving snapshots the body as v{version + 1}`. Success toast keeps the
existing `config.savedToast` wording.

Danger zone at the bottom, above a `--border` top rule, exactly as drawn:
`Delete skill` in `--crit`, "Removes it from all agents. This can't be undone."
beneath it, and a `danger` `size="sm"` `Trash` button labelled `Delete` on the
right. Same confirm + `useDeleteSkill` + post-delete routing as the card.

### Preview tab

Unchanged — the shipped `Preview` / "Rendered as the reviewing agent receives
it." / `Markdown` body are already the design's literals, inside a `Card`.

### Stats tab

Backed by `useSkillStats`. Four KPI tiles in the design's order, labels verbatim:
`USED BY` (value `{n}` + muted suffix ` agent` / ` agents`), `PULL FREQUENCY`
(`{p}` + `%`), `ACCEPT RATE` (`{a}` + `%`, with a `CircularScore` in the tile's
top-right), `FINDINGS (30D)` (bare count). Below, two equal-width cards
(`grid-template-columns: 1fr 1fr`): `SectionLabel icon="Cpu"` reading "Agents
using this skill" — one row per linked agent (`Cpu` icon box, name, `MonoLink`
`Open` → `/agents/{id}?tab=skills`, muted when the agent or the link is
disabled) — and `SectionLabel icon="Tag"` reading "Findings by category" with a
`Donut size={120}` over `findings_by_category`. `SectionLabel` uppercases in CSS,
so those two strings stay sentence-case in `messages/`.

Donut values are **counts** — the design's segments are plain integers
(`security: 52`, `bug: 20`, `perf: 16`, `style: 12`), no currency anywhere on
this screen.

The attribution rule from decision 4 lives in a `title` tooltip on the
`ACCEPT RATE` and `FINDINGS (30D)` tiles — no visible caption, so the tile row
stays exactly as drawn. `—` in a tile whose rate is null. `EmptyState` on the
design's own condition (the skill has no linked agents) with its literals:
`BarChart` icon, "No usage yet", "This skill isn't enabled on any agent. Add it
to an agent to start collecting stats."

### Versions tab

`Version history` + `{n} versions` badge + the design's subtitle, reworded off
`eval runs`: "Every save snapshots the body so past runs stay reproducible
against the exact text they scored." Rows: mono `v{n}` chip, note as the row
title (fallback `Version {n}`), date beneath; right side a dotted `Current`
badge for the current version, otherwise `Diff` (ghost, `Eye`) and `Restore`
(secondary, `History`) buttons. The existing diff panel and restore confirm stay.

### Shared markdown editor

`client/src/components/markdown-editor/MarkdownEditor.tsx` —
`{ value, onChange, fileName, tokensLabel, unsavedLabel?, dirty?, ariaLabel,
fill?, minLines? }`. Labels arrive already translated, so the component carries
no `useTranslations` and no namespace assumption (its two callers live in the
`skills` and `conventions` namespaces). `fill`
switches between "grow with content" (Config tab, page scrolls) and "fill the
container and scroll internally" (conventions modal, which must not scroll the
modal itself). The conventions `CreateSkillModal` is migrated to it in the same
change.

### Nav order and demo data

The design's `SKILLS LAB` group reads Skills (`Sparkles`) → Agents (`Cpu`) →
Conventions (`ListChecks`) → Eval Dashboard (`Gauge`); the app currently ships
Agents → Skills → Conventions. `vendor/ui/nav.ts` is reordered to the design's
first three (keys, hrefs and `gKey` shortcuts unchanged, so `g a` / `g k` /
`g c` and the shortcut list stay valid). `Eval Dashboard` is not added
(decision 2).

`pnpm db:seed` gains demo usage for the seeded skills (decision 6): a handful of
`agent_runs` for the seeded agent, `run_skills` rows on a subset of them so
`PULL FREQUENCY` lands below 100%, and findings in several categories with a mix
of accepted / dismissed / pending so `ACCEPT RATE`, `FINDINGS (30D)` and the
category donut all render like the mockup. Idempotent like the rest of the seed.

### Deliberate deviations from the design source

| Change | Why |
|---|---|
| No `Evals` tab, no `Run on evals` header button | no eval routes exist; a dead tab misrepresents the product (decision 2) |
| No `Eval Dashboard` nav item (design's 4th `SKILLS LAB` entry) | same — the screen it links to has no backing module |
| Versions subtitle says "past runs", design says "eval runs" | the sentence would name a feature the build does not have |
| Version titles are generated, not the design's hand-written prose | the Config screen has no note field; the generator matches the shape ("Added Tests section") but not the exact wording ("Added Tests dimension") (decision 7) |
| `—` instead of `0%` in a workspace with no recorded runs | zero is a measurement, nothing measured is not; `pnpm db:seed` populates the demo workspace so the starter screen matches the design (decision 6) |
| Trash on the list card, in addition to the design's Config danger zone | requested; matches `AgentCard` so deletion is in the same place everywhere (decision 8) |
| `Description` loses its shipped `descriptionHint` | the design draws that field bare |

### i18n (`client/messages/en/skills.json`)

New: `card.pull` / `card.accept` / `card.statUnknown` (`card.agentCount` already
exists and already pluralises), `card.deleteConfirm` reworded to name versions
and agent bindings, `editor.versionChip`, `stats.*` (the four KPI labels exactly
as drawn, `agentsUsing` = `Agents using this skill` and `byCategory` =
`Findings by category` in sentence case, `attributionHint` for the tooltip,
`open`, `noFindings`, `loadError`, `emptyTitle` → `No usage yet` and `emptyBody`
→ the design's sentence, both replacing today's "coming later"),
`config.snapshotHint` (`Saving snapshots the body as v{version}`),
`config.dangerTitle` / `config.dangerBody` / `config.delete` for the danger zone,
`versions.title` → `Version history` plus `versions.count`, `versions.subtitle`,
`versions.noteFallback`. Reworded: `config.bodyHint` to the design's sentence,
`config.tokenEstimate` to `{tokens} tokens` (drop the `~`), `config.unsaved` to
lowercase `unsaved`. Removed: `config.descriptionHint`, and
`page.selectPrompt.body`'s "editor toolbar" sentence (there is no toolbar any
more).

## Testing

**Server unit** — `stats-helpers.test.ts`: pull/accept rates, union
denominator, null rates on empty input, category map, pending excluded from the
accept denominator; `helpers.test.ts` additions: `bodyLineDelta`,
`skillVersionNote` for all six cases; `agents-skills-prompt.test.ts` addition:
`promptSkillRefs` filters both enable gates and carries `skill_version`.

**Server integration** — `skills-stats.it.test.ts`: seed agent + skill + link,
insert two runs with `run_skills` on one, findings accepted/dismissed, assert
`pull_rate = 0.5`, `accept_rate`, `agents[0].name`; assert `404` for a foreign
skill. Extend `skills.it.test.ts`: body update → `v2` with
`note: 'Body +1/-0 lines'`, restore → `Restored from v1`, delete removes the
`run_skills` rows. Extend `reviews.it.test.ts`: a stubbed-LLM run with one
enabled linked skill writes exactly one `run_skills` row with the skill's
current version, and a globally-disabled skill writes none.

**Client** — `SkillCard.test.tsx`: stats footer renders `3 agents`, is absent
when no agent uses the skill, `—` for null rates, trash click asks for confirm
and calls the delete mutation; `SkillEditor.test.tsx`: four tabs, header chip,
stats tab renders KPI values from a mocked hook; `ConfigTab.test.tsx` addition:
the danger-zone `Delete` confirms and fires the same mutation;
`VersionsTab.test.tsx`: note as title, fallback when null,
`Current` badge on the current version only; `MarkdownEditor.test.tsx`: gutter
line count follows the value.

## Non-goals

Evals tab / eval runs / `Eval Dashboard` screen · community skill search drawer ·
per-finding skill attribution inside reviewer-core ·
backfilling `run_skills` for historical runs · user-authored version notes ·
skill diff between arbitrary versions in the UI (the endpoint already supports
`?against=`) · cross-workspace or per-repo skill scoping · sparkline trends on
the Stats tab.
