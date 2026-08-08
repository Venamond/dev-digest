# Conventions Extractor — design

> Date: 2026-08-06 · Depends on the Skills feature
> (`2026-08-05-skills-feature-design.md`).

## Problem

An agent sees only the PR diff, so it cannot know a repo's unwritten house
rules (ESM `.js` import suffix, `Result<T, E>` handlers, layering). Those rules
live in the existing code and nowhere else. Writing them by hand requires
knowing the whole project; authors are blind to their own conventions.

## Goal

Scan the **cloned** repo, let a cheap model distil recurring rules, verify every
piece of evidence against real files, let the user accept/reject/edit each
candidate, and compose the accepted ones into one editable skill
`repo-conventions` that binds to an agent through the existing Skills tab.

## Decisions (from brainstorming)

1. **One skill.** All accepted candidates → single `repo-conventions` body.
   `category` is still stored and used as section headings; per-category skills
   are a later, non-breaking extension.
2. **Sample selection is pure code, no model.** Config files by fixed name +
   top-12 ranked source files via `repoIntel.getConventionSamples()`. The model
   receives one prompt and cannot request more files, so it cannot cite a file
   it was never shown.
3. **Grounding is mandatory.** A candidate survives only if its file exists and
   its snippet is found. Ungrounded candidates are dropped server-side and never
   reach the UI.
4. **Evidence links are pinned to a SHA**, not to the default branch, so the
   line never drifts. Uses `repoIntel.getIndexState().lastIndexedSha`, falling
   back to `repos.defaultBranch`. GitHub plays no part in extraction — sampling
   and grounding read the local clone only. The URL is a plain anchor for the
   human reviewer, built from `owner/name` + sha + path + line; the feature works
   end to end with GitHub unreachable.
5. **Both affordances on the evidence row**: the `path:line` text is a GitHub
   link (acceptance criterion), the copy icon on the right stays as mocked.
6. **Preconditions are surfaced, not silently degraded.** No clone → blocking
   notice. Clone but no repo-intel index → blocking notice with a link to
   re-sync, because `getConventionSamples` would return `[]`. Missing provider
   API key → the same treatment.
7. **Re-scan replaces the candidate list** for that repo. Previously created
   skills are untouched — they are independent rows in `skills`.
8. **The model chooses nothing about persistence.** The server composes the
   skill draft, the client edits it, and a dedicated route persists it. Saving
   does **not** reuse `POST /skills`, which hardcodes `source: 'manual'` — an
   extracted skill must be honestly marked `source: 'extracted'` so the list can
   tell generated skills from hand-written ones.
9. **Skill type is fixed, not chosen.** A skill built from conventions is a
   `convention` by definition; the modal renders the type as a static badge, not
   a select. The type stays editable afterwards in the skill's own Config tab.
10. **Cheap model by default, user-overridable.** The call resolves through
    `resolveFeatureModel(container, ws, 'conventions')`, so Settings → Feature
    Models wins. The registry default moves from `openai/gpt-5.4` to
    `openrouter/deepseek/deepseek-v4-flash` — the same cheap default the
    onboarding feature and the seeded agent already use. A missing
    `OPENROUTER_API_KEY` surfaces as a precondition notice, not a 500.

## Architecture

```
POST /repos/:id/conventions/extract
  │
  ├─ preconditions ── clonePath? indexed? ─── 409 ConventionsPreconditionError
  ├─ sampling (code) ─ configs by name + getConventionSamples(repoId, 12)
  ├─ llm (1 call) ──── feature model `conventions` (Settings override)
  ├─ parse (Zod) ───── candidates[]; malformed items dropped
  ├─ grounding (fs) ── clone lookup; drop or line-correct
  └─ persist ───────── replace rows for repoId, status='pending'
```

New module `server/src/modules/conventions/` (onion: routes → service →
repository, plus pure `helpers.ts` for prompt/parse/grounding/body composition).
Reads the clone through the existing `CloneFs` adapter; file ranking through the
`repoIntel` facade. No new adapters.

## Data model

Existing table `conventions` (`server/src/db/schema/knowledge.ts`) has `rule`,
`evidence_path`, `evidence_snippet`, `confidence`, `accepted`. It has never been
written to.

Additive migration `0012_conventions_extractor.sql`:

| Column | Type | Why |
|---|---|---|
| `category` | `text` | section headings in the skill body |
| `evidence_line_start` | `integer` | evidence anchor + GitHub link |
| `evidence_line_end` | `integer` | multi-line snippets |
| `status` | `text not null default 'pending'` | `pending` / `accepted` / `rejected` — `accepted:boolean` cannot express "rejected" vs "not yet judged" |
| `source_sha` | `text` | pins evidence links |
| `sample_file_count` | `integer` | the "Detected from N sample files" subtitle |
| `position` | `integer` | preserves the model's ordering in the list |
| `created_at` | `timestamptz not null default now()` | scan timestamp ("last scan 1h ago") |

Scan metadata (`sample_file_count`, `created_at`, `source_sha`) is denormalised
onto every row: a re-scan replaces all rows for the repo, so every row of a scan
carries identical values and no second table is needed.

Plus an index on `repo_id`. The legacy `accepted` column is left in place and
unused: `PluginConvention` in `contracts/productionize.ts` still declares it, and
that export lesson can derive it as `status === 'accepted'`.

## Contracts (both `vendor/shared`, kept byte-identical)

`ConventionCandidate` gains `category`, `evidence_line_start`,
`evidence_line_end`, `status` (`ConventionStatus` enum), `evidence_url`
(server-composed, nullable). `accepted` is removed from the DTO — status
replaces it.

New: `ConventionScan { sampled_file_count, scanned_at, source_sha }`,
`ConventionsList { candidates, scan }` for `GET`,
`ConventionsExtractResult { candidates, scan, dropped }` for the quality report,
`ConventionUpdate { status?, rule? }`, `ConventionSkillDraft
{ name, description, body }`, and `ConventionSkillCreate
{ name, description, body, enabled }`. The last two carry neither `type` nor
`source` — the server sets both.

## Server API

| Route | Behaviour |
|---|---|
| `POST /repos/:id/conventions/extract` | full pipeline; replaces rows; returns `ConventionsExtractResult`. `409` when clone or index is missing |
| `GET /repos/:id/conventions` | `ConventionsList { candidates, scan }` — candidates by `position` ASC, plus `scan { sampled_file_count, scanned_at, source_sha }` for the subtitle (`scan` is null before the first run) |
| `PATCH /conventions/:id` | accept / reject / edit rule text |
| `GET /repos/:id/conventions/skill-draft` | composes `ConventionSkillDraft` from `status='accepted'` rows; `409` when none |
| `POST /repos/:id/conventions/skill` | persists the edited draft as a skill with `source: 'extracted'`, `type: 'convention'`; returns the created `Skill` |

### Draft template (matches the mockup)

`composeSkillBody` emits one section per accepted candidate, headed by a slug of
the **rule** — not by `category`, which the mockup does not surface:

```markdown
# repo-conventions

House conventions for `payments-api`. Flag changes that violate any rule below
and cite the offending `file:line`.

## async-await-then-chains
Always use async/await instead of .then() chains.

Detected in `src/api/users.ts:23-31`:
```

Description defaults to `N house conventions extracted from <repo>`; name
defaults to `repo-conventions`. `category` is still persisted for future
per-category skills and for grouping in the API, but it is not rendered.

The draft endpoint returns pre-filled text the user may rewrite; the POST accepts
`{ name, description, body, enabled }` only. `type` and `source` are server-set,
so neither the client nor the public `POST /skills` can claim a skill was
extracted when it wasn't. Creation reuses the skills repository, so versioning
behaves exactly like a hand-written skill.

### Model contract

One call, `response_format` JSON, asking for at most 12 items of
`{ category, rule, evidence: { path, line_start, line_end, snippet }, confidence }`.
The prompt states explicitly: cite only supplied files, ignore formatting rules
that a linter already enforces, prefer rules observable in a diff. Provider and
model come from `resolveFeatureModel(container, ws, 'conventions')`; the registry
default becomes `openrouter` / `deepseek/deepseek-v4-flash` (changed from
`openai/gpt-5.4` in `FEATURE_MODELS` — both `vendor/shared/contracts/platform.ts`
copies plus the client mirror `client/src/lib/feature-models.ts`).

### Grounding rules (pure, unit-tested)

1. Path must be inside the sampled set; otherwise drop.
2. Read the file from the clone; missing file → drop.
3. Compare the snippet at the claimed line, whitespace-normalised. Match → keep.
4. No match at that line → search the file for the snippet. Found → keep with
   corrected line numbers. Not found → drop.
5. Duplicate rules (normalised text) → keep the highest confidence.

`dropped` counts are returned so the PR description can report extraction
quality.

## Client

New route `client/src/app/repos/[repoId]/conventions/page.tsx` plus a
`Conventions` nav item in the `SKILLS LAB` group (`vendor/ui/nav.ts`; the
pathname→nav mapping in `app-shell/helpers.ts` already handles it).

Page states: precondition notice (no clone / not indexed / no provider key) ·
empty (never scanned) · scanning · list · load error.

**Header** — `Conventions in <repo>` with the repo name accented, subtitle
`Detected from N sample files · last scan <relative>` from `scan`, then a row
with `Deselect all`, `N of M accepted`, and `Create skill` (disabled at zero
accepted). `Re-scan` sits top-right, labelled `Run extraction` before the first
scan.

**Candidate card** — rule text (italic), evidence row with `path:lineStart-lineEnd`
plus the copy icon on the right, snippet block, and a `Confidence` bar with the
percentage. Bar colour: `>= 0.85` ok, `0.6–0.85` warn, `< 0.6` muted. On the
right, a stacked pair: the accept control (rendered filled and labelled
`Accepted` once accepted) and `Reject`.

**Create-skill modal** — title `Create skill from conventions` with the skill
name beneath, an info banner (`Merged from N accepted conventions in <repo>.
Everything below is editable before you save.`), then Name (required, mono),
Description, a static `convention` type badge, and the `Enabled` toggle with its
prompt-inclusion hint. The body field reuses the skills Config-tab pattern: a
meta row with `<name>.md`, an `unsaved` marker driven by dirty state, and the
`estimateTokens` count, above a mono textarea. Footer: `Saved as v1 · added to
Skills Lab` on the left, `Cancel` / `Create skill` on the right.

### Deliberate deviations from the mockup

| Change | Why |
|---|---|
| `path:line` is a GitHub anchor, copy icon retained | acceptance criterion demands clickable evidence; browsing only, extraction stays local |
| Inline rule editing on the card | assignment requires editing an individual insight; the mockup has no affordance |
| Type is a static badge, not a select | a conventions skill is a `convention` by definition (decision 9) |
| Precondition notices | mockup assumes a cloned, indexed repo; failing silently would look like "no conventions found" |
| Skill name is `repo-conventions`, not `<repo>-conventions` | acceptance criteria name the skill explicitly |
| `Deselect all` moves accepted rows back to `pending`, never to `rejected` | "deselect" is not a judgement; rejecting must stay explicit |
| Nav order Agents → Skills → Conventions | keeps the existing group order instead of the mockup's Skills → Agents |

Strings live in the existing `client/messages/en/conventions.json`, extended with
the subtitle (`sampleFileCount`, `lastScan`), `deselectAll`, accept/reject/edit,
the precondition notices, and every modal key including the banner and footer.
The pre-existing `page.candidateCount` string is replaced by the mockup's
subtitle wording.

## Part 2 — API Contract Reviewer (no product code)

Authored content plus one experiment, using the shipped Skills feature:

- Agent `API Contract Reviewer` created through the UI, prompt mirrored into
  `docs/agent-prompts/`.
- Four skills with directive bodies and good/bad examples: `breaking-change`,
  `response-schema`, `semver-discipline`, `deprecation-policy`. At least one is
  brought in through the import drawer to exercise that path.
- Control experiment on a PR that renames a response field or changes a route
  signature: run with skills disabled (miss) vs enabled (catches the breaking
  change). Both runs stay visible in Run history for the demo.

## Testing

Unit: sampling selection, prompt/response parse (including malformed JSON),
grounding (all five rules), skill-body composition, GitHub URL building.
Integration: extract with a stubbed LLM against a temp clone, precondition
409s, PATCH transitions, draft with zero accepted rows, and skill creation
asserting `type: 'convention'` + `source: 'extracted'` and that rejected
candidates are absent from the body.

## Non-goals

Per-category skills · embeddings/dedupe across scans · scan history · automatic
re-extraction on push · convention enforcement outside the review prompt ·
writing to the `memory` table.
