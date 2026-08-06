/**
 * Seed skill bodies for demo agents (Test Quality + API Contract).
 * Idempotent by skill `name` in seed.ts. Keep in sync with importable
 * copies under docs/skills/. `deprecation-policy` is intentionally NOT
 * seeded — import it via the Skills Lab drawer to exercise that path.
 */

export interface SeedSkillDef {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const SEED_SKILLS: SeedSkillDef[] = [
  {
    name: 'happy-path-coverage-gap',
    description: 'Flag tests that only exercise the success path and miss failure branches.',
    type: 'rubric',
    body: `## Skill: happy-path-coverage-gap

When reviewing test diffs (or production code with accompanying tests), flag cases where tests only assert the happy path:

- A function has error / early-return / guard branches that no test exercises.
- Mocks always resolve successfully; reject/throw paths are never asserted.
- Only \`200\` / success statuses are tested while the handler returns \`4xx\`/\`5xx\`.

Report a finding when the uncovered branch is in the diff or clearly reachable from changed code. Prefer WARNING when a real failure mode is untested; SUGGESTION when the gap is minor.`,
  },
  {
    name: 'corner-case-checklist',
    description: 'Require boundary, error, and empty-input coverage in test changes.',
    type: 'rubric',
    body: `## Skill: corner-case-checklist

For new or substantially changed tests, check that the suite covers:

1. **Empty / null / undefined** inputs where the API allows them.
2. **Boundaries** — zero, one, max length, off-by-one on limits and pagination.
3. **Error paths** — thrown errors, rejected promises, validation failures.
4. **Idempotency / duplicates** when the production code claims them.

If the production change introduces a branch for any of the above and tests omit it, report a WARNING with the missing case named explicitly.`,
  },
  {
    name: 'over-mocking-smell',
    description: 'Flag mocks that hide real contracts and make tests lie about behavior.',
    type: 'rubric',
    body: `## Skill: over-mocking-smell

Flag test changes that over-mock so the test no longer exercises a real contract:

- Mocking the unit under test itself (or its immediate collaborator so heavily that assertions only check the mock was called).
- Stubbing return shapes that do not match the real module's types or Zod schemas.
- Replacing DB/HTTP with mocks that never fail, then claiming "integration" coverage.
- \`vi.mock\` of broad modules when a narrow stub or test double would preserve the contract.

Prefer SUGGESTION unless the mock clearly hides a bug class the PR claims to fix — then WARNING.`,
  },
  {
    name: 'flaky-test-patterns',
    description: 'Catch timing, order dependence, and shared mutable state in tests.',
    type: 'rubric',
    body: `## Skill: flaky-test-patterns

Flag patterns that commonly cause flaky CI:

- Bare \`setTimeout\` / \`sleep\` waits instead of condition-based waits.
- Reliance on test file or case execution order; shared module-level mutable state without reset.
- Real network / clock / randomness without injection or fake timers.
- Race-prone async assertions (\`expect\` before the promise settles).
- Parallel-unsafe use of a shared DB row, temp file, or port.

Report WARNING when the pattern is in newly added tests; SUGGESTION when tightening an existing flaky pattern in the diff.`,
  },
];

/** Skills linked to API Contract Reviewer on seed (import `deprecation-policy` separately). */
export const API_CONTRACT_SEED_SKILLS: SeedSkillDef[] = [
  {
    name: 'breaking-change',
    description: 'Flag removal or rename of a public API route, method, param, or response field.',
    type: 'rubric',
    body: `## Skill: breaking-change

When reviewing API diffs, flag **breaking changes to a public contract** — anything that makes an existing client fail without a coordinated migration in the same PR.

## Flag when
- A public route path, HTTP method, or path/query parameter is removed or renamed.
- A field is removed or renamed in a response body, error envelope, or webhook payload.
- A request field that clients already send is rejected after the change (new required field, removed enum value).

## Do not flag when
- The change is purely additive (new optional field, new route, new enum value).
- The renamed symbol is clearly internal.
- The PR includes a dual-read / dual-write or versioned path that keeps the old contract working.

## Good / bad
**Bad** — rename \`user_id\` → \`id\` in a shared response DTO with no alias.
**Good** — keep \`user_id\` as a deprecated optional alias while adding \`id\`.

## Finding shape
- **Title:** Breaking change: \`<what broke>\`
- **Severity:** CRITICAL when an existing client will fail at runtime; WARNING when likely but ambiguous.
- Cite old/new shapes with \`file:line\` from the diff.`,
  },
  {
    name: 'response-schema',
    description: 'Flag incompatible changes to response field types, nullability, or requiredness.',
    type: 'rubric',
    body: `## Skill: response-schema

Focus on **response (and error) schema shape** — types, nullability, and whether fields stay present for callers that already deserialize them.

## Flag when
- A response field changes wire type (\`string\` ↔ \`number\`, object ↔ array).
- A previously required response field becomes optional, nullable, or may be omitted.
- An optional request field becomes required without a default.
- Status-code semantics change so clients mis-handle success vs failure.

## Do not flag when
- Internal TypeScript types change but the Zod / JSON schema is unchanged.
- New optional response fields are added.

## Good / bad
**Bad** — \`balance: z.number()\` → \`balance: z.number().optional()\`.
**Good** — keep \`balance\` required; add \`balance_currency: z.string().optional()\`.

## Finding shape
- **Title:** Response schema change: \`<field or status>\`
- **Severity:** CRITICAL for type flips / removed required fields; WARNING for tightened request validation.`,
  },
  {
    name: 'semver-discipline',
    description: 'Require a major version bump (or dual-version path) when a change is incompatible.',
    type: 'rubric',
    body: `## Skill: semver-discipline

When a diff introduces an **incompatible** public API change, require an explicit major-version signal or a compatibility shim.

## Flag when
- A breaking route/schema change lands with no package/OpenAPI major bump, no \`/v2\` path, and no migration note.
- \`version\` stays on the same major while the wire contract is incompatible.
- The PR claims "non-breaking" but removes or renames a public field/route.

## Do not flag when
- Changes are backward-compatible (additive).
- Only private/internal modules change.

## Good / bad
**Bad** — rename \`/v1/charges/:id\` → \`/v1/payments/:id\` with version \`1.4.2\` unchanged.
**Good** — add \`/v2/payments/:id\`, keep \`/v1/charges/:id\`, bump to \`2.0.0\`.

## Finding shape
- **Title:** Semver: incompatible change needs major (or dual path)
- **Severity:** WARNING (CRITICAL only with an undocumentated hard break).`,
  },
];
