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

## Experiments run (2026-08-27–28)

Four runs against this harness (plus a sibling one in the separate `evals/`
package). Full trace and per-assertion numbers for each live in
`skill-evals/INSIGHTS.md`; this is the index.

| # | What | Cases / where | Result |
|---|---|---|---|
| 1 | Skill `zod`, baseline benchmark | `.claude/skills/zod/evals/cases.json`, 2 cases × 5 runs × 2 arms | **98.9% ± 4% vs 90.0% ± 8%** (+9pp) |
| 2 | Ablate `onion-architecture` (delete 4 lines of `rules/ports-adapters-di.md`), then author a new skill's cases | `.claude/skills/onion-architecture/evals/`, workspace `onion-ablation-1`; new set at `.claude/skills/dependency-checker/evals/` | Targeted assertion **5/5 → 0/5 → 5/5**; the new `dependency-checker` set separately gave **95% vs 52%** (+43pp), the cleanest delta of the four |
| 3 | A/B `architecture-reviewer`'s own definition (delete the "name the rule" clause) | `.claude/agents/evals/architecture-reviewer.cases.json`, workspace `agent-ab-1` | Rule-attribution **100% → 23% → 95%**; all 7 control assertions held flat |
| 4 | Whole-workflow harness: dispatch / positive activation / negative activation / CLAUDE.md contrast | **Different package** — `evals/workflow/experiment4.cases.ts` (`@devdigest/evals`'s `WorkflowCase` DSL, not this one) | 4/4 pass on real tool-call/file-read evidence, after two case-design misfires (see `evals/INSIGHTS.md`) |

Two methodological findings surfaced repeatedly enough to matter for anyone
extending this harness:

- **A compound assertion ("every X" / "both halves") measures its own tail,
  not the effect under test.** It cost experiment 2 its clean signal on one
  assertion and experiment 3 its signal on another — both times the mechanical
  pass rate moved exactly as expected while the compound assertion sat flat.
  Split "identify Vn" from "Vn's supporting half" before trusting either.
- **Blind the arms whenever the expected direction is known.** Every
  ablation/A-B run above copied outputs to neutral `X`/`Y`/`Z` paths with a
  decode key opened only after grading — a directionally-aware grader
  otherwise trades variance for bias, which is not a fair trade for a result
  anyone will cite.

The "run-to-run variance is not measured yet" caveat two sections up is now
stale for the *skill* tier specifically — experiments 1 and 2 both ran 5
samples per arm and reported mean ± stddev. It still holds for anything run
as a single sample, which the ablation/A-B *per-assertion* breakdowns above
are (5 runs, but each condition's assertion table is one 5-run series, not
yet repeated at a second n=5 to check the spread of the spread).

## What the eval set deliberately avoids

Import-graph violations do not discriminate: a reviewing agent with repo access
reads `server/.dependency-cruiser.cjs` and `AGENTS.md` and re-derives the ring
rules from source. See `.claude/skills/onion-architecture/evals/README.md` for
the measurement that established this and what replaced those cases.
