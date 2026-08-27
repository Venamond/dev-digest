# skill-evals — the runner

Scores a skill by running its eval cases twice — once with the skill handed to
the reviewer, once without — then grading both against the same assertions and
reporting the delta.

**Cases and fixtures live inside the skill**, at
`.claude/skills/<skill>/evals/`, so they travel with it when it is shared.
Only the harness lives here.

```
.claude/skills/onion-architecture/evals/
  README.md      # what each case tests and why — for humans
  cases.json     # prompts, ground truth, assertions — for the runner
  fixtures/      # the change set under review, at real repo paths
skill-evals/
  prompts/       # reviewer + grader prompt templates
  scripts/       # aggregate.sh — benchmark + viewer
  workspace/     # gitignored results
```

## Running an iteration

There is no single-command runner: the two arms are agent invocations, not a
script. The loop is six dispatches plus six graders, and it is done from a
Claude Code session.

1. **Create the run directories** for the iteration:

   ```sh
   for c in d-parse-and-rowshape e-ports-and-secrets f-drift-and-handler; do
     mkdir -p skill-evals/workspace/iteration-N/$c/{with_skill,without_skill}/outputs
   done
   ```

2. **Dispatch both arms of every case in the same turn** — all six at once, not
   the skill arms first and the controls later. Build each prompt from
   `prompts/reviewer.md`, substituting the case's `prompt` from `cases.json`.

3. **Save timing as each agent returns.** The completion notification carries
   `total_tokens` and `duration_ms`; they exist nowhere else. Write
   `<run>/timing.json` as `{"total_tokens": N, "duration_ms": M,
   "total_duration_seconds": S, "tool_uses": T}` immediately.

4. **Dispatch one grader per run** using `prompts/grader.md`, injecting that
   case's `planted_violations`, `legal_distractors` and `assertions` from
   `cases.json`. Each writes `<run>/grading.json`.

5. **Aggregate and review:**

   ```sh
   ./skill-evals/scripts/aggregate.sh \
     skill-evals/workspace/iteration-N \
     skill-evals/workspace/iteration-N-1   # optional, shows the previous outputs
   ```

   Set `SKILL_CREATOR_DIR` if skill-creator is not at the default plugin path.

## Three things to know before wiring this into CI

**It calls a model.** Every other workflow in this repo is deliberately
LLM-free. This one cannot be. Budget one agent invocation per case per arm plus
one grader per run: three cases cost roughly 800k tokens for a full pass.
Trigger it on `workflow_dispatch` and on changes under `.claude/skills/**`, not
on every PR.

**A `claude -p` subprocess does not load a project-local skill from
`.claude/skills/`.** The with-skill arm therefore injects the skill *by path*
in the prompt. A runner relying on ambient loading scores both arms identically
and reports a delta of zero — which reads as "this skill does nothing" rather
than "the harness never reached the skill". If a delta ever comes back as
exactly zero across every case, suspect this first.

**Run-to-run variance is not measured yet.** One run per arm is one sample. Run
a single unchanged case several times and look at the spread before turning any
threshold into a blocking gate.

## What the eval set deliberately avoids

Import-graph violations do not discriminate: a reviewing agent with repo access
reads `server/.dependency-cruiser.cjs` and `AGENTS.md` and re-derives the ring
rules from source. See `.claude/skills/onion-architecture/evals/README.md` for
the measurement that established this and what replaced those cases.
