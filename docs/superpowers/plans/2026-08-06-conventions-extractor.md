# Conventions Extractor — implementation plan

> Spec: `docs/superpowers/specs/2026-08-06-conventions-extractor-design.md`
> **Do not commit** unless the user asks — leave the tree for review.

**Goal:** Scan the cloned repo → grounded convention candidates → accept/reject/
edit in UI → one editable `repo-conventions` skill bound to an agent.

**Stack:** Fastify 5, Drizzle, Zod shared contracts, Next.js 15, TanStack Query,
Vitest.

---

## File ownership (parallel after Foundation)

| Track | Owns | Must NOT touch |
|---|---|---|
| **Foundation** (first, alone) | migration `0012_conventions_extractor.sql`, `schema/knowledge.ts`, `db/rows.ts`, both `vendor/shared/contracts/knowledge.ts`, both `contracts/platform.ts` + `client/src/lib/feature-models.ts` (cheap default) | anything else |
| **A — Server** | `server/src/modules/conventions/**`, `modules/index.ts`, `server/test/conventions*.ts` | client/, repo-intel, skills module |
| **B — Client** | `client/src/app/repos/[repoId]/conventions/**`, `lib/hooks/conventions.ts`, `queryKeys`, `vendor/ui/nav.ts`, `messages/en/conventions.json` | server/ |
| **C — Content (Part 2)** | `docs/agent-prompts/api-contract-reviewer.md`, `docs/skills/*.md` | src/ |

## Tasks

### Foundation
- [x] Migration: add `category`, `evidence_line_start`, `evidence_line_end`,
      `status` (`default 'pending'`), `source_sha`, `sample_file_count`,
      `position`, `created_at`, index on `repo_id`. Additive only; leave legacy
      `accepted` untouched.
- [x] Mirror in `schema/knowledge.ts` + `ConventionRow` in `db/rows.ts`.
- [x] Contracts: `ConventionStatus`, extended `ConventionCandidate` (drop
      `accepted`, add `evidence_url`), `ConventionsExtractResult`,
      `ConventionUpdate`, `ConventionScan`, `ConventionsList`,
      `ConventionSkillDraft`, `ConventionSkillCreate` (no `type` / `source` —
      server-set). Copy into both `vendor/shared`; verify
      `./scripts/check-shared-sync.sh`.
- [x] Cheap default: `FEATURE_MODELS.conventions` → `openrouter` /
      `deepseek/deepseek-v4-flash` in both `contracts/platform.ts` copies and in
      the client mirror `client/src/lib/feature-models.ts`.
- [x] `cd server && pnpm db:migrate` (manual, never on boot).

### A — Server module `modules/conventions/`
- [x] `constants.ts`: config filenames, `SAMPLE_FILE_COUNT = 12`,
      `MAX_CANDIDATES = 12`, per-file char budget.
- [x] `helpers.ts` (pure, no I/O): `buildPrompt`, `parseCandidates` (Zod,
      tolerant of malformed items), `groundCandidate` (spec's five rules),
      `dedupeCandidates`, `ruleSlug`, `composeSkillBody` + `composeDraftMeta`
      (template in the spec), `evidenceUrl`.
- [x] `repository.ts`: `replaceForRepo`, `listByRepo`, `updateOne`,
      `listAccepted` (+ repo read + extracted skill insert).
- [x] `service.ts`: precondition checks (clonePath, `getIndexState`, provider
      key), sampling (configs via `CloneFs` + `repoIntel.getConventionSamples`),
      one LLM call via `resolveFeatureModel(..., 'conventions')`, parse → ground
      → dedupe → persist, returns `ConventionsExtractResult` incl. `dropped`.
- [x] `routes.ts`: the five routes from the spec; `409` for preconditions and
      for an empty draft. Skill creation sets `type: 'convention'` and
      `source: 'extracted'` server-side.
- [x] Register in `server/src/modules/index.ts`.
- [x] Tests: `helpers.test.ts` + `conventions.it.test.ts` (stub LLM, temp
      clone, 409s, PATCH transitions, extracted skill).

### B — Client
- [x] `lib/hooks/conventions.ts`: `useConventions`, `useExtractConventions`,
      `useUpdateConvention`, `useConventionSkillDraft` + `queryKeys` entries.
- [x] Route `app/repos/[repoId]/conventions/page.tsx` + `_components/
      ConventionsView` (states: precondition / empty / scanning / list / error;
      header with subtitle from `scan`, `Deselect all`, `N of M accepted`,
      `Re-scan`, `Create skill`).
- [x] `_components/ConventionCard`: rule (inline-editable), evidence row with
      GitHub link + copy icon, snippet, confidence bar with the spec's colour
      thresholds, Accept / Reject.
- [x] `_components/CreateSkillModal`: prefilled from the draft endpoint, info
      banner, type as a static `convention` badge, body meta row
      (`<name>.md` · `unsaved` · token count), `Saved as v1` footer; saves via
      `POST /repos/:id/conventions/skill`, then routes to the new skill.
- [x] Nav item `Conventions` in `SKILLS LAB` (`vendor/ui/nav.ts`, `g c`
      shortcut) — pathname mapping already exists.
- [x] i18n: extend `messages/en/conventions.json` (subtitle sample-count +
      relative last-scan, `deselectAll`, reject, edit, preconditions, modal
      banner/footer). Replace the stale `page.candidateCount` wording.
- [x] Tests: helpers + `ConventionsView` empty-state smoke.

### C — Part 2 content & experiment
- [x] Author `API Contract Reviewer` prompt (`docs/agent-prompts/` +
      `seed-prompts.ts`); seed agent on `pnpm db:seed`.
- [x] Write four skills with good/bad examples; seed three, leave
      `deprecation-policy` for Import drawer (`docs/skills/`).
- [x] Experiment protocol: `docs/superpowers/plans/2026-08-06-api-contract-experiment.md`
      (runs A/B + extractor quality notes — execute at demo time).
- [ ] Run the control experiment + extractor on a real repo (human / demo).

### Integrate
- [ ] `cd server && pnpm test`, `cd client && pnpm test`, both `tsc` clean,
      `./scripts/check-shared-sync.sh`.
- [ ] Verify acceptance: evidence links open real code at the pinned SHA;
      rejected candidates absent from the skill body; skill binds to an agent
      and appears in a run's prompt assembly.
- [ ] Re-read `client/INSIGHTS.md` and `server/INSIGHTS.md`; append only if
      something genuinely new surfaced.
- [ ] `pr-self-review` skill before `gh pr create`.

## Constraints

- Grounding is non-optional: an ungrounded candidate must never reach the UI.
- Generated skills are `type: 'convention'`, `source: 'extracted'`, both set by
  the server; the public `POST /skills` stays `manual`-only.
- The model never picks files and never writes to the DB.
- Evidence URLs pin `lastIndexedSha`, falling back to `defaultBranch`.
- Preconditions block with a notice; never degrade to an empty result silently.
- One skill only; `category` is a heading, not a separate skill.
- ESM: relative imports carry `.js`.
- `server/src/vendor/shared` ≡ `client/src/vendor/shared`.
- No git commits unless the user asks.
