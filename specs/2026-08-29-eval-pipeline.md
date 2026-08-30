# Spec: Eval pipeline — a regression harness for the reviewer agents

> Spec ID: SPEC-2026-08-29-eval-pipeline
> Status: approved
> Supersedes: —
> Superseded-by: —
> Revision: 2026-08-29 — folded in the human's answers to all three blocking
> questions (a run is background work reporting progress; a `must not flag` case
> passes by the scoped rule; one failed case does not abort the batch) and their
> verdict to keep `Run all agents`; recorded six minor decisions taken by the
> assistant and left unchallenged. New criteria AC-34…AC-48; the markers those
> answers close are cleared, one new minor marker opened.
> Revision: 2026-08-29 — closed every remaining clarification. A case that
> produced no output leaves the metric denominators entirely and is reported
> only in the run's completion count; a `must find` case passes on its expected
> findings alone, an extra finding costing precision rather than the case; and
> the human's verdict of 2026-08-29 was to keep all ten undecided mockup
> elements as drawn. New criteria AC-49…AC-60; no clarification marker remains
> anywhere in this document.
> Revision: 2026-08-29 — fixed five defects found in review. Scoring is no
> longer asymmetric: an unjudged extra finding in a `must find` case is counted
> nowhere (AC-16 amended), so every false positive now comes from a dismissal
> (AC-17), which is what `precision` prices (AC-19 amended). A single-case
> trial is named and separated from a set run (new AC-62, AC-63; AC-10, AC-11
> and AC-42 amended), so `Play`, `Run case` and `Run on save` no longer create
> an unnamed second kind of run. The scorer's offline verification command has
> an acceptance criterion (new AC-61). AC-32's source fact was wrong — the
> repository does snapshot version 1 — and is replaced by the verified fact and
> a stronger reason. Every mockup citation now points at the committed sources
> under `img/mockup-src/` instead of a temporary directory.
> Revision: 2026-08-29 — closed the three items the final review left unsettled.
> AC-56's `30 days` control is narrowed to the metric trend chart alone, so no
> control can hide a run from the runs table and make it unselectable for a
> comparison (AC-28). The dependency of `precision` on the presence of
> `must not flag` cases is stated in Scoring and as an edge case: a set of only
> positive cases reads 100% precision forever, which AC-8 is what prevents.
> All three remaining Design review proposals are accepted as the assistant's
> calls and become AC-64…AC-67; `## Design review` now records that no live
> proposal remains.
> Revision: 2026-08-29 — status promoted from `draft` to `approved`: the human
> read the spec and approved it in their own word ("апрув") on 2026-08-29. No
> criterion, section or prose changed.
> Revision: 2026-08-29 — `Turn into eval case` is gated on a disposition. AC-3
> covered an accepted finding **and** one still awaiting a decision; that second
> half came from the human's own choice earlier on 2026-08-29 and was reversed
> the same day, after they compared the running app against the course mentor's
> reference implementation and adopted its rule ("приймаємо правило з відео").
> AC-3 now covers an accepted finding only, and the new AC-68 states the gate:
> while a finding is undecided the control is inert and says why. The cost of
> the new rule is recorded beside AC-8, because undecided findings can no longer
> seed the demonstrated set. `Learn` and `Reply to author` (AC-52, AC-60) are
> deliberately untouched; no other criterion, scoring rule or non-goal changed,
> and the status stays `approved`.

## Problem and user

An agent author edits a reviewer agent's system prompt and has no way to learn
whether the edit helped. Today the only feedback is running the agent on a
pull request and reading the findings by eye: one PR, one opinion, no memory of
what the previous prompt produced. Nothing tells the author that the edit which
fixed one missed defect started inventing two others.

The user is the agent author working in the Skills Lab — the same person who
accepts and dismisses findings on a pull request, and who therefore already
knows which findings were right and which were noise.

## Goals / Non-goals

**Goals**

- Turn a real finding into an eval case in one click, in both directions: a
  finding that was right becomes "must find X at file:line", a finding that was
  dismissed becomes "must NOT comment on Y".
- Hold a set of eval cases per agent, seeded from real findings *and*
  hand-authored, and run the agent over the whole set.
- Score every run mechanically — no model call in the scorer — into recall,
  precision and citation accuracy.
- Keep run history and let the author compare two runs side by side, so
  "old prompt vs new" is a readable answer rather than an impression.

**Non-goals**

- **Evals for skills.** Confirmed out of scope by the human on 2026-08-29. A
  skills eval is a *different kind* of eval: it checks whether a skill
  instruction produces the right artifact — e.g. that the `engineering-insights`
  skill writes to INSIGHTS.md in the right format, with a date and a link. It
  would have the same shape (fixtures + cases + threshold) and would reuse the
  same case-editor modal, but its fixtures have to be synthetic and generated by
  a model, because hand-writing a diff-format case for it is impractical. This
  is recorded rather than omitted so a later reader can tell the decision from a
  gap; the existing eval-case owner kind already admits `skill`, which keeps the
  door open.
- Promoting or rolling back an agent version from the eval screens.
- Exporting eval results to CI, or gating a CI run on them.
- Changing how a pull-request review itself runs. The eval runner is a second
  caller of the existing engine, not a change to it.

## User stories

Only one earns its place, because it fixes the direction of the whole feature:

> As the author of `Security Reviewer`, having just dismissed a finding as
> noise, I want that dismissal to become a permanent assertion that the agent
> must not raise it again — so that the next prompt edit cannot quietly
> reintroduce it.

## Acceptance criteria (EARS)

### Seeding a case from a finding

- **AC-1** — WHEN the reviewer expands a finding on the pull-request page, the
  system shall offer a `Turn into eval case` action on that finding, beside the
  existing `Accept` and `Dismiss` actions.
  *(source: mockup `img/Снимок экрана 2026-08-29 в 00.10.42.png`; verify: client)*
- **AC-2** — WHEN the reviewer activates `Turn into eval case` on a **dismissed**
  finding, the system shall open the eval-case editor pre-filled as a negative
  case whose assertion reads `MUST NOT comment on <file>:<line range>
  (<finding title>)`.
  *(source: mockup `findingToSeed`, `img/mockup-src/findings.jsx:30-46`;
  human, 2026-08-29; verify: client)*
- **AC-3** — WHEN the reviewer activates `Turn into eval case` on an
  **accepted** finding, the system shall open the editor pre-filled as a
  positive case whose assertion reads
  `MUST find "<finding title>" at <file>:<line range>`.
  *(source: human, 2026-08-29; mockup `findingToSeed`; verify: client)*
- **AC-68** — WHILE a finding is neither accepted nor dismissed, the system
  shall keep `Turn into eval case` inert on that finding and shall state on it
  that the finding must be accepted or dismissed first.
  *(source: human, 2026-08-29 — the reference implementation gates the control
  on a disposition and the human adopted that rule, reversing their earlier
  choice the same day; the substantive reason is that a case seeded from a
  finding **nobody judged** turns unverified model output into the harness's own
  ground truth, which contradicts this spec's own governing scoring principle
  that the harness scores only against what a human actually judged; verify:
  client)*
- **AC-4** — WHEN a seeded case is saved, the system shall attach it to the
  agent that produced the finding, and that case shall thereafter appear in that
  agent's case set.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-5** — WHEN the system seeds a case from a finding, it shall capture the
  reviewed diff of **that finding's own file** as the case's input, so that the
  case is runnable without further editing.
  *(source: human, 2026-08-29 — "create an eval case from a real finding in one
  click" and "run the agent over all cases of the set" together require the
  seeded case to be runnable; scope narrowed to the finding's own file by the
  assistant's call, stated to the human on 2026-08-29 and not challenged —
  cheaper to run and focused on the assertion; verify: server-integration)*
- **AC-65** — WHERE a finding already has an eval case seeded from it, the
  system shall show on that finding that a case exists for it.
  *(source: assistant's call, stated to the human on 2026-08-29 — nothing on
  the finding says a case exists today; verify: client)*
- **AC-66** — IF the author activates `Turn into eval case` on a finding that
  already has one (AC-65), THEN the system shall state that before a second
  case is created, so that a case whose name collides with the first is never
  created silently.
  *(source: assistant's call, stated to the human on 2026-08-29 — the seeded
  name is derived from the finding's title, `findingToSeed`,
  `img/mockup-src/findings.jsx:30-46`, so a second activation produces a
  duplicate name; verify: client)*
- **AC-52** — The expanded finding's action row shall carry `Learn` and
  `Reply to author` beside `Accept`, `Dismiss` and `Turn into eval case`,
  in the disabled state of AC-60.
  *(source: mockup `img/Снимок экрана 2026-08-29 в 00.10.42.png`; human,
  2026-08-29 — keep every drawn element; verify: client)*

### The case set

- **AC-6** — The agent editor shall carry an `Evals` tab that lists every eval
  case of that agent, each row showing the case name, its expectation type
  (`must find` / `must not flag`), the result of its last run, and per-row
  actions to run, edit and delete it.
  *(source: mockup `EvalCaseRow`, `img/mockup-src/agent_widgets.jsx:43-65`;
  mockup `img/Снимок экрана 2026-08-29 в 00.11.55.png`; verify: client)*
- **AC-7** — The `Evals` tab shall offer `New eval case`, which opens the same
  editor with no seed, so a case can be authored without a finding to start
  from.
  *(source: mockup `EvalsTab`, `img/mockup-src/screen_agents.jsx:176`; human,
  2026-08-29; verify: client)*
- **AC-8** — The eval set delivered for the demonstrated agent shall contain at
  least 8 cases and shall include all three kinds: a real diff containing a
  violation the agent must find; a diff containing no violation, where the agent
  must produce no finding; and a diff that tempts a finding which is not
  actually a violation. Copied past findings alone do not satisfy this.
  *(source: human, 2026-08-29, modelled on
  `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts`; verify:
  manual)*

*The disposition gate (AC-68) has its cost here. An undecided finding can no
longer seed a case, so the set AC-8 requires can only be assembled after its
findings have been accepted or dismissed. Verified against the dev database on
2026-08-29: the demonstrated agent `Test Quality Reviewer` has 9 findings, of
which 2 are accepted and 2 dismissed — five further decisions are needed before
its set can be seeded from its own findings. Hand-authored cases (AC-7) are
unaffected by the gate.*
- **AC-9** — The eval-case editor shall show the case name as a required field,
  the case input under `Diff` / `Files` / `PR meta` tabs, the expected output,
  and a validity indicator for the expected output.
  *(source: mockup `EvalCaseEditor`,
  `img/mockup-src/screen_ciruns_and_eval_case_editor.jsx:56-104`;
  mockup `img/Снимок экрана 2026-08-29 в 00.12.04.png`; verify: client)*
- **AC-34** — IF the expected output typed into the editor is not valid JSON,
  THEN the system shall refuse to save the case and shall show the expected
  output as invalid.
  *(source: assistant's call, stated to the human on 2026-08-29 and not
  challenged; verify: client)*
- **AC-35** — WHEN the author deletes an eval case, the system shall ask for
  confirmation and shall state in that confirmation that the case's run history
  is deleted with it.
  *(source: assistant's call, stated to the human on 2026-08-29 and not
  challenged; verify: client)*
- **AC-36** — WHEN a case deletion is confirmed, the system shall delete that
  case's recorded executions with it.
  *(source: assistant's call, stated to the human on 2026-08-29 and not
  challenged; the stored schema already dictates it —
  `server/src/db/schema/eval.ts:26` references `eval_cases` with
  `onDelete: 'cascade'`; verify: server-integration)*
- **AC-53** — The case editor's `Files` and `PR meta` tabs shall show the
  case's stored input files and its stored pull-request metadata read-only,
  offering no way to edit either.
  *(source: mockup `EvalCaseEditor`,
  `img/mockup-src/screen_ciruns_and_eval_case_editor.jsx:56-104`;
  human, 2026-08-29 — keep every drawn element; verify: client)*
- **AC-54** — WHERE the case editor's `Run on save` toggle is on, WHEN the
  author saves the case, the system shall execute that case immediately after
  saving it as a single-case trial (AC-62) — which is one paid model call per
  save.
  *(source: mockup `EvalCaseEditor`; human, 2026-08-29 — keep every drawn
  element; verify: client)*
- **AC-55** — WHEN the author activates `+ Finding skeleton` in the case
  editor, the system shall insert an empty finding object into the case's
  expected output, leaving the rest of the expected output unchanged.
  *(source: mockup `EvalCaseEditor`; human, 2026-08-29 — keep every drawn
  element; verify: client)*
- **AC-58** — The agent editor's tab bar shall carry six tabs, in the order
  `Config`, `Skills`, `Context`, `Evals`, `Stats`, `CI` — `CI` in the disabled
  state of AC-60.
  *(source: mockup `AgentEditor`,
  `img/Снимок экрана 2026-08-29 в 00.11.55.png`; human, 2026-08-29 — keep every
  drawn element; verify: client)*

### Running a set

**Two kinds of execution, and only one of them is a run.** A **set run** takes
a whole case set, is recorded in run history with its metrics, its agent
version and its prompt, and is what the dashboard, the trend chart and the
comparison are built from. A **single-case trial** — the case row's `Play`
action, the case editor's `Run case`, and `Run on save` — executes exactly one
case and reports that case's own result; it is not a run, and it never enters
run history. Everything in this section and in *Scoring* is about set runs
unless it names the trial.

- **AC-10** — WHEN the reviewer starts a set run of an agent's eval set, the
  system shall execute every case in the set through that agent's own
  configured provider and model, one case at a time.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-11** — WHEN a set is run, the system shall record every case execution of
  that set run as one run in history, carrying the agent version it ran under
  and the full system-prompt text that produced it.
  *(source: human, 2026-08-29 — a run is all case executions sharing one run
  identity, tagged with the agent version; mockup `RunCompare` reads the prompt
  off the run itself,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:318`; verify:
  server-integration)*
- **AC-12** — The system shall compute a run's metrics at the time of the run
  and shall display those recorded numbers thereafter, never recomputing them on
  read.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-13** — The scorer shall reach no model: computing a run's metrics from
  the model's output shall make zero model calls.
  *(source: human, 2026-08-29 (course acceptance criterion); mockup copy
  "No model call in the scorer", `img/mockup-src/screen_agents.jsx:169`;
  verify: server-unit)*
- **AC-14** — The `Evals` tab shall state, in the user's view, that scoring is
  mechanical — a finding counts when the file matches and the line ranges
  overlap — and that the scorer makes no model call.
  *(source: mockup `EvalsTab`, `img/mockup-src/screen_agents.jsx:167-169`;
  verify: client)*

**While a run is in flight.** The author is never made to wait for the set: the
run proceeds in the background and reports its progress as it goes. This is the
shape a pull-request review already has in this repository
(`server/src/modules/reviews/service.ts:106-141`, `GET /runs/:id/events`) — the
criteria below state what the author sees, not how it is delivered.

- **AC-37** — WHEN the author starts a run of an agent's eval set, the system
  shall show the run as started before any case has finished, and the author
  shall be able to keep using the screen while it runs.
  *(source: human, 2026-08-29; verify: client)*
- **AC-38** — WHILE a run is in flight, the system shall show how far it has got
  as a position in the set — the number of the case being executed over the
  number of cases in the set — and shall advance that position as the run
  proceeds.
  *(source: human, 2026-08-29; verify: client)*
- **AC-39** — WHILE a run is in flight for an agent, the control that starts a
  run for that agent shall show the run as in progress instead of offering a
  second start.
  *(source: human, 2026-08-29; verify: client)*
- **AC-40** — WHEN a run finishes, the system shall show it as a new row in that
  agent's runs table, with its metrics, without the author reloading the screen.
  *(source: human, 2026-08-29; verify: client)*
- **AC-41** — WHEN the author navigates away or closes the browser after
  starting a run, the system shall carry that run to completion and record its
  result regardless.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-42** — IF a set run **or** a single-case trial is requested for an agent
  that already has a set run in flight, THEN the system shall refuse it and
  shall state that a run is already in progress for that agent — either would
  otherwise run the same agent concurrently.
  *(source: assistant's call, stated to the human on 2026-08-29 and not
  challenged; extended to the trial by the same reasoning, human, 2026-08-29;
  verify: server-integration)*
- **AC-62** — WHEN the author activates the case row's `Play` action, the case
  editor's `Run case`, or saves a case with `Run on save` on (AC-54), the
  system shall execute that one case and report that case's own result, and
  shall not record it as a run in the agent's run history: it shall never
  appear in the runs table, never become a point on the trend chart, and never
  be selectable for a comparison.
  *(source: mockup — the editor reports a per-case outcome, "Last run passed ·
  expected 1 finding, got 1 · 1.8s · $0.02",
  `img/mockup-src/screen_ciruns_and_eval_case_editor.jsx:103`; human,
  2026-08-29; verify: server-integration)*
- **AC-63** — The last-run result shown on a case row (AC-6) and in the case
  editor shall be that of whichever execution touched that case most recently,
  whether a set run or a single-case trial.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-43** — IF a case cannot be executed or its execution fails — its stored
  diff cannot be parsed, the provider errors or times out, or the model's output
  cannot be parsed — THEN the system shall record that case as failed, shall
  continue with the remaining cases, and shall bring the run to completion.
  *(source: human, 2026-08-29; verify: server-integration)*
- **AC-44** — WHERE a case failed during a run, the system shall show it as
  failed with the reason it failed, distinguishable from a case that ran and did
  not pass.
  *(source: human, 2026-08-29; verify: client)*
- **AC-45** — WHERE a run has at least one failed case, the system shall report
  the run as a partial result, naming how many of its cases produced a result
  over the number of cases in the set.
  *(source: human, 2026-08-29 — "the run ends as a partial result, e.g. 7 of 8";
  verify: client)*
- **AC-64** — WHEN the author activates a control that will spend model calls —
  `Run eval`, `Run all evals`, `Run all agents` (AC-48), a case row's `Play` or
  the case editor's `Run case` (AC-62), or a save with `Run on save` on
  (AC-54) — the system shall state how many model calls the action will make
  before the action starts.
  *(source: assistant's call, stated to the human on 2026-08-29 — after AC-48
  and AC-54 there are five ways to spend money on these screens, one of them
  attached to a save rather than to a run control; verify: client)*

### Scoring

- **AC-15** — The system shall treat an actual finding as matching an expected
  finding when, and only when, the file is the same **and** the two
  `[start_line, end_line]` ranges overlap. No other field — title, severity,
  category, rationale — shall take part in the match.
  *(source: human, 2026-08-29; verify: server-unit)*
- **AC-16** — For each `must find` case, the system shall count every expected
  finding matched by at least one actual finding as a true positive and every
  unmatched expected finding as a false negative. An actual finding that
  matches no expected finding shall be counted **nowhere** — neither as a true
  positive nor as a false positive — because no human judged it and the
  harness therefore holds no ground truth about it.
  *(source: human, 2026-08-29; verify: server-unit)*
- **AC-17** — For each `must not flag` case, the system shall count every actual
  finding overlapping the forbidden file and line range as a false positive.
  *(source: human, 2026-08-29; verify: server-unit)*
- **AC-18** — The system shall report `recall` as true positives over true
  positives plus false negatives across every `must find` case of the run
  **that produced output**.
  *(source: human, 2026-08-29; verify: server-unit)*
- **AC-19** — The system shall report `precision` as true positives over true
  positives plus false positives across **every** case of the run **that
  produced output**, where every false positive comes from a `must not flag`
  case (AC-17) — so a dismissal is the only thing that can lower precision.
  *(source: human, 2026-08-29 (course acceptance criterion, in its own words:
  "precision (частка знахідок, що не шум — dismissed-кейси працюють саме
  тут)"); verify: server-unit)*
- **AC-20** — The system shall report `citation_accuracy` as the share of the
  model's raw findings that survive the existing citation-grounding gate —
  kept over kept plus dropped — across every case of the run that produced
  output.
  *(source: human, 2026-08-29; grounding gate at
  `reviewer-core/src/grounding.ts:52-84`; verify: server-unit)*
- **AC-21** — The system shall report a run's traces-passed count as the number
  of its cases that passed over the number of its cases that produced output.
  *(source: mockup `EvalMetricStrip`, `img/mockup-src/screen_agents.jsx:145`;
  human, 2026-08-29 — the same denominator as the metrics; verify: server-unit)*
- **AC-46** — The system shall pass a `must not flag` case when no actual
  finding overlaps the dismissed finding's file and line range, whatever other
  findings that case produced elsewhere in the diff.
  *(source: human, 2026-08-29 — "we must not punish the agent for getting
  better": a case seeded from a dismissed "Unused import" at `users.ts:3` still
  passes when the agent instead reports a real SQL injection at `users.ts:40`;
  verify: server-unit)*
- **AC-47** — WHERE a metric's denominator is zero, the system shall display
  `—` in place of that metric, never `0%` and never `NaN`.
  *(source: assistant's call, stated to the human on 2026-08-29 and not
  challenged; consistent with AC-24's treatment of an agent with no runs;
  verify: client)*
- **AC-49** — WHERE a case of a run produced no output — it could not be
  executed, or its execution failed — the system shall exclude that case from
  the numerator and the denominator of every metric it reports for that run.
  *(source: human, 2026-08-29 — "не входить → RECALL 6/7 = 86%"; verify:
  server-unit)*
- **AC-50** — WHEN the system shows a run's metrics, it shall show beside them
  that run's completion count — the number of cases that produced output over
  the number of cases in the whole set.
  *(source: human, 2026-08-29 — "а поруч окремо «7 з 8 виконано»"; verify:
  client)*
- **AC-51** — The system shall pass a `must find` case when every expected
  finding of that case is matched, whatever additional findings that case
  produced.
  *(source: human, 2026-08-29 — "давай делаем симметрию"; verify: server-unit)*
- **AC-61** — The scorer's own checks shall be runnable as one command that
  needs neither network nor model, exercising the matching rule (AC-15) and
  every metric the system reports (AC-18…AC-21), and that command is part of
  the deliverable.
  *(source: human, 2026-08-29 (course acceptance criterion); verify:
  server-unit)*

*One principle governs the whole scorer: **the harness scores only against
what a human actually judged.** A case's pass mark answers "did the agent do
what was asked of it" — a `must find` case passes on its expected findings
alone (AC-51), a `must not flag` case on the absence of a finding at the
forbidden location alone (AC-46). The metrics answer a narrower question:
"did the agent reproduce noise a human already rejected". So every false
positive comes from a dismissal (AC-17), and a finding nobody judged — an
extra finding in a `must find` case, or a finding elsewhere in the diff of a
`must not flag` case — is counted **nowhere**, in either direction (AC-16,
AC-46). This is what keeps the metric honest under the human's own principle
of 2026-08-29, "we must not punish the agent for getting better": improving
the prompt so the agent finds more real defects cannot lower `precision`,
because those extra findings are not evidence the harness holds.*

*That principle has a consequence for the shape of a case set: **`precision`
can only move when the set holds `must not flag` cases**, because a dismissal
is its only source of false positives (AC-17, AC-19). A set of only `must find`
cases has no reachable false positive, so its `precision` reads 100% on every
run forever. This is a second, independent reason AC-8 requires all three kinds
of case — not merely for coverage, but because a set of only positive cases
cannot measure precision at all.*

*Fabrication is still policed, by two mechanisms that do not depend on the
above. `citation_accuracy` (AC-20) prices a finding whose file and lines are
not in the diff at all. And the fabrication-pressure cases AC-8 requires — a
diff that tempts a finding which is not actually a violation — are
`must not flag` cases whose forbidden location is exactly the tempting spot,
so an invented finding lands on a forbidden location and costs `precision`
(AC-17). The mockup's `assert empty` badge is the on-screen wording for the
negative assertion, not a second requirement: it labels the case, it does not
mean the case fails on a finding elsewhere in the same diff.*

### The Eval Dashboard

- **AC-22** — The studio's left sidebar shall carry an `Eval Dashboard` entry in
  the Skills Lab group, after `Conventions`.
  *(source: mockup `NAV`, `img/mockup-src/chrome_sidebar.jsx:13`; mockup
  `img/Снимок экрана 2026-08-29 в 00.11.13.png`; verify: client)*
- **AC-23** — The Eval Dashboard shall open on an all-agents overview listing
  every reviewer agent with its model, its latest run's identity, date and
  traces-passed count (AC-21), a recall sparkline, and its latest recall, precision
  and citation accuracy.
  *(source: mockup `AgentEvalOverview`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:344-391`;
  verify: client)*
- **AC-24** — WHERE an agent has no eval run, its overview row shall read
  `No eval runs yet`, shall show `—` in place of each metric, and shall render
  no sparkline.
  *(source: mockup `AgentEvalOverview`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:354,374-375`;
  verify: client)*
- **AC-25** — The overview shall show a cross-agent feed of the most recent eval
  runs, newest first, each row naming its agent, when it ran, the agent version,
  its three metrics and its traces-passed count (AC-21).
  *(source: mockup `AgentEvalOverview`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:380-390`;
  verify: client)*
- **AC-26** — WHEN an agent is opened on the dashboard, the system shall show
  that agent's current recall, precision and citation accuracy, each with its
  change since the previous run, a trend chart of the three metrics across the
  agent's runs in chronological order, and a table of its runs with when it ran,
  the agent version, the three metrics, the traces-passed count (AC-21) and the run
  cost.
  *(source: mockup `ScreenEval`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:440-476`;
  mockup `img/Снимок экрана 2026-08-29 в 00.11.33.png`; verify: client)*
- **AC-27** — IF the latest run's precision is lower than the previous run's,
  THEN the dashboard shall show a regression alert naming the drop in percentage
  points and the agent version it happened on.
  *(source: mockup `ScreenEval`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:437-439`;
  verify: client)*
- **AC-48** — WHEN the author activates `Run all agents` on the Eval Dashboard,
  the system shall start a run of every reviewer agent's eval set; every case of
  every set is one paid model call, so one activation costs N agents × M cases.
  *(source: human, 2026-08-29 — "да", keep it; mockup `ScreenEval`
  `Run all agents`; verify: client)*
- **AC-56** — The Eval Dashboard shall carry a `30 days` control which sets the
  window of runs plotted on the metric trend chart (AC-26), and which changes
  nothing else: the runs table, the cross-agent recent-runs feed and the runs
  selectable for a comparison shall show every run regardless of the control's
  state.
  *(source: assistant's call, stated to the human on 2026-08-29; the mockup's
  control is inert and carries no behaviour of its own, and a control that hid
  runs would make an old run unselectable for the comparison this feature
  exists for; verify: client)*
- **AC-59** — WHERE a screen captions a run or a set with the size of that set,
  the system shall state the real number of cases in it, never a fixed number.
  *(source: mockup captions "on the 20-trace gold set" on the dashboard and in
  the compare modal; human, 2026-08-29 — keep the element, with the real count;
  verify: client)*

### Comparing two runs

- **AC-28** — WHILE fewer than two runs are selected, the system shall keep the
  `Compare` action disabled and shall show the affordance
  `Select two runs to compare`.
  *(source: mockup `ScreenEval`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:458-460`;
  verify: client)*
- **AC-29** — WHEN a third run is selected, the system shall drop the earliest of
  the two already-selected runs and keep the selection at two.
  *(source: mockup `toggleRun`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:412`; verify: client)*
- **AC-30** — WHEN two runs are compared, the system shall present them oldest
  first regardless of the order they were selected in, and shall show
  old → new for recall, precision, citation accuracy and cost, each with its
  change.
  *(source: mockup `RunCompare` / `openCompare`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:316-341,414-418`;
  verify: client)*
- **AC-31** — WHEN two runs are compared, the system shall show a word-level diff
  of the two runs' recorded system prompts, with the older run's removed words
  struck through and the newer run's added words highlighted.
  *(source: mockup `RunCompare` / `diffTokens`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:286-340`; verify:
  client)*
- **AC-32** — The comparison shall diff the prompt text recorded **with each
  run**, never the agent's current prompt.
  *(source: mockup `RunCompare` reads `a.prompt` / `b.prompt` off the run,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:318`; human, 2026-08-29
  — an agent's prompt can be edited while a run is in flight, so no join to
  version history can ever reconstruct the text a given run actually sent;
  verify: client)*
- **AC-67** — WHEN two runs are compared, the system shall state on the
  comparison itself that the two runs share a case set and a model, and that
  model output varies between identical calls — so that a metric change reads
  as evidence, not proof, of the prompt change's effect.
  *(source: assistant's call, stated to the human on 2026-08-29 — the modal
  puts a prompt diff beside metric deltas, which invites reading one as the
  cause of the other, and this spec's own Determinism paragraph says it is not;
  verify: client)*
- **AC-57** — The comparison shall carry a `Promote v7` action naming the newer
  of the two compared runs' agent versions, in the disabled state of AC-60.
  *(source: mockup `RunCompare`,
  `img/mockup-src/screen_skills_and_eval_dashboard.jsx:316-341`;
  human, 2026-08-29 — keep every drawn element; verify: client)*

### Controls drawn without a mechanism

Three of the kept elements have nothing behind them in this product, so
specifying them as live controls would specify a control that is pressed and
does nothing:

- `Promote v7` (AC-57) — there is no "promote a version" concept; an agent's
  version increments when the agent is saved with a config change
  (`server/src/modules/agents/repository.ts:122-124`).
- The `CI` tab (AC-58) — exporting an agent to CI is a different part of L06
  and a non-goal of this spec.
- `Learn` and `Reply to author` (AC-52) — separate features. The shared
  contract already admits both action kinds
  (`server/src/vendor/shared/contracts/findings.ts:82-83`), but neither has
  behaviour in this feature.

- **AC-60** — WHERE a control is drawn but has no mechanism behind it in this
  feature — `Promote v7` (AC-57), the `CI` tab (AC-58), and `Learn` and
  `Reply to author` (AC-52) — the system shall render that control disabled and
  shall state on it why it is inactive.
  *(source: assistant's call, stated to the human on 2026-08-29; verify:
  client)*

### The demonstration

- **AC-33** — WHEN the same case set is run twice against the same agent and
  model with a changed system prompt between the runs, the system shall record
  and display each run's recall and precision independently, so the difference
  between them is readable on the dashboard and in the comparison.
  *(source: human, 2026-08-29 (course acceptance criterion); verify: manual)*

## Edge cases

**Empty and thin states**

- An agent with **zero cases**: the `Evals` tab needs an empty state rather than
  a zero-length list under a `0 / 0 passing` badge.
- An agent with **zero runs**: covered by AC-24 on the overview; on the agent
  dashboard the metric cards, the trend chart and the runs table all have
  nothing to draw. The trend chart needs at least two points before a line
  means anything.
- Exactly **one run**: `Compare` can never be enabled (AC-28), and every
  metric's change since the previous run is undefined.
- A metric whose **denominator is zero** — a set with no `must find` case, or a
  run in which the model produced no finding at all: the metric reads `—`
  (AC-47), never `0%` and never `NaN`.
- A set with **no `must not flag` case**: `precision` reads 100% on every run,
  because nothing in such a set can lower it — every false positive comes from
  a dismissal (AC-17, AC-19). This is expressly *not* the zero-denominator case
  above: the denominator is non-zero and the number is well-formed, it simply
  has nothing to measure, so AC-47's `—` treatment does not cover it and
  nothing on screen marks the 100% as meaningless. AC-8 is what prevents the
  situation, by requiring all three kinds of case in the set.
- A run **older than the dashboard's `30 days` window**: it stays in the runs
  table, in the recent-runs feed and in the comparison selection, because that
  control narrows the trend chart alone (AC-56). The narrowing exists for
  exactly this reason — a control that filtered the runs table would hide the
  old prompt's run and make the two-run comparison AC-28 and AC-29 govern
  impossible to assemble, which is the comparison this feature exists for.

**During a run**

- A run in progress. A sequential run over 8 cases against a real model takes
  tens of seconds, so the run is background work: it reports its position in the
  set while it goes and lands in the runs table when it finishes
  (AC-37…AC-40). The mockup shows no running state, so this screen state is
  specified here and not drawn anywhere.
- One case fails mid-run — the provider errors, times out, or rate-limits. That
  case records a failure, the batch continues, and the run completes as a
  partial result (AC-43…AC-45). That case produced no evidence either way, so it
  leaves the metrics entirely (AC-49) and appears only in the run's completion
  count (AC-50): a set of 8 with one failure reads `recall 6/7` beside
  `7 of 8 ran`, not a recall penalised for a provider outage.
- **Every** case of a run fails — a provider outage, an expired key. No metric
  has a denominator, so all three read `—` (AC-47), the traces-passed count
  reads `—` (AC-21, AC-49), and the completion count reads `0 of N` (AC-50).
  The run is visibly a non-result rather than a score of zero.
- A second set run is started for the same agent while one is already in
  flight, or a case is `Play`ed or saved with `Run on save` on during one: each
  is refused with a stated reason (AC-42).
- The agent's system prompt is edited **while** a run is in flight. This is
  precisely the demo scenario; AC-11 and AC-32 are what make it safe, because
  the run carries the prompt it actually used. Version history cannot stand in
  for it: a version is snapshotted when the agent is *saved*, not when a run
  starts, so a run that straddles a save matches no version's text. A second,
  narrower gap corroborates it — an agent created through the API does get a
  version-1 snapshot (`server/src/modules/agents/repository.ts:106`), but a
  seeded built-in agent gets none, because `server/src/db/seed.ts:246` writes
  the agents row with plain Drizzle rather than through that repository.
  Verified against the dev database on 2026-08-29: `Security Reviewer` is at
  version 1 with zero `agent_versions` rows, and `API Contract Reviewer` is at
  v12 with `min(version) = 2`.
- Two runs of the same set, same model, same prompt, returning different
  metrics. Model output is not deterministic, so a metric movement is only
  attributable to a prompt change when the case set, the model and the recorded
  prompt are the ones being compared.

**Case data**

- A case whose stored diff no longer parses, or is empty — an unparseable diff
  fails that case and the run continues (AC-43); an empty input cannot ground
  any finding, so citation accuracy for that case reads `—` (AC-47) rather than
  zero.
- Expected output that is not valid JSON, typed into the editor: the case cannot
  be saved (AC-34).
- A very long diff or a very long expected output — both panes of the editor
  scroll independently in the mockup.
- The same finding turned into a case twice. The seeded case name is derived
  from the finding's title, so the two cases collide by name, and nothing on the
  finding says a case already exists.
- Deleting a case that already has runs. Run history hangs off the case, so
  deleting a case destroys the executions a past run's metrics were computed
  from — the run's recorded numbers then describe a set that no longer exists.
  The deletion is confirmed first and the history goes with it (AC-35, AC-36).
- A `must not flag` case whose diff legitimately contains a *different*, real
  problem: the case still passes (AC-46), and only findings overlapping the
  forbidden location count against the agent (AC-17). The stricter "assert
  empty" reading was rejected on 2026-08-29 because it punishes a correct
  finding.
- A `must find` case where the agent reports the expected defect **and** a
  second, real one: the case still passes (AC-51) and the extra finding is
  counted nowhere (AC-16) — it does not lower `precision`, because nobody
  judged it. Pricing it would punish exactly the improvement the harness exists
  to detect.
- The same defect reported twice inside one case execution. The engine's
  map-reduce reduction concatenates partial reviews without de-duplicating
  (`reviewer-core/src/review/reduce.ts:43-55`), so a duplicate is reachable.
  Under AC-16 a duplicate that matches an expected finding is absorbed into
  that single true positive; a duplicate that matches nothing is counted
  nowhere — unless it lands on a forbidden location in a `must not flag` case,
  where each overlapping finding is a false positive (AC-17).

**Degradations across boundaries**

- The model provider times out, errors, or returns unparseable output for one
  case → that case is recorded as failed, the batch continues, and the run ends
  as a partial result (AC-43…AC-45); it never hangs.
- The client asks for a run that no longer exists → a plain "not found", never a
  blank dashboard.
- A run is started and the browser is closed → the run completes anyway and its
  result is there on return (AC-41).

## Cross-module interactions

Three packages take part; the direction never reverses.

```mermaid
sequenceDiagram
  participant W as client (studio)
  participant A as server (api)
  participant E as reviewer-core
  participant M as model provider
  W->>A: start eval run {agent, case set}
  A--)W: run started — before any case has finished
  loop one case at a time
    A->>A: parse the case's stored diff
    A->>E: review(agent prompt, model, diff)
    E->>M: structured completion
    M--)E: findings | error | timeout
    E->>E: citation grounding (kept / dropped)
    E--)A: findings + kept/dropped + cost
    A->>A: score mechanically — no model call
    A--)W: progress — case k of N
  end
  A--)W: run complete (or partial), metrics recorded
  Note over A,E: a provider error or timeout fails that case only; the batch<br/>continues and the run ends as a partial result
  Note over A,M: the scorer never appears on this edge — it reads only<br/>what the engine already returned
```

- The **eval runner lives in `server`**, never in `reviewer-core`. The engine
  must stay free of database, GitHub and filesystem access; it is called with an
  injected model provider, exactly as the pull-request review path calls it
  today.
- The runner needs a stored diff string turned into the engine's diff shape.
  That parsing already lives in `server`, so the dependency still points
  `server → reviewer-core` and nothing new is asked of the engine.
- **Any change to the shared eval contracts must land in both mirrored copies,
  byte-identically** (`server/src/vendor/shared` and
  `client/src/vendor/shared`). CI enforces this.
- The client reads and writes everything over the existing HTTP API; it holds no
  eval state of its own beyond the two selected runs on the compare screen and
  the progress of a run it is currently watching.
- A run **outlives the request that started it** (AC-37, AC-41): the server owns
  the run's lifetime, and the client is a spectator that can leave and come
  back. The pull-request review path already works this way
  (`server/src/modules/reviews/service.ts:106-141`), so this asks for no new
  direction of dependency.

## Contracts

The shared contract surface for evals already exists — `EvalCase`,
`EvalCaseInput`, `EvalRun`, `EvalRunRecord`, `EvalTrendPoint`, `EvalDashboard`
(`server/src/vendor/shared/contracts/knowledge.ts:49-84`,
`…/contracts/eval-ci.ts:20-89`). What this feature adds to the shape crossing
the boundary:

```
Eval case (extends the existing case shape)
  expectation      "must_find" | "must_not_flag"        required
  seeded_from      finding reference | null             optional — drives the
                                                        row's "seeded from a
                                                        dismissed/accepted
                                                        finding" affordance
  (existing) name, input_diff, input_files, input_meta,
             expected_output, notes

Eval run (one execution of a whole set)
  run identity     shared by every case execution of the run   required
                   — known as soon as the run starts (AC-37)
  agent_version    the version the agent was on                required
  system_prompt    the prompt text the run actually used       required
  state            running | complete | partial                required
  progress         case k of N, while state is running         required while running
  ran_at, recall, precision, citation_accuracy,
  passed / produced-a-result (AC-21), produced-a-result / cases in the set
  (the completion count, AC-50), cost_usd, duration_ms

Per-case result within a run
  case reference, outcome (passed | failed the assertion |
  could not run), failure reason when it could not run,
  actual_output, expected-vs-actual counts, cost_usd, duration_ms

Single-case trial (AC-62)
  the same per-case result shape, with no run identity
  and no run-level metrics — it is not a run

Errors the API must be able to state
  - the named agent has no eval cases          (not an error — an empty set)
  - a run is already in progress for this agent (refuses the new set run and
                                                 any single-case trial, AC-42)
  - a case's stored diff cannot be parsed       (fails that case only, AC-43)
  - the model provider failed for a case        (fails that case only, AC-43)
  - the expected output is not valid JSON       (refuses the save, AC-34)
```

Note that `expectation` has no representation anywhere in the code today —
`must_find` / `must_not_flag` appear in the mockup and nowhere in the
repository.

## Non-functional requirements

**Model use**

- A **set run** calls the model **once per case**, on an explicitly triggered
  path only. One click on `Run eval` therefore costs N paid calls for a set of N
  cases; `Run all evals` costs the whole set, and `Run all agents` (AC-48, kept
  in scope by the human on 2026-08-29) costs every agent's set at once — N
  agents × M cases of paid calls per click.
- A **single-case trial** (AC-62) costs one paid model call and is reached from
  three places: the case row's `Play`, the case editor's `Run case`, and
  `Run on save` (AC-54). All three are explicitly triggered, but `Run on save`
  is the only one where the spend attaches to a *save* rather than to a press
  of a run control — which is why AC-64 names it among the controls that must
  state their cost before acting. A trial spends money without producing a run
  in history, so its cost is visible only on the case's own result.
- The `Evals` tab, the Eval Dashboard and the compare view never call a model —
  they render numbers already recorded.
- The **scorer** never calls a model (AC-13). This is the property the course
  acceptance criterion names, and it is also what makes a run's metrics
  reproducible from its stored output.

**Cost**

- Cost is attributed to the run: each case execution records its own cost, and
  the run's cost is the sum, shown per run in the runs table and per run in the
  comparison.
- The engine already computes a call's cost from the provider result; the eval
  path must not invent a second accounting.

**Failure**

- Run history is append-only: a failed or partially completed run never alters
  an earlier run's recorded metrics.
- A failing case costs the author the rest of the run's information, not the
  run: the remaining cases still execute and the run still records metrics, on
  the stated partial basis (AC-43…AC-45).
- A case that could not run is still visible as such (AC-44), so a partial run
  is never mistaken for a clean one.

**Determinism and comparability**

- Two runs are comparable only when they ran the same case set on the same
  model. Because model output varies between identical calls, the comparison
  view must not present a metric change as *caused by* the prompt change; it
  presents the prompt diff and the metric deltas side by side and lets the
  reader judge.

**Verification command**

- The requirement itself is AC-61. The course submission checklist names this
  command `verify:l06`; there is no root package in this repository, so it is
  run from `server/`, mirroring the existing `verify:l03`
  (`server/package.json:18`). The naming and the location are recorded here
  because they are constraints on the deliverable rather than design choices.

**Repository constraints this feature must respect**

- `reviewer-core` stays free of database, GitHub and filesystem access.
- The two `vendor/shared` copies stay byte-identical.

**Path convention**

- The course submission checklist names this document `specs/eval-pipeline.md`.
  It is written at `specs/2026-08-29-eval-pipeline.md` instead, following this
  repository's own convention (`specs/README.md`): a dated file name, and the
  root of `specs/` because two modules are in scope. Recorded so the divergence
  is a decision rather than a mistake.

## Inputs and provenance

| Input | Comes from | Boundary crossed |
|---|---|---|
| The finding a case is seeded from — title, file, line range, severity, category, disposition | the model, via a past review; the disposition from the user's accept/dismiss | database → API → client |
| The case's input diff | the reviewed pull request, originally from GitHub | database → API → engine → model prompt |
| The case name and notes | the operator, typed into the editor | client → API → database |
| The expected output | derived from the finding on seeding, or typed by the operator | client → API → database; **never enters a prompt** |
| The system prompt a run uses | the agent's configuration at the moment the run starts | database → engine → model prompt |
| The agent's provider and model | the agent's configuration | database → engine → provider |
| The actual findings, and which of them survived grounding | the model, then the engine's grounding gate | model → engine → API → database |
| Cost of each call | the provider's response, priced by the engine | provider → engine → API |

## Untrusted inputs

- A case's **input diff is third-party text**: it is repository code that
  reaches the model as the reviewed diff. It occupies exactly the same trust
  position as a real pull-request diff already does, and the engine's existing
  injection guard applies to it unchanged. It is data, never instructions.
- **PR metadata** carried by a case — title, body — has the same status.
- The case **name** and **notes** are operator-authored and are not third-party
  text.
- The **expected output never reaches a prompt.** It is only ever compared by
  code. This is why the scorer needs no guard of its own, and it is a property
  worth keeping: a scorer that showed the expectation to a model would make the
  whole harness circular.

## Open questions

**None.** Every question this spec opened has been answered. The blocking three
were settled first — the running state (AC-37…AC-41), the `must not flag` pass
rule (AC-46) and the partial run (AC-43…AC-45). The two that remained were
settled on 2026-08-29: how a case that produced no output counts in the metrics
(AC-49, AC-50), and the ten undecided mockup elements.

**The mockup verdict of 2026-08-29.** The human's verdict on the ten rows that
had awaited one was to **keep every element as drawn** — "the buttons are in the
mockup, leave them; we can remove them later if need be" — so the table of
proposals is gone and its rows are requirements: `Learn` and `Reply to author`
(AC-52), the read-only `Files` and `PR meta` tabs (AC-53), `Run on save`
(AC-54), `+ Finding skeleton` (AC-55), `Promote v7` (AC-57), the `30 days`
control (AC-56), the `CI` tab (AC-58), the per-row `Play` / `Edit` / `Trash`
actions (already AC-6), the real case count in place of the fixture caption
(AC-59) and the mechanical-scoring line (already AC-14). The verdict is
explicitly reversible: an element may be dropped later, and dropping one costs
only the criterion that names it. Three of them have no mechanism behind them
and are therefore present but disabled with a stated reason (AC-60) — that
narrowing is the assistant's call, stated to the human on 2026-08-29. A fourth,
the `30 days` control, is drawn inert and was given a behaviour of the narrowest
kind that cannot harm the feature: it windows the trend chart and filters no
list (AC-56), also the assistant's call of 2026-08-29.

*(Row 7 — the dashboard's `Run all agents` button — was settled earlier: the
human kept it on 2026-08-29 and it is AC-48. Row 9 — the Skills Lab `Evals`
tab — is settled as a non-goal, recorded above.)*

**Divergence between the two mockup artefacts.** For the AgentEditor `Evals`
tab, the runnable HTML mockup shows a `must find` / `must not flag` badge on
each case row and the mechanical-scoring note, and lists 9 cases; the PNG
screenshot shows neither badge nor note and lists 5. The criteria above follow
the HTML, because it is the newer artefact and carries the badges and the
mechanical-scoring note — assistant's call, stated to the human on 2026-08-29
and not challenged.

## Design review

**No live proposal remains.** All five proposals this spec raised are decided,
and each is now a criterion:

| Proposal | Became | Decided by |
|---|---|---|
| Confirm before deleting a case | AC-35 | assistant's call, stated to the human on 2026-08-29 |
| Caption a set with its real case count instead of the fixture's | AC-59 | human, 2026-08-29 |
| Confirm before a paid run | AC-64 | assistant's call, stated to the human on 2026-08-29 |
| Mark a finding that already has an eval case | AC-65, AC-66 | assistant's call, stated to the human on 2026-08-29 |
| Say what makes two runs comparable | AC-67 | assistant's call, stated to the human on 2026-08-29 |

The last three were closed on 2026-08-29 on the assistant's call, not the
human's: the human delegated the decision — "close the three" — rather than
ruling on each proposal individually. Each therefore stays refutable in one
sentence, and rejecting one costs only the criterion that names it.
