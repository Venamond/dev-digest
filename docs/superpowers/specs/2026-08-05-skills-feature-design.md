# Skills feature — design

**Date:** 2026-08-05  
**Status:** approved — implementation in progress  
**Scope:** product Skills (reusable markdown config blocks), Agent ↔ Skill binding, import, Test Quality Reviewer seed, prompt wiring + trace.  
**Out of scope:** Conventions extractor, API Contract agent/experiment, community/URL import, **Skill Evals entirely** (no tab, no “Run on evals”, no eval APIs), rich Stats analytics (pull/accept/findings charts), plugin bundle import (L08).

## Problem

Agents today carry a static system prompt only. Course L02 needs reusable **Skills**: text-only configuration blocks that live in a shared pool, can be edited independently, bound to agents with order + enable state, and appear as distinct sections in the assembled review prompt. The DB tables, Zod contracts, and `reviewer-core` skills slot already exist; there is no skills module, no Skills UI, and `run-executor` does not pass skill bodies into `reviewPullRequest`.

## Goal

Ship a Skills Lab experience matching the updated mockups (Agents-parity master-detail): list + skill editor with tabs, import, Agent → Skills binding, prompt injection for enabled skills in order, one demo agent (Test Quality Reviewer) with four skills, and a reproducible control experiment. Skills never execute code — body text only.

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Enable semantics | **Both layers (C):** `skills.enabled` (global kill-switch) AND `agent_skills.enabled` (per-agent). Prompt iff both true and linked. |
| New agents | **One:** Test Quality Reviewer |
| Skills per that agent | **Four** (working titles below) |
| Control experiment | **Test Quality only** (API Contract deferred) |
| Import | **`.md` + `.zip`**, preview then confirm; never execute archive contents |
| Import shape | **Frontmatter** `name`, `description`, `type` + markdown body; zip uses root `SKILL.md` |
| Conventions | **Out of scope** |
| Implementation packaging | **Dedicated `modules/skills`** mirroring agents (approach 1) |
| Skills UI chrome | **`ScreenSkillsLab` from design HTML**: left list + center code editor (no Eval panel; no Config/Preview/Versions/Stats tab strip) |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ client      │────▶│ modules/skills   │────▶│ skills          │
│ /skills     │     │ CRUD + import    │     │ skill_versions  │
│ /skills/:id │     │ + versions       │     └────────┬────────┘
└─────────────┘     └──────────────────┘              │
┌─────────────┐     ┌──────────────────┐              │
│ Agent       │────▶│ modules/agents   │─── agent_skills ─────┘
│ Skills tab  │     │ bind/order/enab. │
└─────────────┘     └──────────────────┘
┌─────────────┐     ┌──────────────────┐
│ reviews     │────▶│ run-executor     │── bodies ──▶ reviewer-core
│ run + trace │     │ load linked ON   │             assemblePrompt
└─────────────┘     └──────────────────┘             (skills slot)
```

- **DB is source of truth** for skill content and bindings.
- **reviewer-core** stays pure: already accepts `skills?: string[]`; server loads bodies.
- **Cross-package contracts** stay in `vendor/shared` (edit both copies).

## Data model

### Existing tables (reuse)

- `skills` — workspace-scoped pool: `name`, `description`, `type` (`rubric` \| `convention` \| `security` \| `custom`), `source` (`manual` \| `imported_url` \| `extracted` \| `community`), `body`, `enabled` (global), `version`, `evidence_files`, timestamps.
- `skill_versions` — immutable body/config snapshots on save (mirror `agent_versions`).
- `agent_skills` — `(agent_id, skill_id)` PK, `order` integer.

### Additive change

- Column: `agent_skills.enabled boolean NOT NULL DEFAULT true`.
- Drizzle schema + **new coordinated migration** (do not hand-edit `0000_init.sql` without coordination; follow project migration process).
- Extend shared Zod / DTOs: `AgentSkillLink` gains `enabled`; list/bind payloads include it.
- Skill list DTO may include `agent_count` (derived from `agent_skills`) for card footer; pull/accept/findings metrics are **not** computed in this feature (UI shows placeholders or omits until Evals lesson).

### Prompt inclusion rule

```
include skill body in reviewPullRequest({ skills })
  iff skills.enabled
 AND agent_skills row exists for (agent, skill)
 AND agent_skills.enabled
ORDER BY agent_skills.order ASC
```

Global OFF or per-agent OFF → skill absent from prompt assembly and from the Skills block in the run trace.

## Pages (client routes)

Source of truth for Skills chrome: `DevDigest Design (standalone).html` → `ScreenSkillsLab` (list + `CodeEditor`). Eval panel omitted.

| Route | Role | Implement |
|---|---|---|
| `/skills` | Lab layout; auto-select first skill | **Yes** |
| `/skills/[id]` | Same lab layout with selection; center = meta + line-numbered body editor; Preview/Versions/Save in toolbar | **Yes** |
| `/agents` | Existing list; show skill count on cards; Skills Lab nav | **Extend** |
| `/agents/[id]?tab=skills` | Bind / enable / reorder skills for one agent | **Yes** (new tab) |
| `/agents/[id]?tab=config` | Existing; caption that skills append below system prompt | **Keep** |
| PR run trace drawer | Skills block when assembly non-null | **Wire only** |

Sidebar: add **Skills** under Skills Lab (next to Agents). Conventions / Eval Dashboard nav entries stay as-is if already present (no Conventions feature work).

## Server API

### New module: `server/src/modules/skills/`

Onion layout: `routes.ts` → `service.ts` → `repository.ts` (+ helpers/constants). Register in `modules/index.ts`. Zod + `fastify-type-provider-zod`. Skills are **text only** — no tool wiring, no archive execution.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/skills` | List workspace skills (incl. `agent_count`, type, source, enabled, version) |
| `POST` | `/skills` | Create (manual) → version 1 snapshot |
| `GET` | `/skills/:id` | Get one |
| `PUT` | `/skills/:id` | Update name/description/type/body/enabled; bump `version` + `skill_versions` on config/body change |
| `DELETE` | `/skills/:id` | Delete (cascade links/versions) |
| `GET` | `/skills/:id/versions` | Version history (newest first) |
| `GET` | `/skills/:id/versions/:version` | One snapshot |
| `POST` | `/skills/:id/versions/:version/restore` | Restore snapshot as new current version (same pattern spirit as agent config history) |
| `GET` | `/skills/:id/versions/:version/diff` | Diff current (or `?against=`) vs snapshot — text diff of body (+ meta if useful) |
| `POST` | `/skills/import/preview` | Multipart `.md` or `.zip` → draft DTO, **no persist** |
| `POST` | `/skills/import/confirm` | Persist confirmed draft |

No `/skills/:id/evals*` routes at all. No `/skills/:id/stats` (Stats tab is UI stub only).

### Import rules

- **`.md`:** YAML frontmatter `name`, `description`, `type`; remainder = `body`.
- **`.zip`:** read **only** root `SKILL.md`; ignore other files; **never execute**.
- Invalid/missing frontmatter → 400 with field errors for preview UI.
- `source`: UI create → `manual`; file import → `manual` for this lesson (URL/community deferred; do not misuse `imported_url` without a URL).
- Trust copy: foreign skill = foreign instructions in the agent prompt.

### Agents module extensions

| Method | Path | Change |
|---|---|---|
| `GET` | `/agents/:id/skills` | Pool-oriented rows: `{ skill, linked, enabled, order }` for “N of M” |
| `POST` | `/agents/:id/skills` | Persist full set with `order` + per-link `enabled` |

### Prompt wiring

- In `run-executor.ts`, load linked skills, filter both enabled flags, map `body` in order → `reviewPullRequest({ skills })`.
- Trace `PromptAssembly.skills` non-null when injected; disabled skills never appear.

## Client UI (matches updated mockups)

Reuse Agents list/editor patterns, TanStack Query (`queryKeys`), colocated `_components`, `styles.ts`, i18n (`messages/*/skills.json` — wire and extend).

### `/skills` (+ `/skills/[id]`) — `ScreenSkillsLab`

Matches design HTML (`screen_skills.jsx`):

- **Left (~290px):** “Skills” + **+ Add Skill** dropdown (Import from file / Create; URL & community muted), search, compact list rows (mono name, toggle, one-line description, type color tag + source icon). No card grid.
- **Center:** skill workspace — compact meta (name / type / enabled / description) + code-editor chrome (`{name}.md`, unsaved, token estimate, **Preview** / **Versions** / **Save**), line-numbered markdown body. Preview toggles in-place; Versions expands a bottom panel (Diff / Restore).
- **Right Eval panel:** **not shipped** (evals out of scope).
- Selecting a row navigates `/skills/:id`; bare `/skills` auto-selects the first skill when the list is non-empty.

### Import drawer

- From Add Skill → Import from file: `.md` / `.zip` → preview → Confirm / Cancel + trust note.
- No skill persisted until confirm.

### Agent editor → Skills tab

- Register next to Config; Evals/Stats/CI stay stubs.
- Draggable list, per-agent checkbox, type tags, filter, “N of M enabled”, order caption.
- Agent cards show skill count.

### Trace

- Existing RunTraceDrawer Skills block once `assembly.skills` is set.

## Seed & demo content

### Agent

- **Test Quality Reviewer** — seeded like General/Security/Performance (`seed.ts` + `seed-prompts` / `docs/agent-prompts/`).
- Focus: test quality — uncovered branches, missing corner cases, over-mocking, flaky patterns.

### Four skills (working titles; bodies authored at implementation)

1. `happy-path-coverage-gap` — flag tests that only exercise the success path.
2. `corner-case-checklist` — require boundary / error / empty-input coverage.
3. `over-mocking-smell` — flag mocks that hide real contracts.
4. `flaky-test-patterns` — timing, order dependence, shared mutable state.

All four linked and per-agent enabled on Test Quality Reviewer. ≥1 also shipped as importable `SKILL.md` / `.md` under e.g. `docs/skills/` or `server/src/db/seed-skills/`. Others may be DB-seeded.

## Control experiment

1. PR whose tests cover only the happy path.
2. Run Test Quality **with skills disabled** → miss/weak on coverage gaps.
3. Run **with skills enabled** → flags uncovered branch + corner case (live LLM for course demo; mock LLM OK in automated tests).
4. Open run trace → prompt assembly → Skills block + token delta when enabled; absent when disabled.

API Contract experiment is **not** part of this feature.

## Acceptance checklist

- [ ] Skills Lab matches design: list + code editor (Preview/Versions in toolbar); **no Eval panel / Run on evals**.
- [ ] Skill created/edited in UI; DB source of truth; versions snapshot on save; restore works.
- [ ] Import preview→confirm for `.md`/`.zip`; executables never run.
- [ ] Test Quality Reviewer has four linked skills.
- [ ] Agent → Skills tab: bind, enable/disable, reorder.
- [ ] Enabled skill = separate prompt/trace block; disabled (global or per-agent) absent.
- [ ] Control experiment reproducible for Test Quality.
- [ ] Manual `pr-self-review` (auto-call off) pulled frontend + backend skills.

## Testing expectations

- **Server unit:** import parser (md + zip), enable/filter/order helper, version restore/diff helpers.
- **Server integration (`*.it.test.ts`):** skills CRUD + versions; bind enabled/order; run-executor assembly includes/excludes skills.
- **Client component tests:** list toggle, Config save, Preview render, Versions restore, import confirm gate, Agent Skills tab (fetch mocked).
- **reviewer-core:** existing skills-slot tests; extend only if assembly formatting changes.
- **e2e:** optional; not blocking if itests + component tests cover the path.

## Non-goals / explicit deferrals

- Conventions extractor and “Accept as Skill”.
- API Contract Reviewer and its experiment.
- URL / community skill import (menu may show disabled items).
- Skill Evals (tab, runner, APIs) — omitted entirely.
- Stats charts (pull %, accept %, findings-by-category) — stub tab only.
- Agent Evals / Stats / CI tabs (unchanged stubs).
- Skills invoking tools, MCP, or shell.
- Plugin bundle import/export (L08).

## Open implementation notes (non-blocking)

1. File-import `source` value — keep `manual` for this lesson.
2. Migration name/process for `agent_skills.enabled` — follow server migration coordination.
3. Final skill body prose and system prompt — authored during implementation.
4. Version “summary” string on snapshots — free text from save message or derived (“Updated body”); pick in implementation plan.
5. Diff UI — unified text diff is enough; no need for a third-party diff package unless one is already in the client.
