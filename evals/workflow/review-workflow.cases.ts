import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by SCENARIO, not by
 * rule: one believable developer task per session, asserting every routing rule that task
 * legitimately triggers. That is what keeps the session count low.
 *
 * Budget: 6 Claude sessions total.
 *   - 4 × trace      → 1 session each                      = 4
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
    expectSkills: ["frontend-architecture"],
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
    expectSkills: ["spec-creator"],
    maxTurns: 10,
  },

  // --- trace 4 (1 session): wrap-up scenario ---------------------------------------------------
  // Merges CLAUDE.md:101-104 (on finishing work → engineering-insights) with :106-108
  // (before `gh pr create` → pr-self-review). Both rules fire on one honest end-of-work prompt.
  // If engineering-insights proves flaky on a wrap-up phrasing, split it back out and use the
  // discovery-shaped prompt (the one in the negative below) as its positive.
  {
    kind: "trace",
    name: "wrap-up: pr-self-review before gh pr create + engineering-insights on finishing",
    prompt:
      "Закінчив роботу над фічею в server і збираюся створити пулреквест через `gh pr create`. " +
      "Що за настановами цього репо треба зробити перед цим?",
    expectSkills: ["pr-self-review", "engineering-insights"],
    maxTurns: 8,
  },

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
  // Guards trace 4 from the opposite side. Without it, a `pr-self-review` that activates on ANY
  // PR-adjacent sentence would still pass trace 4 — the positive alone cannot tell "routed
  // correctly" from "fires on everything". Near-miss: same vocabulary (`gh pr create`), but a
  // question ABOUT the command, with no local change set to review.
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
