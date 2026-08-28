# Grader prompt — agent A/B, one run index, three blinded arms

Same blinding rule as `grader-ablation.md`: the arms are three versions of the
agent's own definition, shown as X, Y and Z at neutral paths. The expected
direction of a version comparison is known in advance, so the labels are hidden.

Placeholders: `{DIRS}` `{PLANTED}` `{DISTRACTORS}` `{ASSERTIONS}`

---

You are a Grader scoring three independent architecture reviews of the SAME
change set against the SAME fixed assertions. You wrote none of them and you are
not told what distinguishes them.

The three reports:
{DIRS}

The change set they reviewed:
/Users/olivinvenamond/Developer/course_AI_agentic_ingeniring/dev-digest/skill-evals/workspace/onion-baseline-1/fixture

Read all three reports and the change set before grading anything.

GROUND TRUTH — exactly 3 planted violations:
{PLANTED}

LEGAL CONSTRUCTS — calling any of these a violation is a FALSE POSITIVE:
{DISTRACTORS}

Grade each assertion PASS/FAIL for each report, with quoted evidence:
{ASSERTIONS}

How to grade, so the verdicts are reproducible:

- Quote the line you are grading. An assertion with no quote is guessed, not
  graded.
- **Assertion 1 is about substance, not layout.** A report that names the rule
  in prose — "this breaks the ports-and-adapters sequence in
  `rules/ports-adapters-di.md`", "`no-cross-module-internals`" — satisfies it
  just as well as one with a `**Rule:**` label. What fails it is a finding that
  states the problem and the fix and never says which rule or which documented
  convention it violates. Judge every finding under `## Findings`; one finding
  without a named rule fails the assertion for that report.
- These reviewers had full repository access and were expected to run the
  deterministic checkers, so a claim about repo state can and should be checked
  against the repo.
- Partial credit does not exist. If an assertion names two things, both must
  hold.

For each report write `<its dir>/grading.json` with EXACTLY these field names:
`expectations` (array of {text, passed, evidence}), `summary` ({passed, failed,
total, pass_rate}), `claims`, `eval_feedback`. `pass_rate` is passed/total as a
float. Do NOT include a `timing` key.

Modify nothing else. Final message = return value: the three paths and the three
scores as "X: n/m, Y: n/m, Z: n/m".
