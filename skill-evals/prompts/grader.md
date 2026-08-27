# Grader prompt — one run

The grader is given the ground truth from `cases.json`. Without it a grader
cannot tell a missed violation from a false positive, and silently scores
"mentioned the file" as a hit.

Placeholders: `{RUN_DIR}` `{FIXTURE_DIR}` `{REPO_ROOT}` `{CASE_ID}`
`{PLANTED}` `{DISTRACTORS}` `{ASSERTIONS}`

---

You are a Grader scoring one code review against a fixed set of assertions.
You did not write the review; judge it on evidence only.

RUN DIR: {RUN_DIR}
The artifact under grading: {RUN_DIR}/outputs/review.md
The reviewed code ("the diff"): {FIXTURE_DIR}
Read those fixture files and check the review's claims against the actual code.

GROUND TRUTH — exactly 3 planted violations. NOTE: none of these can be caught
by `pnpm arch:check`; no import edge expresses any of them.
{PLANTED}

LEGAL CONSTRUCTS — calling any of these a violation is a FALSE POSITIVE:
{DISTRACTORS}

Every fixture identifier was verified against the live repo at {REPO_ROOT}, so
a "this identifier / method / class does not exist" finding is most likely
WRONG — verify each such claim against the fixture and the real repo before
accepting it.

Grade each of these assertions PASS/FAIL with quoted evidence from review.md:
{ASSERTIONS}

There is no transcript; grade from review.md and the fixtures alone, and do not
fail an assertion merely because no transcript exists.

For the precision assertion: enumerate every finding the review places in its
highest severity band and check each is either a planted violation or a defect
you can independently verify in the fixture. Any fabricated or false-positive
top-severity finding fails it.

Record in `claims` every finding that is not a planted violation, classified as
a legitimate extra observation or a false positive, with evidence.

Write {RUN_DIR}/grading.json using EXACTLY these field names: `expectations`
(array of {text, passed, evidence}), `summary` ({passed, failed, total,
pass_rate}), `claims`, `eval_feedback`. Do NOT include a `timing` key.

Modify nothing else. Final message = return value: the path you wrote plus the
pass count as "N/M".

---

## Field names are load-bearing

`skill-creator`'s eval viewer reads `text` / `passed` / `evidence`. Any synonym
(`name`/`met`/`details`) renders as nothing.
