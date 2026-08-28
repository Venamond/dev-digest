import type { WorkflowCase } from "../src/index.js";

/**
 * Experiment 4 — "check the whole workflow". Four cases, one per required scenario, each using
 * the DSL's own trace-asserted `kind` so the assertion is a real tool call / file read, never the
 * model's prose ("I called the reviewer" is not evidence — see `dispatch`'s assertion on
 * `result.subagents`, populated only from `tool_use` blocks whose name is in `SPAWN_TOOLS`).
 *
 * Kept in its own file rather than appended to `review-workflow.cases.ts`: that file was mid-run
 * under a concurrent `pnpm eval:workflow` invocation (another session) when this one started, and
 * a shared cases file would mean two vitest processes racing the same 5 pre-existing cases against
 * the same repo. Run this file alone: `npx vitest run workflow/experiment4.eval.ts` (from `evals/`).
 *
 * Every case here goes through `workflowTask`, which is already a read-only allow-list
 * (`WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"]`, passed as BOTH
 * `allowedTools` and `tools` — see `evals/INSIGHTS.md`, "`allowedTools` does not restrict
 * anything" — so this is an actual restriction, not just an auto-approve list). No case here needs
 * `Bash` or `Write`, so none is granted; the dispatched `architecture-reviewer` subagent still gets
 * its own `Bash`/`Write` from its own frontmatter — that grant lives on the subagent, not the
 * session under test, and is out of scope for what this file asserts.
 */
export const cases: WorkflowCase[] = [
  // --- 1. dispatch: architecture-reviewer ------------------------------------------------------
  // Asserts result.subagents contains "architecture-reviewer" — populated only from an actual
  // Task/Agent tool_use block carrying that subagent_type. A reply that merely SAYS "I'll dispatch
  // architecture-reviewer" without the tool call leaves `subagents` empty and this fails.
  // GET /api/notify-rules is genuinely absent from every routes.ts in server/src/modules/ (verified
  // 2026-08-28) — an endpoint that already exists gets reviewed inline instead of dispatched.
  {
    kind: "dispatch",
    name: "dispatch case: a new-endpoint plan gets sent to architecture-reviewer, not reviewed inline",
    prompt:
      "Я планую додати новий, ще не реалізований ендпоінт GET /api/notify-rules у server (список " +
      "правил сповіщень воркспейсу). Перш ніж я писатиму код, ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він перевірив мій план на відповідність onion-шарам — не рецензуй " +
      "план сам і не пиши код.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 8,
  },

  // --- 2. positive activation: engineering-insights --------------------------------------------
  // `activated()` (case.ts) accepts EITHER an explicit Skill tool_use for "engineering-insights"
  // OR a Read of `.claude/skills/engineering-insights/SKILL.md` — the second path matters because
  // evals/INSIGHTS.md records the Skill tool firing ~0/20 times on this harness's subscription
  // path, so a prompt that only works via the Skill tool would be measuring the harness, not the
  // rule. The prompt below is built from CLAUDE.md's OWN trigger language verbatim ("genuinely
  // new and non-trivial", "via the engineering-insights skill or /engineering-insights") rather
  // than naming the skill's file path — so a pass is evidence the routing rule reached the model,
  // not evidence I fed it the answer.
  //
  // Deliberately NO invented schema/class/module name in the bug story — the first draft named
  // `CreateDigest.parse(body)`, unintentionally reused from the onion-architecture eval fixture at
  // .claude/skills/onion-architecture/evals/fixtures/case-d-parse-and-rowshape/server/src/modules/
  // digest/service.ts. There is no real "digest" module in server/src/modules/ (verified), so the
  // model went hunting for one, found that unrelated fixture instead, and burned its turn budget
  // exploring it (measured: 10 tool calls in 11 turns against maxTurns 10 — 1 turn short, and the
  // real evidence — tools: Grep/Read/Skill/Glob, skills: engineering-insights, a read of
  // server/src/modules/digest/INSIGHTS.md — was voided anyway by the ceiling). That was a case
  // defect, not a rule failure: describe the pattern in plain language, name no module, so there
  // is nothing for the model to go looking for. maxTurns 12 for real margin over the 11 turns the
  // flawed draft still needed to reach a genuine engagement.
  {
    kind: "activation",
    name: "positive activation: a found bug root cause routes to engineering-insights",
    prompt:
      "Щойно я знайшов і виправив баг у backend server-коді: сервісний шар повторно валідував " +
      "тіло запиту (викликав `.parse()`), хоча відповідний Fastify-роут уже провалідував те саме " +
      "тіло власною Zod-схемою в описі маршруту — тобто зайва, друга межова валідація глибоко в " +
      "стеку викликів замість однієї на вході. Причина нетривіальна, конкретна і практично корисна " +
      "для майбутньої роботи в цьому репозиторії — не щось, що я міг би просто тримати в голові. " +
      "За настановами цього репозиторію (CLAUDE.md) — що мені слід зробити з цим висновком? " +
      "У цій сесії в тебе НЕМАЄ інструменту для редагування чи запису файлів (лише Read/Grep/Glob/" +
      "Task/Agent/Skill) — виконай процес, описаний у CLAUDE.md, тими інструментами, які в тебе є.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 12,
  },

  // --- 3. negative activation: a plain, unrelated question --------------------------------------
  // Deliberately NOT a near-miss (review-workflow.cases.ts already covers that shape for this same
  // skill with the pgvector-dimensions question). This one shares no vocabulary with a bug report,
  // a fix, or a session wrap-up — a single factual lookup answerable straight from CLAUDE.md's own
  // "Stack" section. maxTurns generous per the same "negatives are part of the measurement" rule:
  // a session that dies on the ceiling proves nothing about non-activation.
  {
    kind: "activation",
    name: "negative activation: a plain factual question must NOT record an insight",
    prompt: "Яка мінімальна версія Node.js потрібна для цього проєкту?",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 8,
  },

  // --- 4. contrast: CLAUDE.md routing to docs/agent-prompts/api-contract-reviewer.md ------------
  // Course spec names "api-contracts.md"; this repo has no file by that name. The real, on-disk
  // equivalent is docs/agent-prompts/api-contract-reviewer.md — CLAUDE.md:96 routes "editing a
  // built-in agent's system prompt" to docs/agent-prompts/, and api-contract-reviewer.md is one of
  // the five prompts listed there (docs/agent-prompts/README.md). Treatment = the real harness
  // (workflowTask, CLAUDE.md loaded). Control = the SAME prompt in a freshly created empty tmpdir
  // with settingSources: [] — no CLAUDE.md, no .claude/, no project context at all (case.ts's
  // `contrast` branch does exactly this: `mkdtempSync` + `runClaude(..., { cwd: emptyCwd,
  // settingSources: [] })`). tools left at the kind's own default (["Read","Grep","Glob"]) — this
  // case needs no Task/Agent/Skill grant.
  {
    kind: "contrast",
    name: "contrast: CLAUDE.md routes an api-contract-reviewer prompt edit to docs/agent-prompts/",
    prompt:
      "Хочу відредагувати системний промпт вбудованого api-contract-reviewer агента, щоб він " +
      "суворіше перевіряв дрейф форми відповіді (response shape drift). За настановами цього " +
      "репозиторію — де лежить файл з цим промптом? Прочитай його.",
    expectFileRead: "docs/agent-prompts/api-contract-reviewer.md",
    maxTurns: 8,
  },
];
