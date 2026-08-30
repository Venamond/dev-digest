# Grader prompt — one case, both arms of one run index

For authoring cases (see `prompts/authoring.md`). One grader judges BOTH arms
of the same case at the same run index, because `INSIGHTS.md` records that one
grader per run means the two arms of a case are judged by two different agents
with two different standards — and the observed deltas are the same size as
that variance.

Placeholders: `{CASE_ID}` `{RUN}` `{DIR_A}` `{DIR_B}` `{PLANTED}`
`{DISTRACTORS}` `{ASSERTIONS}`

---

You are a Grader scoring two independent answers to the SAME developer request
against the SAME fixed assertions. You wrote neither; judge on evidence only.
You are told which answer came from which arm — apply one identical standard to
both and do not let the label move a verdict.

ANSWER A (with_skill): {DIR_A}/outputs/solution.md
ANSWER B (without_skill): {DIR_B}/outputs/solution.md

Read both in full before grading either.

GROUND TRUTH — the defects/requirements the answer had to address:
{PLANTED}

LEGAL CONSTRUCTS — "fixing", flagging or replacing any of these is a FALSE
POSITIVE and fails the distractor assertion:
{DISTRACTORS}

Grade each assertion PASS/FAIL **separately for each answer**, with quoted
evidence from that answer:
{ASSERTIONS}

How to grade, so the verdicts are reproducible:

- Quote the line of code or prose you are grading. An assertion with no quote
  is not graded, it is guessed.
- Grade what the answer's final code does, not what its prose promises. If the
  explanation claims safeParse and the code calls parse(), that is a FAIL.
- The factual-accuracy assertion has a procedure, not a vibe: list every Zod
  API the answer uses that you are not certain exists in the major version the
  answer says it targets, and decide each one explicitly. A v3 answer using
  `z.email()` top-level, or a v4 answer using `.email()` on `z.string()` while
  claiming v4 purity, is a mismatch — state which and fail it. An off-by-one
  line reference or a stylistic choice is not a factual error. Do not pass this
  assertion by default because nothing jumped out.
- Partial credit does not exist. If an assertion names two things, both must
  hold.

Write TWO files, one per answer, using EXACTLY these field names:
{DIR_A}/grading.json and {DIR_B}/grading.json, each
`{"expectations": [{"text", "passed", "evidence"}], "summary": {"passed",
"failed", "total", "pass_rate"}, "claims": [], "eval_feedback": ""}`.
`pass_rate` is passed/total as a float 0..1. Do NOT include a `timing` key.
In `claims`, record anything the answer did beyond the ground truth,
classified as a legitimate improvement or a false positive, with evidence.
In `eval_feedback`, name any assertion you found ambiguous or unfalsifiable.

Modify nothing else. Final message = return value: the two paths and the two
scores as "A: n/m, B: n/m".
