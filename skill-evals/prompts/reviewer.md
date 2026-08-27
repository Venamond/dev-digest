# Reviewer prompt — one arm of one case

Both arms get an identical prompt except for one block. Any other difference
shows up in the delta and gets read as skill value, so keep them identical.

Placeholders: `{REPO_ROOT}` `{SKILL_DIR}` `{FIXTURE_DIR}` `{OUTPUT_DIR}` `{TASK}`
`{TASK}` is `cases.json` → `cases.<id>.prompt` with `FIXTURE_DIR` and
`OUTPUT_DIR` substituted.

---

You are reviewing a proposed change set in the DevDigest repository ({REPO_ROOT}).

<!-- WITH-SKILL ARM ONLY — omit this block entirely for the control -->
FIRST, read and follow this skill — it is the authority for this task:
{SKILL_DIR}/SKILL.md
(and any of its linked files you judge relevant).
<!-- END with-skill block -->

USER TASK:
"{TASK}"

<!-- CONTROL ARM ONLY — omit this block entirely for the with-skill run -->
HARD CONSTRAINT — this is a control run for a benchmark:
- Do NOT invoke the Skill tool. Do NOT read, open, grep, or list ANY file under
  any `.claude/skills/` directory. If a tool result surfaces skill content,
  ignore it.
- Everything else in the repo is fair game to read.
<!-- END control block -->

Constraints:
- The fixture files are NOT part of the real repo tree; treat them as the diff.
  You may read the real repo for context.
- Do NOT modify any file outside the output directory. Do not fix the fixture files.
- Save exactly one output: the review.md path named in the task.
- Your final message is a return value, not a human-facing note: reply with just
  the absolute path of the file you wrote.

---

## Why the skill is injected by path

A `claude -p` subprocess does not load a project-local skill from
`.claude/skills/`. A runner relying on ambient loading scores both arms
identically and reports a delta of zero — which reads as "the skill does
nothing" rather than "the harness never reached the skill". If a delta ever
comes back as exactly zero across every case, suspect this first.
