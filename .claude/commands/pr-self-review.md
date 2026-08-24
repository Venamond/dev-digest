---
description: Review the local change set against DevDigest's skills before opening a PR
argument-hint: "[--dry-run | --parallel]"
---

Invoke the `pr-self-review` skill now against the current local change set
(everything that would land in the PR: committed on the branch, staged,
unstaged, and untracked).

- If `--dry-run` was passed: print only the routing decision — files with
  their statuses, the skills each routes to, the gates that would run — and
  stop there.
- If `--parallel` was passed: run the review with one subagent per cluster
  (backend-architecture, backend-data, frontend, security) instead of
  inline.
- Otherwise: run the full procedure inline and report the verdict.
