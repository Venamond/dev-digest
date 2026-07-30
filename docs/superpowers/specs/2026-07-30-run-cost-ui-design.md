# Feature: показывать стоимость (cost) запусков ревьюверов на трёх экранах

Дата: 2026-07-30
Статус: approved (design), реализация не начата

## Проблема / цель

В `agent-runs`/review-запусках уже считается стоимость LLM-вызова (`ReviewOutcome.costUsd` в `reviewer-core/src/review/run.ts`), но она нигде не персистится и не показывается пользователю. Нужно вывести cost на трёх экранах:

1. Список Pull Requests — колонка COST.
2. Таймлайн запусков агентов внутри PR detail (рядом со временем запуска).
3. Run Trace drawer (сайдбар) — рядом с Duration / Tokens / Findings.

## Контекст (что уже есть в коде)

Инфраструктура cost построена частично и обрывается перед персистом:

- `server/src/adapters/llm/pricing.ts` — статическая таблица `estimateCost(model, tokensIn, tokensOut): number | null` (USD/1M токенов), используется в `openai.ts` и `anthropic.ts`.
- `server/src/platform/price-book.ts` — `PriceBook`: живые цены OpenRouter (`/models`), с fallback на статическую таблицу. Уже инжектируется в `OpenRouterProvider` через `container.ts:181-187`.
- `reviewer-core/src/review/run.ts` — `reviewPullRequest()` считает и возвращает `ReviewOutcome.costUsd`, суммируя по чанкам, `null`-пропагируя при неизвестной модели.
- `server/src/modules/reviews/run-executor.ts:213` — `const { tokensIn, tokensOut, grounding } = outcome;` — **`costUsd` молча выбрасывается**, не попадает ни в `agent_runs`, ни в `trace.stats`.
- `agent_runs.cost_usd` — колонка существовала в `0000_init.sql` и была осознанно удалена миграцией `0009_complex_runaways.sql` (единственная строка в файле: `DROP COLUMN "cost_usd"`). Соседние таблицы `eval_runs.cost_usd` и `ci_runs.cost_usd` остались нетронуты.
- Контракты `RunStats`/`RunSummary` (`vendor/shared/contracts/trace.ts`) и `PrMeta` (`vendor/shared/contracts/platform.ts`) не содержат cost-поля.
- В дизайн-файле (`DevDigest Design (standalone).html`) найден переиспользуемый JSX-компонент `CostBadge` с канонической логикой форматирования (см. раздел 5).

## Дизайн, подтверждённый скриншотами из `DevDigest Design (standalone).html`

### Экран 1 — Pull Requests list (artboard `dashboard`)

Колонка **COST** между STATUS и UPDATED. Значения маленькие ($0.003–$0.041), у Stale-строки без findings стоит "—". Формат совпадает с `CostBadge` (`<$1` → 3 знака).

**Решение: cost = cost последнего запуска ревью на этом PR** (тот же семантический паттерн, что уже используется для `score` — "latest, не сумма"), не сумма всех исторических запусков.

### Экран 2 — Agent runs timeline в PR detail (artboard `pr-runs`, компонент `TimelineRun`)

Под таймстампом справа в каждой строке таймлайна: `tokens.toLocaleString() + " tok · $" + cost` рядом со временем запуска. В самом дизайне cost отформатирован вручную (`.toFixed(4)`), но по решению из брейнштормa — стандартизируем на общий `CostBadge` (3/2 знака), а не копируем этот edge case дизайна дословно.

### Экран 3 — Run Trace drawer, Stats-блок (artboard `trace-hist`, компонент `TraceBody`)

4 колонки в ряд: **DURATION | TOKENS | COST | FINDINGS** (было 3: Duration/Tokens/Findings). Пример из дизайна: `8.2s | 15k→1.2k | $0.06 | 3`.

### Общий компонент форматирования — `CostBadge`

Портируется из дизайн-файла в реальный код, используется на всех трёх экранах (единая точка форматирования):

```js
function formatCost(usd) {
  if (usd == null) return "—";
  return usd < 1 ? "$" + usd.toFixed(3) : "$" + usd.toFixed(2);
}
```

## Backend изменения

### 1. Миграция (новый файл, не редактируем 0009)

```sql
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

### 2. Схема

`server/src/db/schema/runs.ts` → `agentRuns.costUsd = doublePrecision('cost_usd')`.

### 3. Перестать выбрасывать `costUsd` в `run-executor.ts`

- Строка ~213: деструктурировать `costUsd` вместе с `tokensIn`/`tokensOut`/`grounding`.
- Передать `costUsd` в `completeAgentRun(...)` (персист в `agent_runs.cost_usd`).
- Добавить `cost_usd: costUsd` в `trace.stats` при построении `RunTrace`.

### 4. Источник цены — PriceBook везде

- `server/src/adapters/llm/openai.ts` и `anthropic.ts`: заменить прямой вызов статического `estimateCost()` из `pricing.ts` на инжектируемый `container.priceBook.estimate(...)`, по аналогии с уже существующей интеграцией в `OpenRouterProvider` (`container.ts:181-187`).
- `PriceBook.estimate()` уже грациозно фолбэчится на ту же статическую таблицу при отсутствии живой цены — поведение не ухудшается ни для одного провайдера, только выигрывает там, где у OpenRouter есть live-цена на соответствующую модель.
- `pricing.ts`/`estimateCost` не удаляются — остаются как fallback-реализация внутри `PriceBook`.

### 5. Контракты (`vendor/shared/contracts`, server и client копии должны остаться побайтово идентичны)

- `trace.ts`: `RunStats.cost_usd: number | null`, `RunSummary.cost_usd: number | null`.
- `platform.ts`: `PrMeta.cost_usd: number | null` (комментарий по аналогии с существующим `score`: "Latest agent-run cost per PR, list endpoint only").

### 6. Агрегация cost для списка PR

`server/src/modules/pulls/routes.ts` — по аналогии с существующим latest-score блоком (строки ~114–155, комментарий "Latest-review SCORE per PR..."): аналогичный IN-запрос, но по `agent_runs` (не `reviews`), сортировка по `ranAt desc`, берём `cost_usd` первой (самой свежей) строки на `prId`.

## Frontend изменения

### Экран 1 — `client/src/app/repos/[repoId]/pulls/`

- `constants.ts`: добавить `"cost"` в `COLUMN_KEYS`, слот ширины в `GRID` (между `status` и `updated`).
- i18n: `prReview.json` → `list.columns.cost`.
- `_components/PRRow/PRRow.tsx`: рендер `<CostBadge usd={pr.cost_usd} />` с тем же null-guard паттерном, что у `score`.

### Экран 2 — `_components/RunHistory/RunHistory.tsx`

Рядом с существующим `{r.ran_at && <span>{...}</span>}` добавить `<CostBadge usd={r.cost_usd} />`.

### Экран 3 — `_components/RunTraceDrawer/`

- `_components/TraceBody/TraceBody.tsx`: четвёртый `<Stat label={t("trace.stat.cost")} val={<CostBadge usd={stats.cost_usd} />} />` в `s.statsRow`, порядок: Duration → Tokens → Cost → Findings.
- i18n: `runs.json` → `stat.cost: "COST"`.

### Общий компонент

Новый файл (например `client/src/components/CostBadge.tsx`) с логикой форматирования из раздела «Общий компонент форматирования» выше. Используется во всех трёх местах.

## Из явных не-целей

- Никакая колонка/показатель не суммирует cost по нескольким запускам — везде "последний запуск" (см. Экран 1).
- Не трогаем `reviewer-core/src/llm/openrouter.ts` (уже правильно передаёт `usage.cost` из API, приоритет над инжектированным estimator'ом) — изменения только в `openai.ts`/`anthropic.ts`.
- Не трогаем `server/src/vendor/shared/contracts/observability.ts` (`AgentColumn.cost_usd`, `MultiAgentRun.total_cost_usd` и т.п.) — это scaffolding для будущего урока (multi-agent review), вне рамок этой фичи.
- Не удаляем и не меняем `pricing.ts`/`estimateCost` — остаётся как fallback внутри `PriceBook`.

## Тестирование

- Сервер (unit): `run-executor.ts` пишет `costUsd` в `agent_runs` и в `trace.stats`; агрегирующий запрос в `pulls/routes.ts` берёт cost самого свежего `agent_runs` по `ranAt`; `null`-модель → `cost_usd: null` не ломает сериализацию ответа.
- Клиент (RTL): `CostBadge` — 3 ветки форматирования (`null`, `<$1`, `>=$1`); `PRRow` рендерит cost либо em-dash; `TraceBody` показывает 4 стата в правильном порядке.
- `server/test/price-book.test.ts` уже покрывает `PriceBook` напрямую — не трогаем.
