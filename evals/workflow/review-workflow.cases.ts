import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by SCENARIO, not by
 * rule: one believable developer task per session, asserting every routing rule that task
 * legitimately triggers. That is what keeps the session count low.
 *
 * Budget: 5 Claude sessions total.
 *   - 3 × trace      → 1 session each                      = 3
 *   - 2 × activation (near-miss negatives, cannot be merged) = 2
 *
 * Merging rules:
 *   - `trace` ANDs every provided expectation over ONE session and stops early once ALL of them
 *     hold, so a merged case is genuinely 1 session — not N.
 *   - A negative (`shouldActivate: false`) can NEVER be merged: it needs its own prompt.
 *   - Order the prompt so document reads come BEFORE a subagent dispatch. If the dispatch fires
 *     first, `stopWhen` is not yet satisfied and the nested subagent runs to completion.
 *   - Asserts fire in order and the first failure throws, so a merged case reports one broken
 *     rule, not all of them. Split a case once it starts failing for mixed reasons.
 *   - A rule whose ONLY possible evidence is a skill activation cannot be merged as a `trace`
 *     right now — see the removed wrap-up case below. `expectSkills` is unreliable (the Skill
 *     tool is suppressed by default in this harness; INSIGHTS.md), and a `trace` with no other
 *     expectation to fall back on degrades to an always-true assertion once it's dropped. Only
 *     `activation`'s explicit true/false check is trustworthy for a skill-only rule today.
 *
 * Path-matching caveat: expectFilesRead uses substring matching (case.ts), and this repo contains
 * a full clone of ITSELF under server/clones/<owner>/<repo>/ (gitignored). Every target below has
 * a twin there, so a read from the clone would count as a pass. Low risk for these prompts;
 * the real fix is resolving both sides against REPO_ROOT in the DSL.
 */
export const cases: WorkflowCase[] = [
  // --- trace 1 (1 session): server scenario ----------------------------------------------------
  // Merges: CLAUDE.md:99 (<module>/INSIGHTS.md first) + :94 (TESTING.md) + subagent dispatch.
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    name: "server task: INSIGHTS-first + TESTING routing + architecture-reviewer dispatch",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export у server (віддає " +
      "ревʼю як markdown), разом із тестами. Спершу, за настановами цього репо (CLAUDE.md), прочитай " +
      "саме ті документи, які треба прочитати перед роботою в цьому модулі і перед написанням тестів. " +
      "ПОТІМ обовʼязково запусти сабагента architecture-reviewer, щоб він оцінив план на відповідність " +
      "onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/INSIGHTS.md", "TESTING.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 12,
  },

  // --- trace 2 (1 session): client scenario ----------------------------------------------------
  // Merges: CLAUDE.md:99 (client/INSIGHTS.md) + the NESTED client/AGENTS.md "Read when" row that
  // routes browser coverage to ../e2e/README.md — a row the root CLAUDE.md does not have, so a
  // read of e2e/README.md is evidence the nested module doc took effect + frontend-architecture.
  {
    kind: "trace",
    name: "client task: INSIGHTS-first + nested AGENTS.md routes to e2e + frontend-architecture",
    prompt:
      "Міняю екран у client: додаю панель фільтрів на сторінку списку ревʼю, і цій зміні потрібне " +
      "справжнє браузерне покриття, а не лише компонентний тест. За настановами цього репо — що " +
      "прочитати перед роботою тут, і де має жити це покриття? Прочитай ці документи.",
    expectFilesRead: ["client/INSIGHTS.md", "e2e/README.md"],
    // expectSkills: ["frontend-architecture"] removed 2026-08-28 — the Skill tool is suppressed
    // by default in this harness (runClaude never sets the SDK's `skills` option), confirmed by a
    // throwaway probe: Skill fired zero times across 20 sessions with skills omitted. See
    // INSIGHTS.md "A skill's own activation may carry tool grants...". `skills: 'all'` makes it
    // fire, but unreliably, and one run showed it escaping the tools restriction (Bash appeared
    // in the trace) — not safe to flip on here until that is resolved.
    maxTurns: 10,
  },

  // --- trace 3 (1 session): authoring scenario -------------------------------------------------
  // Merges: CLAUDE.md:95 (specs/README.md) + :96 (docs/agent-prompts/) + the spec-creator skill.
  // One coherent task — spec a new built-in reviewer, then touch its system prompt.
  // NOTE: "specs/README.md" matches 8 files in this repo (module specs + the self-clone). The
  // spec-creator activation is the load-bearing signal here; the read is corroboration.
  {
    kind: "trace",
    name: "authoring task: spec routing + spec-creator + agent-prompt routing",
    prompt:
      "Хочу описати специфікацію на новий вбудований ревʼю-агент, а потім відредагувати його системний " +
      "промпт. За настановами цього репо — у якому форматі пишеться спека і де лежать системні промпти " +
      "вбудованих агентів? Прочитай відповідні документи.",
    expectFilesRead: ["specs/README.md", "docs/agent-prompts/"],
    // expectSkills: ["spec-creator"] removed 2026-08-28 — see the removal note on trace 2 above.
    // expectFilesRead alone still exercises both routing rows, so this case stays meaningful.
    maxTurns: 10,
  },

  // --- trace 4 (wrap-up: pr-self-review + engineering-insights) removed 2026-08-28 -------------
  // This case's ONLY assertion was expectSkills — no expectFilesRead/expectSubagents to fall back
  // on, because CLAUDE.md:101-108 states both rules purely as skill-activation instructions, with
  // no document to read as corroboration. Deleting expectSkills (see trace 2's note) would leave
  // an assertion of `isError === false` alone, which passes on any coherent reply and asserts
  // nothing about the rule — worse than no coverage, because it LOOKS like coverage. Reinstate
  // this case once Skill-tool activation is measurable again (see INSIGHTS.md).
  //
  // --- activation (1 session): the one thing that CANNOT be merged -----------------------------
  // A negative needs its own prompt by construction — it asserts the ABSENCE of an activation on
  // a near-miss, which no positive session can carry.
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    // Generous on purpose. On a negative, maxTurns is part of the MEASUREMENT, not a safety
    // margin: a session that dies on the ceiling did not activate the skill because it ran out
    // of room, and the case passes having measured nothing. This one ran 5 turns against a
    // ceiling of 4 on 2026-08-27 and went green while erroring. runWorkflowCases now fails an
    // errored activation outright, so a tight ceiling here would surface as a red case instead.
    maxTurns: 8,
  },

  // --- activation (1 session): the second negative ---------------------------------------------
  // No positive counterpart since trace 4 was removed (see above) — this is now the ONLY case
  // touching pr-self-review's CLAUDE.md:106-108 rule at all, and only from the negative side.
  // Near-miss: same vocabulary (`gh pr create`), but a question ABOUT the command, with no local
  // change set to review.
  {
    kind: "activation",
    name: "near-miss negative — a question about gh pr create must NOT trigger pr-self-review",
    prompt:
      "Поясни, чим `gh pr create` відрізняється від `gh pr view` і які в нього є корисні флаги.",
    skill: "pr-self-review",
    shouldActivate: false,
    // Same reasoning as the negative above — never starve a negative of turns.
    maxTurns: 8,
  },
];
