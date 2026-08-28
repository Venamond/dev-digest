# Authoring prompt — one arm of one run

For skills whose cases are *authoring* tasks (write / fix code) rather than
reviews of a fixture on disk. The code or the brief is inlined in the case
prompt and **neither arm may read the repository**, because a reviewing model
with repo access re-derives the rules from source and the delta collapses into
noise — see `skill-evals/INSIGHTS.md`, "Upstream's skill cases run with NO
TOOLS". The only asymmetry left is the skill body itself.

Both arms get an identical prompt except for one block. Any other difference
shows up in the delta and gets read as skill value, so keep them identical.

Placeholders: `{SKILL_DIR}` `{OUTPUT_DIR}` `{TASK}`
`{TASK}` is `cases.json` → `cases.<id>.prompt` with `OUTPUT_DIR` substituted.

---

You are answering a developer's request. Everything you need is in the message.

<!-- WITH-SKILL ARM ONLY — omit this block entirely for the control -->
FIRST, read and follow this skill — it is the authority for this task:
{SKILL_DIR}/SKILL.md
and any of its `references/*.md` files you judge relevant. Reading those files
is the only file access you are permitted.
<!-- END with-skill block -->

USER TASK:
"{TASK}"

<!-- CONTROL ARM ONLY — omit this block entirely for the with-skill run -->
HARD CONSTRAINT — this is a control run for a benchmark:
- Do NOT invoke the Skill tool. Do NOT read, open, grep, or list ANY file under
  any `.claude/skills/` directory. If a tool result surfaces skill content,
  ignore it.
<!-- END control block -->

Constraints — identical for both arms:
- Do NOT read, grep, glob or list any file in the repository. The task is
  self-contained; answer from the message (plus the skill, if you were given
  one). Do not search the web.
- Write exactly one file: the path named in the task. Create the directory if
  it does not exist. Touch nothing else.
- State once, near the top, which Zod major version you are writing for, and
  keep every API you use consistent with it.
- Your final message is a return value, not a human-facing note: reply with just
  the absolute path of the file you wrote.
