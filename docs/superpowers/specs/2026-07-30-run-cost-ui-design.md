# Feature: показ вартості (cost) запусків рев'юверів на трьох екранах

Дата: 2026-07-30
Статус: approved (design), реалізація не розпочата

## Проблема / мета

У `agent-runs`/review-запусках вже рахується вартість LLM-виклику (`ReviewOutcome.costUsd` у `reviewer-core/src/review/run.ts`), але вона ніде не персистується і не показується користувачу. Потрібно вивести cost на трьох екранах:

1. Список Pull Requests — колонка COST.
2. Таймлайн запусків агентів всередині PR detail (поруч із часом запуску).
3. Run Trace drawer (сайдбар) — поруч із Duration / Tokens / Findings.

## Контекст (що вже є в коді)

Інфраструктура cost побудована частково і обривається перед персистом:

- `server/src/adapters/llm/pricing.ts` — статична таблиця `estimateCost(model, tokensIn, tokensOut): number | null` (USD/1M токенів), використовується в `openai.ts` і `anthropic.ts`.
- `server/src/platform/price-book.ts` — `PriceBook`: живі ціни OpenRouter (`/models`), з fallback на статичну таблицю. Вже інжектується в `OpenRouterProvider` через `container.ts:181-187`.
- `reviewer-core/src/review/run.ts` — `reviewPullRequest()` рахує і повертає `ReviewOutcome.costUsd`, підсумовуючи по чанках, `null`-пропагуючи при невідомій моделі.
- `server/src/modules/reviews/run-executor.ts:213` — `const { tokensIn, tokensOut, grounding } = outcome;` — **`costUsd` мовчки викидається**, не потрапляє ні в `agent_runs`, ні в `trace.stats`.
- `agent_runs.cost_usd` — колонка існувала в `0000_init.sql` і була свідомо видалена міграцією `0009_complex_runaways.sql` (єдиний рядок у файлі: `DROP COLUMN "cost_usd"`). Сусідні таблиці `eval_runs.cost_usd` і `ci_runs.cost_usd` лишились незачепленими.
- Контракти `RunStats`/`RunSummary` (`vendor/shared/contracts/trace.ts`) і `PrMeta` (`vendor/shared/contracts/platform.ts`) не містять cost-поля.
- У дизайн-файлі (`DevDigest Design (standalone).html`) знайдено перевикористовуваний JSX-компонент `CostBadge` із канонічною логікою форматування (див. розділ 5).

## Дизайн, підтверджений скриншотами з `DevDigest Design (standalone).html`

### Екран 1 — Pull Requests list (artboard `dashboard`)

Колонка **COST** між STATUS і UPDATED. Значення невеликі ($0.003–$0.041), у Stale-рядка без findings стоїть "—". Формат збігається з `CostBadge` (`<$1` → 3 знаки).

**Рішення: cost = cost останнього запуску ревью на цьому PR** (той самий семантичний патерн, що вже використовується для `score` — "latest, не сума"), не сума всіх історичних запусків.

### Екран 2 — Agent runs timeline у PR detail (artboard `pr-runs`, компонент `TimelineRun`)

Під таймстампом справа в кожному рядку таймлайну: `tokens.toLocaleString() + " tok · $" + cost` поруч із часом запуску. У самому дизайні cost відформатований вручну (`.toFixed(4)`), але за рішенням із брейнштормінгу — стандартизуємо на загальний `CostBadge` (3/2 знаки), а не копіюємо цей edge case дизайну дослівно.

### Екран 3 — Run Trace drawer, Stats-блок (artboard `trace-hist`, компонент `TraceBody`)

4 колонки в ряд: **DURATION | TOKENS | COST | FINDINGS** (було 3: Duration/Tokens/Findings). Приклад із дизайну: `8.2s | 15k→1.2k | $0.06 | 3`.

### Спільний компонент форматування — `CostBadge`

Портується з дизайн-файлу в реальний код, використовується на всіх трьох екранах (єдина точка форматування):

```js
function formatCost(usd) {
  if (usd == null) return "—";
  return usd < 1 ? "$" + usd.toFixed(3) : "$" + usd.toFixed(2);
}
```

## Backend зміни

### 1. Міграція (новий файл, не редагуємо 0009)

```sql
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

### 2. Схема

`server/src/db/schema/runs.ts` → `agentRuns.costUsd = doublePrecision('cost_usd')`.

### 3. Перестати викидати `costUsd` у `run-executor.ts`

- Рядок ~213: деструктурувати `costUsd` разом з `tokensIn`/`tokensOut`/`grounding`.
- Передати `costUsd` у `completeAgentRun(...)` (персист у `agent_runs.cost_usd`).
- Додати `cost_usd: costUsd` у `trace.stats` при побудові `RunTrace`.

### 4. Джерело ціни — PriceBook усюди

- `server/src/adapters/llm/openai.ts` і `anthropic.ts`: замінити прямий виклик статичного `estimateCost()` з `pricing.ts` на інжектований `container.priceBook.estimate(...)`, за аналогією з вже наявною інтеграцією в `OpenRouterProvider` (`container.ts:181-187`).
- `PriceBook.estimate()` вже грайливо (graceful) фолбечиться на ту саму статичну таблицю при відсутності живої ціни — поведінка не погіршується для жодного провайдера, тільки виграє там, де в OpenRouter є live-ціна на відповідну модель.
- `pricing.ts`/`estimateCost` не видаляються — лишаються як fallback-реалізація всередині `PriceBook`.

### 5. Контракти (`vendor/shared/contracts`, server і client копії мають лишитись побайтово ідентичними)

- `trace.ts`: `RunStats.cost_usd: number | null`, `RunSummary.cost_usd: number | null`.
- `platform.ts`: `PrMeta.cost_usd: number | null` (коментар за аналогією з наявним `score`: "Latest agent-run cost per PR, list endpoint only").

### 6. Агрегація cost для списку PR

`server/src/modules/pulls/routes.ts` — за аналогією з наявним latest-score блоком (рядки ~114–155, коментар "Latest-review SCORE per PR..."): аналогічний IN-запит, але по `agent_runs` (не `reviews`), сортування за `ranAt desc`, беремо `cost_usd` першого (найсвіжішого) рядка на `prId`.

## Frontend зміни

### Екран 1 — `client/src/app/repos/[repoId]/pulls/`

- `constants.ts`: додати `"cost"` у `COLUMN_KEYS`, слот ширини в `GRID` (між `status` і `updated`).
- i18n: `prReview.json` → `list.columns.cost`.
- `_components/PRRow/PRRow.tsx`: рендер `<CostBadge usd={pr.cost_usd} />` з тим самим null-guard патерном, що й у `score`.

### Екран 2 — `_components/RunHistory/RunHistory.tsx`

Поруч із наявним `{r.ran_at && <span>{...}</span>}` додати `<CostBadge usd={r.cost_usd} />`.

### Екран 3 — `_components/RunTraceDrawer/`

- `_components/TraceBody/TraceBody.tsx`: четвертий `<Stat label={t("trace.stat.cost")} val={<CostBadge usd={stats.cost_usd} />} />` у `s.statsRow`, порядок: Duration → Tokens → Cost → Findings.
- i18n: `runs.json` → `stat.cost: "COST"`.

### Спільний компонент

Новий файл (наприклад `client/src/components/CostBadge.tsx`) з логікою форматування з розділу «Спільний компонент форматування» вище. Використовується у всіх трьох місцях.

## Явні не-цілі

- Жодна колонка/показник не сумує cost по декількох запусках — всюди "останній запуск" (див. Екран 1).
- Не чіпаємо `reviewer-core/src/llm/openrouter.ts` (вже коректно передає `usage.cost` з API, пріоритет над інжектованим estimator'ом) — зміни лише в `openai.ts`/`anthropic.ts`.
- Не чіпаємо `server/src/vendor/shared/contracts/observability.ts` (`AgentColumn.cost_usd`, `MultiAgentRun.total_cost_usd` тощо) — це scaffolding для майбутнього уроку (multi-agent review), поза межами цієї фічі.
- Не видаляємо і не змінюємо `pricing.ts`/`estimateCost` — лишається як fallback всередині `PriceBook`.

## Тестування

- Сервер (unit): `run-executor.ts` пише `costUsd` в `agent_runs` і в `trace.stats`; агрегувальний запит у `pulls/routes.ts` бере cost найсвіжішого `agent_runs` за `ranAt`; `null`-модель → `cost_usd: null` не ламає серіалізацію відповіді.
- Клієнт (RTL): `CostBadge` — 3 гілки форматування (`null`, `<$1`, `>=$1`); `PRRow` рендерить cost або em-dash; `TraceBody` показує 4 стати в правильному порядку.
- `server/test/price-book.test.ts` вже покриває `PriceBook` напряму — не чіпаємо.
