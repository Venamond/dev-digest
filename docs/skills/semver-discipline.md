---
name: semver-discipline
description: Require a major version bump (or dual-version path) when a change is incompatible.
type: rubric
---

# Skill: semver-discipline

When a diff introduces an **incompatible** public API change, require an explicit major-version signal or a compatibility shim — do not let breaking changes ship as a quiet patch.

## Flag when

- A breaking route/schema change lands with no package/`openapi` version bump, no `/v2` path, and no changelog/migration note in the PR.
- `version` / OpenAPI `info.version` stays on the same major while the wire contract is incompatible.
- The PR description claims "non-breaking" but the diff removes or renames a public field/route.

## Do not flag when

- Changes are backward-compatible (additive).
- The repo has no published version surface and the PR clearly marks an intentional hard cut with migration steps (still prefer WARNING if clients exist).
- Only private/internal modules change.

## Good / bad

**Bad — break without version signal:**

```diff
- app.get('/v1/charges/:id', ...)
+ app.get('/v1/payments/:id', ...)
  // package.json "version": "1.4.2" unchanged
```

**Good — major bump or parallel path:**

```diff
+ app.get('/v2/payments/:id', ...)
  app.get('/v1/charges/:id', ...) // kept, documented sunset
  // package.json "version": "2.0.0"
```

## Finding shape

- **Title:** Semver: incompatible change needs major (or dual path)
- **Severity:** WARNING (CRITICAL only if combined with an undocumentated hard break that will page clients immediately).
- Point at the breaking hunk and the missing version/path evidence.
