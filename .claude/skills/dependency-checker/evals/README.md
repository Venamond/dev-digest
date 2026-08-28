# `dependency-checker` — eval set

Two authoring cases plus a triggering set. The runner lives in `skill-evals/`;
only the cases live here, so they travel with the skill.

## Shape

Both cases inline a collector JSON in the prompt and forbid every arm from
reading the repository. That is deliberate: with repo access an arm re-runs
`du` and `npm audit` itself and the skill's rules stop being the only source of
the priority table, the `own_kb`/`exclusive_kb` distinction and the
not-installed rule. `skill-evals/INSIGHTS.md` records four iterations that
saturated exactly this way.

| id | fixture | what it tests |
|---|---|---|
| `a-real-repo-report` | the real 2026-08-27 collector run, trimmed | ranking by `scope` not severity, `not installed` ≠ 0, untrustworthy sizes dropped not estimated, `exclusive_kb` quoted by name, disk weight not sold as bundle weight |
| `b-clean-no-priorities` | derived from A, verified P0=P1=P2=0 | the negative: does the report invent priorities when the data has none |

## The negative case, and why it is verified rather than asserted

`b-clean-no-priorities` is A with every prod-scope `high`/`critical` advisory
removed, `majors_behind` capped at 1, `client`'s prod packages shrunk under
1 MB, the version splits unified and `e2e` installed. It still carries the bait
a severity-only ranking falls for: `vitest` is `critical` and `vite`, `nanoid`
and `postcss` are `high` — all `scope: dev`, so all P3 under the skill's table.

A "clean" fixture nobody checked rewards the arm that never looked, so the
claim is machine-derived, not authored:

```sh
python3 .claude/skills/dependency-checker/evals/verify-fixture.py \
  .claude/skills/dependency-checker/evals/fixtures/case-b-clean-no-priorities.json
# P0: 0   P1: 0   P2: 0   P3: 19
```

The same script over case A prints P0: 18, P1: 5, P2: 3 — which is where that
case's ground truth comes from. Re-run it after touching either fixture.

## What was deliberately left out of the assertions

Removed because any model passes them without the skill, so they measure the
model's floor and dilute the score:

- "the output is Markdown with a verdict and a priority table"
- "it recommends removing unused dependencies"
- "it groups advisories by severity"

Removed because no evidence can settle them:

- "the report is actionable" / "the diagrams are useful"
- "the priorities are the right ones for this team"

Kept out for now but a fair candidate for a sixth assertion: *every mermaid
block parses* — mechanically checkable with `scripts/check-diagrams.mjs`, but
the arm cannot run it under the no-tools rule, so only the grader could.

## Triggering

`trigger-eval.json` — 10 should-trigger and 10 should-not-trigger queries for
`scripts/run_loop.py`'s description optimisation. The negatives are near
misses, not filler: DI-in-a-constructor (the word "dependency", the wrong
subject), a failing `pnpm install`, adding a package, a `dependency-cruiser`
rule question that belongs to `onion-architecture`, a licence inventory the
skill does not produce, and a Docker image size that is not `node_modules`.
A negative that shares no vocabulary with the skill tests nothing.
