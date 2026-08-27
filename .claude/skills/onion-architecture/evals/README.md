# `onion-architecture` — eval set

Three cases that score this skill by running the same review task twice: once
with the skill handed to the reviewer, once without, then grading both against
the same assertions and reporting the delta.

Cases and fixtures live **here, inside the skill**, so they travel with it.
Only the runner lives elsewhere (`skill-evals/` at the repo root).

```
evals/
  README.md      # this file — what each case tests and why
  cases.json     # prompts, ground truth, assertions — for the runner
  fixtures/      # the change set under review, at real repo paths
```

## What these cases deliberately do NOT test

Import-graph violations. An earlier iteration planted them (a route importing
`drizzle-orm`, `node:fs` inside `reviewer-core`, an adapter importing a
service) and the **no-skill arm scored higher than the skill arm** — 5/5 vs
3/5 on one case. The reason showed up in the transcripts: the control read
`server/.dependency-cruiser.cjs` and `AGENTS.md` itself and re-derived every
ring rule from source. All three control runs cited the config by name.

Those rules are already executable. A skill that restates them measures
nothing. So every violation planted here is one **no import edge expresses** —
the judgment calls, the grandfathered exceptions, the conventions that live
only in prose.

## The cases

| id | fixture | what it plants |
| --- | --- | --- |
| `d-parse-and-rowshape` | `case-d-parse-and-rowshape` | double boundary-parse; `$inferSelect` leaking out of the repository into a route's response type; `.nullable()` where `.nullish()` is meant |
| `e-ports-and-secrets` | `case-e-ports-and-secrets` | `process.env` read in an adapter instead of `SecretsProvider`; `Container` in a new service's constructor; port added without its `ContainerOverrides` field or a mock |
| `f-drift-and-handler` | `case-f-drift-and-handler` | server/client `vendor/shared` drift; severity rollup and cost math inline in a route handler; a transaction handle threaded into a ring-0 helper |

Each case carries exactly 3 planted violations and 3 **legal distractors** —
constructs that look wrong and are not. A run that flags a distractor fails the
precision assertion. The distractors are the point: they separate a reviewer
that knows the rule from one pattern-matching on shape.

## Measured baseline

Two questions have been run against this set. Numbers are one sample per arm.

**Does the skill beat no skill?** (2026-08-27, 5 assertions per case)

| case | with skill | without skill |
| --- | --- | --- |
| `d-parse-and-rowshape` | 5/5 | 5/5 |
| `e-ports-and-secrets` | 5/5 | 4/5 |
| `f-drift-and-handler` | 5/5 | 4/5 |
| **total** | **15/15** | **13/15** |

**Does skill v2 beat v1?** (2026-08-27, 7 assertions per case, three blind
graders each judging both arms of one case without knowing which is which)

v2 = v1 plus `rules/module-boundaries.md`, its "Read next" row, a "Where does
this go?" bullet and three `review-checklist.md` rows — 652 → 770 lines.

| case | v2 | v1 | what separated them |
| --- | --- | --- | --- |
| `g-module-boundaries` | **7/7** | 6/7 | v1 demoted V1 to LOW, arguing the cross-module `helpers.ts` import is "precedented" |
| `e-ports-and-secrets` | 6/7 | 6/7 | both demoted V3 below the top band |
| `f-drift-and-handler` | 6/7 | 6/7 | v2 flagged distractor D2; v1 demoted V2 to HIGH |
| **total** | **19/21** | 18/21 | v2 was also ~23s faster and ~5.6k tokens cheaper |

An identical run with 5 assertions scored **15/15 for both versions** — the
delta only appears once band placement is graded.

**The one reproducible signal.** Both arms find the violations; they disagree
about how serious one *is*. Across every run so far the weaker arm reaches the
same place: it greps the repo, finds the pattern in existing code, and files a
planted violation as house style. `constructor(private container: Container)`
was cleared as "the established pattern, not a violation" with eleven existing
services cited; the cross-module `toAgentDto` import was demoted as
"precedented". The repo shows the practice; only the skill's prose says the
practice is grandfathered and must not be extended. That is its load-bearing
content.

Band-placement failures: **v1 in 3 of 3 cases, v2 in 1 of 3.**

## Known weaknesses — read before trusting a number

- **One run per arm is one sample.** No threshold here is safe as a blocking
  CI gate until the spread is measured. Run one unchanged case ~5 times first.
- **`d-parse-and-rowshape` does not discriminate** (5/5 both arms). Its fixture
  carries roughly a dozen unplanted real defects that give both arms abundant
  material, and the control derived "arch:check cannot catch this" unaided.
  Trim the fixture before relying on this case.
- **Assertion 6 fails almost everywhere** (5 of 6 arms in the v2-vs-v1 run).
  An assertion that nearly always fails discriminates no better than one that
  always passes. `e-ports-and-secrets`' V3 is compound — an absent override
  field plus an absent mock — and both arms split it into two lower-band
  findings. Either split V3 into two assertions or drop the band requirement
  for compound violations.
- **The factual-accuracy edge did not survive instruction.** In the first
  v2-vs-v1 run, the v1 arm carried a materially false supporting claim in 3 of
  3 cases and v2 in none. Once the reviewer prompt told *both* arms to verify
  every identifier and line reference, assertion 7 passed for all six arms.
  Treat that earlier signal as a prompt artifact, not a property of the skill.
- **Token cost did not replicate across runs.** Iteration 1 had the skill arm
  cheaper in 3 of 3 cases; iteration 2 had it 4.5k tokens *more* expensive.
  Directionally it is cheaper more often than not; do not quote a figure.

## Packaging caveat

`skill-creator`'s `scripts/package_skill.py` carries
`ROOT_EXCLUDE_DIRS = {"evals"}` and strips a directory named `evals/` at the
skill root from a packaged `.skill`. This directory is named `evals/` by
choice: this repo delivers skills through git (and a `tile.json` manifest, see
`.claude/skills/fastify-best-practices/tile.json`), not through that packager.
If you ever do package this skill into a `.skill` archive, rename this
directory first or the eval set will silently not be in the archive.
