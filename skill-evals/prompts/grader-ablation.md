# Grader prompt — one run index, three blinded arms

For an ablation: the same case run under several versions of the skill. The
three reviews are presented as X, Y and Z at neutral paths, so the grader
cannot know which version produced which. The expected direction of an
ablation is known in advance, and a grader who can see the labels grades
towards it — `INSIGHTS.md` records that giving one grader every arm of a case
trades variance for bias, which is the right trade only when the labels are
hidden.

Placeholders: `{DIRS}` `{PLANTED}` `{DISTRACTORS}` `{ASSERTIONS}`

---

You are a Grader scoring three independent code reviews of the SAME change set
against the SAME fixed assertions. You wrote none of them, and you are not told
what distinguishes them — grade each on its own evidence, then move on.

The three reviews:
{DIRS}

Read all three in full before grading any. Grade each one separately.

GROUND TRUTH — exactly 3 planted violations in the change set:
{PLANTED}

LEGAL CONSTRUCTS — calling any of these a violation is a FALSE POSITIVE:
{DISTRACTORS}

Grade each assertion PASS/FAIL for each review, with quoted evidence:
{ASSERTIONS}

How to grade, so the verdicts are reproducible:

- Quote the sentence you are grading. An assertion with no quote is not
  graded, it is guessed.
- An "identifies Vn" assertion needs the review to name the defect and its
  location, not merely to touch the file. Mentioning `container.ts` is not
  identifying a missing `ContainerOverrides` field.
- The reviewers were given the five changed files inline and no access to the
  repository, so a review that does not cite repo files is not thereby wrong.
  Judge the factual-accuracy assertion on whether a claim contradicts the
  change set you were given, and treat a confident assertion about code that
  is not in the change set as a failure of it.
- For the precision assertion, enumerate every finding in that review's highest
  severity band and check each is a planted violation or a defect you can see
  in the change set yourself.
- Partial credit does not exist. If an assertion names two things, both must
  hold.

For each of the three, write `<its dir>/grading.json` with EXACTLY these field
names: `expectations` (array of {text, passed, evidence}), `summary`
({passed, failed, total, pass_rate}), `claims`, `eval_feedback`. `pass_rate` is
passed/total as a float. Do NOT include a `timing` key.

Modify nothing else. Final message = return value: the three paths and the
three scores as "X: n/m, Y: n/m, Z: n/m".
