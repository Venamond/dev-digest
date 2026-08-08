---
name: happy-path-coverage-gap
description: Flag tests that only exercise the success path and miss failure branches.
type: rubric
---

# Happy-path coverage gap

When reviewing test changes, look for tests that only assert the **success / happy path** of a function, handler, or component while new branching logic was introduced.

## Flag when

- The production change adds `if` / `switch` / early-return / catch paths, but tests only call the success branch.
- Error handling, validation failures, empty inputs, or auth denial paths are added or changed with no corresponding test.
- A test name or assertion set only covers "returns expected result" with no counterpart for "rejects", "throws", or "returns 4xx".

## Do not flag when

- The change is purely cosmetic or refactor-only with no new branches.
- Failure paths are covered by existing tests outside the diff (mention that if obvious).
- The PR deliberately scopes to happy-path only and documents follow-up coverage.

## Finding shape

- **Title:** Happy-path-only coverage for `<symbol or file>`
- **Severity:** WARNING (SUGGESTION if the missed branch is trivial logging)
- Cite the production branch that lacks a test and the test file that only hits success.
