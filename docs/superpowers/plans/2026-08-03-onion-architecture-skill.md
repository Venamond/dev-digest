# Onion Architecture Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a project skill at `.claude/skills/onion-architecture/` that names DevDigest's existing backend directories as onion rings and enforces the inward dependency rule with `dependency-cruiser`.

**Architecture:** No runtime code changes. Two `dependency-cruiser` configs (one for `server`, one for `reviewer-core`) turn the dependency rule into a non-zero exit code, with a committed known-violations baseline that grandfathers today's six leaks. The skill documents the ring map and per-tool rules; `AGENTS.md` carries a short pointer so an agent sees the rule without invoking the skill.

**Tech Stack:** `dependency-cruiser` 17.4.3 (already a `server` dependency), Node ≥22, pnpm ≥10, TypeScript 5.7, markdown.

## Global Constraints

- **No new npm packages.** `dependency-cruiser` 17.4.3 is already in `server/package.json` dependencies. `reviewer-core` gets no dependency of its own — its check runs from `server`'s binary via a relative path.
- **No runtime source changes.** This plan touches only `.dependency-cruiser.cjs` files, `server/package.json` scripts, markdown, and the baseline JSON. `pnpm test` and `pnpm typecheck` must be byte-for-byte unaffected.
- **`tsPreCompilationDeps: true` is mandatory** in both configs. Most leaks in this codebase are `import type` statements, which are erased before runtime and invisible to `dependency-cruiser` without this flag.
- **All commands run from `server/`** (`cd server && pnpm arch:check`), matching every other check in this repo.
- **The baseline may only shrink.** Growing `.dependency-cruiser-known-violations.json` requires a deliberate `pnpm arch:baseline` run, reviewed in the diff.
- **Module docs are `AGENTS.md`**; each directory has a `CLAUDE.md` symlink to it. Edit `AGENTS.md`, never the symlink.
- ESM: relative imports carry the `.js` extension and resolve to `.ts` sources. The resolver must handle this or every rule silently matches nothing.

## Known violations this plan expects to find

These six are the baseline. Any other violation surfaced during execution is a
finding to report, not to silently baseline.

| File | Rule |
| --- | --- |
| `src/modules/pulls/routes.ts` | `no-route-to-db` |
| `src/modules/polling/routes.ts` | `no-route-to-db` |
| `src/modules/workspace/routes.ts` | `no-route-to-db` |
| `src/modules/settings/routes.ts` | `no-route-to-db` |
| `src/modules/reviews/run-executor.ts` | `no-app-to-schema` |
| `src/modules/reviews/diff-loader.ts` | `no-app-to-schema` |

## File structure

| File | Responsibility |
| --- | --- |
| `server/.dependency-cruiser.cjs` | Create — ring rules for `server` |
| `server/.dependency-cruiser-known-violations.json` | Create — the six grandfathered leaks |
| `reviewer-core/.dependency-cruiser.cjs` | Create — purity rules for the core |
| `server/package.json` | Modify — three `arch:*` scripts |
| `.claude/skills/onion-architecture/SKILL.md` | Create — frontmatter, ring map, delegation note |
| `.claude/skills/onion-architecture/rules/layers.md` | Create — ring table in depth, "where does this go" |
| `.claude/skills/onion-architecture/rules/fastify-routes.md` | Create — ring 3 |
| `.claude/skills/onion-architecture/rules/drizzle-repositories.md` | Create — ring 2 persistence, `db/rows.ts` seam |
| `.claude/skills/onion-architecture/rules/zod-contracts.md` | Create — ring 0 DTOs, boundary parsing |
| `.claude/skills/onion-architecture/rules/ports-adapters-di.md` | Create — port → adapter → container → mock |
| `.claude/skills/onion-architecture/rules/reviewer-core-purity.md` | Create — the pure core |
| `.claude/skills/onion-architecture/enforcement.md` | Create — configs, scripts, baseline policy |
| `.claude/skills/onion-architecture/examples.md` | Create — good/bad from real files |
| `.claude/skills/onion-architecture/review-checklist.md` | Create — symptom → rule → fix |
| `.claude/skills/onion-architecture/references.md` | Create — sources |
| `.claude/skills/README.md` | Modify — catalog row |
| `server/AGENTS.md` | Modify — replace the false "routes never touch the DB" line |
| `reviewer-core/AGENTS.md` | Modify — pointer to the purity rule |

---

### Task 1: Config skeleton and the resolver sanity check

The single highest-risk step. If `dependency-cruiser` cannot resolve
`../../db/schema.js` to `db/schema.ts`, every rule in this plan matches
nothing and the whole thing silently reports success. Prove resolution works
before writing a single rule.

**Files:**

- Create: `server/.dependency-cruiser.cjs`
- Modify: `server/package.json` (scripts)

**Interfaces:**

- Produces: `pnpm arch:check` — the command every later task runs. Config exports a CommonJS object with `forbidden: []` and an `options` block reused by all later rules.

- [ ] **Step 1: Create the config with one deliberately-failing probe rule**

The probe rule forbids something that definitely exists (`routes.ts` importing
`fastify`). If the cruiser resolves correctly, this rule fires. If it reports
zero violations, resolution is broken and every later rule would be a
false negative.

```js
// server/.dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'probe-delete-me',
      severity: 'error',
      comment: 'Temporary resolver sanity check — removed in step 4.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'node_modules/fastify' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    // REQUIRED: most leaks here are `import type`, erased at runtime and
    // invisible without this flag.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
```

- [ ] **Step 2: Add the scripts**

In `server/package.json`, add to `"scripts"`:

```json
"arch:check": "depcruise src --config .dependency-cruiser.cjs --ignore-known",
"arch:baseline": "depcruise src --config .dependency-cruiser.cjs --output-type baseline > .dependency-cruiser-known-violations.json",
"arch:check:core": "depcruise ../reviewer-core/src --config ../reviewer-core/.dependency-cruiser.cjs"
```

`arch:check:core` will fail until Task 6 creates
`reviewer-core/.dependency-cruiser.cjs`. That is expected — no step before
Task 6 runs it. All three scripts are added here so `package.json` is touched
once.

- [ ] **Step 3: Run the probe and confirm it FIRES**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`

Expected: non-zero exit, `error probe-delete-me` reported for
`src/modules/pulls/routes.ts` (and the other route files).

**If it reports 0 violations, STOP.** Resolution is broken. Diagnose with
`pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err-long`
and check for `couldNotResolve` entries before continuing. Do not proceed to
Task 2 until the probe fires.

- [ ] **Step 4: Prove `.js` → `.ts` resolution specifically**

Run: `cd server && pnpm exec depcruise src/modules/reviews/run-executor.ts --config .dependency-cruiser.cjs --output-type json | grep -c '"couldNotResolve": true'`

Expected: `0`. A non-zero count means relative `.js` specifiers are not
resolving to `.ts` sources; fix `enhancedResolveOptions.extensions` before
continuing.

- [ ] **Step 5: Replace the probe with an empty rule list**

```js
  forbidden: [],
```

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`
Expected: exit 0, "no dependency violations found".

- [ ] **Step 6: Commit**

```bash
git add server/.dependency-cruiser.cjs server/package.json
git commit -m "chore(server): add dependency-cruiser config skeleton and arch scripts"
```

---

### Task 2: `no-domain-io` — ring 0 must be pure

Verified before writing this plan: `vendor/shared` imports only `zod`,
`reviewer-core` only `zod`/`openai`/`@devdigest/shared`, `grounding.ts`
imports nothing, `pulls/status.ts` imports one type from `@devdigest/shared`.
This rule should therefore pass with **zero** violations on first run — it
locks in a property that already holds.

**Files:**

- Modify: `server/.dependency-cruiser.cjs`

**Interfaces:**

- Consumes: the `options` block from Task 1.
- Produces: ring-0 path regex `^(src/vendor/shared|src/platform/grounding\.ts|src/modules/pulls/status\.ts|\.\./reviewer-core/src)` — reused verbatim by Task 6's `reviewer-core` config comment.

- [ ] **Step 1: Add the rule**

```js
    {
      name: 'no-domain-io',
      severity: 'error',
      comment:
        'Ring 0 (domain) must have no I/O. It defines port interfaces; ' +
        'ring 2 implements them. See .claude/skills/onion-architecture/rules/layers.md',
      from: {
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts)',
      },
      to: {
        path: '^(node_modules/(fastify|drizzle-orm|octokit|postgres|simple-git|@fastify)|src/db/)',
      },
    },
    {
      name: 'no-domain-node-builtins',
      severity: 'error',
      comment: 'Ring 0 must not touch Node builtins (fs, child_process, …).',
      from: {
        path: '^(src/vendor/shared|src/platform/grounding\\.ts|src/modules/pulls/status\\.ts)',
      },
      to: { dependencyTypes: ['core'] },
    },
```

- [ ] **Step 2: Run and confirm it PASSES**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`
Expected: exit 0, no violations. Ring 0 is already clean.

- [ ] **Step 3: Prove the rule actually bites**

Temporarily add `import 'node:fs';` as the first line of
`src/platform/grounding.ts`.

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`
Expected: non-zero exit, `error no-domain-node-builtins` on
`src/platform/grounding.ts`.

Then **revert the edit**: `git checkout -- src/platform/grounding.ts`, and
re-run to confirm exit 0 again.

- [ ] **Step 4: Commit**

```bash
git add server/.dependency-cruiser.cjs
git commit -m "chore(server): forbid I/O and node builtins in the domain ring"
```

---

### Task 3: `no-route-to-db` and the first baseline

**Files:**

- Modify: `server/.dependency-cruiser.cjs`
- Create: `server/.dependency-cruiser-known-violations.json`

**Interfaces:**

- Consumes: config from Task 2.
- Produces: the baseline file that `arch:check` reads via `--ignore-known`.

- [ ] **Step 1: Add the rule**

```js
    {
      name: 'no-route-to-db',
      severity: 'error',
      comment:
        'Ring 3 (routes) must go through service → repository, never straight ' +
        'to Drizzle. Known offenders are grandfathered in the baseline; do not ' +
        'add more. See rules/fastify-routes.md',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^(node_modules/drizzle-orm|src/db/schema)' },
    },
```

- [ ] **Step 2: Run and confirm exactly four violations**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`

Expected: non-zero exit, `no-route-to-db` on exactly
`src/modules/pulls/routes.ts`, `src/modules/polling/routes.ts`,
`src/modules/workspace/routes.ts`, `src/modules/settings/routes.ts`.

If a fifth route appears, stop and report it — the plan's assumption about the
current state was wrong and the extra file needs a decision, not a silent
baseline entry.

- [ ] **Step 3: Generate the baseline**

Run: `cd server && pnpm arch:baseline`

- [ ] **Step 4: Inspect the baseline before trusting it**

Run: `cd server && cat .dependency-cruiser-known-violations.json`
Expected: exactly four entries, all `no-route-to-db`, matching the four files
above. Nothing else.

- [ ] **Step 5: Confirm `arch:check` is now green**

Run: `cd server && pnpm arch:check`
Expected: exit 0.

- [ ] **Step 6: Confirm a NEW violation still fails**

Add `import { eq } from 'drizzle-orm';` to `src/modules/repos/routes.ts`
(a file not in the baseline).

Run: `cd server && pnpm arch:check`
Expected: non-zero exit, `no-route-to-db` on `src/modules/repos/routes.ts`.

Then revert: `git checkout -- src/modules/repos/routes.ts` and re-run;
expected exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/.dependency-cruiser.cjs server/.dependency-cruiser-known-violations.json
git commit -m "chore(server): forbid routes reaching the DB, baseline the four known offenders"
```

---

### Task 4: `no-app-to-schema` — ring 1 keeps out of `db/schema`

`db/rows.ts` is explicitly allowed: its own docstring establishes it as the
seam that lets cross-cutting consumers name a row shape without importing
another module's data layer.

**Files:**

- Modify: `server/.dependency-cruiser.cjs`
- Modify: `server/.dependency-cruiser-known-violations.json`

**Interfaces:**

- Consumes: baseline from Task 3.

- [ ] **Step 1: Add the rule**

```js
    {
      name: 'no-app-to-schema',
      severity: 'error',
      comment:
        'Ring 1 (services, helpers, executors, pipelines) may name row shapes ' +
        'via src/db/rows.ts, but must not import the Drizzle table objects or ' +
        'the query builder. See rules/drizzle-repositories.md',
      from: {
        path: '^src/modules/[^/]+/(service|helpers|run-executor|diff-loader)\\.ts$|^src/modules/repo-intel/pipeline/',
      },
      to: { path: '^(node_modules/drizzle-orm|src/db/schema)' },
    },
```

- [ ] **Step 2: Run and confirm exactly two NEW violations**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`
Expected: `no-app-to-schema` on exactly `src/modules/reviews/run-executor.ts`
and `src/modules/reviews/diff-loader.ts`, plus the four already-known
`no-route-to-db` ones.

- [ ] **Step 3: Confirm `db/rows.ts` is NOT flagged**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type err-long | grep -c "db/rows"`
Expected: `0`. `run-executor.ts` imports both `db/schema` and `db/rows.ts`;
only the `db/schema` import may be reported. If `db/rows` appears, the rule's
`to.path` is too broad — it must not match `src/db/rows.ts`.

- [ ] **Step 4: Regenerate and inspect the baseline**

Run: `cd server && pnpm arch:baseline && cat .dependency-cruiser-known-violations.json`
Expected: exactly six entries — four `no-route-to-db`, two `no-app-to-schema`.

- [ ] **Step 5: Confirm green**

Run: `cd server && pnpm arch:check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/.dependency-cruiser.cjs server/.dependency-cruiser-known-violations.json
git commit -m "chore(server): keep db/schema out of the application ring"
```

---

### Task 5: `no-infra-to-app`, `no-cross-module-internals`, `no-circular`

The inversion Onion exists to prevent (`adapters/*` depending on
`modules/*/service.ts`) plus module encapsulation. Expected to pass clean;
`platform/container.ts` is the composition root and is exempt.

**Files:**

- Modify: `server/.dependency-cruiser.cjs`

- [ ] **Step 1: Add the three rules**

```js
    {
      name: 'no-infra-to-app',
      severity: 'error',
      comment:
        'Ring 2 (adapters) implements ring 0 interfaces. An adapter depending ' +
        'on a service is the inversion Onion Architecture exists to prevent.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module must not reach into another module\'s data or application ' +
        'layer. Shared repositories are exposed via the container (see ' +
        'container.agentsRepo / container.reviewRepo).',
      from: { path: '^src/modules/([^/]+)/', pathNot: '^src/modules/_shared/' },
      to: {
        path: '^src/modules/([^/]+)/(service|repository)(\\.ts|/)',
        // $1 back-reference: only flag when the target module differs
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break the ring ordering.',
      from: {},
      to: { circular: true },
    },
```

- [ ] **Step 2: Run and inspect**

Run: `cd server && pnpm exec depcruise src --config .dependency-cruiser.cjs`

Expected: only the six known violations from Tasks 3–4.

If `no-cross-module-internals` or `no-circular` fires, **do not baseline it
reflexively**. Report each hit with its file pair and stop for a decision:
these two rules were not part of the surveyed leaks, so a hit means either a
real architectural problem worth fixing now or an over-broad regex worth
narrowing. `container.ts` importing `AgentsRepository` and `ReviewRepository`
is expected and must NOT be flagged — it is the composition root, and the
`from` path above excludes it by only matching `^src/modules/`.

- [ ] **Step 3: Confirm `arch:check` is green**

Run: `cd server && pnpm arch:check`
Expected: exit 0, baseline still six entries.

- [ ] **Step 4: Commit**

```bash
git add server/.dependency-cruiser.cjs
git commit -m "chore(server): forbid infra→app inversion, cross-module internals, cycles"
```

---

### Task 6: `reviewer-core` purity config

Makes the existing "no DB/GitHub/fs; the only side effect is the injected
LLMProvider" contract executable. Verified allowed imports today: `zod`,
`openai`, `openai/helpers/zod`, `@devdigest/shared`.

**Files:**

- Create: `reviewer-core/.dependency-cruiser.cjs`

**Interfaces:**

- Consumes: the `arch:check:core` script added in Task 1.

- [ ] **Step 1: Create the config**

```js
// reviewer-core/.dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-no-node-builtins',
      severity: 'error',
      comment:
        'reviewer-core is a pure diff→prompt→LLM→findings engine. Its only ' +
        'side effect is the injected LLMProvider. No fs, no child_process.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-allowlisted-deps-only',
      severity: 'error',
      comment:
        'Only openai and zod are permitted. Adding a dependency here means ' +
        'reconsidering whether the logic belongs in server/ instead.',
      from: { path: '^src/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'],
        pathNot: '^node_modules/(openai|zod)(/|$)',
      },
    },
    {
      name: 'core-no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.js', '.json'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
```

- [ ] **Step 2: Run and confirm it PASSES**

Run: `cd server && pnpm arch:check:core`
Expected: exit 0.

Note: `@devdigest/shared` resolves through the tsconfig path alias to
`../server/src/vendor/shared/index.ts`, i.e. a local file, not an npm
dependency — so `core-allowlisted-deps-only` must not flag it. If it does,
confirm `tsConfig.fileName` is being honoured.

- [ ] **Step 3: Prove the rule bites**

Temporarily add `import 'node:fs';` to the top of `reviewer-core/src/prompt.ts`.

Run: `cd server && pnpm arch:check:core`
Expected: non-zero exit, `core-no-node-builtins` on `src/prompt.ts`.

Revert: `git checkout -- reviewer-core/src/prompt.ts`, re-run, expect exit 0.

- [ ] **Step 4: Commit**

```bash
git add reviewer-core/.dependency-cruiser.cjs
git commit -m "chore(reviewer-core): make the purity contract executable"
```

---

### Task 7: `SKILL.md` and `rules/layers.md`

**Files:**

- Create: `.claude/skills/onion-architecture/SKILL.md`
- Create: `.claude/skills/onion-architecture/rules/layers.md`

**Interfaces:**

- Produces: the skill name `onion-architecture`, referenced by `.claude/skills/README.md` (Task 10) and both `AGENTS.md` files (Task 10).

- [ ] **Step 1: Write `SKILL.md`**

Frontmatter matching the format used by the sibling `fastify-best-practices`
skill (`name`, `description`, `metadata.tags`). The `description` must carry
the trigger terms an agent would use, and must state the delegation boundary:

```markdown
---
name: onion-architecture
description: "Enforces Onion Architecture in DevDigest's backend packages (server, reviewer-core). Use when adding or moving a route, service, repository, adapter, or port; when deciding which layer new backend code belongs in; when reviewing a backend diff for layering; or when `pnpm arch:check` fails. Covers the ring map (domain / application / infrastructure / presentation + composition root), the inward dependency rule, and how it is enforced via dependency-cruiser. Trigger terms: onion architecture, dependency rule, layering, arch:check, dependency-cruiser, which layer, port, adapter, composition root, repository layer. For general DDD, Hexagonal, CQRS or Event Sourcing theory use the clean-ddd-hexagonal skill instead — this skill carries only DevDigest specifics."
metadata:
  tags: architecture, backend, server, reviewer-core, layering, dependency-rule
---
```

Body sections, in this order:

1. **The one rule** — dependencies point inward only: 3 → 2 → 1 → 0, plus
   2 → 0 (an adapter implements a port defined in the core). 2 → 1 is a hard
   error.
2. **Ring map** — the table from the spec, verbatim.
3. **Where does this go?** — a short decision list: pure logic no I/O → ring 0;
   orchestrates domain, has side effects via ports → ring 1; talks to Postgres,
   GitHub, git, an LLM → ring 2; parses HTTP → ring 3; wires concrete classes
   → composition root.
4. **Check it** — `cd server && pnpm arch:check` and `pnpm arch:check:core`.
5. **Read next** — the `rules/` table with one line each.

- [ ] **Step 2: Write `rules/layers.md`**

The ring table expanded: for each ring, the exact directories, what may be
imported, what may not, and the one-line reason. Include the composition-root
exemption and why it exists. Include the `db/rows.ts` seam and why it is
allowed from ring 1 but not ring 0.

- [ ] **Step 3: Verify the skill is discoverable**

Run: `cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest && ls .claude/skills/onion-architecture/SKILL.md && head -5 .claude/skills/onion-architecture/SKILL.md`
Expected: file exists, frontmatter opens with `---` and `name: onion-architecture`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/onion-architecture/SKILL.md .claude/skills/onion-architecture/rules/layers.md
git commit -m "docs(skills): add the onion-architecture skill entry point and ring map"
```

---

### Task 8: The four per-tool rule files

Each file is short and specific. Every "bad" example must be a real file path
in this repo, not an invented one.

**Files:**

- Create: `.claude/skills/onion-architecture/rules/fastify-routes.md`
- Create: `.claude/skills/onion-architecture/rules/drizzle-repositories.md`
- Create: `.claude/skills/onion-architecture/rules/zod-contracts.md`
- Create: `.claude/skills/onion-architecture/rules/ports-adapters-di.md`
- Create: `.claude/skills/onion-architecture/rules/reviewer-core-purity.md`

- [ ] **Step 1: `fastify-routes.md`**

Content: a route is a driving adapter — validate, delegate, map errors. The
Zod contract from `vendor/shared/contracts` drives request validation *and*
response serialization via `fastify-type-provider-zod`; never hand-roll
`Schema.parse(req.body)` (this restates an existing `server/AGENTS.md`
convention in ring terms). Resolve a service from `container`; translate
failures through `platform/errors.ts`. Bad example: the
`container.db.select().from(t.repos)` block at the top of the
`GET /repos/:id/pulls` handler in `server/src/modules/pulls/routes.ts`.
Good example: `server/src/modules/agents/routes.ts` (delegates to
`AgentsService`).

- [ ] **Step 2: `drizzle-repositories.md`**

Content: `drizzle-orm` is imported only in `modules/*/repository.ts`,
`modules/*/repository/*.ts`, and `db/*`. A repository composes its aggregate's
queries and exposes contract types where it can. Where a row type must cross
into ring 1, it comes from `server/src/db/rows.ts` — never from another
module's `repository.ts`, never from `db/schema`. Transaction boundaries
belong to ring 1 and are expressed as a port; a `tx` handle is never threaded
into ring 0. Good example: `server/src/modules/reviews/repository.ts`
composing `repository/{review,run,pull}.repo.ts`.

- [ ] **Step 3: `zod-contracts.md`**

Content: contracts in `vendor/shared/contracts` are the domain DTOs and the
`server`/`client` copies must stay byte-identical (existing do-not-touch
rule — edit both or neither). Parse at the boundary as an anti-corruption
layer; inside the domain the value is already typed, so a second `parse` is a
smell. Cross-reference the existing `zod` project skill for schema authoring
itself; this file covers only *where* parsing happens.

- [ ] **Step 4: `ports-adapters-di.md`**

Content: the five-step sequence for any new external dependency — interface in
`server/src/vendor/shared/adapters.ts` → implementation in `server/src/adapters/<name>/`
→ lazy getter in `server/src/platform/container.ts` → field in
`ContainerOverrides` → mock in `server/src/adapters/mocks.ts`. Note that
`Container` belongs to the composition root: a service should take its ports
explicitly. State plainly that `ReviewsService`, `AgentsService`,
`ReposService` and `RepoIntelService` currently take `Container` in their
constructor, that this is grandfathered, and that new services must not copy
it. Cite `SecretsProvider` as the model port (interface in ring 0, local impl
in ring 2, never read `process.env` for a key elsewhere).

- [ ] **Step 5: `reviewer-core-purity.md`**

Content: what the core is (pure diff→prompt→LLM→findings), its single
permitted side effect (the injected `LLMProvider`), its allowlisted deps
(`openai`, `zod`, plus `@devdigest/shared` via path alias), how it is consumed
as source by both `server` and the CI agent-runner via tsconfig paths rather
than npm, and how `pnpm arch:check:core` enforces this.

- [ ] **Step 6: Verify every referenced path exists**

Run:

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest && \
grep -oh 'server/src/[a-zA-Z0-9_/.-]*\.ts' .claude/skills/onion-architecture/rules/*.md \
  | sort -u | while read -r f; do [ -f "$f" ] || echo "MISSING: $f"; done
```

Expected: no output. Any `MISSING:` line is a broken reference to fix before
committing.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/onion-architecture/rules/
git commit -m "docs(skills): add per-tool onion rules for fastify, drizzle, zod, ports, core"
```

---

### Task 9: `enforcement.md`, `examples.md`, `review-checklist.md`, `references.md`

**Files:**

- Create: `.claude/skills/onion-architecture/enforcement.md`
- Create: `.claude/skills/onion-architecture/examples.md`
- Create: `.claude/skills/onion-architecture/review-checklist.md`
- Create: `.claude/skills/onion-architecture/references.md`

- [ ] **Step 1: `enforcement.md`**

Content: the two config files and what each rule forbids (the rule table from
the spec); the three scripts and that they run from `server/`; why
`tsPreCompilationDeps: true` is mandatory here (most leaks are `import type`);
the baseline policy — the file is committed, its entry count may only
decrease, and growing it needs a deliberate reviewed `pnpm arch:baseline`;
and the burn-down list of the six grandfathered violations.

- [ ] **Step 2: `examples.md`**

Good/bad pairs drawn from real files. At minimum:

| Bad | Good |
| --- | --- |
| `modules/pulls/routes.ts` querying `container.db` in the handler | `modules/agents/routes.ts` delegating to `AgentsService` |
| `run-executor.ts` importing `* as schema from db/schema` | importing `AgentRow` from `db/rows.ts` |
| a service constructed with `Container` | a service constructed with explicit ports |

Each pair shows the actual import lines, not paraphrase.

- [ ] **Step 3: `review-checklist.md`**

A symptom → violated rule → fix table. Must cover what `dependency-cruiser`
cannot catch, because those are the ones a reviewer has to hold:

- `Container` in a service constructor → service-locator, not a port → take
  ports explicitly
- a `$inferSelect` row type in an exported ring-1 signature → persistence
  shape leaking → map to a contract type, or source the row from `db/rows.ts`
  and keep it internal
- a repository method returning a raw Drizzle row to a route → ring 3 coupled
  to ring 2 → return a contract type
- a second `Schema.parse()` inside a service → boundary parsing done twice

- [ ] **Step 4: `references.md`**

Copy the Sources section from
`docs/superpowers/specs/2026-08-03-onion-architecture-skill-design.md`
verbatim, including the note that the Milan Jovanović page returned HTTP 403
and nothing was drawn from it.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/onion-architecture/
git commit -m "docs(skills): add enforcement, examples, review checklist and references"
```

---

### Task 10: Wire the skill into the docs agents actually read

A skill only loads when an agent decides it is relevant. `AGENTS.md` is read
every session, so the dependency rule needs a pointer there — and
`server/AGENTS.md` currently states a false invariant that must go.

**Files:**

- Modify: `.claude/skills/README.md`
- Modify: `server/AGENTS.md`
- Modify: `reviewer-core/AGENTS.md`

- [ ] **Step 1: Add the catalog row**

In the `## Catalog` table of `.claude/skills/README.md`, add:

```markdown
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Ring map, inward dependency rule, dependency-cruiser enforcement for `server` + `reviewer-core` |
```

- [ ] **Step 2: Fix the false invariant in `server/AGENTS.md`**

Replace this line in the `## Structure` section:

```markdown
- `modules/<name>/{routes,service,repository,helpers,constants}.ts` — one
  feature per module, always in that layering (routes never touch the DB).
```

with:

```markdown
- `modules/<name>/{routes,service,repository,helpers,constants}.ts` — one
  feature per module. Dependencies point inward only: routes → service →
  repository → db. Routes must not import `drizzle-orm` or `db/schema`;
  services may name row shapes via `db/rows.ts` but not `db/schema`.
  Enforced by `pnpm arch:check`. **Four routes predate this rule** (`pulls`,
  `polling`, `workspace`, `settings`) and are grandfathered in
  `.dependency-cruiser-known-violations.json` — do not copy them. Full ring
  map: `.claude/skills/onion-architecture/SKILL.md`.
```

- [ ] **Step 3: Add the arch commands to `server/AGENTS.md`**

In the `## Commands` block, after the `pnpm typecheck` line:

```sh
pnpm arch:check      # onion dependency rules (dependency-cruiser)
pnpm arch:check:core # same, for reviewer-core purity
```

- [ ] **Step 4: Point `reviewer-core/AGENTS.md` at the purity rule**

Add to its conventions section:

```markdown
- **Purity is enforced, not just documented.** `cd ../server && pnpm
  arch:check:core` fails the build on any Node builtin or any dependency
  outside `openai`/`zod`. See
  `.claude/skills/onion-architecture/rules/reviewer-core-purity.md`.
```

- [ ] **Step 5: Confirm the symlinks still resolve**

Editing `AGENTS.md` must not have replaced the `CLAUDE.md` symlinks.

Run:

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest && \
ls -l server/CLAUDE.md reviewer-core/CLAUDE.md | grep -c '\->'
```

Expected: `2`. Anything less means a symlink was clobbered — restore it with
`ln -sf AGENTS.md <dir>/CLAUDE.md`.

- [ ] **Step 6: Full verification sweep**

```bash
cd /Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/server && \
  pnpm arch:check && pnpm arch:check:core && pnpm typecheck && pnpm test
```

Expected: all four pass. `typecheck` and `test` must be unaffected — this plan
changed no runtime source.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/README.md server/AGENTS.md reviewer-core/AGENTS.md
git commit -m "docs: point AGENTS.md at the onion dependency rule, drop the false routes claim"
```

---

## Out of scope

Deliberately not in this plan, per the spec's non-goals: renaming directories
to `domain/application/infrastructure`; introducing domain entities with
mappers over Drizzle rows; fixing the six baselined violations; refactoring
services to take explicit ports instead of `Container`; anything in `client/`.

Fixing the baselined violations is follow-up work — each is a small, separate
change (move the query into the module's service/repository, delete the
baseline entry, confirm `arch:check` stays green).
