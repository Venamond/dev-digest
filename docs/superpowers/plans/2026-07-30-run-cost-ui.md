# Run Cost UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показати вартість (cost, USD) запуску рев'ювера на трьох екранах — список Pull Requests, таймлайн запусків у PR detail, Run Trace drawer (Duration/Tokens/Cost/Findings) — довівши вже наявний, але недоперсистований розрахунок `costUsd` до бази даних і UI.

**Architecture:** `reviewer-core` вже рахує `ReviewOutcome.costUsd`; ланцюжок обривається в `run-executor.ts`, який досі його не зберігає. План: (1) повернути колонку `agent_runs.cost_usd`, (2) перестати викидати `costUsd` при записі результату запуску, (3) перевести обчислення ціни в `openai.ts`/`anthropic.ts` на інжектований `PriceBook` (той самий патерн, що вже є в `OpenRouterProvider`), (4) розширити спільні контракти (`RunStats`, `RunSummary`, `PrMeta`) полем `cost_usd`, (5) вивести значення на трьох екранах через єдиний `CostBadge`.

**Tech Stack:** Fastify 5 + Drizzle (Postgres) на сервері; Next.js 15 + React 19 + next-intl на клієнті; Vitest (server-unit / server-integration / client) для тестів.

## Global Constraints

- `agent_runs.cost_usd` — нова міграція (не редагувати `0009_complex_runaways.sql`, яка її видалила).
- Джерело ціни — `PriceBook` (живі ціни OpenRouter, fallback на статичну `pricing.ts`) для **всіх** провайдерів (`openai`, `anthropic`, `openrouter`), не тільки OpenRouter.
- Cost у списку PR = cost **останнього** запуску на цей PR (не сума історичних запусків) — той самий семантичний патерн, що вже використовується для `score`.
- Форматування cost — єдиний компонент `CostBadge`, використовується на всіх трьох екранах: `usd == null` → `"—"`; `usd < 1` → `"$" + usd.toFixed(3)`; `usd >= 1` → `"$" + usd.toFixed(2)`.
- `server/src/vendor/shared` і `client/src/vendor/shared` мають лишатись синхронізованими — кожна зміна контракту редагується в обох копіях.
- Порядок статів у Run Trace drawer: Duration → Tokens → Cost → Findings.

---

### Task 1: Схема БД + міграція (`agent_runs.cost_usd`)

**Files:**
- Modify: `server/src/db/schema/runs.ts`
- Create (auto-generated): `server/src/db/migrations/00010_<auto-name>.sql` (точне ім'я згенерує `drizzle-kit`)

**Interfaces:**
- Produces: `agentRuns.costUsd` (Drizzle-колонка, тип `doublePrecision`, nullable) — використовується в Task 6 (`completeAgentRun`) і Task 8 (агрегація для списку PR).

- [ ] **Step 1: Додати поле в схему**

У `server/src/db/schema/runs.ts` в об'єкті `agentRuns` (файл: `server/src/db/schema/runs.ts:8-30`), одразу після `blockers`:

```ts
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
  /** USD cost of this run's LLM calls; null when the model's price is unknown. */
  costUsd: doublePrecision('cost_usd'),
});
```

І додати `doublePrecision` до імпорту в шапці файлу:

```ts
import { pgTable, uuid, text, integer, doublePrecision, jsonb, timestamp } from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Згенерувати міграцію**

```bash
cd server && pnpm db:generate
```

Перевірити, що новий файл у `server/src/db/migrations/` містить рівно:

```sql
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

- [ ] **Step 3: Прогнати міграцію проти локальної БД**

Переконатись, що Postgres піднятий (`./scripts/dev.sh` або вже запущений з попередньої розробки), потім:

```bash
cd server && pnpm db:migrate
```

Очікування: команда завершується без помилок, у логах видно застосування нової міграції.

- [ ] **Step 4: Перевірити типи**

```bash
cd server && pnpm typecheck
```

Очікування: без помилок.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema/runs.ts server/src/db/migrations/
git commit -m "feat(db): add agent_runs.cost_usd column"
```

---

### Task 2: Спільні контракти — `RunStats`, `RunSummary`, `PrMeta` (`cost_usd`)

**Files:**
- Modify: `server/src/vendor/shared/contracts/trace.ts`
- Modify: `client/src/vendor/shared/contracts/trace.ts`
- Modify: `server/src/vendor/shared/contracts/platform.ts`
- Modify: `client/src/vendor/shared/contracts/platform.ts`

**Interfaces:**
- Produces: `RunStats.cost_usd: number | null`, `RunSummary.cost_usd: number | null`, `PrMeta.cost_usd?: number | null` — споживаються в Task 6, 7, 8 (сервер, запис/читання) і Task 11, 12, 13 (клієнт, рендер).

- [ ] **Step 1: `RunStats` — обидві копії `trace.ts`**

У `server/src/vendor/shared/contracts/trace.ts` (і ідентично в `client/src/vendor/shared/contracts/trace.ts`), знайти:

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  findings: z.number().int(),
  grounding: z.string(),
});
```

Замінити на:

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** USD cost of this run's LLM calls; null when the model's price is unknown. */
  cost_usd: z.number().nullable(),
  findings: z.number().int(),
  grounding: z.string(),
});
```

- [ ] **Step 2: `RunSummary` — обидві копії `trace.ts`**

У тому самому файлі (обидві копії), в `RunSummary`, одразу після `tokens_out`:

```ts
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  /** USD cost of this run's LLM calls; null when unknown or run failed pre-LLM. */
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
});
```

- [ ] **Step 3: `PrMeta` — обидві копії `platform.ts`**

У `server/src/vendor/shared/contracts/platform.ts` (і ідентично в `client/src/vendor/shared/contracts/platform.ts`), в `PrMeta`, одразу після `score`:

```ts
export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  // Latest-review score (list endpoint only; null/absent until reviewed).
  score: z.number().int().nullish(),
  // Latest agent-run cost per PR (list endpoint only; null/absent until a run completes).
  cost_usd: z.number().nullish(),
});
```

- [ ] **Step 4: Перевірити, що сервер і клієнт компілюються**

```bash
cd server && pnpm typecheck
cd client && pnpm typecheck
```

Очікування: без помилок (нові поля поки ніде не заповнюються — типи `zod`-схем допускають `nullable`/`nullish`, TS ще не вимагає значень там, де вони не читаються).

- [ ] **Step 5: Commit**

```bash
git add server/src/vendor/shared/contracts/trace.ts client/src/vendor/shared/contracts/trace.ts \
        server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts
git commit -m "feat(contracts): add cost_usd to RunStats, RunSummary, PrMeta"
```

---

### Task 3: `OpenAIProvider` — інжектований `estimateCost`

**Files:**
- Modify: `server/src/adapters/llm/openai.ts`

**Interfaces:**
- Consumes: `estimateCost(model, tokensIn, tokensOut): number | null` з `./pricing.js` (наявний, без змін).
- Produces: `OpenAIProviderOptions.estimateCost?` — конструкторська опція, споживається в Task 5 (`container.ts`).

- [ ] **Step 1: Додати опційний конструкторський параметр**

У `server/src/adapters/llm/openai.ts`, замінити:

```ts
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }
```

на:

```ts
export interface OpenAIProviderOptions {
  /** Injected cost estimator (e.g. PriceBook.estimate); falls back to the static table. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  private client: OpenAI;
  private estimateCost: (model: string, tokensIn: number, tokensOut: number) => number | null;

  constructor(apiKey: string, opts: OpenAIProviderOptions = {}) {
    this.client = new OpenAI({ apiKey });
    this.estimateCost = opts.estimateCost ?? estimateCost;
  }
```

- [ ] **Step 2: Використати `this.estimateCost` замість прямого імпорту в обох методах**

У `doComplete` (файл: `server/src/adapters/llm/openai.ts`, метод повертає `CompletionResult`):

```ts
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: this.estimateCost(req.model, tokensIn, tokensOut),
    };
```

У `completeStructured` (той самий файл, гілка успішного парсингу):

```ts
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: this.estimateCost(req.model, tokensIn, tokensOut),
          raw: lastRaw,
          attempts: attempt,
        };
```

Імпорт `estimateCost` з `./pricing.js` лишається — тепер він використовується як дефолтне значення в конструкторі, а не напряму в методах.

- [ ] **Step 3: Перевірити типи**

```bash
cd server && pnpm typecheck
```

Очікування: без помилок. (Existing call sites `new OpenAIProvider(key)` лишаються валідними — другий параметр опційний.)

- [ ] **Step 4: Commit**

```bash
git add server/src/adapters/llm/openai.ts
git commit -m "feat(llm): make OpenAIProvider cost estimator injectable"
```

---

### Task 4: `AnthropicProvider` — інжектований `estimateCost`

**Files:**
- Modify: `server/src/adapters/llm/anthropic.ts`

**Interfaces:**
- Consumes: `estimateCost(model, tokensIn, tokensOut): number | null` з `./pricing.js`.
- Produces: `AnthropicProviderOptions.estimateCost?` — споживається в Task 5.

- [ ] **Step 1: Додати опційний конструкторський параметр**

У `server/src/adapters/llm/anthropic.ts`, замінити:

```ts
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }
```

на:

```ts
export interface AnthropicProviderOptions {
  /** Injected cost estimator (e.g. PriceBook.estimate); falls back to the static table. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;
  private estimateCost: (model: string, tokensIn: number, tokensOut: number) => number | null;

  constructor(apiKey: string, opts: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({ apiKey });
    this.estimateCost = opts.estimateCost ?? estimateCost;
  }
```

- [ ] **Step 2: Використати `this.estimateCost` в обох методах**

У `doComplete`:

```ts
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: this.estimateCost(req.model, tokensIn, tokensOut),
    };
```

У `completeStructured` (гілка успішного парсингу):

```ts
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: this.estimateCost(req.model, tokensIn, tokensOut),
          raw: lastRaw,
          attempts: attempt,
        };
```

- [ ] **Step 3: Перевірити типи**

```bash
cd server && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add server/src/adapters/llm/anthropic.ts
git commit -m "feat(llm): make AnthropicProvider cost estimator injectable"
```

---

### Task 5: `container.ts` — підключити `PriceBook` до `openai`/`anthropic`

**Files:**
- Modify: `server/src/platform/container.ts`

**Interfaces:**
- Consumes: `OpenAIProviderOptions`/`AnthropicProviderOptions` з Task 3/4; `this.priceBook: PriceBook` (наявний геттер, без змін).

- [ ] **Step 1: Передати `estimateCost` у `buildLlm`**

У `server/src/platform/container.ts`, метод `buildLlm` (рядки ~172-192), замінити:

```ts
  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }
```

на:

```ts
  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    // All three providers share ONE cost source: PriceBook (live OpenRouter
    // prices, static-table fallback) — not just the OpenRouter path.
    const estimateCost = (model: string, tokensIn: number, tokensOut: number) =>
      this.priceBook.estimate(model, tokensIn, tokensOut);
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key, { estimateCost });
    }
    if (id === 'openrouter') {
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, { estimateCost });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key, { estimateCost });
  }
```

- [ ] **Step 2: Перевірити типи**

```bash
cd server && pnpm typecheck
```

- [ ] **Step 3: Прогнати наявний unit-набір, щоб переконатись, що нічого не зламано**

```bash
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
```

Очікування: усі тести проходять (ця зміна не чіпає жодну логіку, яку вони перевіряють — `price-book.test.ts` тестує `PriceBook` напряму й не залежить від `container.ts`).

- [ ] **Step 4: Commit**

```bash
git add server/src/platform/container.ts
git commit -m "feat(llm): wire PriceBook as the cost source for openai and anthropic providers"
```

---

### Task 6: `run-executor.ts` — перестати викидати `costUsd`

**Files:**
- Modify: `server/src/modules/reviews/run-executor.ts`

**Interfaces:**
- Consumes: `outcome.costUsd: number | null` (вже повертається `reviewPullRequest`, без змін); `agentRuns.costUsd` з Task 1; `RunStats.cost_usd` з Task 2.
- Produces: `agent_runs.cost_usd` персистується; `RunTrace.stats.cost_usd` заповнюється — споживається Task 7 (список запусків) і клієнтським `TraceBody` (Task 13).

- [ ] **Step 1: Деструктурувати `costUsd` з `outcome`**

У `server/src/modules/reviews/run-executor.ts:213`, замінити:

```ts
      const { tokensIn, tokensOut, grounding } = outcome;
```

на:

```ts
      const { tokensIn, tokensOut, grounding, costUsd } = outcome;
```

- [ ] **Step 2: Передати `costUsd` у `completeAgentRun`**

У тому самому файлі, виклик `completeAgentRun` для успішного завершення (біля рядка ~243):

```ts
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        costUsd,
        error: null,
      });
```

- [ ] **Step 3: Додати `cost_usd` у побудову `RunTrace`**

У тому самому файлі, об'єкт `trace.stats` (біля рядка ~262):

```ts
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
```

- [ ] **Step 4: Проставити `cost_usd: null` у `traceFromBuffer` (failed/cancelled шлях)**

У приватному методі `traceFromBuffer` (біля рядка ~408), у полі `stats`:

```ts
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
```

- [ ] **Step 5: Прийняти `costUsd` у сигнатурах `completeAgentRun` (repository + run.repo)**

У `server/src/modules/reviews/repository/run.repo.ts:141-158`, у типі `values` функції `completeAgentRun`, додати поле одразу після `blockers`:

```ts
export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    findingsCount: number;
    grounding: string;
    score?: number | null;
    blockers?: number | null;
    /** USD cost of this run's LLM calls; null when unknown. */
    costUsd?: number | null;
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      costUsd: values.costUsd ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}
```

І дзеркально в `server/src/modules/reviews/repository.ts:150-168`, у тонкій обгортці `completeAgentRun`, додати те саме поле в тип `values`:

```ts
  completeAgentRun(
    runId: string,
    values: {
      status: 'done' | 'failed' | 'cancelled';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      findingsCount: number;
      grounding: string;
      score?: number | null;
      blockers?: number | null;
      /** USD cost of this run's LLM calls; null when unknown. */
      costUsd?: number | null;
      error?: string | null;
    },
  ): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }
```

- [ ] **Step 6: Перевірити типи**

```bash
cd server && pnpm typecheck
```

- [ ] **Step 7: Прогнати unit-набір**

```bash
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
```

Очікування: усі тести проходять.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/reviews/run-executor.ts server/src/modules/reviews/repository/run.repo.ts server/src/modules/reviews/repository.ts
git commit -m "feat(reviews): persist run cost_usd instead of dropping it"
```

---

### Task 7: `run.repo.ts` — `cost_usd` у `listRunsForPull` (таймлайн, Екран 2)

**Files:**
- Modify: `server/src/modules/reviews/repository/run.repo.ts`

**Interfaces:**
- Consumes: `agentRuns.costUsd` (Task 1), `RunSummary.cost_usd` (Task 2).
- Produces: `RunSummary.cost_usd` заповнене — споживається клієнтським `RunHistory` (Task 12).

- [ ] **Step 1: Додати `cost_usd` у мапінг рядка**

У `server/src/modules/reviews/repository/run.repo.ts`, функція `listRunsForPull` (рядки ~39-68), у `return rows.map(...)`:

```ts
  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  }));
```

- [ ] **Step 2: Перевірити типи**

```bash
cd server && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/reviews/repository/run.repo.ts
git commit -m "feat(reviews): surface cost_usd in the PR run history"
```

---

### Task 8: `pulls/routes.ts` — cost останнього запуску в списку PR (Екран 1)

**Files:**
- Modify: `server/src/modules/pulls/routes.ts`

**Interfaces:**
- Consumes: `agentRuns` (Task 1), `PrMeta.cost_usd` (Task 2).
- Produces: `GET /repos/:id/pulls` повертає `cost_usd` на кожному елементі — споживається клієнтським `PRRow` (Task 11).

- [ ] **Step 1: Додати latest-cost-per-PR запит поруч із latest-score**

У `server/src/modules/pulls/routes.ts`, одразу після блоку latest-score (рядки ~114-129, що будує `latestReviewByPr`), додати аналогічний блок по `agent_runs`:

```ts
    // Latest agent-run COST per PR for the list's cost column. Same pattern as
    // the score block above, but from `agent_runs` (not `reviews`) — cost is a
    // property of the RUN, not the review. "Latest", not summed across runs.
    const latestCostByPr = new Map<string, number | null>();
    if (prIds.length > 0) {
      const runRows = await container.db
        .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds))
        .orderBy(desc(t.agentRuns.ranAt));
      // Rows are newest-first → first seen per PR is the latest run.
      for (const rr of runRows) {
        if (rr.prId && !latestCostByPr.has(rr.prId)) latestCostByPr.set(rr.prId, rr.costUsd);
      }
    }
```

- [ ] **Step 2: Додати `cost_usd` у відповідь**

У тому самому файлі, в `return rows.map((r) => { ... })` (рядки ~131-155), додати поле в кінці об'єкта:

```ts
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: latestCostByPr.get(r.id) ?? null,
      };
    });
```

- [ ] **Step 3: Перевірити типи**

```bash
cd server && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/pulls/routes.ts
git commit -m "feat(pulls): surface latest agent-run cost in the PR list"
```

---

### Task 9: Інтеграційний тест — cost проходить через увесь ланцюжок

**Files:**
- Modify: `server/test/reviews.it.test.ts`

**Interfaces:**
- Consumes: `MockLLMProvider` (наявний, `server/src/adapters/mocks.ts:101` — `completeStructured` завжди повертає `costUsd: 0.001`), увесь ланцюжок з Task 1, 6, 7, 8.

Це docker-gated тест (`*.it.test.ts`), піднімає реальний Postgres через testcontainers. Уже наявний тест `'runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one'` (файл `server/test/reviews.it.test.ts`, рядки ~152-212) запускає повний review-цикл через `MockLLMProvider` (яка завжди повертає `costUsd: 0.001` з `completeStructured`, `server/src/adapters/mocks.ts:101`) і вже дістає `runId`, `trace`, `run` — розширюємо САМЕ ЦЕЙ тест новими асертами, а не додаємо окремий `it`.

- [ ] **Step 1: Додати асерти в наявний тест**

У `server/test/reviews.it.test.ts`, усередині `it('runs a review: map-reduce ...', async () => { ... })`, одразу після наявного блоку:

```ts
    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    await app.close();
  });
```

вставити нові асерти ПЕРЕД `await app.close();` (тобто `run`, `trace`, `pr`, `runId`, `app` — уже наявні змінні в цій самій функції):

```ts
    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');
    // cost: a single-chunk diff makes exactly ONE completeStructured call, so
    // MockLLMProvider's fixed costUsd (0.001) is the run's total — persisted
    // on agent_runs, in the trace stats, and surfaced on the PR list.
    expect(run!.costUsd).toBeCloseTo(0.001, 6);
    expect(trace.stats.cost_usd).toBeCloseTo(0.001, 6);

    const list = (await app.inject({ method: 'GET', url: `/repos/${pr.repoId}/pulls` })).json();
    const listedPr = list.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeCloseTo(0.001, 6);

    await app.close();
  });
```

`pr.repoId` — поле, яке вже повертає `db.insert(t.pullRequests).values({ ... repoId: repo!.id, ... }).returning()` у `setupRepoAndPr` (той самий файл, рядки ~64-84): вставлений рядок містить `repoId`, тож `.returning()` повертає його на об'єкті `pr`.

- [ ] **Step 2: Прогнати інтеграційний тест**

```bash
cd server && pnpm exec vitest run reviews.it.test
```

Очікування: PASS (потребує Docker; тест сам скіпається, якщо Docker недоступний — `describe.skip` через `dockerAvailable()`).

- [ ] **Step 3: Commit**

```bash
git add server/test/reviews.it.test.ts
git commit -m "test(reviews): cover cost_usd through run → trace → PR list"
```

---

### Task 10: Клієнтський компонент `CostBadge`

**Files:**
- Create: `client/src/components/cost-badge/CostBadge.tsx`
- Create: `client/src/components/cost-badge/index.ts`
- Test: `client/src/components/cost-badge/CostBadge.test.tsx`

**Interfaces:**
- Produces: `CostBadge({ usd: number | null | undefined }): JSX.Element` — імпортується як `import { CostBadge } from "@/components/cost-badge";` у Task 11, 12, 13.

- [ ] **Step 1: Написати тест**

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CostBadge } from "./CostBadge";

afterEach(cleanup);

describe("CostBadge", () => {
  it("renders an em-dash for null cost", () => {
    render(<CostBadge usd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders 3 decimals for sub-dollar cost", () => {
    render(<CostBadge usd={0.0134} />);
    expect(screen.getByText("$0.013")).toBeInTheDocument();
  });

  it("renders 2 decimals for cost at or above $1", () => {
    render(<CostBadge usd={8.7} />);
    expect(screen.getByText("$8.70")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Переконатись, що тест падає (компонент ще не існує)**

```bash
cd client && pnpm exec vitest run cost-badge/CostBadge.test.tsx
```

Очікування: FAIL — "Failed to resolve import ./CostBadge".

- [ ] **Step 3: Реалізувати компонент**

```tsx
/* CostBadge — single formatting authority for run cost (USD) across all three
   cost surfaces: PR list, run timeline, Run Trace drawer stats. */
import React from "react";

export function CostBadge({ usd }: { usd: number | null | undefined }) {
  if (usd == null) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  const formatted = usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
  return (
    <span className="mono tnum" style={{ color: "var(--text-secondary)" }}>
      {formatted}
    </span>
  );
}
```

```ts
export * from "./CostBadge";
```

(другий блок — вміст `client/src/components/cost-badge/index.ts`)

- [ ] **Step 4: Переконатись, що тест проходить**

```bash
cd client && pnpm exec vitest run cost-badge/CostBadge.test.tsx
```

Очікування: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/cost-badge/
git commit -m "feat(ui): add CostBadge — shared cost formatting component"
```

---

### Task 11: Екран 1 — колонка Cost у списку Pull Requests

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/constants.ts`
- Modify: `client/src/app/repos/[repoId]/pulls/styles.ts`
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- Modify: `client/messages/en/prReview.json`
- Test: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`

**Interfaces:**
- Consumes: `CostBadge` (Task 10), `PrMeta.cost_usd` (Task 2, вже проброшене через `@devdigest/shared` → `client/src/lib/types.ts`, змін у `types.ts` не потрібно — це прямий ре-експорт).

- [ ] **Step 1: Написати тест PRRow (спочатку — впаде, бо колонки Cost ще нема)**

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "abc123",
    additions: 200,
    deletions: 85,
    files_count: 4,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    score: null,
    cost_usd: null,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost column", () => {
  it("shows an em-dash when the PR has never been reviewed", () => {
    renderRow(pr({ cost_usd: null }));
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows the formatted cost of the latest run", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Переконатись, що тест падає**

```bash
cd client && pnpm exec vitest run PRRow.test.tsx
```

Очікування: FAIL (колонки cost ще немає — `$0.014` не рендериться; або компонент навіть не приймає `cost_usd` в типі, якщо Task 2 не підхопився — але Task 2 вже зроблено раніше, тож тип є, просто UI ще не рендерить).

- [ ] **Step 3: Додати колонку в `constants.ts`**

У `client/src/app/repos/[repoId]/pulls/constants.ts`:

```ts
/** Grid template for both the header row and PR rows. */
export const GRID = "1fr 132px 92px 60px 118px 74px 78px";
```

```ts
/** Column header i18n keys (under `list.columns`), in display order. */
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "score",
  "status",
  "cost",
  "updated",
];
```

- [ ] **Step 4: Додати i18n-лейбл**

У `client/messages/en/prReview.json`, у `list.columns` (рядки ~89-96), додати `"cost"` після `"status"`:

```json
    "columns": {
      "pullRequest": "Pull request",
      "author": "Author",
      "size": "Size",
      "score": "Score",
      "status": "Status",
      "cost": "Cost",
      "updated": "Updated"
    },
```

- [ ] **Step 5: Додати стиль клітинки**

У `client/src/app/repos/[repoId]/pulls/styles.ts`, одразу після `scoreCell`:

```ts
  scoreCell: { display: "flex", alignItems: "center" } satisfies CSSProperties,
  costCell: { display: "flex", alignItems: "center", fontSize: 12.5 } satisfies CSSProperties,
```

- [ ] **Step 6: Відрендерити колонку в `PRRow.tsx`**

У `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`, додати імпорт:

```tsx
import { CostBadge } from "@/components/cost-badge";
```

І вставити нову клітинку між статусом і "оновлено":

```tsx
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <CostBadge usd={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
```

- [ ] **Step 7: Переконатись, що тест проходить**

```bash
cd client && pnpm exec vitest run PRRow.test.tsx
```

Очікування: PASS (2/2).

- [ ] **Step 8: Прогнати весь клієнтський набір і typecheck**

```bash
cd client && pnpm test
cd client && pnpm typecheck
```

Очікування: усе проходить (жоден наявний тест не залежав від старого `GRID`/`COLUMN_KEYS` пожорстко).

- [ ] **Step 9: Commit**

```bash
git add client/src/app/repos/\[repoId\]/pulls/constants.ts \
        client/src/app/repos/\[repoId\]/pulls/styles.ts \
        client/src/app/repos/\[repoId\]/pulls/_components/PRRow/ \
        client/messages/en/prReview.json
git commit -m "feat(pulls): show latest run cost in the PR list"
```

---

### Task 12: Екран 2 — cost у таймлайні запусків (`RunHistory`)

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`

**Interfaces:**
- Consumes: `CostBadge` (Task 10), `RunSummary.cost_usd` (Task 2).

- [ ] **Step 1: Оновити фікстуру `run()` у наявному тестовому файлі**

У `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`, у хелпері `run()` (рядки ~17-31), додати поле — інакше файл не скомпілюється, щойно `RunSummary.cost_usd` стане обов'язковим (`nullable`, не `nullish`):

```ts
function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}
```

- [ ] **Step 2: Додати новий тест (спочатку — впаде)**

У тому самому файлі, у `describe("RunHistory — outcome badge", ...)`, додати:

```ts
  it("shows the run's cost next to its timestamp", () => {
    renderRuns([run({ status: "done", cost_usd: 0.0013 })]);
    expect(screen.getByText("$0.001")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Переконатись, що новий тест падає**

```bash
cd client && pnpm exec vitest run RunHistory.test.tsx
```

Очікування: новий тест FAIL (`$0.001` не рендериться), решта — PASS (фікстура вже виправлена в Step 1).

- [ ] **Step 4: Додати `CostBadge` поруч із часом**

У `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`, додати імпорт:

```tsx
import { CostBadge } from "@/components/cost-badge";
```

І в блоці з часом запуску (наприкінці мапи `items`, там де `{r.ran_at && <span>...}`):

```tsx
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              <CostBadge usd={r.cost_usd} />
            </div>
```

- [ ] **Step 5: Переконатись, що тест проходить**

```bash
cd client && pnpm exec vitest run RunHistory.test.tsx
```

Очікування: усі тести PASS (включно з наявними — em-dash `CostBadge` для `cost_usd: null` не конфліктує з рештою асертів, бо `getByText` в них шукає інші рядки).

- [ ] **Step 6: Commit**

```bash
git add client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/RunHistory/
git commit -m "feat(runs): show run cost in the PR agent-runs timeline"
```

---

### Task 13: Екран 3 — Cost у Run Trace drawer (Duration / Tokens / Cost / Findings)

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts`
- Modify: `client/messages/en/runs.json`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx`

**Interfaces:**
- Consumes: `CostBadge` (Task 10), `RunTrace.stats.cost_usd` (Task 2).

- [ ] **Step 1: Оновити фікстуру `TRACE` у наявному тесті (інакше не скомпілюється)**

У `RunTraceDrawer.test.tsx`, у константі `TRACE.stats` (рядок ~10), додати поле:

```ts
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
```

- [ ] **Step 2: Додати новий асерт у наявний тест "renders the trace tabs and stats"**

У тому самому файлі, в `it("renders the trace tabs and stats", ...)`:

```ts
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Переконатись, що тест падає**

```bash
cd client && pnpm exec vitest run RunTraceDrawer.test.tsx
```

Очікування: FAIL — `$0.06` не рендериться (компонент ще не додав четвертий Stat).

- [ ] **Step 4: Додати i18n-ключ**

У `client/messages/en/runs.json`, у `trace.stat` (рядки ~39-43), додати `"cost"` після `"tokens"`:

```json
    "stat": {
      "duration": "DURATION",
      "tokens": "TOKENS",
      "cost": "COST",
      "findings": "FINDINGS"
    },
```

- [ ] **Step 5: Оновити grid статів на 4 колонки**

У `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts`, знайти `statsRow` (рядок ~100):

```ts
  statsRow: { display: "flex", gap: 10 } satisfies CSSProperties,
```

`display: flex` з `gap` уже розтягує будь-яку кількість `Stat`-тайлів рівномірно (кожен `Stat` сам займає `flex: 1` — перевірити `s.stat` на сусідніх рядках; якщо там немає `flex: 1`, додати його, інакше 4 тайли не заповнять рядок так само, як 3):

```ts
  stat: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
```

(Звірити з наявним вмістом `s.stat` перед заміною — додати лише `flex: 1`, якщо цього поля там ще нема; решту полів не чіпати.)

- [ ] **Step 6: Додати четвертий `Stat` у `TraceBody.tsx`**

У `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, додати імпорт:

```tsx
import { CostBadge } from "@/components/cost-badge";
```

І в `s.statsRow`, порядок Duration → Tokens → Cost → Findings:

```tsx
        <div style={s.statsRow}>
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.cost")} val={<CostBadge usd={stats.cost_usd} />} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
```

- [ ] **Step 7: Переконатись, що тест проходить**

```bash
cd client && pnpm exec vitest run RunTraceDrawer.test.tsx
```

Очікування: усі тести PASS, включно з новим асертом `$0.06`.

- [ ] **Step 8: Прогнати весь клієнтський набір і typecheck**

```bash
cd client && pnpm test
cd client && pnpm typecheck
```

- [ ] **Step 9: Commit**

```bash
git add client/src/app/repos/\[repoId\]/pulls/\[number\]/_components/RunTraceDrawer/ \
        client/messages/en/runs.json
git commit -m "feat(trace): add Cost stat to the Run Trace drawer"
```

---

## Фінальна перевірка

- [ ] **Прогнати весь сервер і клієнт наскрізь**

```bash
cd server && pnpm test        # unit + integration (потребує Docker для .it.test.ts)
cd client && pnpm test        # + typecheck
```

- [ ] **Ручна перевірка в браузері** (`./scripts/dev.sh`, потім `pnpm db:migrate` у `server/`, якщо ще не зроблено):
  1. Список Pull Requests — колонка Cost показує `$X.XXX` або `—`.
  2. PR detail → таймлайн запусків — cost поруч із часом кожного запуску.
  3. Клік на іконку трейсу → Run Trace drawer → блок Stats показує Duration / Tokens / Cost / Findings.
