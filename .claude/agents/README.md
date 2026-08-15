# Агенти DevDigest

Карта набору субагентів. Повні правила — у самих файлах агентів; тут лише те,
що потрібно, аби зрозуміти, кого коли кликати й чого від нього чекати.

## Ланцюжок

```
                        ┌──▶ implementer          (червоний тест наперед)
test-writer ────────────┤
   (тести + Test Report)└──▶ людина                (покриття наявного коду,
                                                    без плану й без implementer)

researcher ──(звіт з доказами)──▶ planner ──(docs/plans/*.md)──▶ implementer
                                     ▲                                │
                                     │                    (код + Implementation Report)
                                     │                                │
                   дефект плану ─────┤            ┌───────────────────┼───────────────────┐
                                     │            ▼                   ▼                   ▼
                                     └──── plan-verifier      architecture-reviewer   doc-writer
                                        (таблиця по кроках)   (findings з доказами)  (docs/*.md,
                                                                                      <module>/*.md)
                                                     │                   │
                                                     └─────────┬─────────┘
                                                               ▼
                                              людина: коміт → /pr-self-review → PR
```

`test-writer` має два входи — червоний тест **перед** реалізацією (далі його
підхоплює `implementer`) і самостійне покриття вже наявної поведінки, яке ні
плану, ні `implementer` не потребує.

Передача між ланками йде **файлом**, а не переказом: субагент не бачить контексту
батьківської сесії, тож усе, що не записано в план, для наступної ланки не існує.
`test-writer`, `architecture-reviewer` і `plan-verifier` віддають звіт у чат, бо
його споживає людина в тій самій сесії; файлом передають лише `planner` і
`doc-writer`.

## Склад набору

| Агент | Модель | Відповідальність | Що НЕ робить |
|---|---|---|---|
| [`researcher`](researcher.md) | `sonnet`, `maxTurns: 40` | Дослідження репозиторію та зовнішніх джерел; звіт із доказами | Не змінює жодного файлу, не планує, не реалізує |
| [`planner`](planner.md) | `opus`, `effort: high` | Перетворює задачу на Development Plan | Не редагує продакшн-код, не запускає implementer, не робить рев'ю |
| [`implementer`](implementer.md) | `inherit`, `maxTurns: 60` | Виконує план у backend і frontend, ганяє гейти | Не планує, не досліджує в інтернеті, не робить рев'ю, не комітить |
| [`test-writer`](test-writer.md) | `inherit`, `maxTurns: 50` | Пише і ганяє тести для `client`, `server` і `reviewer-core`; доводить, що тест уміє падати | Не пише і не лагодить продакшн-код, не робить рев'ю, не комітить |
| [`architecture-reviewer`](architecture-reviewer.md) | `opus`, `effort: high`, `maxTurns: 30` | Read-only рев'ю меж: спершу детерміновані чекери, потім судження; findings з `file:line` | Нічого не редагує, не робить security-рев'ю, не пише вердикт `/pr-self-review` |
| [`plan-verifier`](plan-verifier.md) | `sonnet`, `maxTurns: 40` | Звіряє готовий код з кожним пунктом плану; таблиця вердиктів по кроках | Не оцінює якість коду, не править код, не редагує план |
| [`doc-writer`](doc-writer.md) | `inherit`, `maxTurns: 40` | Документує реалізоване; сам обирає місце в `docs/` або в доках модуля (ADR — у `<module>/docs/`); діаграми Mermaid | Не пише `INSIGHTS.md`, не документує нереалізоване, не чіпає символлінки `CLAUDE.md`, не створює `docs/adr/` |

## Дозволи

| Агент | `tools` | Заборонено (`disallowedTools`) | Преднавантажені скіли |
|---|---|---|---|
| `researcher` | Read, Grep, Glob, Bash, WebSearch, WebFetch | — (Write/Edit просто відсутні) | — |
| `planner` | Read, Grep, Glob, Bash, Write, TodoWrite, Skill, Agent | Edit, NotebookEdit, WebFetch, WebSearch | `onion-architecture`, `frontend-architecture` |
| `implementer` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite, `mcp__plugin_context7_context7__*` | WebSearch, WebFetch, Agent, NotebookEdit | — (вантажить за маршрутизацією з плану) |
| `test-writer` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite, `mcp__plugin_context7_context7__*` | WebSearch, WebFetch, Agent, NotebookEdit | — (вантажить за областю) |
| `architecture-reviewer` | Read, Grep, Glob, Bash, Skill | Write, Edit, NotebookEdit, WebSearch, WebFetch, Agent | `onion-architecture`, `frontend-architecture` (+ `zod` / `typescript-expert` за зміною) |
| `plan-verifier` | Read, Grep, Glob, Bash | Write, Edit, NotebookEdit, WebSearch, WebFetch, Agent | — |
| `doc-writer` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite | WebSearch, WebFetch, Agent, NotebookEdit | `mermaid-diagram` (+ вантажить за темою) |

Особливості, які легко пропустити:

- `Agent` є лише в `planner` — і лише для виклику `researcher`. Запускати
  `implementer`, `test-writer`, `architecture-reviewer`, `plan-verifier` чи
  `doc-writer` він не може. Усі вони листки ланцюжка: те, чого не побачили
  самі, іде в «не перевірено», а не делегується.
- У `implementer` немає вебу взагалі: за документацією бібліотек він іде в
  context7 MCP.
- `Skill` не обмежується вибірково — тільки цілком. Тому «які скіли вантажити»
  задано критерієм у промпті, а не технічно.
- `Bash` у `researcher` і `planner` оголошений read-only на рівні промпту;
  технічно запис через перенаправлення не заблокований.
- read-only форма з документації — це саме `Read, Grep, Glob, Bash`; у
  `architecture-reviewer` і `plan-verifier` `Bash` потрібен рівно для запуску
  детермінованих чекерів і команд перевірки з плану;
- жоден з нових агентів не пише `.claude/pr-self-review.local.md` — цей файл є
  контрактом хука `PreToolUse`, і його заповнює тільки скіл `pr-self-review`;
- у `plan-verifier` немає `Skill`: його задача — покриття плану, а не рев'ю
  якості; заборона тримається відсутністю інструмента в `tools`, а не окремим
  записом у `disallowedTools`;
- `test-writer` — єдиний, кому дозволено тимчасово зламати продакшн-файл, і
  лише щоб довести «червоний» тест, з обов'язковим відновленням через `Edit`
  (ніколи `git checkout`) і перевіркою `git diff --exit-code`.

## Артефакти

| Агент | Вхід | Вихід |
|---|---|---|
| `researcher` | Конкретне питання (внутрішнє або зовнішнє) | Звіт у чат: Findings з `path:line` або URL, Inferences окремо, обов'язкова секція «чого не вдалося встановити», Coverage |
| `planner` | Задача + за потреби звіт researcher'а | **Файл** `docs/plans/<YYYY-MM-DD>-<slug>.md` (англійською) + резюме в чат |
| `implementer` | Шлях до файлу плану (за потреби — назва треку) | Змінений код і тести + Implementation Report у чат |
| `test-writer` | Область/модуль або крок плану, що вимагає покриття | Тестові файли в репо + Test Report у чат (цитати виводу + доказ «червоного») |
| `architecture-reviewer` | Діапазон змін, шлях або питання про межі | Звіт у чат: вивід детермінованих чекерів → findings (severity + `file:line` + цитата рядка + назва правила) → «що не перевірено» |
| `plan-verifier` | Шлях до плану в `docs/plans/` або явний список вимог | Звіт у чат: таблиця «пункт → вердикт → доказ», зайва робота поза планом, «що не вдалося перевірити» |
| `doc-writer` | Реалізована фіча + матеріал (план, спека, звіт `researcher`) | **Файл(и)** документації в `docs/` або в доках модуля (ADR — у `<module>/docs/adr-NNNN-….md`) + резюме в чат |

Розділи плану: контекст і скоуп → зачеплені модулі (**включно з тим, що не
чіпаємо**) → обмеження → **рішення й відкинуті альтернативи** → **архітектура
змін** (шари, unchanged, джерела даних, послідовність викликів з внутрішньою
функцією, схема, API, prompt builder, UI, live log vs trace) → маршрутизація
скілів → кроки (реальні сигнатури, тест на пастку, DoD, `Depends on`,
`Track`) → план перевірки → ризики → handoff → відкриті питання.

Перед `Write` planner звіряє чернетку з репо: сигнатури, уже наявні хелпери,
regex cruiser, нащадки filter/map, null/empty, суперечливі правила, два
канали логів.

Розділи звіту implementer'а: відповідність плану → зміни → застосовані скіли →
верифікація з **цитатами виводу команд** → self-check → відхилення від плану →
handoff (зокрема `Insight candidates`) → що не зроблено.

### Межа з /pr-self-review

Три питання не перетинаються — `plan-verifier` питає «чи виконано план»,
`architecture-reviewer` — «чи витримані межі», `/pr-self-review` — «чи можна
це віддавати в PR», і лише останній пише вердикт, який читає хук.

## Паралельність

Кроки плану позначаються треками. Два кроки потрапляють у **різні** треки, лише
якщо виконуються всі три умови: набори файлів не перетинаються, немає залежності
по виходу, не зачеплені спільний контракт, схема БД чи `vendor/shared`. Дефолт —
один трек. Кілька `implementer` одночасно допускаються тільки по незалежних
треках; при виявленому перетині виконавець зупиняється, а треки перенарізає
`planner`.

## На чому ґрунтуються правила

Джерела розкладені **строго по агенту**: те, що формувало саме цей промпт.
Спільних кошиків «planner та implementer» / «усі чотири» немає. Посилання
може повторитися, якщо воно реально лягло в кілька промптів.

`[F]` = джерело витягнуто й прочитано напряму, `[S]` = лише пошукова видача;
жодне `[S]`-джерело не використане як підстава для числа.

### `researcher`

**Зовнішні.** Схема фронтматера, allowlist `tools`, ізоляція контексту
субагента: [sub-agents](https://code.claude.com/docs/en/sub-agents) [F].
Роль research-воркера (звіт із доказами, який споживає оркестратор, а не
план і не патч):
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system).

**У репозиторії.** root `AGENTS.md`; `**/INSIGHTS.md` (глоб, не хардкод);
lockfile/manifest — pinned-версія перед зовнішнім фактом.

**Без зовнішнього джерела.** `sonnet`, `maxTurns: 40`; Findings окремо від
Inferences; обов'язкова секція «чого не вдалося встановити»; заборона
`/deep-research`.

### `planner`

**Зовнішні.** Фронтматер (`tools`, `disallowedTools`, `skills`, `model`,
`effort`), преднавантаження скілів, ізоляція контексту, «use proactively»:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
Специфікація у файл, виконання у свіжому контексті:
[best-practices](https://code.claude.com/docs/en/best-practices).
Делегувальний промпт до `researcher` (ціль, формат виводу, межі):
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system).
Orchestrator-workers:
[building effective agents](https://www.anthropic.com/engineering/building-effective-agents).
Sequential orchestration і «найнижчий рівень складності, що вирішує задачу»:
[AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns).
Треки й секція «рішення й відкинуті альтернативи» — щоб паралельні агенти не
конфліктували незаписаними рішеннями:
[Cognition](https://cognition.com/blog/dont-build-multi-agents).
Plan-and-execute (менше викликів, примус продумати задачу цілком):
[LangChain](https://www.langchain.com/blog/planning-agents).

**У репозиторії.** Скіли `onion-architecture` і `frontend-architecture`
(преднавантажені); `**/INSIGHTS.md`; root `AGENTS.md`. Правила проєкту не
переписані — лише названі в маршрутизації.

**Без зовнішнього джерела.** `opus`, `effort: high`; `Agent` лише для
`researcher` (не для `implementer` і не для рев'юерів); порядок кроків
контракти → міграція → бекенд → фронтенд; обов'язкова секція відкритих
питань; обов'язкова `## 2c` (архітектура) і verify-pass проти репо перед
`Write` (сигнатури, unchanged, cruiser `from.path`, нащадки transform,
null/empty, два канали логів).

### `implementer`

**Зовнішні.** Фронтматер, allowlist, ізоляція:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
«Той, хто робив, не оцінює» — звідси handoff на рев'юерів, а не самооцінка
архітектури:
[best-practices](https://code.claude.com/docs/en/best-practices).
Гардрейл на вході (валідація плану до першої правки):
[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/),
[Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf).
Гейти, цитата виводу, ліміт спроб — приріст дав інтерфейс виконання, не
розщеплення ролей: [SWE-agent, arXiv:2405.15793](https://arxiv.org/abs/2405.15793).
Детермінований сигнал перед заявою:
[verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) [F].
Виконання лінійної послідовності кроків:
[AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns).

**У репозиторії.** Таблиця маршрутизації скілів з плану; `TESTING.md`;
`server/.dependency-cruiser.cjs` і `reviewer-core/.dependency-cruiser.cjs`;
`scripts/check-shared-sync.sh`; `**/INSIGHTS.md`. Свідомо продубльовано три
тихі пастки: pnpm/npm, дзеркало `vendor/shared`, заборона растить baseline.

**Без зовнішнього джерела.** `inherit`, `maxTurns: 60`; план read-only;
немає вебу, бібліотеки — через context7; заборона «тести проходять» без
цитати виводу; ліміт двох спроб на впалий гейт; тести в кроці, що вводить
поведінку (правило 7); `Insight candidates` замість запису в `INSIGHTS.md`;
немає `Agent`.

### `test-writer`

**Зовнішні.** Фронтматер, allowlist, ізоляція, `skills:` = повне тіло:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
Доказ = вивід раннера, не заява:
[verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) [F].
Надмірне мокання як режим відмови агентних тестів:
[arXiv:2602.00409](https://arxiv.org/pdf/2602.00409) [F].
Мутація як сигнал замість покриття (Meta ACH):
[engineering.fb.com](https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/) [F].
Тест, що закріплює баг як очікувану поведінку:
[arXiv:2602.08146](https://arxiv.org/html/2602.08146) [S].
«Ілюзія безпеки» (покриття росте, виявлення дефектів падає):
[keelcode.dev](https://keelcode.dev/blog/ai-tests-safety-illusion) [S, fetch failed].
Red-first як явна інструкція:
[dev.to](https://dev.to/spyrae/tdd-with-ai-claude-writes-tests-first-then-the-implementation-27hm) [S],
[alexop.dev](https://alexop.dev/posts/custom-tdd-workflow-claude-code-vue/) [S].

**У репозиторії.** `TESTING.md`; `server/AGENTS.md`, `client/AGENTS.md`,
`reviewer-core/AGENTS.md`; скіли з таблиці маршрутизації (`react-testing-library`,
`frontend-architecture`, `onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `zod`, `typescript-expert`, …); `**/INSIGHTS.md`;
`./scripts/check-shared-sync.sh` при зачіпанні `vendor/shared`.

**Без зовнішнього джерела.** `inherit`, `maxTurns: 50`; жодного преднавантаженого
скіла (як у `implementer`); протокол тимчасової мутації через `Edit`/`Write`,
ніколи `git checkout`; конфлікт із правилом 7 `implementer` закритий вхідними
умовами, а не зміною `implementer`; немає `Agent`; не пише
`.claude/pr-self-review.local.md`.

### `architecture-reviewer`

**Зовнішні.** Фронтматер, read-only форма `Read, Grep, Glob, Bash`, ізоляція,
`skills:` = повне тіло:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
Чекери спочатку, судження потім:
[verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) [F].
Ліміт дрібних зауважень, планка «behavior claims need a `file:line` citation
in the source, not an inference from naming», skip generated/vendor:
[code-review](https://code.claude.com/docs/en/code-review) [F]. Аргумент
`effort` **команди** `/code-review` — інша річ, ніж поле `effort` у
фронтматері субагента, і як обґрунтування значення у фронтматері не
використовується.
Ландшафт детермінованих інструментів (чому в репо вже є cruiser, а не
ArchUnitTS/madge):
[dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) [S],
[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) [S],
[ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) [S],
[madge](https://github.com/pahen/madge) [S],
[arXiv:2605.17548](https://arxiv.org/pdf/2605.17548) [S].
«Той, хто робив, не оцінює»:
[best-practices](https://code.claude.com/docs/en/best-practices).

**У репозиторії.** `server/.dependency-cruiser.cjs`,
`reviewer-core/.dependency-cruiser.cjs` (лише десять іменованих правил);
шкала CRITICAL/HIGH/MEDIUM/LOW зі `.claude/skills/pr-self-review/references.md`;
скіли `onion-architecture` і `frontend-architecture` (преднавантажені), за
зміною — `zod` / `typescript-expert`; `scripts/check-shared-sync.sh`.

**Без зовнішнього джерела.** `opus`, `effort: high` за прецедентом `planner`,
не за `/code-review`; немає `Agent`; не пише `.claude/pr-self-review.local.md`;
security / performance / product / test-quality — `## Out of remit`.

### `plan-verifier`

**Зовнішні.** Фронтматер, read-only форма `Read, Grep, Glob, Bash`, ізоляція:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
Команди з `## 5` плану як детермінований сигнал:
[verification loops](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) [F].
Таксономія відмов верифікатора — *optimistic* та *echo* вердикти:
[TeamBench](https://arxiv.org/pdf/2605.07073) [S].
Схильність трактувати заяви як факти:
[arXiv:2606.05403](https://arxiv.org/html/2606.05403v2) [S].
Один рядок на вимогу:
[katalon](https://katalon.com/resources-center/blog/traceability-matrix) [S].
Definition of Done для агентів:
[scrum.org](https://www.scrum.org/resources/blog/definition-done-ai-agents) [S],
[paelladoc](https://paelladoc.com/blog/acceptance-criteria-for-ai-agents/) [S].

**У репозиторії.** Шаблон плану в `planner.md` (`## 0`–`## 8`); шаблон звіту
в `implementer.md` (claim, не evidence); скрипти з `package.json` пакетів,
названих у `## 5` плану.

**Без зовнішнього джерела.** `sonnet`, `maxTurns: 40`; немає інструмента
`Skill`; одна таблиця «пункт → вердикт» без агрегованого підсумку; немає
`Agent`; не пише `.claude/pr-self-review.local.md`; план read-only (не
фліпає `Status:`).

### `doc-writer`

**Зовнішні.** Фронтматер, allowlist, ізоляція, `skills:` = повне тіло:
[sub-agents](https://code.claude.com/docs/en/sub-agents) [F],
[agent-sdk/subagents](https://code.claude.com/docs/en/agent-sdk/subagents) [F].
Чотири типи документації (форма, не папки):
[Diátaxis](https://diataxis.fr/start-here/) [F].
Docs-as-code і дефолт на видалення застарілого:
[Google docguide](https://google.github.io/styleguide/docguide/best_practices.html) [F].
Режими відмови LLM-документації та окремий етап верифікації (DocAgent):
[arXiv:2504.08725](https://arxiv.org/abs/2504.08725) [F].
ADR (Nygard: Title / Status / Context / Decision / Consequences) і MADR:
[adr.github.io](https://adr.github.io/) [S],
[MADR](https://adr.github.io/madr/) [S].
Mermaid на GitHub нативно:
[github.blog](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) [S].
Стиль: [Google developer style](https://developers.google.com/style) [S],
[Write the Docs](https://www.writethedocs.org/guide/) [S].
Впевнено вигадані параметри й дефолти:
[diffray.ai](https://diffray.ai/blog/llm-hallucinations-code-review/) [S].

**У репозиторії.** Реальна карта `docs/` і `<module>/README.md` /
`<module>/AGENTS.md` / `<module>/docs/`; преднавантажений скіл
`mermaid-diagram`; маршрутизація скілів предметної області; заборона чіпати
симлінк `CLAUDE.md`. Немає ADR-скіла в `.claude/skills/` — поля ADR живуть
у самому агенті.

**Без зовнішнього джерела.** `inherit`, `maxTurns: 40`; Diátaxis задає форму,
адресу дає таблиця цього репо (не `docs/tutorials/` тощо); ADR у вже існуючі
`<module>/docs/`, не `docs/adr/`; межа `docs/superpowers/specs/` (вхід) vs
`<module>/docs/` (запис); немає `Agent` і немає context7/вебу; не пише
`INSIGHTS.md` і не пише `.claude/pr-self-review.local.md`.

### Числа, які заборонено цитувати

Жодна з наведених нижче неперевірених цифр не має з'являтися в промпті
жодного агента. Кожна відома лише з `[S]`-видачі, тож її не можна копіювати
навіть як «орієнтир»: мутаційний бал, що циркулює для тестів, написаних LLM;
частка вразливого AI-згенерованого коду; зниження хибнопозитивних у CORE;
заявлене зниження галюцинацій; рівні прийняття вердиктів верифікатора в
TeamBench.

## Практика використання

- Каталог `docs/plans/` створюється першим записаним планом.
- Поле `Status: draft` у плані на `approved` переводить людина.
- `git push` і `gh pr create` заблоковані хуком `PreToolUse` доти, доки
  `/pr-self-review` не поверне `CLEAR`. Хук нічого не запускає сам — він лише
  блокує, тож рев'ю запускає людина.
- Уроки, зафіксовані в `Insight candidates`, оцінює головна сесія; за правилом
  скіла `engineering-insights` урок, який можна виразити правилом скіла або
  машинною перевіркою, туди й має піти замість запису у файл.

## Економія токенів при оркестрації

Перше правило стосується самих агентів, решта — того, хто їх викликає.

- **Довгий звіт іде у файл, у чат — три рядки.** `implementer` і
  `test-writer` пишуть звіт у `docs/reports/<дата>-<агент>-<область>.md`, а
  в чат повертають шлях, результат гейтів і те, що блокує наступний крок.
  Причина не стилістична: фінальне повідомлення може обірватися в передачі,
  і тоді відновлення коштує повний повторний прогін. Виміряно за одну
  сесію — **191 294 + 185 352 + 142 280 ≈ 519 000 токенів** витрачено тричі
  поспіль лише на те, щоб отримати текст звіту, чия робота вже була зроблена
  й лежала на диску. Це ~27% усіх витрат на субагентів. Зі звітом у файлі
  обрив коштує один `Read`.

- **Ревізію вже завершеного `planner`- чи `implementer`-прогону запускай
  новим `Agent`-викликом проти файлу на диску, а не `SendMessage` до
  завершеного агента.** `SendMessage` резюмує агента з усім попереднім
  транскриптом — кожен токен нової інструкції додається поверх повного
  першого проходу. План чи звіт на диску вже містить усе, що агенту треба
  знати; свіжий виклик платить лише за читання файлу й застосування правок,
  не за відтворення власного попереднього міркування. Виміряно на цій сесії:
  ревізія плану Smart Diff через `SendMessage` коштувала 222 359 токенів на
  три виклики інструментів — переважна більшість пішла на перенесений
  контекст, не на роботу. Виняток: якщо ревізія залежить від міркування
  агента, якого немає у файлі (непояснене рішення, відкинута альтернатива, що
  не потрапила в план) — тоді резюмування виправдане, бо цей контекст більше
  ніде не існує.
- **Перед делегуванням `researcher` — швидка власна розвідка (2-3 виклики
  `Grep`/`Bash`), і бриф агенту звужується до того, чого вона не встановила.**
  Дослідник не винен, якщо перевіряє факт, який викликач уже знав, — `Answer
  only what was asked` (`researcher.md`) працює лише в межах заданого
  питання. Якщо запитати про те, що вже відомо, агент чесно це підтвердить —
  коштом повного дослідницького проходу. Приклад із цієї сесії: контракт
  `SmartDiff` виявився через два `grep`; `researcher` усе одно отримав
  завдання перевірити це заново в складі 83 919-токенного звіту.
