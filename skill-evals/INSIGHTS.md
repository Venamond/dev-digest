# `skill-evals` — insights

Append-only. Every entry must pass the cold test: an agent with zero session
context reads it and knows exactly what to do — no "be careful with X", only
"X breaks under Y, do Z instead", with a file/command when relevant. Treat this
file as a **draft to spot-check**, not ground truth.

## Tool & Library Notes

**The agent registry is cached at session start — editing `.claude/agents/*.md`
mid-session does not reach agents you spawn afterwards.** Verified: after
deleting the "named rule" clause from `architecture-reviewer.md`, a probe agent
spawned with `subagent_type: architecture-reviewer` quoted the *deleted* text
back verbatim with **zero tool uses**, so it came from its system prompt, not
from disk. Any A/B of an agent definition run this way scores both versions
identically and reports a delta of zero, which reads as "the requirement does
nothing".

The canary costs one small agent and is decisive: ask it to quote the exact
constraint you edited, verbatim, and forbid it from doing anything else. Zero
tool uses plus the old wording means cached. The fix is the same one
`prompts/authoring.md` uses for skills — write both versions to files outside
`.claude/`, hand the path to a `general-purpose` agent as "your operating
instructions are in this file", and keep everything else in the wrapper
identical. That also lets all conditions run in parallel, since the condition
is a path rather than the state of a tracked file.


**Blind the arms whenever the expected direction is known, and keep the
blinding scaffolding out of the workspace.** One grader per run index judging
every arm is right for consistency, but for an ablation the grader knows which
way the result "should" go. Copy the outputs to neutral `X/Y/Z` directories
under a fixed rotation, write a `KEY.json`, grade, then copy each verdict back
onto its real run. Put those copies **outside** the iteration directory:
`eval-viewer/generate_review.py` walks recursively, treats any directory with an
`outputs/` child as a run, and dies with
`TypeError: '<' not supported between instances of 'int' and 'NoneType'` when
one of them has no `eval_metadata.json` — its `eval_id` comes back `None` and
the sort key mixes `None` with `int`. A leading dot does not save you from the
viewer; it only hides the directory from `aggregate.sh`'s glob.


`aggregate_benchmark.py` hardcodes `metadata.runs_per_configuration = 3` (a
literal in the dict it builds, not a count of what it read), so `benchmark.md`
states "3 runs each per configuration" whatever you actually ran. The `runs`
array and every mean/stddev are correct — only that one line lies, and it is
the line a reader uses to judge whether a delta is worth anything.
`scripts/aggregate.sh` now recomputes the field from the aggregated runs and
rewrites both files, so quote our copy, never the plugin's stdout.


`skill-creator` ships two consumers of a workspace and they expect **different
layouts**. Do not assume one directory tree satisfies both.

- `eval-viewer/generate_review.py` walks recursively and treats any directory
  containing an `outputs/` subdirectory as a run. It finds `eval_metadata.json`
  and `grading.json` in either the run directory or its parent. Flexible —
  point it at `iteration-N/` and it works.
- `scripts/aggregate_benchmark.py` globs `eval-*/` then `<config>/run-*/` and
  reads `grading.json` from the `run-*` level. A workspace laid out as
  `iteration-N/<case>/<arm>/` matches nothing and the aggregator reports
  `Directory not found`.

`scripts/aggregate.sh` bridges this with a throwaway symlink shim under
`.bench-shim/`. If the aggregator ever starts returning empty stats, check the
shim's shape first, not the grading files.

Two path traps in that same script, both already fixed but easy to reintroduce:

- The aggregator must be invoked as `python3 -m scripts.aggregate_benchmark`
  **from skill-creator's own directory**, so any workspace path passed to it
  has to be absolute. A relative path silently resolves against skill-creator's
  tree.
- skill-creator's plugin cache is not always under `~/.claude`. On this machine
  it is `~/.claude-max/plugins/cache/...`. The script probes both and honours
  `SKILL_CREATOR_DIR`.

## Recurring Errors & Fixes

**A number in the case prompt can leak into a report as an unverified "fact",
independent of the skill.** `b-clean-no-priorities`'s prompt says "last month's
report had four items in P0... I mostly want to know whether anything new came
up" — one `with_skill` run wrote "the four P0 items from last month stay
cleared" as a stated fact, which is not derivable from the supplied JSON. A
grader caught it and failed assertion 3 (no invented figures) on that arm. The
fixture never claims four historical P0 items exist; the prompt's scene-setting
did. Strip specific numbers from a case's frame story unless the fixture backs
them, or a false grounding failure gets attributed to the skill.


**An assertion quantified over every finding measures the tail, not the
target.** "Every finding names the rule it breaks" came out 3/5, 2/5, 2/5
across the un-ablated, ablated and restored agent — flat — while the mechanical
rate of rule-attributed findings was 100%, 23%, 95%. The graders were right:
each report ends with a LOW observation for which no rule exists ("import path
is inconsistent with its siblings"; the report itself writes "no cruiser rule
forbids this"), and one such finding fails the whole report in every condition.
Score the **fraction** of findings that satisfy the requirement, or exempt
findings that explicitly declare no rule governs them. The same shape already
ate assertion 3 of `e-ports-and-secrets`; treat any "every X" assertion as
suspect until you have checked what the X's tail looks like.

**When a mechanical proxy disagrees with the graders, read the artifact before
believing either.** Three definitions of "names a rule" produced three different
tables from the same 15 reports: counting the `**Rule:**` label gave version A
19/19, a stricter regex over cruiser ids and `rules/*.md` gave the same arm
12/19 and one run 0/4, and the graders gave 3/5. The strict pattern simply did
not know about `CLAUDE.md § Non-default conventions`, which is a legitimate rule
source this repo uses. Two minutes of `grep -nE '^#{2,4} |^\*\*Rule'` over one
report settled it; more regex iterations would not have.


**A two-part assertion cannot measure a one-part ablation.** Assertion 3 of
`e-ports-and-secrets` requires *both* the missing `ContainerOverrides` entry
*and* the missing mock. Ablated scored 0/5 — and so did **intact**, which named
`ContainerOverrides` in all five runs but mentioned `mocks.ts` once in passing,
which three independent graders correctly refused as identification. Restored
scored 5/5. So the assertion moved 0 → 0 → 5 while the behaviour under test
moved 5 → 0 → 5, and the totals table (intact 4.80 ± 0.45, ablated 4.40 ± 0.89,
restored 5.80 ± 0.45) reads as noise. Split V3 into two assertions before
re-running anything against this case. `INSIGHTS.md` already flagged V3 as a
compound violation for the band-placement assertion; the same defect had a
second assertion to break.

**Band placement (assertion 6) scored 0/15 in the no-tools configuration.** No
review put all three planted violations in one top band. The task prompt asks
for bands but hands over no rubric, so the assertion is measuring an
undocumented preference. An assertion that fails every arm discriminates
exactly as little as one that passes every arm — fix the prompt or drop it.

**The control arm's file ban and the fixture's location contradict each other.**
`prompts/reviewer.md` forbids the control to read anything under
`.claude/skills/`, and the fixtures live at
`.claude/skills/<skill>/evals/fixtures/`. The control cannot do the task without
breaking its own constraint. Copy the fixture into the workspace and point both
arms there — `skill-evals/workspace/onion-baseline-1/fixture/` is the worked
example.


**A fixture that carries unplanted real defects stops measuring the skill.**
Iteration 1's case A leaked a wrong `getContext` arity and four invented
`findings` columns; the graders correctly scored the resulting findings as
legitimate, which handed both arms abundant top-severity material unrelated to
layering and collapsed the precision assertion as a discriminator. Iteration
2's case D repeated it — roughly a dozen unplanted defects, 19 findings, and
both arms at 5/5.

The fix is mechanical: before writing a fixture line, grep the **member** you
are about to use, not the file it lives in. Opening `db/rows.ts` does not tell
you whether `findings.workspaceId` exists — read the `pgTable` block. Opening
`vendor/shared/adapters.ts` does not tell you the port method is
`completeStructured` and not `structured` — read the interface.

**Do not name a dependency-cruiser rule from its comment.** Iteration 1's
ground truth attributed a `modules/*/repository.ts → service.ts` import to
`no-infra-to-app`. That rule's `from` is `^src/adapters/` and it cannot fire on
a module repository; what actually fires is `no-circular`. Read the `from`/`to`
matchers in `server/.dependency-cruiser.cjs` before writing a rule id into
`cases.json`.

## Open Questions

Run-to-run variance is unmeasured. Every number in
`.claude/skills/onion-architecture/evals/README.md` is a single sample per arm,
so no threshold here is safe as a blocking CI gate yet — run one unchanged case
~5 times and look at the spread first.

The with-skill arm scores 15/15 on the current set. At the ceiling an
improvement cannot be observed, only a regression. Harder cases are needed
before this set can measure a skill edit in both directions.

## Recurring Errors & Fixes (cont.)

**One grader per run means the two arms of a case are judged by two different
agents.** In both iterations each `grading.json` was written by its own grader
instance: the `with_skill` verdict and the `without_skill` verdict for the same
case never shared a judge or a standard. Where an assertion is a judgment call
rather than a fact, the delta then partly measures judge variance rather than
skill effect — one grader cleared a mention of the allowlisted `openai` import
as "not a false positive" with an argument, while another failed a comparable
borderline call on `NotFoundError` in case F.

This matters because the observed deltas are small: 1–2 assertions out of 15.
The noise and the signal are the same size.

Fix, cheapest first: give **one grader both arms of a case** — it sees the two
reviews side by side and applies one standard, and it halves the grader count.
The cost is that it knows which arm is which, so bias replaces variance. If a
delta ever needs to survive scrutiny, use three independent graders per verdict
and take the majority instead.

The control arm is "without the skill **body**", not a zero-knowledge baseline.
Subagents carry the Skill tool, so the available-skills listing — every skill's
name and `description` — is in their context even when reading
`.claude/skills/` is forbidden. `onion-architecture`'s own description already
summarises the ring map and names dependency-cruiser as the enforcement. Verified
that no control review cited the skill or any of its files (0 hits for
`onion-architecture` and `.claude/skills` across all six), but that shows what
was *used*, not what was *available*. The leak strengthens the control, so it
biases deltas downward, never upward — worth stating before anyone reads a small
positive delta as an understatement.

**A "legal distractor" has to be checked against the enforcement config, not
just against intuition.** Case G's deps bag was first written as
`import type { ReviewRepository } from '../reviews/repository.js'` — every
identifier real, and still a live `no-cross-module-internals` violation,
because `.dependency-cruiser.cjs:113` sets `tsPreCompilationDeps: true` and a
type-only import is a real edge. A distractor that is secretly a violation
inverts the assertion: the arm that correctly flags it is scored as a false
positive. Before shipping a distractor, run its shape past the rule matchers
in `server/.dependency-cruiser.cjs`, and prefer copying a pattern that exists
in the live tree (here, `modules/brief/deps.ts` declares the slice
structurally and says why).

**Identification-only assertions cannot compare two versions of the same
skill.** v2 (652 → 770 lines, a new `rules/module-boundaries.md`) scored 15/15
against v1's 15/15 — zero delta, including on the case built specifically for
the added rule. Three independent blind graders each diagnosed the instrument
rather than the content: "assertions 2 and 3 ask only for identification",
"assertion 3 as written is satisfied by any split and any band", "as written,
the suite does not separate these two arms".

The differences that existed were real and unscored: v2 placed all three
planted violations in its top severity band where v1 split them across
CRITICAL/HIGH, and in **3 of 3 cases the v1 arm carried a materially false
supporting claim** that the v2 arm did not (`t.findings` "written by six
modules"; "`LLMProvider` carries no provider literal" against
`adapters.ts:83`; "exactly two module-level getters"). Add two assertions per
case before running another version comparison: *planted violations sit in the
highest severity band*, and *no supporting claim is refuted by the live repo*.
Both were proposed by the graders themselves and both are mechanically
checkable.

**Fixtures living inside the skill directory weaken baseline isolation.** With
cases at `.claude/skills/<skill>/evals/fixtures/`, the arm running the OLD
version must read a path under `.claude/skills/` to see its diff — one `ls ..`
from the new version it must not see. The ban held this run (no `rules/`
citation appears in any baseline review; the single `module-boundaries` hit is
the fixture's own directory name), but it holds by instruction, not by
construction. For a version comparison, copy the fixture to a temp directory
first and point the baseline arm there.

**A new assertion needs a matching line in the reviewer prompt.** Adding
*band placement* and *factual accuracy* to the graded set only measures the
skill if both arms were told to order findings by severity and to verify every
identifier and line reference first. Grade a behaviour nobody was asked for and
the delta measures which arm happened to volunteer it — prompt luck, not skill
content. Keep `prompts/reviewer.md` and `cases.json`'s assertion list in sync
whenever either changes.

The same assertion also needs a **verification procedure in the grader
prompt**, or it defaults to PASS. "No supporting claim is refuted by the live
repo" is unfalsifiable as written: a grader that does not run the greps has
nothing to fail it on. Spell out the steps — *state which band this arm calls
its highest and list what sits in it*; *run the greps yourself and name what
you verified; do not pass by default* — and say which deviations are
disqualifying (a materially false claim) versus tolerable (an off-by-one line
reference).

**Correction to the entry above ("3 of 3 the v1 arm carried a materially false
supporting claim").** That signal did not survive. The reviewer prompt in that
run never asked either arm to verify its citations. Once the prompt told
*both* arms to check every identifier, line reference and count against the
live repo, the factual-accuracy assertion passed for all six arms and the gap
vanished. It was a prompt artifact, not a property of the skill version. The
general rule stands — grade factual accuracy — but do not cite that 3/3 as
evidence about skill content.

**An assertion that almost always fails is as useless as one that always
passes.** Band placement failed in 5 of 6 arms on its first run. The cause is
structural, not a scoring accident: `e-ports-and-secrets`' V3 is a *compound*
violation — an absent `ContainerOverrides` field plus an absent mock in
`adapters/mocks.ts` — and both arms naturally reported it as two separate,
lower-band findings. Requiring a single top-band placement for a violation that
has two independent halves cannot be satisfied by a good review. Either split
such a violation into two assertions, or exempt compound violations from the
band requirement. Check this before adding a band assertion to any new case:
*can one finding carry the whole violation?*

**First actual variance measurement (5 runs per arm, one case).** Within-arm
spread on tokens is ±5.4k for both arms, while the between-arm difference is
2.2k — the difference is less than half the noise. Wall time: v3 260s ± 23,
v1 283s ± 44. Every token or time claim made from single runs in earlier
iterations (cheaper 3 of 3, then 4.5k more expensive) was inside this band and
therefore meaningless. Do not report a token or time delta from fewer than five
runs per arm, and report it with the standard deviation beside it or not at all.

**A stale fact inside a skill becomes a confident false claim in its output.**
`enforcement.md` says "Current baseline (16 entries, as of this skill landing)";
`server/.dependency-cruiser-known-violations.json` is `[]`. In one graded run a
reviewer quoted the 16 straight out of the skill and failed the factual-accuracy
assertion for it. The line predates the baseline being burned down, and it sits
in both skill versions, so it is a coin-flip hazard for either arm.

Two consequences worth acting on. For the skill: any number a skill states about
repo state (entry counts, module counts, file lists) is a maintenance liability
— prefer naming the command that prints it. For the harness: an
"identifies X" assertion cannot catch this, and precision only catches it in the
top band; the factual-accuracy assertion is what surfaced it. That is an argument
for keeping assertion 7 even though it fires rarely.

**Harder fixtures do not fix saturation — change the reviewer, not the case.**
Case `h-indirection` was built to be hard: 11 files, 322 lines, three violations
that require tracing a chain (a basename outside `no-app-to-schema`'s `from`
list, a ring-0 contract importing a module, a two-hop re-export through the
exempt `_shared/`). Across 5 runs per arm, **30 of 30 planted violations were
found by both skill versions, all in the top band, with no distractor flagged.**
Per-run scores: v3 [7,6,7,7,7] = 6.8 ± 0.45, v1 [6,7,7,6,7] = 6.6 ± 0.55 — the
0.2 difference is under half the within-arm spread.

Four iterations now end the same way: the reviewing model's baseline ability is
above the difficulty we can plant, so version deltas drown in noise. The levers
left are not fixture design:

- run the arms on a **weaker reviewer model** (Haiku), where the ceiling is low
  enough for a skill to raise it;
- run **without repo access**, the CI-agent scenario, where the skill is the
  only source of the rules instead of a summary of files sitting next to it.

Also fixed-by-noticing: case H's V2 uses `../../modules/reports/constants.js`
from `vendor/shared/contracts/`, which resolves to a non-existent
`src/vendor/modules/` — it should be `../../../`. Two graders derived this
independently. The violation still stands but its nature is mixed; correct the
path before reusing the case.

**Upstream already ships an eval framework — check it before extending this
one.** `upstream/l06-evals` (remote `ai-agentic-engineering-neo/dev-digest`,
one commit ahead of us on that line) adds a root-level `evals/` package,
`@devdigest/evals`: vitest + `@anthropic-ai/claude-agent-sdk`, eval suites for
agents and skills, `.diff` fixtures, a LiteLLM proxy, `scripts/ci-detect.mjs`,
and `src/compare.ts` / `repeat.ts` / `delta.ts` / `records/benchmark.ts` —
version comparison, repeat runs for variance, and benchmarking, which is
exactly what this directory hand-rolls. Its package description says it runs on
the Claude Code subscription with no API token.

Nothing collides: that branch carries no `.claude/skills/onion-architecture/`
and no `skill-evals/`. Before adding capability here, read
`git show upstream/l06-evals:evals/src/compare.ts` and `repeat.ts` and decide
whether the cases and fixtures should move into that harness instead.

**Always quote `description:` in SKILL.md frontmatter.** A plain (unquoted)
YAML scalar may not contain `": "`, and this repo's descriptions habitually end
with `Trigger terms: …`. `run-plan` and `spec-creator` shipped unquoted and
crashed `gray-matter` — the parser the upstream `evals/` harness uses to read
every skill — with "incomplete explicit mapping pair". The visible tail is
`Node.js v25.7.0` / `ELIFECYCLE`, which points at nothing; the cause is 30 lines
up in the stack.

15 of 17 skills already quote it, so the convention exists and these two fell
out of it. Verify a frontmatter edit with the real parser, not by eye:

```sh
cd evals && node -e 'const m=require("gray-matter"),fs=require("fs");
for (const d of fs.readdirSync("../.claude/skills",{withFileTypes:true}).filter(d=>d.isDirectory())) {
  const f=`../.claude/skills/${d.name}/SKILL.md`; if(!fs.existsSync(f))continue;
  try{ if(!m(fs.readFileSync(f,"utf8")).data.name) throw new Error("no name") }
  catch(e){ console.log("FAIL",f,e.message.split("\n")[0]) } }'
```

**Upstream's skill cases run with NO TOOLS — that is the fix for saturation.**
`evals/src/dsl/case.ts` defines `SkillCase = QualityCase` (`prompt`,
`practices[]` judged by a model, `grounding[]` substring gate, `threshold`
default 0.6), and the reference case file states the mechanism outright:
"quality cases run with no tools (skillTask measures the SKILL.md content in
isolation)". `fixtureReader(import.meta.url)` inlines a colocated fixture into
the prompt instead of leaving it on disk for the model to read.

That removes the exact confound this directory could never escape: with repo
access, both arms read `server/.dependency-cruiser.cjs` and re-derive the rules,
so the skill adds nothing measurable. With no tools the skill is the only source
of the rules. `evals/skills/dependency-checker/` is the worked example, and
`WorkflowCase` `kind: "contrast"` (with `expectFileRead`) plus `activated()`
cover the "did this file contribute" question separately.

Porting cost: our `assertions` map onto `practices` nearly one-to-one, including
the distractors ("does NOT flag X"); our fixtures become inlined text. What is
lost is the explicit ground-truth grader with per-violation PASS/FAIL. Do the
port before adding any further capability here.

## What Works

**The cleanest delta in this repo so far came from a report-writing skill with
a computed rubric, not a review skill.** `dependency-checker`'s two no-tools
cases (real collector JSON inlined, chat-vs-scope priority table, a verified
zero-priority negative) gave 95% ± 12% vs 52% ± 20% — a 43pp gap against a
~15pp combined spread, an order of magnitude clearer than the zod (+9pp) or
architecture-reviewer (100%→23%→95% on one assertion, flat on the rest) runs
in this same file. The mechanism: `SKILL.md`'s priority table is a computed
rule (`P0: severity in {{critical,high}} AND scope: prod`), not a style
preference, and the fixtures plant a `scope: dev` `critical` finding as bait.
Every control failure quotes the same mistake — treating severity as sufficient
and ignoring scope — which is exactly the rule the skill states and the control
does not know. When picking or building a skill to demonstrate the benchmark
method, a skill whose value is a checkable rule over structured data
discriminates far better than one whose value is prose judgement.


**Removing a format requirement removes the format, not the knowledge.**
Deleting the per-finding rule-citation requirement from `architecture-reviewer`
took explicit rule attribution from 100% of findings to 23%, while all seven
control assertions stayed put (V1 5/5 in every arm, "no invented rule name" 5/5,
"deterministic checks first" 5/5). The ablated arm still argued from the rules
in prose — one heading reads "NotifyService takes Container, the exact pattern
the skill says not to copy into new code" — because the two skills stayed
preloaded. Expect a format requirement to move the shape of the output and
nothing else, and pick the expectation accordingly: an identification assertion
cannot see this edit at all.


**An ablation is only visible without repo access — now measured, not argued.**
Deleting steps 4-5 of `rules/ports-adapters-di.md` (the `ContainerOverrides`
field and the `adapters/mocks.ts` mock, 4 lines) and re-running
`e-ports-and-secrets` five times per condition:

| what the review names | intact | ablated | restored |
|---|---|---|---|
| `ContainerOverrides` | 5/5 | **0/5** | 5/5 |
| `adapters/mocks.ts`  | 3/5, once each | **0/5** | 5/5, 2-4× each |

The ablated arm did not merely miss the finding, it certified the change set on
the mutilated rule: *"three-step sequence in `rules/ports-adapters-di.md`
("Interface in ring 0" / "Implementation in ring 2" / "Lazy getter in the
composition root")"*. In the same experiment the **ready harness's control arm —
no skill at all, repo access — still identified the missing override field**,
because `server/src/platform/container.ts:117` says "Tests inject a mock via
`ContainerOverrides.repoIntel`". Repo access hands the control the rule the
skill was supposed to carry. Ablate with the fixture inlined and file access
limited to the skill directory, or the experiment measures nothing.


**No-tools authoring cases finally produced a delta above the noise.** After
four onion-architecture iterations where version deltas drowned, `zod` was
measured with the shape `INSIGHTS.md` had only predicted: the code and the
brief inlined in the prompt, both arms forbidden to read any file, the
with_skill arm allowed `SKILL.md` + `references/*.md` and nothing else. Two
cases, 5 runs per arm, one grader per pair. with_skill 98.9% ± 4, control
90.0% ± 8 — the +9pp gap is larger than either arm's spread, the first time
that has been true here. Prompts and templates: `prompts/authoring.md`,
`prompts/grader-authoring.md`.

**Build the assertions on second-order rules; first-order ones are free.**
Only 4 of 18 assertions discriminated: field-level validations applied on the
schema, an error response carrying every issue instead of `issues[0]`,
`z.input` vs `z.infer` across a transform, and deriving the PATCH schema with
`.partial()` instead of re-declaring it. The famous ones — `safeParse`,
`z.infer`, `z.unknown` over `z.any`, `z.enum`, `discriminatedUnion`,
validating a `JSON.parse` result — passed in 20 of 20 runs on both arms. A
suite made of those measures the model's ceiling, not the skill. Look for the
rule a competent answer skips because nothing forced it: the second half of a
two-part requirement, and the type-level consequence of a runtime choice.

**Price the skill in the same report.** with_skill cost 81,958 ± 17,402
tokens against the control's 45,462 ± 4,144, and 7-20 tool calls against 2-4
— reading `references/*.md` is most of it. A +9pp pass rate for +36k tokens
is a trade the human should see stated, not a win to report alone. Note the
asymmetry in the spread too: the control's token cost is nearly constant,
the with_skill arm's is not, because how many reference files an agent
decides to open is its own judgement call.
