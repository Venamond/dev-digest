---
name: response-schema
description: Flag incompatible changes to response field types, nullability, or requiredness.
type: rubric
---

# Skill: response-schema

Focus on **response (and error) schema shape** — types, nullability, and whether fields stay present for callers that already deserialize them.

## Flag when

- A response field changes wire type (`string` ↔ `number`, object ↔ array, boolean ↔ enum string).
- A previously required response field becomes optional, nullable, or may be omitted.
- An optional request field becomes required without a default that preserves old callers.
- Status-code semantics change so clients reading `res.ok` / specific codes will mis-handle success vs failure.

## Do not flag when

- Internal TypeScript types change but the Zod / JSON schema emitted to clients is unchanged.
- New optional response fields are added.
- Nullability widens only behind a new API version path.

## Good / bad

**Bad — required field becomes optional (callers assume presence):**

```ts
// before
balance: z.number(),
// after
balance: z.number().optional(),
```

**Good — additive optional field; required fields unchanged:**

```ts
balance: z.number(),
balance_currency: z.string().optional(),
```

## Finding shape

- **Title:** Response schema change: `<field or status>`
- **Severity:** CRITICAL for type flips / removed required fields; WARNING for tightened request validation; SUGGESTION for documentation-only gaps.
- Quote the before/after schema lines from the diff.
