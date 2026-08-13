# Development Plan: four new subagents (test-writer, architecture-reviewer, plan-verifier, doc-writer)

- **Date:** 2026-08-12
- **Author:** planner
- **Status:** approved
- **Revised:** 2026-08-12 after plan review — ADRs go in `<module>/docs/` (no
  `docs/adr/`); `reviewer-core` tests live in `reviewer-core/test/`; all steps
  on track A; mutation restore is via `Edit`, never `git checkout`

## 0. Context & scope

- **Task:** add four subagents to `.claude/agents/` — `test-writer`,
  `architecture-reviewer`, `plan-verifier`, `doc-writer` — and extend the
  existing Ukrainian `.claude/agents/README.md` so the set stays documented as
  one coherent chain.
- **In scope:**
  - four new files: `.claude/agents/test-writer.md`,
    `.claude/agents/architecture-reviewer.md`,
    `.claude/agents/plan-verifier.md`, `.claude/agents/doc-writer.md`;
  - edits to `.claude/agents/README.md`: chain diagram, "Склад набору" table,
    "Дозволи" table, "Артефакти" table, the "легко пропустити" notes, and the
    "На чому ґрунтуються правила" sources section (including a new
    "числа, які заборонено цитувати" subsection).
- **Out of scope:**
  - any change to production code in `server/`, `client/`, `reviewer-core/`,
    `e2e/`;
  - any change to `docs/agent-prompts/` — those are DB-backed *review-agent*
    system prompts (`agents.system_prompt`), a different artifact entirely;
  - any change to `researcher.md`, `planner.md`, `implementer.md` (see §2b for
    why the `implementer` ↔ `test-writer` conflict is resolved without editing
    `implementer.md`);
  - any change to `.claude/settings.json`, its two hooks, or the
    `pr-self-review` skill;
  - writing an actual ADR — S4 only teaches `doc-writer` the existing
    `<module>/docs/` destination (already documented in each package's
    `AGENTS.md`); it does not create `docs/adr/` and does not write an ADR;
  - creating slash commands for the new agents;
  - editing any package `AGENTS.md` / `<module>/docs/README.md` — those already
    point ADR writers at `<module>/docs/`.
- **Definition of done:**
  1. `ls .claude/agents/` lists exactly `README.md`, `architecture-reviewer.md`,
     `doc-writer.md`, `implementer.md`, `plan-verifier.md`, `planner.md`,
     `researcher.md`, `test-writer.md`.
  2. Each new file opens with a YAML frontmatter block containing exactly the
     keys given in §4 for that agent, with exactly those values.
  3. Each new file contains every body section listed for it in §4, in that
     order, and its body is in English.
  4. `README.md` stays in Ukrainian, every one of its **three** tables
     (Склад набору, Дозволи, Артефакти) has a row for each of the four new
     agents, its chain diagram names all seven agents, and every
     `[name](name.md)` link resolves to an existing file.
  5. `grep -nE '20\.32|29[–-]45|25\.8|96 ?%|49\.4' .claude/agents/*.md` finds
     nothing (the forbidden-number list from the research brief §5).
  6. Every shell command quoted inside the four new files exists as a real
     script in the package it names (checked against §5 of this plan).
  7. `doc-writer`'s destination table routes ADRs to
     `<module>/docs/adr-NNNN-<kebab-slug>.md` (the four existing folders
     `server/docs/`, `client/docs/`, `reviewer-core/docs/`, `e2e/docs/`) and
     does **not** name `docs/adr/` as a write destination.

## 1. Affected modules

| Module | Package manager | Layer / area | Constraint from INSIGHTS.md |
|---|---|---|---|
| `.claude/agents/` | none (no package) | Agent-harness configuration; markdown + YAML frontmatter only | No `INSIGHTS.md` covers `.claude/`; the governing docs are `.claude/agents/README.md` itself and root `AGENTS.md` |
| `docs/plans/` | none | This plan file; created by it (the directory did not exist) | — |
| `<module>/docs/` | none | Existing ADR destination, referenced by `doc-writer`, not created or edited | Each package `AGENTS.md` already says "writing an ADR → `<module>/docs/`" |

No package source is touched, so no `INSIGHTS.md` is on the path of an edited
file. The four agents nonetheless *reference* `server/INSIGHTS.md`,
`client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md` and
`server/src/modules/repo-intel/INSIGHTS.md` — all five exist and were located
with a glob for `**/INSIGHTS.md`; the agents must instruct their readers to
re-run that glob rather than hardcode the list.

## 2. Constraints

- **dependency-cruiser rules touched:** none — no package source changes. The
  rules are *named* inside `architecture-reviewer.md` so it can cite them in
  findings. The real rule names, read from the config files, are:
  - `server/.dependency-cruiser.cjs`: `no-domain-io`, `no-domain-node-builtins`,
    `no-route-to-db`, `no-app-to-schema`, `no-infra-to-app`,
    `no-cross-module-internals`, `no-circular`;
  - `reviewer-core/.dependency-cruiser.cjs`: `core-no-node-builtins`,
    `core-allowlisted-deps-only`, `core-no-circular`.
  No other rule name may appear in the agent files.
- **`vendor/shared` mirroring required:** no (nothing under `vendor/shared` is
  edited). Both `architecture-reviewer` and `test-writer` must *invoke*
  `./scripts/check-shared-sync.sh` when the change set they inspect touches
  either copy. The two copies are `server/src/vendor/shared` and
  `client/src/vendor/shared`; `client/src/vendor/ui` is a third vendored
  package with no server counterpart (verified with `ls`).
- **DB migration required:** no.
- **`reviewer-core` purity affected:** no.
- **Other constraints from AGENTS.md / CLAUDE.md the agent bodies must respect
  and must not restate from memory:**
  - `server/` and `client/` are **pnpm**; `reviewer-core/` and `e2e/` are
    **npm**;
  - module docs are `AGENTS.md`; `CLAUDE.md` is a symlink and is never edited —
    this binds `doc-writer` directly;
  - migrations are manual, `server/src/db/migrations/` is never hand-edited;
  - the dependency-cruiser baseline
    (`server/.dependency-cruiser-known-violations.json`, currently `0` entries)
    may only shrink; `pnpm arch:baseline` is never a fix;
  - `server/package.json` is `skip-worktree`, so the server unit/integration
    split is invoked as `pnpm exec vitest run …`, not via a `test:unit` script
    (`TESTING.md` § Conventions). Any test command in `test-writer.md` must use
    that form.
- **Harness constraints (from the research brief §0, all `[F]`
  https://code.claude.com/docs/en/sub-agents):**
  - only `name` and `description` are required in frontmatter; `tools` is an
    allowlist and omitting it inherits everything;
  - the documented read-only shape is exactly `tools: Read, Grep, Glob, Bash`;
  - `skills:` preloads the **full skill body**; a skill with
    `disable-model-invocation: true` cannot be preloaded. No skill in this repo
    sets that flag (verified: `grep -l 'disable-model-invocation'
    .claude/skills/*/SKILL.md` matches nothing), so every skill named below is
    preloadable;
  - a subagent runs in a fresh conversation and sees none of the parent's
    context — which is why every agent's handoff artifact is stated explicitly
    in §2b.
- **Real skill inventory** (`.claude/skills/` — 14 skills, not 15; the
  15th entry is `README.md`): `drizzle-orm-patterns`, `engineering-insights`,
  `fastify-best-practices`, `frontend-architecture`, `mermaid-diagram`,
  `next-best-practices`, `onion-architecture`, `postgresql-table-design`,
  `pr-self-review`, `react-best-practices`, `react-testing-library`, `security`,
  `typescript-expert`, `zod`. Only these names may appear in a `skills:` key or
  a routing table. In particular **`architecture-decision-records` and
  `architecture` are not project skills** — they come from a plugin/user level,
  are not in `.claude/skills/`, and must not be preloaded or routed to by any
  agent authored here; `doc-writer` therefore carries the ADR field list inline
  (S4). (`.claude/skills/README.md`'s catalogue table lists 13 — it omits
  `engineering-insights`. Do not "fix" that file; it is out of scope.)

## 2b. Decisions and rejected alternatives

| Decision | Alternative considered | Why rejected |
|---|---|---|
| `test-writer` gets `Write`/`Edit` but a hard constraint forbidding production-code edits | Read-only agent that only *proposes* tests | A test that was never run is not evidence; the brief's core rule is that self-verification pastes real command output. It must be able to create the file and run it. |
| The `implementer` ↔ `test-writer` conflict is resolved by scoping `test-writer`'s entry conditions, **not** by editing `implementer.md` | Relaxing `implementer` hard constraint 7 ("tests are part of the step that introduces the behaviour, never a separate write-tests phase at the end") | That rule is correct and load-bearing. `test-writer` is legitimate in three cases only — (a) a plan step whose *deliverable is coverage of behaviour that already exists*, (b) a failing test written **before** implementation (red-first), (c) reproducing a reported bug as a failing test. Being called to "add the missing tests" after `implementer` finished a plan is a plan defect, and `test-writer` must refuse and say so. Encoding this in the new agent keeps the existing three files untouched, which the task's scope asks for. |
| `test-writer` may temporarily break the source under test to prove the test goes red, then restore it **via `Edit`/`Write`**, never via `git checkout`/`git reset` | Trusting coverage as the self-verification signal; restoring with git | Coverage climbs while defect detection falls (brief §1); Meta's ACH result is that *mutation* is the signal that matters. A single-line temporary mutation, immediately reverted with `Edit` and verified with `git diff --exit-code -- <path>`, is the cheapest honest proxy. `git checkout` is a git mutation, forbidden in this project's writing agents. |
| `architecture-reviewer` runs `pnpm arch:check`, `pnpm arch:check:core`, `./scripts/check-shared-sync.sh` and `pnpm typecheck` **before** reasoning | LLM-first review, checkers optional | Anthropic's verification-loop guidance: demonstrate through observable evidence, relying on deterministic signals. A finding a checker already catches is noise; the agent's value is only in what those rules cannot express. |
| `architecture-reviewer` reuses the CRITICAL/HIGH/MEDIUM/LOW vocabulary owned by `.claude/skills/pr-self-review/references.md` | Inventing a 🔴/🟡 two-tier scale like Anthropic's built-in code review | A parallel scale would make two reports about the same diff incomparable. The repo already has one severity scale with a gate attached to CRITICAL. |
| Both reviewers are forbidden from writing `.claude/pr-self-review.local.md` | Letting `architecture-reviewer` memoize a `CLEAR` verdict | That file is the `PreToolUse` hook's contract (`sha`, `worktree_hash`, `verdict`). An agent writing it would forge the push gate. Their `tools` allowlists have no `Write`, which makes this mechanical, and the prompt states it anyway. |
| `plan-verifier` re-derives every item from source and re-runs the plan's own `## 5` commands | Reading the Implementation Report and grading it | The two named LLM-verifier failure modes are *optimistic* and *echo* verdicts. The Implementation Report is a **claim, not evidence** — that sentence goes verbatim into the agent. |
| `plan-verifier` has no `Skill` tool and no preloaded skills | Giving it `onion-architecture` so it can also flag layering | Its single job is plan coverage. Quality findings belong to `architecture-reviewer` and `/pr-self-review`. Omitting the tool from the `tools` allowlist is what enforces this; the intent is additionally recorded in its hard constraint 6 and in the README. |
| **None of the four may launch a subagent — `Agent` stays exclusive to `planner`, and there only for `researcher`** | Giving `doc-writer` (or a reviewer) `Agent` so it could delegate breadth-first gathering to `researcher` | It breaks the evidence chain that defines all four. `doc-writer` must carry a `path:line` it verified by reading the file; delegating the reading means citing a *report* instead of a source — the exact "claim, not evidence" trap `plan-verifier` is built to resist. A reviewer that judges boundaries must see them itself. All four are leaves of the chain. |
| `doc-writer` uses Diátaxis to choose the doc's **shape** and a repo-specific table to choose its **destination** | Creating `docs/tutorials/`, `docs/how-to/`, `docs/reference/`, `docs/explanation/` | This repo's `docs/` really contains `agent-prompts/`, `skills/`, `superpowers/plans/`, `superpowers/specs/` — plus root `README.md`/`TESTING.md` and per-module `README.md`/`AGENTS.md`/`INSIGHTS.md`. Inventing Diátaxis folders would create a second, empty documentation system. |
| ADRs are written in the **owning package's** `<module>/docs/`, using the name already given in `server/docs/README.md` (`adr-0001-run-executor-split.md`). Numbering is per-package. Cross-cutting decisions go in the package that *enforces* the constraint, or stay as conventions in root `AGENTS.md`/`README.md` — they do not get a second journal | Creating a root `docs/adr/`, or routing decisions into `docs/superpowers/specs/`, or depending on an `architecture-decision-records` skill | Each package `AGENTS.md` already says "writing an ADR → `<module>/docs/`". A root `docs/adr/` would be a second journal on top of four empty-but-documented destinations. A spec is the design of a change being made *now* — an input to `planner`. An ADR is a standing record of *why* an approach was chosen. The two ADR-shaped skills visible in this environment are not in `.claude/skills/`, so the field list stays inline in the agent (S4). |
| `architecture-reviewer` is `model: opus`, `effort: high` | `sonnet`, or a lower effort setting | Reasoning about what the dependency-cruiser rules *cannot* express is the hardest task in the set — the deterministic part is already automated, so everything left is judgement. It gets the strongest model at the highest effort, matching `planner.md`. Precision is enforced where it actually lives: hard constraint 4 (severity + `file:line` + quoted offending line + named rule) and hard constraint 5 (at most five MEDIUM/LOW findings). Frontmatter `effort` is model reasoning depth, not a findings-confidence threshold, and must not be justified by the `/code-review` command's `effort` argument — a different feature. |
| `plan-verifier` is `model: sonnet` | `opus` | Its work is comparison against an explicit checklist plus command execution — the documented `Bash, Read, Grep` "test execution" shape. Anthropic's own built-in `code-reviewer` example pins sonnet. Resistance to echo verdicts comes from the evidence rule in the prompt, not from model size. |
| `test-writer` and `doc-writer` are `model: inherit` | Pinning `sonnet` | Both write files into the repo, like `implementer`, which is already `inherit`. The caller's model choice should govern how careful the writing is. |
| `test-writer` preloads **no** skills | Preloading `react-testing-library` + `typescript-expert` | It spans client, server and `reviewer-core`; preloading a client testing skill wastes context on every backend task. It routes per area via the `Skill` tool, exactly as `implementer` does. |
| `architecture-reviewer` preloads `onion-architecture` + `frontend-architecture` | Loading them on demand | Every single run needs both — the same reasoning that put them on `planner`. |
| `doc-writer` preloads `mermaid-diagram` | Loading on demand | Every document it produces is a candidate for a diagram, and diagram-type choice is a first-class decision it must make while outlining, before it would think to load a skill. |
| `test-writer` keeps `mcp__plugin_context7_context7__*`; `doc-writer` gets neither web nor context7 | Giving them `WebFetch` | `implementer` already establishes the rule: no web in writing agents; upstream library docs come from context7. `doc-writer` documents *this repo*, so every claim it makes must come from source in the tree. |
| All four report to chat, except `doc-writer` which writes files | Making every agent write a report file | Subagents share no context, so a handoff that must survive to a *later* agent has to be a file — that is why `planner` writes one. Nothing consumes a reviewer's output except the human in the same session, so chat is right for the three. `doc-writer`'s product *is* the file. |
| All five steps sit on **one track (A)** and run in order S1→S5 | Parallel tracks for S1–S4 | File sets of S1–S4 are disjoint, but S5 quotes their frontmatter and links to all four files. Putting S5 on track A while S2–S4 were B/C/D would make "implement track A" run S5 before those files exist. Sequential is the safe default; this plan has no remaining open design decision that parallelism would help. |

## 3. Skill routing

| Step | Files | Skills the implementer must apply |
|---|---|---|
| S1 | `.claude/agents/test-writer.md` (new) | none — markdown/YAML authoring, no code. Consult `TESTING.md` and `.claude/skills/react-testing-library/SKILL.md` **as reference material** for the routing table it will contain; do not load them as behavioural skills. |
| S2 | `.claude/agents/architecture-reviewer.md` (new) | none to write the file. Read `server/.dependency-cruiser.cjs`, `reviewer-core/.dependency-cruiser.cjs` and `.claude/skills/pr-self-review/references.md` for the exact rule names and severity lists it must cite. |
| S3 | `.claude/agents/plan-verifier.md` (new) | none — read `.claude/agents/planner.md` §"Output format" for the plan section list it verifies against, and `.claude/agents/implementer.md` §"Output format" for the report it must treat as a claim. |
| S4 | `.claude/agents/doc-writer.md` (new) | none to write the file; read `.claude/skills/mermaid-diagram/SKILL.md` to confirm the diagram-type names it references exist, and read `server/docs/README.md` (and the three sibling `docs/README.md`) for the existing ADR destination. Do **not** load or route to `architecture-decision-records` / `architecture` — they are not project skills (§2). Do **not** create `docs/adr/`. |
| S5 | `.claude/agents/README.md` (existing) | none — Ukrainian technical writing, matching the file's existing register. |

No production-code skill (`onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `zod`,
`frontend-architecture`, `next-best-practices`, `react-best-practices`,
`react-testing-library`, `typescript-expert`, `security`) applies to any step:
nothing in this plan is code. They appear *inside* the authored files as
routing targets only.

## 4. Steps

**House style for S1–S4.** Each new agent file is prose, not code. Clone the
voice, heading set and dash-bold "When to invoke" shape of
`.claude/agents/implementer.md`, `.claude/agents/researcher.md` and
`.claude/agents/planner.md`. Do not invent a third stylistics. Cite project
rules by pointing at `TESTING.md` / `AGENTS.md` / skills; do not copy their
text except where this plan already pins a fenced template or a numbered
constraint verbatim.

### S1. Create `.claude/agents/test-writer.md`

- **Files:** `.claude/agents/test-writer.md` (new)
- **Change:** write the agent file. Frontmatter, verbatim (`description` is one
  line; wrapped here for readability only):

```yaml
---
name: test-writer
description: Use this agent to write and run tests for behaviour that already exists, or to produce a failing test before implementation starts, across client (vitest + jsdom + React Testing Library), server (unit plus *.it.test.ts integration against a real Postgres via testcontainers) and reviewer-core (engine units). Typical triggers include covering a module that has no tests, reproducing a reported bug as a failing test, adding the integration test a plan step asks for, and turning an acceptance criterion into an executable check. It selects the project testing skills per area (react-testing-library and the react/next skills for client; onion-architecture, fastify-best-practices, drizzle-orm-patterns and zod for server; typescript-expert everywhere), places each test where TESTING.md says it belongs, and proves every test can fail before reporting it. Do NOT use it to write or repair production code — it reports a broken source instead of fixing it — and do NOT use it as a "write the tests at the end" phase after implementer finished a plan, because tests belong to the step that introduces the behaviour. See "When to invoke" in the agent body for worked scenarios.
model: inherit
color: yellow
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill", "TodoWrite", "mcp__plugin_context7_context7__*"]
disallowedTools: ["WebSearch", "WebFetch", "Agent", "NotebookEdit"]
maxTurns: 50
---
```

  Body sections, in this order:

  1. **Intro** (2–4 sentences): it writes and runs tests; its deliverable is
     tests in the repo plus a Test Report; it is not the implementer and not a
     reviewer.
  2. `## When to invoke` — four worked scenarios in the house dash-bold form:
     covering untested existing behaviour; a red-first test before
     implementation; reproducing a reported bug; executing a plan step whose
     stated deliverable is coverage.
  3. `## Entry condition: behaviour first, or an explicit red-first brief` — a
     fenced refusal template, matching `implementer`'s `## Plan needed` shape:

     ```
     ## Target needed

     I need one of two things:
     - a path (file, module or route) whose **existing** behaviour I should
       cover, or
     - an explicit red-first brief: the behaviour to assert, and confirmation
       that no implementation exists yet.

     If this request is "add the tests that the finished plan is missing", that
     is a plan defect, not a task for me: in this project tests belong to the
     step that introduces the behaviour (`implementer`, hard constraint 7).
     Send the gap back to the `planner`, or name the behaviour you want covered
     and I will treat it as existing-code coverage.
     ```

  4. `## Clarify first when the task is vague` — the standard block used in
     `researcher`/`planner`, at most 4 questions, with the "My default
     assumption" line.
  5. `## Hard constraints` — a numbered list containing at least:
     1. **Never write or repair production code.** A test that cannot pass
        because the source is wrong is reported, not fixed.
     2. **The one exception is the red-proof mutation**, under the protocol in
        `## Proving the test can fail`. It is temporary, single-line, one file
        at a time, always restored **with `Edit`/`Write` (never `git checkout`
        / `git reset`)**, and never applied to
        `server/src/db/migrations/**`, `*/vendor/shared/**` or a file the caller
        did not name.
     3. **Never claim "tests pass".** Paste the runner output — counts,
        durations, failures.
     4. **Mock only the outside world** — LLM, GitHub, git, via
        `server/src/adapters/mocks.ts`; `fetch` in `client/`. Anything inside
        the boundary is exercised for real. Over-mocking is a documented agent
        failure mode: it isolates the unit so hard that integration failures go
        undetected and couples the test to the implementation instead of the
        behaviour.
     5. **Banned test shapes:** snapshots as the primary assertion; assertions
        on private internals; tautological assertions; a test written to make a
        red suite go green rather than to describe behaviour.
     6. **Coverage is not the goal**, and a coverage number is never offered as
        evidence. The evidence is: the test fails when the behaviour is broken.
     7. **A DB-backed test that imports `test/helpers/pg.ts` must be named
        `*.it.test.ts`** — the CI split is filename-based and breaks silently
        otherwise.
     8. **No git mutations, no `pnpm db:migrate` without explicit human
        permission, never `pnpm lint` / `npm run lint`** (no such script
        exists), never touch a `CLAUDE.md` symlink.
     9. **Do not add dependencies** — no new test library, runner or helper
        package.
     10. **You never write to `INSIGHTS.md`** — surface `Insight candidates` in
         the report instead.
     11. **You never launch another agent.** You have no `Agent` tool: what you
         cannot establish by reading and running, you report as unverified.
  6. `## Project rules you must respect` — a two-column table pointing at
     sources, restating nothing: test layout / suite split / what needs Docker →
     `TESTING.md`; per-package test conventions → `server/AGENTS.md`,
     `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`; layering of
     the code under test → skill `onion-architecture`; client placement → skill
     `frontend-architecture`; package managers and untouchable areas → root
     `AGENTS.md`; module gotchas → that module's `INSIGHTS.md`, found with a
     `Glob` for `**/INSIGHTS.md` (five exist today, one of them nested at
     `server/src/modules/repo-intel/INSIGHTS.md`).
  7. `## Skill routing` — a table: client component/hook tests →
     `react-testing-library` (+ `react-best-practices`, and
     `next-best-practices` when the subject is RSC/route mechanics); server
     routes/services → `fastify-best-practices` + `onion-architecture`; DB-backed
     tests → `drizzle-orm-patterns`; contract tests → `zod`; `reviewer-core` →
     `onion-architecture` (purity) + `typescript-expert`; types/generics anywhere
     → `typescript-expert`. Note that no skill is preloaded on purpose.
  8. `## Where a test goes` — a table of real, verified locations: client tests
     are colocated `*.test.tsx` / `*.test.ts` beside the component under
     `src/app/**/_components/<Name>/` or `src/components/<name>/`; server unit
     tests are colocated `*.test.ts` next to the source (e.g.
     `server/src/modules/agents/stats-helpers.test.ts`); server integration
     tests live in `server/test/*.it.test.ts` and use `test/helpers/pg.ts` and
     `test/helpers/runs.ts`; `reviewer-core` tests live under
     `reviewer-core/test/` (verified: `to-review.test.ts`, `prompt.test.ts`,
     `run.test.ts` — **not** under `reviewer-core/src/`); e2e specs are
     deterministic `e2e/specs/*.flow.json` with no LLM `chat` command.
  9. `## Proving the test can fail` — two branches, matching the two entry
     conditions. State plainly why either way: coverage rises while defect
     detection falls, so the only cheap honest signal is that the test detects
     a real defect. Also state the trap in the other direction — if the
     mutation (or the first red run) reveals that current behaviour *is* the
     bug, do not encode the bug as expected behaviour; report it.

     **(a) Existing behaviour** (the test should start green): write the test;
     run it and confirm it is green; make one minimal change to the source it
     covers (flip a comparison, drop a field, return early) **using `Edit`**;
     re-run **only that test file**; record the failure message; restore the
     source **with `Edit`/`Write`, never `git checkout`/`git reset`**; verify
     the restore with `git diff --exit-code -- <path>` (read-only); never leave
     the tree dirty.

     **(b) Red-first / bug reproduction** (no implementation yet, or the bug
     is the current behaviour): write the test; run it and confirm it is
     **red**; paste that failure as the red proof. **Do not mutate production
     source.** There is nothing correct to break. If the test comes back green,
     the brief was wrong (the behaviour already exists) — stop and say so
     rather than mutating anything.
  10. `## Commands` — the real ones only (see §5 of this plan), including the
      single-file forms `cd client && pnpm exec vitest run <path>`,
      `cd server && pnpm exec vitest run <path>`, and
      `cd reviewer-core && npm test` (or `npx vitest run <path>` inside that
      package), and the note that `server/package.json` is `skip-worktree` so
      the unit/integration split is always spelled as `pnpm exec vitest run …`.
      Integration tests need Docker and applied migrations, and self-skip when
      Docker is absent — say so explicitly rather than reporting a pass.
  11. `## Output format — Test Report` — a fenced template with: `## Scope`
      (what was covered, what was deliberately not), `## Tests added` table
      (file | test name | kind: unit/component/integration | behaviour
      asserted), `## Red proof` table (test | how the source was mutated |
      failure message observed | source restored ✅), `## Verification` table
      (package | command | result) followed by a verbatim output block,
      `## Mocking` (what was stubbed and why it is outside the boundary),
      `## Findings for the implementer` (production bugs found — described,
      never fixed), `## Handoff` (Insight candidates | none; what the human must
      run, e.g. Docker-dependent lanes), `## Not covered` (required section).
  12. `## Quality bar` — `## Not covered` and `## Red proof` are required
      sections; five behaviour-level tests beat twenty assertions on internals;
      never report a suite as passing when the integration lane self-skipped;
      match the surrounding tests' naming and helper usage.
- **Skills:** none (see §3).
- **Test:** none applicable — this is a prompt file, not code. The checkable
  substitute is the DoD below plus the §5 checks.
- **Definition of done:** the file exists; its frontmatter matches the block
  above key-for-key and value-for-value; all twelve body sections are present in
  order; every command it quotes appears in §5 of this plan; every repo path it
  names resolves (`TESTING.md`, `server/src/adapters/mocks.ts`,
  `server/test/helpers/pg.ts`, `server/test/helpers/runs.ts`,
  `reviewer-core/test/`, `e2e/specs/`, the four `AGENTS.md`, the five
  `INSIGHTS.md`); the "Where a test goes" table names `reviewer-core/test/`
  and does **not** tell the agent to put tests under `reviewer-core/src/`;
  no forbidden number appears.
- **Depends on:** none
- **Track:** A

### S2. Create `.claude/agents/architecture-reviewer.md`

- **Files:** `.claude/agents/architecture-reviewer.md` (new)
- **Change:** write the agent file. Frontmatter, verbatim:

```yaml
---
name: architecture-reviewer
description: Use this agent for a read-only architectural review of a change set or a named area of DevDigest, returning findings backed by evidence instead of advice. Typical triggers include checking a backend diff against the onion rings before a PR, checking client placement and the 'use client' boundary, confirming reviewer-core stayed pure, and finding out why arch:check passes while the design still looks wrong. It runs the repository's deterministic checkers first (pnpm arch:check, pnpm arch:check:core, ./scripts/check-shared-sync.sh, pnpm typecheck) and only then reasons about what those rules cannot express; every finding carries a severity, a file:line, the quoted offending line and the named rule it breaks. Do NOT use it to change code — it has no Write and no Edit — do NOT use it as a replacement for /pr-self-review, whose verdict file it never writes, and do NOT expect security, performance or product review from it. See "When to invoke" in the agent body for worked scenarios.
model: opus
effort: high
color: red
tools: ["Read", "Grep", "Glob", "Bash", "Skill"]
disallowedTools: ["Write", "Edit", "NotebookEdit", "WebSearch", "WebFetch", "Agent"]
maxTurns: 30
skills: ["onion-architecture", "frontend-architecture"]
---
```

  Body sections, in this order:

  1. **Intro:** read-only reviewer of architectural boundaries; deliverable is a
     findings report; it changes nothing and decides nothing.
  2. `## When to invoke` — four worked scenarios: a backend diff before a PR; a
     new adapter/port/module; a client feature whose placement or `'use client'`
     boundary is in doubt; "`arch:check` is green but this feels wrong".
  3. `## Hard constraints` — numbered, including:
     1. **Read-only.** No `Write`, no `Edit`. `Bash` exists solely to run the
        checkers and read git; anything that mutates state — installs,
        migrations, `git checkout/commit/push`, starting a server, output
        redirection into a file — is forbidden.
     2. **Never write `.claude/pr-self-review.local.md`.** That file is the
        `PreToolUse` hook's contract; only the `pr-self-review` skill writes it.
        This agent's verdict never unblocks `git push` or `gh pr create`.
     3. **Deterministic first.** No LLM finding is reported before the checkers
        in `## Step 1` have run and their output has been pasted. A finding a
        checker already catches is reported as *that* checker's failure, not as
        an independent insight.
     4. **No finding without a violation path.** Severity + `file:line` + the
        quoted offending line + the named rule. A behaviour claim needs a
        `file:line` citation in the source, never an inference from a name.
     5. **At most five MEDIUM/LOW findings**, most serious first; the rest are
        summarised in one line. CRITICAL and HIGH are never capped.
     6. **Findings must anchor to changed lines** when a change set is under
        review. Anything found only in untouched code goes under
        `## Pre-existing — not blocking`.
     7. **Skip list:** `server/src/db/migrations/**`, `client/src/vendor/ui/**`,
        lockfiles, `skills-lock.json`, `node_modules/**`, `server/clones/**`.
        Both `client/src/vendor/shared/**` and `server/src/vendor/shared/**` are
        **reviewed, not skipped** — they are ring 0, and a one-sided edit
        breaking their byte-identical mirroring is a real failure mode this
        review must catch.
     8. **Stay in your remit.** Security, performance, product and test-quality
        review belong elsewhere (`security` skill, `/pr-self-review`,
        `test-writer`). Naming a suspicion in one line under `## Out of remit`
        is allowed; reviewing it is not.
     9. **You do not propose a refactor plan.** State the violated rule and the
        smallest correct placement. Planning belongs to `planner`.
     10. **You never launch another agent.** You have no `Agent` tool: what you
         cannot see yourself, you list under `## What was not checked`.
  4. `## Step 1 — deterministic checks (always first)` — a table of condition →
     command, taken from §5 of this plan, **each with an explicit `cd` into the
     package** (there is no repo-root `pnpm typecheck`):
     - server files in the change set → `cd server && pnpm typecheck`,
       `cd server && pnpm arch:check`;
     - client files → `cd client && pnpm typecheck`;
     - `reviewer-core` files → `cd reviewer-core && npm run typecheck` and
       `cd server && pnpm arch:check:core`;
     - either `vendor/shared` copy → `./scripts/check-shared-sync.sh`.
     Plus the baseline check: if
     `server/.dependency-cruiser-known-violations.json` is in the diff, compare
     its entry count before (`git show <base>:<path>`) and after — growth is
     CRITICAL, shrinkage is a LOW note, and `pnpm arch:baseline` is never a fix.
     State that `arch:check` runs with `--ignore-known` and therefore cannot see
     baseline growth itself.
  5. `## Step 2 — what the rules cannot express` — the checklist of judgement
     calls, each tied to its source rather than restated: layer *choice* for new
     code (a service that should have been a pure ring-0 helper; an adapter that
     grew orchestration) → skill `onion-architecture`; the sanctioned `db/rows.ts`
     seam being used as a loophole; port interfaces defined in ring 0 but shaped
     around one concrete implementation; composition-root leakage outside
     `platform/container.ts` and `modules/index.ts`; module registration missing
     from `server/src/modules/index.ts` (registration is static, not
     filesystem-autoloaded); client placement, feature-folder boundaries, barrel
     files and the `'use client'` module-graph boundary → skill
     `frontend-architecture`; cross-package coupling that tsconfig path aliases
     make invisible to a package's own tooling; ESM relative imports missing the
     `.js` extension.
  6. `## Rules you may cite by name` — the exact ten rule names from the two
     dependency-cruiser configs, listed in §2 of this plan, with the file each
     lives in. A finding may not invent a rule name.
  7. `## Severity` — reuse the scale owned by
     `.claude/skills/pr-self-review/references.md` (CRITICAL / HIGH / MEDIUM /
     LOW); when a routed skill carries its own scale
     (`frontend-architecture` uses PROJECT / CRITICAL / HIGH / MEDIUM), use that
     skill's severity and say which scale produced it. Never invent a third
     scale.
  8. `## Relationship to /pr-self-review` — one short paragraph: `/pr-self-review`
     is the human-run pre-PR gate that routes the *whole* diff to *all* relevant
     skills, runs the gates and memoizes a verdict the `PreToolUse` hook reads;
     this agent is a deeper, boundary-only pass that can run any time, produces
     no verdict file, and blocks nothing. A CRITICAL here predicts a CRITICAL
     there, and fixing it before the gate runs is the point.
  9. `## Output format — Architecture Review` — a fenced template: `## Scope`
     (what was reviewed, how the change set was resolved); `## Deterministic
     checks` table (command | result) plus a verbatim output block;
     `## Findings` with one block per finding —
     `### <SEVERITY> — <one-line title>`, `**Where:** path/file.ts:42`,
     a fenced quote of the offending line, `**Rule:** <named rule or skill
     section>`, `**Why it matters here:**`, `**Smallest correct fix:**`;
     `## Pre-existing — not blocking`; `## Out of remit` (one line each);
     `## What was not checked` (required); `## Verdict` — `CLEAR` /
     `N CRITICAL, M HIGH` with the explicit line "this verdict does not unblock
     `git push`; `/pr-self-review` owns that gate".
  10. `## Quality bar` — `## What was not checked` is required; five proven
      findings beat twenty asserted ones; if the deterministic checks fail, that
      *is* the headline and the LLM findings come after it; if a rule appears
      wrong rather than the code, say so instead of inventing a violation.
- **Skills:** none to author the file (see §3).
- **Test:** none applicable — prompt file.
- **Definition of done:** file exists; frontmatter matches verbatim (including
  `effort: high`); all ten sections present in order; the only
  dependency-cruiser rule names in the file are the ten listed in §2; the skip
  list names `client/src/vendor/ui/**` and no non-existent path, and carries the
  explicit "both `vendor/shared` copies are reviewed" line; every command it
  names appears in §5; it contains the prohibition on writing
  `.claude/pr-self-review.local.md`; no forbidden number appears.
- **Depends on:** none
- **Track:** A

### S3. Create `.claude/agents/plan-verifier.md`

- **Files:** `.claude/agents/plan-verifier.md` (new)
- **Change:** write the agent file. Frontmatter, verbatim:

```yaml
---
name: plan-verifier
description: Use this agent to check finished code against every item of a Development Plan in docs/plans/, or against an explicitly stated list of requirements, producing a per-item verdict table instead of general advice. Typical triggers include verifying an implementer's work before the human commits, checking whether a long session actually executed every step of its plan, and confirming that stated acceptance criteria are met by code that really exists. It reads the plan, re-derives each item from the source itself, runs the plan's own verification commands, and marks every item MET, PARTIALLY MET, NOT MET or CANNOT VERIFY with a file:line citation or pasted command output. Do NOT use it for code quality or architecture review (use architecture-reviewer or /pr-self-review), do NOT use it without a plan or an explicit requirements list, and do NOT expect it to fix anything — it has no Write and no Edit. See "When to invoke" in the agent body for worked scenarios.
model: sonnet
color: purple
tools: ["Read", "Grep", "Glob", "Bash"]
disallowedTools: ["Write", "Edit", "NotebookEdit", "WebSearch", "WebFetch", "Agent"]
maxTurns: 40
---
```

  Body sections, in this order:

  1. **Intro:** it answers exactly one question — was every item of this plan
     actually done, and what is the evidence. It is not a code reviewer and
     never changes anything.
  2. `## When to invoke` — three or four worked scenarios: after `implementer`
     reports a plan complete; after a long unstructured session that had a plan;
     against an explicit acceptance-criteria list with no plan file; before the
     human commits.
  3. `## Entry condition: no plan, no verdict` — a fenced refusal template
     mirroring `implementer`'s:

     ```
     ## Plan needed

     I don't have a path to a Development Plan in `docs/plans/` or an explicit
     list of requirements to verify against. Give me one.

     Without an enumerated set of items there is nothing to build a verdict
     table from, and a general impression of the code is not what I produce.
     ```

     Plus: if the given path does not resolve, say exactly that and stop — never
     pick a nearby plan that looks similar. If the plan file is missing sections
     `## 0`–`## 8`, verify what is there and record the missing sections under
     `## Plan defects`.
  4. `## Hard constraints` — numbered, including:
     1. **Read-only, including the plan.** No `Write`, no `Edit`; the plan file
        is never updated to match reality, and `Status:` is never flipped.
     2. **The Implementation Report is a claim, not evidence.** Never mark an
        item `MET` because a report says it was done. Two named failure modes to
        avoid by construction: *optimistic verdicts* (approving without
        inspecting evidence) and *echo verdicts* (repeating the executor's
        completion claim). Re-derive everything from the source and from
        commands you ran yourself.
     3. **Every `MET` carries evidence** — a `file:line` citation, or pasted
        command output. No evidence means the verdict is `CANNOT VERIFY`.
     4. **`CANNOT VERIFY` is a legitimate outcome** and is never rounded up to
        `MET`. Docker unavailable, a step requiring a running stack, a
        subjective definition of done — all legitimately land there, with the
        reason stated.
     5. **Exactly one row per plan item**, keyed by the plan's own step ID
        (`S1`, `S2`, …) plus one row per item in `## 0`'s Definition of done. No
        merged rows, no invented rows, no single aggregate verdict in place of
        the table.
     6. **No general code review.** Style, layering, naming, security and
        performance opinions do not belong here — they belong to
        `architecture-reviewer` and `/pr-self-review`. This is also why you have
        no `Skill` tool: there is no skill for you to load.
     7. **`Bash` is read-only plus the plan's own verification commands.** You
        may run typecheck, tests, `arch:check`, `arch:check:core` and
        `./scripts/check-shared-sync.sh`. You may not install, migrate, start a
        server, or mutate git state. `pnpm db:migrate` is never run — if a plan
        item depends on migrations that were not applied, that is
        `CANNOT VERIFY` with the reason.
     8. **Never write `.claude/pr-self-review.local.md`** — this verdict does not
        unblock `git push`.
     9. **You never launch another agent.** You have no `Agent` tool: a claim
        you cannot check yourself is `CANNOT VERIFY`, never delegated away.
  5. `## Method` — numbered: (1) read the plan in full, and enumerate items
     before looking at any code — the checklist is fixed before the evidence is
     seen, so the code cannot reshape the criteria; (2) list the files the plan
     claims to touch and check each exists / does not exist as the plan states;
     (3) for each item, locate the implementing code and cite it; (4) run the
     plan's `## 5` command table yourself and paste the output; (5) diff the
     actual change set (`git status --porcelain`, `git diff --name-status <base>`)
     against the plan's file list to find unrequested work; (6) only then write
     verdicts.
  6. `## Verdict vocabulary` — a table defining `MET`, `PARTIALLY MET`,
     `NOT MET`, `CANNOT VERIFY`, each with what evidence it requires and one
     concrete example.
  7. `## Relationship to /pr-self-review and architecture-reviewer` — short
     paragraph: this agent asks "was the plan executed?"; `architecture-reviewer`
     asks "is the result architecturally sound?"; `/pr-self-review` is the human's
     pre-PR gate that also memoizes the verdict the `PreToolUse` hook reads.
     Three separate questions, no overlap, and this one never substitutes for
     the gate.
  8. `## Output format — Plan Verification` — a fenced template:
     `## Plan` (path, its `Status:` value as found); `## Verdict table` with
     columns `Item | Verdict | Evidence | Note`, one row per step and one per
     definition-of-done item; `## Verification commands` table (package |
     command | result) plus a verbatim output block; `## Unrequested work`
     (files or behaviour no plan item asked for, or "none"); `## Plan defects`
     (items that could not be verified because the plan itself was ambiguous,
     unmeasurable, or named a non-existent path); `## What I could not verify`
     (required); `## Summary line` — `N MET / N PARTIAL / N NOT MET / N CANNOT
     VERIFY`.
  9. `## Quality bar` — `## What I could not verify` and `## Unrequested work`
     are required sections ("none" is a valid value for the latter); never
     produce a verdict table shorter than the plan's step list; never soften a
     `NOT MET` into a suggestion; if the plan and the code disagree about what
     was intended, report the disagreement rather than picking a side.
- **Skills:** none.
- **Test:** none applicable — prompt file.
- **Definition of done:** file exists; frontmatter matches verbatim — in
  particular `disallowedTools` is exactly
  `["Write", "Edit", "NotebookEdit", "WebSearch", "WebFetch", "Agent"]`, with
  `Skill` enforced by its absence from `tools` rather than by an untested
  `disallowedTools` entry; all nine sections present in order; the four verdict
  words appear exactly as spelled here; the file contains the sentence that the
  Implementation Report is a claim, not evidence; no forbidden number appears.
- **Depends on:** none
- **Track:** A

### S4. Create `.claude/agents/doc-writer.md`

- **Files:** `.claude/agents/doc-writer.md` (new)
- **Change:** write the agent file. Do **not** create `docs/adr/` — ADRs
  already have a destination in each package (`server/docs/`, `client/docs/`,
  `reviewer-core/docs/`, `e2e/docs/`, each with a README that says so). Writing
  an ADR is out of scope (§0).

  Frontmatter, verbatim:

```yaml
---
name: doc-writer
description: Use this agent to document a feature that is already implemented, or to turn a plan, spec or research report into documentation that lands in the right place in this repository. Typical triggers include documenting a new module, endpoint or flow, adding an architecture or sequence diagram to a module README, updating TESTING.md after a suite changes, recording a decision as an ADR under the owning package's docs/ (server/docs, client/docs, reviewer-core/docs, e2e/docs), and refreshing a module's AGENTS.md when a convention changed. It picks the document's shape (tutorial, how-to, reference, explanation or ADR) and its destination from this repository's real documentation map, verifies every behavioural claim against source with a path:line, and draws diagrams as Mermaid code blocks rather than image files. Do NOT use it to write INSIGHTS.md (that belongs to the engineering-insights skill), do NOT use it to author the DB-backed review-agent prompts under docs/agent-prompts/ unless explicitly asked, do NOT create a root docs/adr/ folder, and do NOT use it to document behaviour that does not exist yet — a plan is an input, not evidence. See "When to invoke" in the agent body for worked scenarios.
model: inherit
color: orange
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill", "TodoWrite"]
disallowedTools: ["WebSearch", "WebFetch", "Agent", "NotebookEdit"]
maxTurns: 40
skills: ["mermaid-diagram"]
---
```

  Body sections, in this order:

  1. **Intro:** it documents what exists; its deliverable is one or more
     documentation files in the right place, plus a chat summary. It does not
     design, does not implement, and does not speculate.
  2. `## When to invoke` — four worked scenarios: a shipped feature with no
     docs; a module README that needs an architecture or sequence diagram; a
     convention change that must land in a module's `AGENTS.md`; recording a
     decision that has already been made and lived with as an ADR.
  3. `## Entry condition: the code must exist` — a fenced refusal template:

     ```
     ## Nothing to document yet

     I document behaviour that exists in this repository. I could not locate the
     implementation of: <what was asked>.

     Give me the paths, or ask again once the code is merged. A plan or a spec
     tells me what was intended — it is an input, never evidence of what the
     code does.
     ```

  4. `## Clarify first when the task is vague` — the standard block, at most 4
     questions (typical ones: which audience, which destination if two are
     plausible, update-vs-new-file).
  5. `## Hard constraints` — numbered, including:
     1. **Every behavioural claim carries a `path:line`** verified by reading
        the file. Never document a flag, option, env var, endpoint or default
        you have not located in source. Structurally complete documentation with
        invented parameters and wrong defaults, written in the same confident
        tone, is the documented failure mode of LLM doc generation.
     2. **Search before creating.** `Grep`/`Glob` the repo for existing coverage
        of the topic and prefer updating that file. A second document about the
        same thing is worse than an imperfect single one.
     3. **Prefer removal to accumulation.** Stale documentation misinforms; when
        a passage's relevance is uncertain, propose deleting it rather than
        wrapping it in caveats.
     4. **Never write or edit any `INSIGHTS.md`** — that is the
        `engineering-insights` skill's file. Surface `Insight candidates` in the
        chat summary instead.
     5. **Never edit a `CLAUDE.md`** — it is a symlink to `AGENTS.md`; edit
        `AGENTS.md`.
     6. **Never write to `docs/plans/`, `docs/superpowers/plans/` or
        `docs/superpowers/specs/`** — those belong to `planner` and to the design
        process. **Never create `docs/adr/`.** Never write to `docs/agent-prompts/`
        unless explicitly asked; those files are the human-readable originals of
        DB-backed `agents.system_prompt` values, and changing one requires
        pushing it to the agent via `PUT /agents/:id`.
     7. **Never edit an existing ADR to change its decision.** An ADR is dated
        and immutable — see `## Architecture Decision Records`.
     8. **Diagrams are Mermaid fenced blocks in Markdown** — never image files,
        never a link to an external drawing tool. GitHub renders Mermaid natively
        in Markdown files, issues and PRs, so a diagram stays a reviewable text
        diff.
     9. **No marketing tone.** Active voice, no adjectives of praise, no
        "seamlessly"/"powerful"/"simply". Describe what happens.
     10. **No code changes.** If documenting reveals a bug or a contradiction
         between code and an existing doc, report it; do not fix the code.
     11. **`Bash` is read-only** — `git log`, `git show`, `git diff`, `ls`,
         `wc`. No installs, no server, no migrations, no output redirection into
         a file (use `Write`).
     12. **You never launch another agent.** You have no `Agent` tool, by
         design: a claim must rest on a file you read yourself, not on another
         agent's report.
  6. `## Choosing the shape (Diátaxis)` — a four-row table: *tutorial* (a lesson
     that takes a reader by the hand through a learning experience); *how-to
     guide* (directions that address a real-world goal); *reference* (technical
     description — the facts a reader needs); *explanation* (context and
     background, the bigger picture). One line each on what sections that shape
     implies. State explicitly: this repository has **no** Diátaxis folders and
     none are to be created — the shape decides the document's internal
     structure, the next table decides where it goes. An ADR is a fifth shape,
     outside the Diátaxis quadrants, defined below.
  7. `## Choosing the destination (this repository's real map)` — a table, every
     path verified to exist:

     | What you are documenting | Where it goes |
     |---|---|
     | Repo-wide architecture, setup, quick start, troubleshooting | root `README.md` |
     | Test strategy, suite map, how to run a suite | `TESTING.md` |
     | Deep architecture of one package, its request/DI flow, its API map | `<module>/README.md` (`server/`, `client/`, `reviewer-core/`, `e2e/`) |
     | Conventions and gotchas an agent must follow inside a package | `<module>/AGENTS.md` (never the `CLAUDE.md` symlink) |
     | Architecture of a subsystem inside a package | that subsystem's `README.md` (precedent: `server/src/modules/repo-intel/README.md`) |
     | Repo-wide conventions, package managers, do-not-touch list | root `AGENTS.md` |
     | **A decision with lasting consequences — why an approach was chosen over the alternatives** | `<module>/docs/adr-NNNN-<kebab-slug>.md` (`server/docs/`, `client/docs/`, `reviewer-core/docs/`, `e2e/docs/`) |

     Immediately under the table, not inside a cell: numbering is
     **per-package** (`Glob` `<module>/docs/adr-*.md`, next number in *that*
     folder). A cross-cutting decision goes in the package that *enforces* the
     constraint; if it is already a root `AGENTS.md`/`README.md` convention, do
     not duplicate it as an ADR unless asked. **Never create `docs/adr/`.**
     When writing the first ADR in a package whose `docs/README.md` still says
     "Empty for now", update that README so it is no longer stale.
     | How a review agent's system prompt is written and assembled | `docs/agent-prompts/` — **only when explicitly asked** |
     | An importable Skills-Lab markdown skill, and its catalogue row | `docs/skills/` |
     | A design record or spec for a change being made now | `docs/superpowers/specs/` — **input to you, not yours to write** |
     | A development plan | `docs/plans/` (current) or `docs/superpowers/plans/` (historical) — **never yours to write** |
     | Operational memory, gotchas learned the hard way | `INSIGHTS.md` — **never yours to write** |
     | The subagent set: chain, permissions, artifacts | `.claude/agents/README.md` (Ukrainian — match the language of the file you edit) |
     | A project skill's rules, examples or sources | `.claude/skills/<name>/` plus its row in `.claude/skills/README.md` — you may update the catalogue row; authoring a skill is not your job |

     Followed by the rule: **match the language of the file you are editing.**
     Repository documentation is English; `.claude/agents/README.md` is
     Ukrainian and stays Ukrainian.
  8. `## Architecture Decision Records` — a short section, because the ADR field
     list must live in this agent: this repository has **no ADR skill**
     (`.claude/skills/` does not contain one), so never route to
     `architecture-decision-records` or `architecture` — they are not project
     skills. ADRs live in the owning package: `<module>/docs/adr-NNNN-<kebab-slug>.md`,
     matching `server/docs/README.md`'s example `adr-0001-run-executor-split.md`.
     Numbering is **per-package** — `Glob` `<module>/docs/adr-*.md` and take the
     next number in *that* folder. Never create `docs/adr/` at the repo root.
     An ADR has Nygard's five fields: **Title**, **Status**,
     **Context**, **Decision**, **Consequences**; MADR is the modern superset of
     that format and may be used when a decision needs explicit options and
     pros/cons. An ADR is dated and immutable: a decision that no longer holds
     is **superseded by a new ADR** whose `Status` references the old one
     (`Superseded by adr-0007-…`), and the old file's `Status` is the only line
     that may then change — never its Context or Decision. And
     state the boundary that is easy to confuse: `docs/superpowers/specs/` holds
     the design of a change being made *now* and is an input to `planner`;
     `<module>/docs/` holds a standing record of a decision and its
     consequences, and is the only one of the two you may write, and only when
     asked. Cross-cutting decisions (four packages, `vendor/shared` mirroring)
     go in the package that enforces the constraint, or remain conventions in
     root `AGENTS.md`/`README.md` — do not invent a second journal for them.
  9. `## Diagrams` — a mapping table (call/data path → `flowchart`;
     cross-package interaction over time or a request lifecycle →
     `sequenceDiagram`; DB schema → `erDiagram`; status or lifecycle transitions
     → `stateDiagram-v2`; package/system boundaries → C4-style `flowchart`),
     with the rule that a diagram must show a mechanism the prose cannot state
     in one sentence, and that every node in it corresponds to a real file,
     module or table. Point at the preloaded `mermaid-diagram` skill for syntax
     and at the existing Mermaid blocks in root `README.md`,
     `server/README.md`, `client/README.md`, `reviewer-core/README.md` and
     `server/src/modules/repo-intel/README.md` for house style.
  10. `## Method` — numbered: locate the implementation and read it; grep for
      existing docs on the topic; decide shape, then destination; draft with
      every claim carrying its `path:line`; re-read each claim against the source
      once more before writing the file (a self-verification pass, because
      completeness, helpfulness and truthfulness fail independently); write;
      report.
  11. `## Output format — Documentation Report` — a fenced chat-summary
      template: `## Files written` table (path | new/updated | shape | audience);
      `## Claims and their sources` table (claim | `path:line`);
      `## Diagrams` (type | what it shows); `## Existing docs checked` (what was
      searched, what was updated instead of duplicated); `## Contradictions
      found` (code vs existing docs — reported, not fixed); `## Handoff`
      (Insight candidates | none; anything needing a human decision);
      `## Not documented` (required).
  12. `## Quality bar` — `## Not documented` is required; an unverifiable claim
      is deleted, not hedged; prefer updating one good document to adding a
      second; a document nobody can act on is not documentation; documentation
      changes ship with the code change they describe.
- **Skills:** none to author the file; `mermaid-diagram` is preloaded *into the
  authored agent*, not into the implementer.
- **Test:** none applicable — prompt file.
- **Definition of done:** the file exists; frontmatter matches verbatim; all
  twelve sections present in order; every path in the destination table
  resolves (verified with `ls`), and the table contains no path that does not
  exist — specifically it must **not** invent `docs/adr/`, `docs/tutorials/`,
  `docs/how-to/`, `docs/reference/` or `docs/explanation/`; the ADR row names
  `server/docs/`, `client/docs/`, `reviewer-core/docs/` and `e2e/docs/`; the
  ADR section lists exactly Nygard's five fields, states per-package numbering
  and the immutability rule; neither `architecture-decision-records` nor
  `architecture` appears anywhere in the file; no forbidden number appears.
- **Depends on:** none
- **Track:** A

### S5. Extend `.claude/agents/README.md`

- **Files:** `.claude/agents/README.md` (existing, Ukrainian — extend, never
  replace; keep every existing sentence unless a table row genuinely changes)
- **Change:** five edits.

  **(a) Chain diagram** — replace the fenced block at lines 8–12 with:

```
                        ┌──▶ implementer          (червоний тест наперед)
test-writer ────────────┤
   (тести + Test Report)└──▶ людина                (покриття наявного коду,
                                                    без плану й без implementer)

researcher ──(звіт з доказами)──▶ planner ──(docs/plans/*.md)──▶ implementer
                                     ▲                                │
                                     │                    (код + Implementation Report)
                                     │                                │
                   дефект плану ─────┤            ┌───────────────────┼───────────────────┐
                                     │            ▼                   ▼                   ▼
                                     └──── plan-verifier      architecture-reviewer   doc-writer
                                        (таблиця по кроках)   (findings з доказами)  (docs/*.md,
                                                                                      <module>/*.md)
                                                     │                   │
                                                     └─────────┬─────────┘
                                                               ▼
                                              людина: коміт → /pr-self-review → PR
```

  Immediately under the diagram, before the existing paragraph, add one
  Ukrainian sentence making the two entry points explicit: `test-writer` має два
  входи — червоний тест **перед** реалізацією (далі його підхоплює
  `implementer`) і самостійне покриття вже наявної поведінки, яке ні плану, ні
  `implementer` не потребує.

  Keep the existing paragraph ("Передача між ланками йде **файлом**…") and
  append one sentence to it: три нові рев'юери віддають звіт у чат, бо його
  споживає людина в тій самій сесії; файлом передають лише `planner` і
  `doc-writer`.

  **(b) "Склад набору"** — append four rows, in this order, after the
  `implementer` row:

```
| [`test-writer`](test-writer.md) | `inherit`, `maxTurns: 50` | Пише і ганяє тести для `client`, `server` і `reviewer-core`; доводить, що тест уміє падати | Не пише і не лагодить продакшн-код, не робить рев'ю, не комітить |
| [`architecture-reviewer`](architecture-reviewer.md) | `opus`, `effort: high`, `maxTurns: 30` | Read-only рев'ю меж: спершу детерміновані чекери, потім судження; findings з `file:line` | Нічого не редагує, не робить security-рев'ю, не пише вердикт `/pr-self-review` |
| [`plan-verifier`](plan-verifier.md) | `sonnet`, `maxTurns: 40` | Звіряє готовий код з кожним пунктом плану; таблиця вердиктів по кроках | Не оцінює якість коду, не править код, не редагує план |
| [`doc-writer`](doc-writer.md) | `inherit`, `maxTurns: 40` | Документує реалізоване; сам обирає місце в `docs/` або в доках модуля (ADR — у `<module>/docs/`); діаграми Mermaid | Не пише `INSIGHTS.md`, не документує нереалізоване, не чіпає символлінки `CLAUDE.md`, не створює `docs/adr/` |
```

  **(c) "Дозволи"** — append four rows:

```
| `test-writer` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite, `mcp__plugin_context7_context7__*` | WebSearch, WebFetch, Agent, NotebookEdit | — (вантажить за областю) |
| `architecture-reviewer` | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, WebSearch, WebFetch, Agent | `onion-architecture`, `frontend-architecture` |
| `plan-verifier` | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, WebSearch, WebFetch, Agent | — |
| `doc-writer` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite | WebSearch, WebFetch, Agent, NotebookEdit | `mermaid-diagram` |
```

  Then append to the "Особливості, які легко пропустити" list, keeping its four
  existing bullets:

  - read-only форма з документації — це саме `Read, Grep, Glob, Bash`; у
    `architecture-reviewer` і `plan-verifier` `Bash` потрібен рівно для запуску
    детермінованих чекерів і команд перевірки з плану;
  - жоден з нових агентів не пише `.claude/pr-self-review.local.md` — цей файл є
    контрактом хука `PreToolUse`, і його заповнює тільки скіл `pr-self-review`;
  - `Agent` лишається тільки в `planner` (і тільки для `researcher`) — усі
    чотири нові агенти є листками ланцюжка: те, чого вони не побачили самі, іде
    в «не перевірено», а не делегується;
  - у `plan-verifier` немає `Skill`: його задача — покриття плану, а не рев'ю
    якості; заборона тримається відсутністю інструмента в `tools`, а не окремим
    записом у `disallowedTools`;
  - `test-writer` — єдиний, кому дозволено тимчасово зламати продакшн-файл, і
    лише щоб довести «червоний» тест, з обов'язковим відновленням через `Edit`
    (ніколи `git checkout`) і перевіркою `git diff --exit-code`.

  **(d) "Артефакти"** — append four rows:

```
| `test-writer` | Область/модуль або крок плану, що вимагає покриття | Тестові файли в репо + Test Report у чат (цитати виводу + доказ «червоного») |
| `architecture-reviewer` | Діапазон змін, шлях або питання про межі | Звіт у чат: вивід детермінованих чекерів → findings (severity + `file:line` + цитата рядка + назва правила) → «що не перевірено» |
| `plan-verifier` | Шлях до плану в `docs/plans/` або явний список вимог | Звіт у чат: таблиця «пункт → вердикт → доказ», зайва робота поза планом, «що не вдалося перевірити» |
| `doc-writer` | Реалізована фіча + матеріал (план, спека, звіт `researcher`) | **Файл(и)** документації в `docs/` або в доках модуля (ADR — у `<module>/docs/adr-NNNN-….md`) + резюме в чат |
```

  Then append one short subsection after the two existing "Розділи…"
  paragraphs, titled `### Межа з /pr-self-review`, stating in Ukrainian: три
  питання не перетинаються — `plan-verifier` питає «чи виконано план»,
  `architecture-reviewer` — «чи витримані межі», `/pr-self-review` — «чи можна
  це віддавати в PR», і лише останній пише вердикт, який читає хук.

  **(e) "На чому ґрунтуються правила"** — insert a new subsection
  `### Джерела під чотирьох нових агентів` after the existing
  `### Джерела під `planner` та `implementer``, keeping the existing
  `### Джерела всередині репозиторію` and `### Що не має зовнішнього джерела`
  subsections and extending the latter. Contents:

  - **Спільна механіка (усі чотири).** Обов'язкові лише `name` і `description`;
    `tools` — це allowlist; документована read-only форма — `Read, Grep, Glob,
    Bash`; `skills:` преднавантажує **повне тіло** скіла; кожен субагент
    стартує у свіжому контексті:
    [sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
    [agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
    Принцип «демонструвати доказом, а не заявою», спираючись на детерміновані
    сигнали (типчекер, лінтери, тести):
    [verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) [F].
  - **`test-writer`.** Надмірне мокання як задокументований режим відмови
    агентних тестів: [arXiv:2602.00409](https://arxiv.org/pdf/2602.00409) [F].
    Мутаційне тестування як правильний сигнал замість покриття (Meta ACH):
    [engineering.fb.com](https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/) [F].
    Пастка зворотного боку — тест, який закріплює баг як очікувану поведінку:
    [arXiv:2602.08146](https://arxiv.org/html/2602.08146) [S].
    «Ілюзія безпеки» (покриття росте, виявлення дефектів падає):
    [keelcode.dev](https://keelcode.dev/blog/ai-tests-safety-illusion) [S, fetch failed].
    Red-first як явна інструкція:
    [dev.to](https://dev.to/spyrae/tdd-with-ai-claude-writes-tests-first-then-the-implementation-27hm) [S],
    [alexop.dev](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/) [S].
  - **`architecture-reviewer`.** Патерни побудови промпта рев'ювера — ліміт
    дрібних зауважень, планка верифікації («behavior claims need a `file:line`
    citation in the source, not an inference from naming») і skip-правила для
    згенерованого коду:
    [code-review](https://code.claude.com/docs/en/code-review) [F]. Там же
    описаний аргумент `effort` **команди** `/code-review` — це інша річ, ніж
    поле `effort` у фронтматері субагента, і як обґрунтування значення в
    фронтматері він не використовується.
    Ландшафт детермінованих інструментів:
    [dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) [S],
    [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) [S],
    [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) [S],
    [madge](https://github.com/pahen/madge) [S],
    [arXiv:2605.17548](https://arxiv.org/pdf/2605.17548) [S].
  - **`plan-verifier`.** Таксономія відмов верифікатора — *optimistic* та *echo*
    вердикти: [TeamBench](https://arxiv.org/pdf/2605.07073) [S].
    Схильність трактувати заяви як факти:
    [arXiv:2606.05403](https://arxiv.org/html/2606.05403v2) [S].
    Матриця трасування вимог як прецедент «один рядок на вимогу»:
    [katalon](https://katalon.com/resources-center/blog/traceability-matrix) [S].
    Definition of Done для агентів:
    [scrum.org](https://www.scrum.org/resources/blog/definition-done-ai-agents) [S],
    [paelladoc](https://paelladoc.com/blog/acceptance-criteria-for-ai-agents/) [S].
  - **`doc-writer`.** Чотири типи документації та критерій вибору:
    [Diátaxis](https://diataxis.fr/start-here/) [F].
    Docs-as-code і дефолт на видалення застарілого:
    [Google docguide](https://google.github.io/styleguide/docguide/best_practices.html) [F].
    Режими відмови LLM-документації та окремий етап верифікації (DocAgent):
    [arXiv:2504.08725](https://arxiv.org/abs/2504.08725) [F].
    Формат ADR (Nygard: Title / Status / Context / Decision / Consequences) і
    MADR як сучасний надмножинний шаблон:
    [adr.github.io](https://adr.github.io/) [S],
    [MADR](https://adr.github.io/madr/) [S].
    Mermaid рендериться на GitHub нативно:
    [github.blog](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) [S].
    Стиль: [Google developer style](https://developers.google.com/style) [S],
    [Write the Docs](https://www.writethedocs.org/guide/) [S].
    Спостереження про впевнено вигадані параметри й дефолти:
    [diffray.ai](https://diffray.ai/blog/llm-hallucinations-code-review/) [S].
  - A closing paragraph: `[F]` = джерело витягнуто й прочитано напряму,
    `[S]` = лише пошукова видача; жодне `[S]`-джерело не використане як підстава
    для числа.

  Add a new subsection `### Числа, які заборонено цитувати` listing, in
  Ukrainian, that none of these unverified figures may appear in an agent
  prompt: the mutation score circulating for LLM-written tests, the share of
  vulnerable AI-generated code, CORE's false-positive reduction, the claimed
  hallucination reduction, and TeamBench's verifier acceptance rates. **Write
  the sentence without reproducing the digits in a form that survives
  copy-paste into an agent file** — name each descriptively and state that each
  was `[S]`-only.

  Extend `### Що не має зовнішнього джерела` with our own decisions: вибір
  моделей для чотирьох нових агентів (і `effort: high` у
  `architecture-reviewer` за прецедентом `planner`, а не за зовнішнім
  джерелом); протокол тимчасової мутації для доказу «червоного»; заборона всім
  новим агентам писати вердикт-файл `/pr-self-review`; `Agent` тільки в
  `planner`, усі нові агенти — листки; таблиця маршрутизації документів під
  реальну структуру `docs/` цього репозиторію (Diátaxis дає форму, не адресу) і
  вибір писати ADR у вже існуючі `<module>/docs/` (не заводити `docs/adr/`);
  межа між `docs/superpowers/specs/` і `<module>/docs/`; вимога однієї таблиці
  «пункт плану → вердикт» без агрегованого
  підсумку; розв'язання конфлікту `test-writer` ↔ правило 7 `implementer` через
  вхідні умови `test-writer`, а не через зміну `implementer`.

- **Skills:** none.
- **Test:** none applicable.
- **Definition of done:** the README is still Ukrainian throughout; all three
  tables (Склад набору, Дозволи, Артефакти) have exactly four new rows each;
  every `](*.md)` link in the file
  resolves to a file that exists; the chain diagram names all seven agents and
  shows both of `test-writer`'s entry points; the new sources subsection
  contains every URL listed above and marks each `[F]` or `[S]`; the
  forbidden-number check from §5 still finds nothing in `.claude/agents/*.md`
  (including the README).
- **Depends on:** S1, S2, S3, S4 (the links must resolve and the frontmatter
  values quoted in the tables must match the files)
- **Track:** A

## 5. Test & verification plan

No package source changes, so **no package build, typecheck, test, `arch:check`
or `check-shared-sync.sh` gate applies to this change**. State that explicitly in
the Implementation Report rather than running gates for show. The verification is
documentary and is run from the repository root:

| Package | Command | Docker needed | Migrations needed |
|---|---|---|---|
| — | `ls .claude/agents/` — expect exactly 8 entries (README + 7 agents) | no | no |
| — | `grep -c '^---$' .claude/agents/test-writer.md` (and the other three) — expect `2` | no | no |
| — | `grep -nE '^(name\|description\|model\|color\|tools\|disallowedTools\|maxTurns\|effort\|skills):' .claude/agents/<file>.md` — compare the key set against §4 for that file; `architecture-reviewer.md` must show `effort: high` | no | no |
| — | `grep -nE '20\.32\|29[–-]45\|25\.8\|96 ?%\|49\.4' .claude/agents/*.md` — expect no match (exit 1) | no | no |
| — | `grep -n 'pr-self-review.local.md' .claude/agents/architecture-reviewer.md .claude/agents/plan-verifier.md` — expect a match in both (the prohibition is present) | no | no |
| — | `grep -n 'Skill' .claude/agents/plan-verifier.md` — `Skill` must not appear inside the `disallowedTools` array (hard constraint 6 mentioning it in prose is expected) | no | no |
| — | `grep -n 'vendor' .claude/agents/architecture-reviewer.md` — the skip list names `client/src/vendor/ui/**` only; both `vendor/shared` copies are named as reviewed | no | no |
| — | `grep -n 'architecture-decision-records\|skills: \[.*architecture' .claude/agents/doc-writer.md` — expect no match | no | no |
| — | `grep -n 'server/docs' .claude/agents/doc-writer.md` — expect a match (ADR destination) | no | no |
| — | `grep -nE '^\|.*docs/adr/' .claude/agents/doc-writer.md` — expect no match (no destination-table row routes to a root `docs/adr/` folder) | no | no |
| — | `grep -n 'reviewer-core/test' .claude/agents/test-writer.md` — expect a match | no | no |
| — | `grep -n 'Where a test goes' -A 20 .claude/agents/test-writer.md \| grep 'reviewer-core/src'` — expect no match (the location table must not list `src` as where tests go; a later "not under src" sentence is fine and is not this check) | no | no |
| — | `grep -oE '\]\([a-z-]+\.md\)' .claude/agents/README.md \| sort -u` then `ls` each — every link resolves | no | no |
| — | `grep -n 'docs/tutorials\|docs/how-to\|docs/reference\|docs/explanation' .claude/agents/doc-writer.md` — expect no match | no | no |

Commands the authored files are allowed to quote (each verified against the real
`scripts` block of its `package.json`, plus the two repo scripts):

| Package | Real command |
|---|---|
| `server/` (pnpm) | `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm typecheck` · `pnpm test` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm arch:check` · `pnpm arch:baseline` · `pnpm arch:check:core` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · `pnpm exec vitest run .it.test` |
| `client/` (pnpm) | `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm typecheck` · `pnpm test` · `pnpm exec vitest run <path>` |
| `reviewer-core/` (npm) | `npm test` · `npm run typecheck` · `npm run build` · `npx vitest run <path>` |
| `e2e/` (npm) | `npm test` · `npm run typecheck` · `npm run e2e:hermetic` |
| repo root | `./scripts/dev.sh` · `./scripts/check-shared-sync.sh` |

Anything not in this table must not appear as a command inside an agent file.
Note in particular: there is **no** `lint` script anywhere, and `reviewer-core`'s
`build` is `tsc --noEmit` (this package never emits JS).

Run order: S1 → S2 → S3 → S4 → S5 (one track, strictly ordered) →
the documentary checks above, in the order listed.

## 6. Risks & rollback

| Risk | Likelihood | How it shows up | How to roll back |
|---|---|---|---|
| House-style drift — a new agent reads like a different project's prompt | medium | Missing `## When to invoke`, missing clarify block, missing `## Quality bar`, bullet style differs from `implementer.md` | Re-read `implementer.md` / `researcher.md` and rewrite the section; the file is new, so deleting and re-authoring costs nothing |
| An agent quotes a command that does not exist (e.g. `pnpm test:unit`, `pnpm lint`) | medium | The agent fails at runtime on its first use | Fix against the command table in §5 |
| The new reviewers are treated as a substitute for `/pr-self-review` | medium | Someone pushes on an `architecture-reviewer` `CLEAR`; the hook denies it and the confusion lands on the hook | The explicit "does not unblock `git push`" line in both agents and the new README subsection are the mitigation; if it still happens, strengthen the README note |
| `test-writer` leaves a mutated production file behind | low, high impact | An unexplained one-line diff in a source file; a green suite that proves nothing | The protocol requires restore via `Edit` then `git diff --exit-code -- <path>`; `git checkout -- <path>` by the **human** is recovery, never the agent's restore |
| `doc-writer` writes into `INSIGHTS.md`, a plan, a spec, or a `CLAUDE.md` symlink | low | A symlink replaced by a regular file; a plan silently rewritten | Four explicit prohibitions in its hard constraints; recovery is `git checkout -- <path>` (the symlink is tracked) |
| `doc-writer` edits an existing ADR instead of superseding it | low | The decision history stops being a history | Hard constraint 7 plus the `## Architecture Decision Records` section; recovery is `git checkout -- <module>/docs/<file>` |
| `doc-writer` invents a root `docs/adr/` | low | A second ADR journal appears next to the four package `docs/` folders | Hard constraint 6 and the destination table; delete the folder if it appears |
| The Ukrainian README acquires English paragraphs | medium | Mixed-language document | S5's definition of done; rewrite the offending block |
| Four agent prompts duplicate project rules instead of citing them, and drift from the source | medium | A rule restated in `test-writer.md` contradicts `TESTING.md` after `TESTING.md` changes | Each file's `## Project rules you must respect` table cites sources; review that no rule text is copied except the three deliberate repeats already sanctioned in `implementer.md` |
| Rollback of the whole change | — | — | The four files are new (`rm`) and `README.md`'s diff is confined to five blocks; `git checkout -- .claude/agents/README.md` restores it |

## 7. Out of scope / handoff

- **To the `onion-architecture` review checklist:** nothing — no backend code
  changes. The only relevant check is that the rule names quoted inside
  `architecture-reviewer.md` still match `server/.dependency-cruiser.cjs` and
  `reviewer-core/.dependency-cruiser.cjs`.
- **To the `security` skill pass:** nothing to review in production code. One
  prompt-level point worth a look: `architecture-reviewer` and `plan-verifier`
  hold `Bash` while being nominally read-only — the enforcement is the `tools`
  allowlist (no `Write`/`Edit`) plus the prompt; output redirection is not
  mechanically blocked, exactly as already documented for `researcher` and
  `planner`.
- **To the human:**
  - flip this plan's `Status:` to `approved` before implementation;
  - after implementation, invoke each of the four agents once on a trivial task
    to confirm the harness accepts the frontmatter — `implementer` has no
    `Agent` tool and cannot do this itself;
  - decide whether any of the four deserves a slash command (out of scope here);
  - decide whether an existing decision (for example the four-package,
    no-workspace layout) is worth recording as an ADR in the package that
    enforces it — this plan does not write one;
  - commit, run `/pr-self-review`, open the PR. `git push` and `gh pr create`
    stay blocked by the `PreToolUse` hook until the verdict is `CLEAR`.

## 8. Open questions

- **Should `test-writer` also cover `e2e/`?** Its scope statement names client,
  server and `reviewer-core`, and the `## Where a test goes` table mentions
  `e2e/specs/*.flow.json` only so the agent knows what *not* to write there by
  reflex. Not blocking. Assumption taken: e2e flows stay a human/`implementer`
  task because they need the full stack running; if that turns out wrong, it is
  one added row in the routing table.

ADR location is **not** an open question: ADRs go in `<module>/docs/`, decided
after plan review. Do not reopen it during implementation.
