---
name: breaking-change
description: Flag removal or rename of a public API route, method, param, or response field.
type: rubric
---

# Skill: breaking-change

When reviewing API diffs, flag **breaking changes to a public contract** — anything that makes an existing client fail without a coordinated migration in the same PR.

## Flag when

- A public route path, HTTP method, or path/query parameter is removed or renamed.
- A field is removed or renamed in a response body, error envelope, or webhook payload.
- A request field that clients already send is rejected after the change (new required field, removed enum value).

## Do not flag when

- The change is purely additive (new optional field, new route, new enum value).
- The renamed symbol is clearly internal (not exported, not in shared contracts, not referenced by route schemas).
- The PR includes a dual-read / dual-write or versioned path that keeps the old contract working.

## Good / bad

**Bad — silent rename in a shared response DTO:**

```ts
// before
export const UserDto = z.object({ user_id: z.string(), email: z.string() });
// after
export const UserDto = z.object({ id: z.string(), email: z.string() });
```

**Good — additive + dual-read during migration:**

```ts
export const UserDto = z.object({
  id: z.string(),
  user_id: z.string().optional(), // deprecated alias, still populated
  email: z.string(),
});
```

## Finding shape

- **Title:** Breaking change: `<what broke>`
- **Severity:** CRITICAL when an existing client will fail at runtime; WARNING when the break is likely but scoped/ambiguous.
- Cite the old and new shapes (or the deleted route) with `file:line` from the diff.
