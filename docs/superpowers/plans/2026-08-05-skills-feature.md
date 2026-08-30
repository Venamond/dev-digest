# Skills Feature Implementation Plan

> **For agentic workers:** Use parallel agents by file ownership after foundation. **Do not commit** unless the user asks — leave working tree for human review.

**Goal:** Ship product Skills (CRUD, import, versions UI, agent bind with per-agent enable/order, prompt wiring, Test Quality seed) per `docs/superpowers/specs/2026-08-05-skills-feature-design.md`.

**Architecture:** Dedicated `modules/skills` (onion) + agents bind extensions + `run-executor` passes skill bodies into `reviewPullRequest`. Client mirrors Agents master-detail (`/skills`, `/skills/[id]?tab=`). No Evals.

**Tech Stack:** Fastify 5, Drizzle, Zod shared contracts, Next.js 15, TanStack Query, Vitest.

---

## File ownership (parallel)

| Track | Owns (create/modify) | Must NOT touch |
|---|---|---|
| **Foundation** (done first) | `schema/agents.ts` (`agent_skills.enabled`), migration, both `vendor/shared` contracts | — |
| **A — Server skills** | `server/src/modules/skills/**`, `server/src/modules/index.ts`, `server/test/skills*.ts`, importable `docs/skills/*.md` | client/, agents/, run-executor |
| **B — Client skills** | `client/src/app/skills/**`, `client/src/lib/hooks/skills.ts`, `queryKeys`, nav (Skills item), i18n skills messages | server/ |
| **C — Bind + wire + seed** | agents routes/service/repository (skills bind), Agent editor Skills tab, AgentCard skillCount, `run-executor.ts`, `seed.ts` / seed-prompts / agent prompt docs | `modules/skills/**` |

## Task checklist

- [x] Foundation: `agent_skills.enabled` + contracts (`AgentSkillLink.enabled`, `AgentSkillEditorRow`, `SkillListItem`/`agent_count`, `SkillVersion`)
- [x] A: Skills module CRUD + versions + import preview/confirm + unit/itests
- [x] B: `/skills` list + `/skills/[id]` Config/Preview/Versions + Stats stub + import drawer
- [x] C: Agent Skills tab API+UI; run-executor skills; Test Quality + 4 skills seed
- [x] Integrate: client/server tsc clean; shared sync OK; skills + prompt unit tests green (Docker itests skipped in this env)

## Spec constraints (all tracks)

- Enable rule: global `skills.enabled` AND link exists AND `agent_skills.enabled`; order ASC
- Import: `.md` / `.zip` (root `SKILL.md` only), frontmatter name/description/type, never execute
- No Evals tab / Run on evals
- Stats tab stub only
- `source: manual` for create + file import
- Do not hand-edit `0000_init.sql`; additive migration only
- Keep `server/src/vendor/shared` ≡ `client/src/vendor/shared`
- No git commits unless user requests
