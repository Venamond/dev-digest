---
name: deprecation-policy
description: Require deprecation markers instead of silently deleting public API surface.
type: rubric
---

# Skill: deprecation-policy

Public API surface must be **deprecated before deletion**. Flag silent removals and teach the preferred pattern.

## Flag when

- A public route, method, or response field is deleted with no prior deprecation marker in the same codebase area and no sunset note in the PR.
- A replacement is introduced while the old name disappears in one commit with no alias.
- Docs/changelog claim deprecation but the code hard-removes the symbol.

## Do not flag when

- The symbol was never public (test-only, internal helper).
- The PR only adds `@deprecated` / `deprecated: true` / dual-write without removing the old path yet.
- Removal follows an already-documented sunset that is clearly acknowledged in the PR.

## Good / bad

**Bad — silent delete:**

```ts
// removed entirely
// GET /v1/invoices/:id
```

**Good — deprecate, keep serving, document sunset:**

```ts
/**
 * @deprecated Use GET /v2/invoices/:id. Removed after 2026-12-01.
 */
app.get('/v1/invoices/:id', legacyInvoiceHandler);
app.get('/v2/invoices/:id', invoiceHandler);
```

## Finding shape

- **Title:** Deprecation missing for removed `<route or field>`
- **Severity:** WARNING for silent deletes of public surface; SUGGESTION when a replacement exists but deprecation docs are thin.
- Cite the deletion hunk; suggest the dual-path pattern above.
