# Astra Realpolitik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Работать последовательно; отдельные агенты — только при явно разрешённом пользователем способе исполнения.

**Goal:** Создать готовую одиночную веб-игру альтернативной истории с AI-дипломатией, всем миром и оконным рабочим столом в стиле Windows XP.

**Architecture:** Модульный TypeScript-монорепозиторий, авторитетное состояние в PostgreSQL, отдельно web/API/worker. LLM предлагает содержательные исходы, детерминированный домен проверяет и сохраняет события; геометрия и память версионируются независимо от текста.

**Tech Stack:** React, Vite, MapLibre GL JS, Fastify, PostgreSQL, Drizzle, pg-boss, Zod, @google/genai, Vitest, Playwright, axe-core, fast-check, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-05-astra-realpolitik-design.md`; обязательные приложения: `docs/architecture/contracts.md`, `docs/architecture/modern-geography.md`, `docs/architecture/modern-geography.sources.json`, `docs/quality/release-gates.md`, `docs/research/2026-09-05-references.md`.

## Global Constraints

- Одиночная игра; несколько независимых пользователей сервера и кампаний, без мультиплеера внутри кампании.
- Desktop-first, полноценный адаптивный мобильный режим; русский интерфейс и контент, английская локализация как обязательная вторая.
- BYOK: свои ключи AI Studio, без обязательного оплачиваемого ключа владельца приложения.
- Некоммерческое использование подтверждено пользователем после консультации с юристом. Исторические данные CShapes включаются с соблюдением CC BY-NC-SA 4.0; остальные материалы сохраняют собственные лицензионные условия.
- Replay применяет журнал без повторного обращения к LLM.
- Потоковый текст до commit помечен как черновой. Авторитетная карта никогда не изменяется от токенов ответа.
- Не заменять модель молча.
- Node — активная LTS на старте реализации, единая в CI и Docker.
- Все требования R01–R28 из матрицы приёмки реализованы; все обязательные тесты пройдены; нет P0/P1, заглушек в пользовательских путях или неработающих ярлыков.

## 0. Правила выполнения и честной готовности

**Уточнение пользователя от 2026-09-05:** начать полную реализацию; обычные технические решения принимать самостоятельно. Изменения проверять точечно и пакетно, не повторять полные typecheck/lint/regression на каждом малом этапе. Полные тестовые прогоны — на ключевых этапах, максимум три за весь процесс. Это уточнение заменяет прежнюю частоту прогонов ниже, но не уменьшает требования приёмки. Счётчик и фактические результаты: `docs/quality/evidence/development-status.md`.

План состоит из 36 пакетов работ. Пакет — самостоятельный deliverable для проверки, а не обещание выполнить подсистему за несколько минут. Внутри пакета идти малыми TDD-циклами: один тест → наблюдаемый fail → одна законченная реализация → pass → регрессия → небольшой commit. Большую задачу дробить по перечисленным контрактам, не менять её цель на демонстрацию.

Сначала пользователь подтверждает предложенные границы спецификации либо корректирует их. Этот пакет документов сам по себе не разрешает публикацию в чужом аккаунте, создание платной инфраструктуры или расход конкретного ключа на тысячи eval-запросов.

Все пути в задачах относительны корню проекта. Сейчас указанных исходников нет: их предстоит создать. Примеры тестов описывают реальные ожидаемые вызовы экспортов; тестовые fixtures создаются вместе с соответствующей задачей и не используются как production-источник мира.

Для каждой задачи:

1. Прочитать связанные разделы спецификации/контрактов и записи R в матрице.
2. Создать указанный тест и необходимые минимальные fixtures; запустить его отдельно, зафиксировать причину ожидаемого fail.
3. Реализовать описанные exports и поведение, включая отрицательные случаи. Приведённые code blocks — контрактные примеры, не вся реализация файла.
4. Повторить команду теста; затем `pnpm typecheck` и `pnpm lint`; затронутые интеграционные/E2E тесты запускать явно.
5. Записать evidence в `docs/quality/evidence/TNN.md`: commit/hash, команды, реальные результаты, screenshots/reports, оставшиеся блокеры. Сделать scoped commit после проверки, не захватывать чужие изменения.

Не помечать пункт сделанным, если тест пропущен, API недоступен или скриншот не просмотрен. Повторный тест без изменения запроса — не автоматическое разрешение на новые платные попытки.

## 1. Карта создаваемых файлов

```text
apps/
  web/src/
    app/                  bootstrap, routes, providers
    desktop/              desktop, taskbar, window registry/store
    features/
      campaign/           создание и библиотека кампаний
      map/                renderer, layer controls, map adapter
      diplomacy/          комнаты, участники, сообщения, договоры
      cabinet/            советники, поручения, отчёты
      chronicle/          события, поиск, история, финал
      scenario-editor/    редактор пакетов и геометрии
      settings/           модели, ключи, бюджет, UX
    ui/xp/                дизайн-система, tokens, controls
    i18n/                 ru.json, en.json
  api/src/                server, auth, routes, sse, access guards
  worker/src/             jobs, handlers, checkpoints, recovery
packages/
  contracts/src/          zod schemas и TS типы
  engine/src/             validate, reduce, replay, clock, actions
  diplomacy/src/          rooms, turns, initiative, treaties, organizations
  ai/src/                 gateway, profiles, context, roles, budgets
  history/src/            evidence, temporal retrieval, anchors, memory
  geography/src/          IDs, transforms, topology, region partition
  db/src/                 schema, repositories, outbox, leases
  testkit/src/            только deterministic fixtures и fake provider
content/
  sources/                manifests, license notices, evidence metadata
  scenarios/1945/         manifest, actors, geometry refs, anchors
  scenarios/1991/         тот же контракт отдельного исторического мира
  scenarios/contemporary/ датированный современный пакет
  licenses/               тексты лицензий и журнал изменений
tools/                    build-content, validate-content, evals, benchmarks
tests/
  tasks/                  T01–T20, T27–T32 unit/integration tests
  e2e/                    сценарии UI, keyboard, real provider smoke
  fixtures/               synthetic/test-only сценарии
  evals/                  исторические/дипломатические acceptance cases
infra/                    Dockerfiles, compose, reverse proxy, backup
docs/quality/evidence/     доказательства выполнения, не планы результатов
.github/workflows/        CI и release validation
```

### Очерёдность и зависимости

Фундамент T01–T04; география/контент T05–T09; AI и engine T10–T14; дипломатия T15–T19; UX T20–T26; законченные пользовательские потоки T27–T30; качество и поставка T31–T36.

Оконную систему T21–T22 можно реализовать после T02, не дожидаясь всей истории. Это допустимая перестановка задач, не разрешение спавнить агентов. Карта T20 зависит от T05 и T14. UI-дипломатия T24 требует T15–T18 и T22. T36 требует все остальные задачи.

## T01. Воспроизводимый проект и тестовый контур

**Files:** создать `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.node-version`, `.env.example`, `.gitignore`, `vitest.config.ts`, `playwright.config.ts`, `apps/api/src/server.ts`, `apps/web/src/app/main.tsx`, `tests/tasks/T01.test.ts`, `.github/workflows/ci.yml`.

**Interfaces:** `buildServer(): FastifyInstance`, `GET /health → {status:'ok'}`. Health не проверяет и не вызывает LLM. Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `content:validate`, `eval:offline`, `eval:live`, `verify:release`.

- [ ] Проверить официальную документацию/совместимость выбранных пакетов, закрепить точные версии lockfile и runtime, создать workspace и конфигурацию до кода функции health.
- [ ] Создать failing test:

```ts
const app = buildServer();
const response = await app.inject({ method: 'GET', url: '/health' });
expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ status: 'ok' });
await app.close();
```

- [ ] Запустить `pnpm exec vitest run tests/tasks/T01.test.ts`; после наблюдаемого fail реализовать server и изолированный root UI, без игровых mock-данных в production.
- [ ] Проверить `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, тест из чистого checkout; CI выполняет те же команды без API key.
- [ ] Сохранить evidence и commit `chore: establish reproducible workspace and test harness`.

## T02. Типизированные контракты, версии и инварианты

**Files:** `packages/contracts/src/{ids,world,commands,events,diplomacy,ai,scenario}.ts`, `packages/engine/src/{validate-proposal,reduce,replay}.ts`, `tests/tasks/T02.test.ts`.

**Interfaces:** типы из contracts.md; `validateProposal(state:WorldState, proposal:WorldProposal):ValidationResult`, `reduce(state:WorldState, events:CanonicalEvent[]):WorldState`, `replay(initial:WorldState, events:CanonicalEvent[]):WorldState`.

- [ ] Создать фикстуру мира с акторами `a`,`b` и территорией `r1`; проверить неизвестный ID:

```ts
expect(validateProposal(world, unknownTerritoryProposal)).toMatchObject({
  ok: false, issues: [{ code: 'UNKNOWN_ID' }]
});
expect(replay(world, [])).toEqual(world);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T02.test.ts`.
- [ ] Реализовать schemaVersion, strict discriminated unions, календарные даты, числовые bounds, visibility, bounded arrays/strings; запретить произвольные property paths и выполнение кода из JSON. Domain schemas генерируют provider schema с проверкой поддерживаемого подмножества.
- [ ] Property tests: циклические причины отклоняются; apply/replay не меняют input; конфликт контроля и две взаимоисключающие операции отвергаются; `record_fact` не обходит control/treaty schema.
- [ ] Evidence/commit `feat: define versioned domain contracts and invariants`.

## T03. PostgreSQL, журнал, snapshots и атомарность

**Files:** `packages/db/src/schema.ts`, `packages/db/migrations/0001_core.sql`, `packages/db/src/{campaign-repository,commit-world,outbox}.ts`, `tests/tasks/T03.test.ts`, `infra/compose.test.yml`.

**Interfaces:** `commitWorld(input:{ownerId:string;expectedRevision:number;jobId:string;fence:number;proposal:WorldProposal}):Promise<ApplyResult>`; `loadWorld(campaignId:string):Promise<WorldState>`.

- [ ] Поднять отдельную test DB; seed synthetic campaign. Тест проверяет параллельные commits одной revision:

```ts
const results = await Promise.allSettled([commitWorld(inputA), commitWorld(inputB)]);
expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
expect((await loadWorld(campaignId)).revision).toBe(startRevision + 1);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T03.test.ts` с выделенным `TEST_DATABASE_URL`.
- [ ] Реализовать unique indexes, owner scope, optimistic locking, event→projection→checkpoint→outbox в одной транзакции. Версию snapshot и schema хранить независимо.
- [ ] Inject crash после insert event до projection: rollback не оставляет полмира. Replay 100 событий даёт тот же hash, что projection. Проверить миграции на пустой и предыдущей тестовой версии.
- [ ] Evidence/commit `feat: persist atomic world history and projections`.

## T04. Пользователи, сессии и BYOK vault

**Files:** `apps/api/src/auth/{bootstrap,session,oidc}.ts`, `apps/api/src/routes/credentials.ts`, `packages/ai/src/credentials/{vault,crypto}.ts`, `tests/tasks/T04.test.ts`.

**Interfaces:** `vault.put(ownerId:string,key:string,mode:'session'|'persistent'):Promise<{id:string;mask:string}>`, `vault.get(ownerId:string,id:string):Promise<string>`, `vault.revoke(ownerId:string,id:string):Promise<void>`.

- [ ] Написать тест изоляции/отзыва:

```ts
const ref = await vault.put('owner-a', 'synthetic-test-secret', 'persistent');
await expect(vault.get('owner-b', ref.id)).rejects.toThrow('NOT_FOUND');
await vault.revoke('owner-a', ref.id);
await expect(vault.get('owner-a', ref.id)).rejects.toThrow('NOT_FOUND');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T04.test.ts`.
- [ ] Реализовать OIDC adapter публичного режима и single-owner bootstrap; cookie HttpOnly/Secure/SameSite, CSRF/Origin guards; session vault с 8h inactivity expiry; persistent AES-GCM envelope только opt-in. Не сохранять ключ при обычном game save.
- [ ] Проверить expiry, restart, unique nonce, rotation, отсутствие секрета в логах/ошибках; startup в public mode без auth config завершает запуск с понятной ошибкой. User consent описывает backend и Google.
- [ ] Evidence/commit `feat: secure user sessions and bring-your-own-key vault`.

## T05. Реестр акторов и географический pipeline

**Files:** `packages/geography/src/{registry,import-natural-earth,import-cshapes,partition,validate-topology,lod,political-assessment,source-lock}.ts`, `tools/build-geography.ts`, `infra/compose.geography.yml`, `packages/geography/sql/{normalize,partition,adjacency}.sql`, `content/sources/geography.json`, `content/licenses/`, `tests/tasks/T05.test.ts`. Входной immutable manifest — `docs/architecture/modern-geography.sources.json`, обязательный алгоритм — `docs/architecture/modern-geography.md`.

**Interfaces:** `buildGeography(input:{sourceManifestPath:string;scenarioDate:string}):Promise<{manifestPath:string;digest:string}>`, `validateTopology(territories:GeoJSON.FeatureCollection):ValidationResult`. Каждый renderer feature хранит `territoryId`, а не индекс массива.

- [ ] Тестировать сохранение ID на разных LOD и детект пересечения:

```ts
expect(lowDetailIds.sort()).toEqual(highDetailIds.sort());
expect(validateTopology(overlappingTerritories)).toMatchObject({ ok: false });
expect(registry.resolveAlias('ISO_N3', '840', '2026-09-01')).toBe('state:usa');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T05.test.ts`.
- [ ] Скачать 8 конкретных Natural Earth v5.1.2 GeoJSON по commit `f1890d9f152c896d250a77557a5751a93d494776`, проверить Git blob hashes из manifest. Пройти 12 шагов `modern-geography.md`: PostGIS make-valid/noding/polygonize → canonical cells → claims/assessment → indexes → Tippecanoe 2.79.0/PMTiles. Для истории пересечь ячейки с CShapes, не наследовать современную принадлежность. Выбор поставщика геометрии не оставляется агенту.
- [ ] Проверить topology/coverage/determinism по числовым критериям дополнения, микрогосударства/острова/±180°, раздельные control/recognition/claims, no unreviewed modern assessments. Выходы: world/borders PMTiles, overview TopoJSON, territory/edge/adjacency indexes, labels, initial political state и hashes; fallback из той же сетки. Political content completion — зависимый результат T07, геометрические тесты T05 выполняются независимо на synthetic assessments.
- [ ] Атрибуция CShapes/ShareAlike, отдельные notices исходных/производных данных, build report с количеством исправлений; evidence/commit `feat: build versioned historical and modern geography`.

## T06. Два законченных исторических пакета

**Files:** `content/scenarios/{1945,1991}/{manifest,actors,facts,relations,treaties,conflicts,anchors}.json`, `content/sources/history.json`, `tools/validate-content.ts`, `tests/tasks/T06.test.ts`, `docs/content/historical-review.md`.

**Interfaces:** `loadScenario(digest:string):Promise<ScenarioPack>`, `validateScenario(pack:ScenarioPack):ContentReport`; определить `ScenarioPack` из перечисленных файлов и `ContentReport:{errors:ContentIssue[];warnings:ContentIssue[];coverage:Record<string,number>}`; `ContentIssue:{path:string;code:string;message:string}`.

- [ ] Добавить fixtures с государством до даты создания и якорем без evidence; проверить:

```ts
const report = validateScenario(invalidHistoricalPack);
expect(report.errors.map(x => x.code)).toContain('ACTOR_OUTSIDE_LIFETIME');
expect(report.errors.map(x => x.code)).toContain('ANCHOR_WITHOUT_EVIDENCE');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T06.test.ts`; затем `pnpm content:validate --scenario 1945` и `--scenario 1991`.
- [ ] Подготовить полные мировые состояния на 1945-09-02 и 1991-12-26, страны/зависимости/организации, границы и спорные случаи. Каждый playable actor получает досье, цели, ограничения и стартовые отношения; unknown/estimate явно отмечаются.
- [ ] Для каждого пакета собрать ≥150 sourced anchors на первые 10 лет; не заменять это автоматической генерацией 150 непроверенных текстов. Проверить географическое и причинное покрытие, минимум по одному тематическому пути для каждого региона мира; нерелевантные квоты не подменяют review.
- [ ] Содержательная проверка источников нескольких перспектив, validity dates и терминологии; release manifest подписывает content-review status. Evidence/commit `content: ship reviewed 1945 and 1991 world scenarios`.

## T07. Современный мир и обновляемый срез

**Files:** `content/scenarios/contemporary/{actor-aliases,territorial-baseline,control-patches,recognition,claims,evidence,review-coverage}.json`, `content/scenarios/contemporary/geometry-patches.geojson`, `packages/history/src/{current-snapshot,normalize-indicators,source-conflicts,reliefweb-import}.ts`, `tools/update-contemporary.ts`, `tests/tasks/T07.test.ts`. Формы patches/assessment и правила источников закреплены в `docs/architecture/modern-geography.md`.

**Interfaces:** `prepareContemporarySnapshot(asOf:string):Promise<ScenarioPack>`, `normalizeIndicator(input:{value:number|null;year:number;retrievedAt:string}):Fact`. Публикация возвращает immutable digest, не меняет старые кампании.

- [ ] Тест свежести и неизвестных значений:

```ts
const fact = normalizeIndicator({ value: null, year: 2024, retrievedAt: '2026-09-05' });
expect(fact.value).toBeNull();
expect(fact.validFrom).toBe('2024-01-01');
expect(oldCampaign.scenarioDigest).not.toBe(newSnapshot.digest);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T07.test.ts`.
- [ ] Реестр членов/наблюдателей ООН и иных акторов; ≥120 проверенных актуальных проблем/фактов. Отделить observation/publication/retrieval dates. Выбор стартового среза 2026-09-01 с обязательной актуализацией перед выпуском; показать игроку дату базы и свежесть отдельных сведений.
- [ ] Для территориального состояния выполнить §4 `modern-geography.md`: UN membership/документы для международных решений; официальный МИД для позиции конкретной стороны; Natural Earth/UN Geospatial для картографических референсов; датированные OCHA reports для обстановки. ReliefWeb v2 collector требует approved appname, тот же importer принимает конкретные отчёты вручную. Все disputes/ambiguous aliases/conflict regions имеют review; `unreviewed` блокирует публикацию, `mixed/unknown/contested` отображаются честно. Candidate patch проходит evidence/date/geometry проверки; runtime news не overwrites канон.
- [ ] Coverage test для каждой playable страны; evidence/commit `content: ship dated contemporary world and update pipeline`.

## T08. Исторические предпосылки и temporal retrieval

**Files:** `packages/history/src/{temporal-query,anchors,divergence,evidence-store}.ts`, `packages/ai/src/roles/historian.ts`, `tests/tasks/T08.test.ts`.

**Interfaces:** `selectKnownFacts(facts:Fact[],date:string,actorId:string):Fact[]`; `evaluateAnchor(anchor:HistoricalAnchor,state:WorldState):AnchorContext`; определить `HistoricalAnchor` с date window, preconditions, actualOutcome, sources и dependencies; `AnchorContext` содержит satisfied/invalidated preconditions без принятия исхода за модель.

- [ ] Тест утечки будущего и отменённых предпосылок:

```ts
expect(selectKnownFacts([futureFact], '1945-09-02', 'a')).toEqual([]);
expect(evaluateAnchor(warAnchor, peaceTreatyWorld).invalidated).toContain('unresolved_dispute');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T08.test.ts`.
- [ ] Реализовать temporal SQL/query, evidence registry, причинный DAG, eligibility anchors; role historian выбирает `historical/adapted/delayed/cancelled/replaced` по схеме и сохраняет reason/cause refs.
- [ ] Проверить архив, опубликованный позже события, известный на игровую дату факт, смерть/распад участника, будущее после настоящей даты. Актуальный source publication не должен автоматически делать всё прошлое неизвестным.
- [ ] Evidence/commit `feat: ground alternate history in temporal evidence and causes`.

## T09. Изолированные знания и долгая память

**Files:** `packages/history/src/{actor-knowledge,memory,summary-coverage,retrieval}.ts`, `packages/ai/src/context/build-context.ts`, `tests/tasks/T09.test.ts`.

**Interfaces:** `buildActorContext(state:WorldState,actorId:string,date:string):ActorContext`; определить `ActorContext:{publicFacts:Fact[];privateFacts:Fact[];exactObligations:Treaty[];recentEvents:CanonicalEvent[];summaries:string[]}`; `publishSummary(input:{actorId:string;coveredEventIds:string[];text:string;sourceHash:string}):Promise<void>`.

- [ ] Тест, что секрет одного участника не попал в prompt другого:

```ts
const context = buildActorContext(secretWorld, 'b', secretWorld.date);
expect(JSON.stringify(context)).not.toContain('canary-secret-of-a');
expect(context.exactObligations.map(t => t.id)).toContain('due-treaty');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T09.test.ts`.
- [ ] Scope фильтровать до retrieval. Раздельно хранить character profile, exact commitments, plans, recent context и summaries; index по actor/date/topics. Порог summary определять по бюджету контекста выбранной роли, не числу ходов.
- [ ] Atomic publish summary, проверка covered range и обязательств; failure/empty/larger summary сохраняет старую память. После branch прежние summary с неподходящим source hash не используются.
- [ ] Тест памяти на 200 ходах fixtures; evidence/commit `feat: isolate actor knowledge and preserve long-term commitments`.

## T10. Google GenAI adapter и нормализация streaming

**Files:** `packages/ai/src/{gateway,gemini-interactions,normalize-stream,capabilities}.ts`, `packages/testkit/src/fake-gateway.ts`, `tests/tasks/T10.test.ts`, `tests/e2e/gemini-smoke.spec.ts`.

**Interfaces:** `AiGateway.generate(AiRequest,AbortSignal):Promise<AiResult>`; внутренний stream sink получает только нормализованные UI events. FakeGateway экспортируется из testkit, production import запрещён lint/build rule.

- [ ] Тест усечённого ответа и скрытых thoughts:

```ts
expect(normalizeTerminal(truncatedStream).status).toBe('failed');
expect(publicDeltas(thoughtAndTextStream)).toEqual(['Здравствуйте']);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T10.test.ts`. `normalizeTerminal` и `publicDeltas` определить как pure exports данного adapter с входом `unknown[]`, валидируемым schema provider events.
- [ ] По актуальным docs установить `@google/genai`; использовать Interactions с `store:false`, server key, bounded output и явной schema. Контрактный пример параметров:

```ts
const result = await client.interactions.create({
  model: request.modelId,
  store: false,
  system_instruction: request.systemInstruction,
  input: request.input,
  response_format: { type: 'text', mime_type: 'application/json', schema: jsonSchema }
});
```

- [ ] В реальном adapter проверять terminal status, формат usage, abort API выбранной SDK-версии, неизвестные события, empty/block/truncated/malformed output. `thinking`/лимиты передавать только поддерживаемыми полями; ни `temperature`, ни `top_p`, ни `minimal` для 3.8 автоматически не добавлять.
- [ ] С разрешённым ключом и малым лимитом выполнить `pnpm exec playwright test tests/e2e/gemini-smoke.spec.ts` для обоих ID; без ключа записать BLOCKED, не PASS. Evidence/commit `feat: integrate Gemini through a validated provider adapter`.

## T11. Модели, бюджеты, квоты и ошибки

**Files:** `packages/ai/src/{model-catalog,profiles,budget,rate-limit,retry-policy}.ts`, `apps/api/src/routes/{models,usage}.ts`, `tests/tasks/T11.test.ts`.

**Interfaces:** `resolveProfile(selection:ModelSelection):ModelProfile`; `ModelSelection` — `economy|balanced|quality|custom` с роль→model для custom; `reserveUsage(input:{ownerId:string;attemptId:string;estimatedTokens:number;estimatedMicros:number|null}):Promise<UsageReservation>`; определить reservation с id/status/estimate/actual и `unknown`.

- [ ] Тест custom ID и явного отказа бюджета:

```ts
expect(resolveProfile(customSelection).roles.world.modelId).toBe('gemini-custom-test');
await expect(reserveUsage(overBudget)).rejects.toThrow('BUDGET_EXCEEDED');
expect(retryPolicy({ code: 'SAFETY_BLOCK', attempt: 1 }).automatic).toBe(false);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T11.test.ts`; `retryPolicy` принимает `{code:string;attempt:number}` и возвращает `{automatic:boolean;delayMs:number}`.
- [ ] Каталог per owner/credential, capabilities probe, pricing manifest с датой; quota groups по проекту при известном project ID, иначе conservative shared limit владельца. Ключи не вращаются для обхода квот. Max 3 concurrent default.
- [ ] Retry: явный 429 с Retry-After и ограничением attempts, known 5xx по policy; ambiguous dispatch без автоматического повтора. 401/403/model unavailable/capability/safety показываются отдельно. При custom unknown price — tokens plus confirmation. Reservation обновляется атомарно и не обнуляется при неизвестном usage.
- [ ] UI сможет отобразить estimated/actual/unknown; evidence/commit `feat: add model choice and accountable AI budgets`.

## T12. Свободные действия и подтверждения

**Files:** `packages/engine/src/{action-intent,confirm-action}.ts`, `packages/ai/src/roles/intent.ts`, `apps/api/src/routes/commands.ts`, `tests/tasks/T12.test.ts`.

**Interfaces:** `ActionIntent:{id:string;actorId:string;text:string;targetIds:string[];category:string;ambiguities:string[];status:'draft'|'needs_clarification'|'ready'|'confirmed'}`; `confirmAction(intent:ActionIntent,actorId:string):ActionIntent`.

- [ ] Тест, что обсуждение не выполняет приказ:

```ts
expect(classifiedQuestion.status).not.toBe('confirmed');
expect(() => confirmAction(ambiguousIntent, 'a')).toThrow('NEEDS_CLARIFICATION');
expect(confirmAction(readyIntent, 'a').status).toBe('confirmed');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T12.test.ts`.
- [ ] Intent role выделяет исполнитель/цель/срок/ресурс и speech act question/proposal/commitment/order. Unknown target вызывает уточнение; разметка потенциального решения не изменяет мир. Подтверждение имеет command identity и revision.
- [ ] Проверить отрицание «не объявляйте войну», цитату чужого приказа, hypothetical «что будет если», промпт-инъекцию и изменение текста после preview. Действие «поговорить» не захватывает территорию автоматически.
- [ ] Evidence/commit `feat: turn natural language into explicit actionable intents`.

## T13. Worker, checkpoints, отмена и безопасное восстановление

**Files:** `apps/worker/src/{runner,lease,checkpoint,recover,cancel}.ts`, `packages/db/src/{jobs,attempts}.ts`, `apps/api/src/routes/jobs.ts`, `tests/tasks/T13.test.ts`.

**Interfaces:** `runJob(jobId:string):Promise<void>`, `cancelJob(ownerId:string,jobId:string):Promise<void>`, `resumeJob(jobId:string):Promise<void>`. Стадии `queued→preparing→generating→validating→committing→completed`; дополнительные состояния `paused/failed/cancelled/ambiguous`.

- [ ] Тест повторной доставки:

```ts
await runJob(jobId);
await runJob(jobId);
expect(fakeGateway.calls).toBe(1);
expect(await eventCount(campaignId)).toBe(1);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T13.test.ts`; `eventCount` — SQL helper в testkit этой задачи.
- [ ] pg-boss delivery плюс собственный job state; persist attempt до dispatch, checkpoint completion после каждой роли; lease/fencing token перед commit. Не держать SQL-транзакцию во время сети. Hash input гарантирует reuse только того же запроса.
- [ ] Fault injection до dispatch, после отправки без ответа, после ответа до checkpoint, после commit до ACK, после потери lease. Неизвестная отправка не переигрывается автоматически. Cancel останавливает новые calls и не трогает уже committed подшаги.
- [ ] Evidence/commit `feat: orchestrate durable cancellable simulation jobs`.

## T14. Полный AI-цикл мира и перемотка времени

**Files:** `packages/engine/src/{clock,world-plan,arbitration,commit-proposal}.ts`, `packages/ai/src/roles/{world,arbiter}.ts`, `apps/worker/src/handlers/advance-time.ts`, `tests/tasks/T14.test.ts`.

**Interfaces:** `planSubsteps(from:string,to:string,crisis:boolean):{from:string;to:string}[]`; `advanceCampaign(input:{campaignId:string;toDate:string;commandId:string}):Promise<{date:string;revision:number;paused:boolean}>`.

- [ ] Тест прерывания на кризисе:

```ts
const result = await advanceCampaign(monthJumpWithDayThreeCrisis);
expect(result.date).toBe('1992-01-03');
expect(result.paused).toBe(true);
expect(await eventCountAfter(campaignId, result.date)).toBe(0);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T14.test.ts`.
- [ ] Реализовать последовательность §12 спецификации: freeze snapshot → anchors/plans/obligations → actor proposals → arbiter → validation → one repair maximum → transactional commit → scoped outbox. Конфликтующие операции согласовываются до commit, текст после него связан с canonical IDs.
- [ ] Проверить полный мир и selected actors, fairness review каждого актора за 30 дней, cap 12 calls/substep, no silent skipped crisis, месяц с daily crisis steps, calendar leap/month end, opaque RNG journal. Replay не использует gateway.
- [ ] E2E результат изменяет настоящую карту через projection, а не text parsing. Evidence/commit `feat: simulate causally grounded world turns through AI`.

## T15. Комнаты, сообщения и доступ к дипломатии

**Files:** `packages/diplomacy/src/{rooms,membership,visibility,messages}.ts`, `apps/api/src/routes/rooms.ts`, `tests/tasks/T15.test.ts`.

**Interfaces:** `createRoom(input:Room):Promise<Room>`; `visibleMessages(room:Room,messages:Message[],actorId:string):Message[]`; `appendMessage(input:Message):Promise<Message>` со stamped sequence/date на сервере.

- [ ] Тест позднего наблюдателя:

```ts
expect(visibleMessages(roomWithLateObserver, messages, 'observer')).toEqual([disclosedMessage]);
expect(visibleMessages(sideChannel, messages, 'outsider')).toEqual([]);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T15.test.ts`.
- [ ] Реализовать five room kinds, invitations/membership/disclosure, idempotent send, draft→generating→committed. Auth owner и knowledge actor — два независимых фильтра.
- [ ] Удаление/исключение участника не стирает историю знаний. Server GET/SSE не отправляет скрытые сообщения. Повтор send с другим текстом и прежним idempotency key → 409.
- [ ] Evidence/commit `feat: implement private and shared diplomatic rooms`.

## T16. Многосторонние переговоры и индивидуальные делегаты

**Files:** `packages/diplomacy/src/{speaker-policy,conference-turn,agenda}.ts`, `packages/ai/src/roles/{delegate,chair}.ts`, `tests/tasks/T16.test.ts`.

**Interfaces:** `runConferenceExchange(input:{roomId:string;playerMessageId:string}):Promise<Message[]>`; `selectNextSpeaker(input:{members:RoomMember[];addressedIds:string[];spokenIds:string[];remaining:number}):string|null`.

- [ ] Тест лимита и отсутствия коллективного согласия:

```ts
const replies = await runConferenceExchange(exchangeInput);
expect(replies.length).toBeLessThanOrEqual(6);
expect(new Set(replies.map(m => m.speakerActorId)).size).toBeGreaterThan(1);
expect(await unsignedTreatyStatus()).not.toBe('active');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T16.test.ts`.
- [ ] Контекст каждому delegate отдельно; chair получает публичную повестку, очередь и summary видимых позиций. Прямое обращение имеет приоритет, но не заставляет участника говорить; разногласия/молчание сохраняются. После лимита вернуть управление игроку с summary нерешённых вопросов.
- [ ] Проверить 3-, 8- и 20-сторонние комнаты: выступают релевантные участники, не все каждый раз; observer не подписывает; приватная уступка не известна остальным. Нельзя симулировать голоса всех одной unconstrained строкой.
- [ ] Evidence/commit `feat: negotiate with distinct state delegates in conferences`.

## T17. Самостоятельные обращения и инициативы государств

**Files:** `packages/diplomacy/src/{initiative-triggers,initiative-scheduler,inbox,dedup}.ts`, `apps/worker/src/handlers/initiatives.ts`, `tests/tasks/T17.test.ts`.

**Interfaces:** `planInitiatives(input:{world:WorldState;triggerEventIds:string[];playerActorId:string}):Promise<Initiative[]>`; `Initiative:{id:string;senderId:string;recipientIds:string[];topicId:string;priority:'normal'|'urgent'|'critical';dueDate:string|null;roomId:string|null}`.

- [ ] Тест самостоятельной просьбы и подавления дублей:

```ts
const planned = await planInitiatives(allianceBreachTrigger);
expect(planned.some(i => i.senderId === 'ally' && i.priority === 'urgent')).toBe(true);
expect(deduplicateInitiatives([...planned, ...planned])).toHaveLength(planned.length);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T17.test.ts`; `deduplicateInitiatives(Initiative[]):Initiative[]` — pure export по stable topic/sender/trigger identity.
- [ ] Создать триггеры интересов, кризисов, договоров, deadlines и leadership changes; источник инициативы — собственные мотивы актора. На паузе после обмена максимум 2 релевантных обращения; без самостоятельного бесконечного polling Gemini.
- [ ] Обращения создают комнату/приглашение, могут включать третью страну; игнорирование дедлайна имеет записанное правило и предупреждение. Проактивность не означает обязательную угрозу/войну.
- [ ] Evidence/commit `feat: make states initiate meaningful diplomacy`.

## T18. Договоры, ратификация, организации и нарушения

**Files:** `packages/diplomacy/src/{treaties,signatures,clauses,ratification,obligations,organizations,voting}.ts`, `apps/api/src/routes/treaties.ts`, `tests/tasks/T18.test.ts`.

**Interfaces:** `signTreaty(treaty:Treaty,actorId:string,contentHash:string):Treaty`; `canActivateTreaty(treaty:Treaty,date:string):boolean`; `tallyVotes(rule:VotingRule,votes:Vote[]):VoteOutcome`; определить typed majority/unanimity/veto rules и eligibility по manifest организации.

- [ ] Тест конкретной версии и всех сторон:

```ts
expect(canActivateTreaty(twoSignaturesOfThree, today)).toBe(false);
expect(() => signTreaty(revisedTreaty, 'a', oldHash)).toThrow('VERSION_MISMATCH');
expect(tallyVotes(vetoRule, votesWithVeto).passed).toBe(false);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T18.test.ts`.
- [ ] Реализовать все статусы, version diff, explicit assent, disclosure секретных статей, eligibility, signatures, ratification, conditional effective date. Каждая clause имеет concrete verifier и due date; generic statement не выдаёт себе территориальные полномочия.
- [ ] Проверить выполнение, нарушение, suspend/terminate, реакцию гаранта, membership changes, abstention, veto, изменение quorum, распад участника. Нарушение порождает candidate consequences и новое общение, не только badge.
- [ ] Evidence/commit `feat: enforce negotiated treaties and institutional rules`.

## T19. Кабинет, экономика, внутренняя политика и конфликты

**Files:** `packages/engine/src/{domestic,resources,operations,conflicts,objectives}.ts`, `packages/ai/src/roles/advisor.ts`, `tests/tasks/T19.test.ts`.

**Interfaces:** `ResourceTransfer:{fromAccountId:string;toAccountId:string;amount:number;unit:string;causeEventId:string}`; `reserveActionResources(actionId:string,transfers:ResourceTransfer[]):Promise<void>`; `resolveStrategicAction(actionId:string):Promise<WorldProposal>`; `evaluateObjectives(state:WorldState):ObjectiveResult[]` с `{id:string;status:'ongoing'|'achieved'|'failed';evidenceEventIds:string[]}`.

- [ ] Тест двойного расходования:

```ts
await reserveActionResources('aid-1', firstAid);
await expect(reserveActionResources('aid-2', overspendingAid)).rejects.toThrow('INSUFFICIENT_RESOURCES');
expect(evaluateObjectives(world)[0].evidenceEventIds.length).toBeGreaterThan(0);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T19.test.ts`.
- [ ] Ledger ресурсов/резервов, policy/action state machine, strategic conflict schema, turn-duration constraints. Resources не надо превращать в бесконечную таблицу производств. LLM решает исход с логистикой, внутренними фракциями, интересами и внешними реакциями; engine ограничивает недопустимые эффекты.
- [ ] Проверить реформу с сопротивлением, помощь союзнику, санкции с побочными эффектами, мобилизацию и деэскалацию, мир без победы, провал плана, условное признание; mass escalation требует явного подтверждения и контекста.
- [ ] Goals/personal priorities и финальный factual scorecard; evidence/commit `feat: connect domestic decisions and strategic conflicts to history`.

## T20. Рабочая интерактивная карта

**Files:** `apps/web/src/features/map/{WorldMap,MapToolbar,LayerLegend,CountryPopover,MapComparison}.tsx`, `apps/web/src/features/map/{map-adapter,layers,fallback}.ts`, `tests/e2e/map.spec.ts`.

**Interfaces:** `MapViewModel:{revision:number;date:string;territories:Territory[];selectedActorId:string|null;layer:string}`; `MapAdapter.setState(view:MapViewModel):void`, `MapAdapter.focusTerritories(ids:string[]):void`, `MapAdapter.destroy():void`. Реальные геометрии берутся по digest T05.

- [ ] Написать тест до реализации связки map/state:

```ts
await page.getByRole('button', { name: 'Карта мира', exact: true }).dblclick();
await page.getByRole('searchbox', { name: 'Найти страну или регион' }).fill('Сингапур');
await page.getByRole('option', { name: 'Сингапур', exact: true }).click();
await expect(page.getByRole('button', { name: 'Начать переговоры' })).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/map.spec.ts` с deterministic seed campaign, не с production-заглушкой.
- [ ] Подключить world/borders PMTiles через единственную регистрацию protocol, HTTP Range и edge/territory indexes из T05. Реализовать political/control/claims/relations/conflict/sanctions/events/organizations layers, mixed-control hatching, coherent legend, IDs, hover/click, searchable region list и state revision. Дифф применяет только committed changes; border visibility пересчитывается по соседним контролёрам, не остаётся статичной после передачи региона.
- [ ] Проверить передачу части государства, отделение нового актора, государство без полигона, antimeridian, прошлую дату, before/after, отсутствие WebGL, перезапуск renderer без утечки. Vector tiles и fallback не зависят от платной картографической службы.
- [ ] Screenshot и performance evidence; commit `feat: render a stateful historical world map`.

## T21. XP design system и оригинальные ресурсы

**Files:** `apps/web/src/ui/xp/{tokens.css,Button,Toolbar,Menu,StatusBar,TreeView,TabPanel,Field,Dialog,Toast}.tsx`, `apps/web/src/ui/xp/icons/`, `apps/web/src/i18n/{ru,en}.json`, `tests/e2e/xp-kit.spec.ts`, `docs/design/xp-art-direction.md`.

**Interfaces:** semantic controls на native HTML; `XpButton` сохраняет `button` props, keyboard/focus; `XpDialog` требует accessible title и onClose. Theme tokens из §10 спецификации — единый источник цветов/отступов.

- [ ] Написать компонентные тесты с Playwright-страницей каталога controls: Enter активирует button, disabled не активирует, modal возвращает фокус, меню закрывается Escape.

```ts
await page.getByRole('button', { name: 'Показать подтверждение' }).click();
await expect(page.getByRole('dialog', { name: 'Подтверждение решения' })).toBeVisible();
await page.keyboard.press('Escape');
await expect(page.getByRole('button', { name: 'Показать подтверждение' })).toBeFocused();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/xp-kit.spec.ts`.
- [ ] Сделать XP Luna-inspired controls, градиентные заголовки, фаски, menu/tool/status bars и оригинальные предметные иконки 16/24/32 px. Если нужны растровые рисунки — использовать соответствующий image skill, не скачивать чужие Windows-ресурсы.
- [ ] Проверить 100/125/150% scale, обе локали, контраст, high-contrast и reduced-motion; отсутствие обрезанных длинных подписей. Каждая иконка имеет единый язык материала/света, не смешивать emoji и случайные icon packs.
- [ ] Сохранить просмотренные screenshots всех controls и asset-license manifest; commit `design: establish accessible XP-inspired interface system`.

## T22. Desktop shell и полноценный window manager

**Files:** `apps/web/src/desktop/{Desktop,DesktopIcon,Taskbar,StartMenu,WindowFrame}.tsx`, `apps/web/src/desktop/{window-store,window-registry,layout-persistence,keyboard}.ts`, `tests/e2e/desktop.spec.ts`.

**Interfaces:** `WindowState:{id:string;appId:string;entityId:string|null;x:number;y:number;width:number;height:number;mode:'normal'|'minimized'|'maximized';restoreRect:{x:number;y:number;width:number;height:number};z:number}`; store exports `openWindow`, `focusWindow`, `minimizeWindow`, `maximizeWindow`, `restoreWindow`, `closeWindow`, `resetLayout`.

- [ ] Тест открытия/сворачивания/восстановления:

```ts
await page.getByRole('button', { name: 'Дипломатия', exact: true }).dblclick();
await page.getByRole('button', { name: 'Свернуть Дипломатия' }).click();
await page.getByRole('button', { name: 'Окно: Дипломатия' }).click();
await expect(page.getByRole('region', { name: 'Дипломатия', exact: true })).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/desktop.spec.ts`.
- [ ] Implement window state reducer и pointer capture для drag/resize, z-order, restoreRect, taskbar linkage, singleton rules, multi-entity rooms, icon keyboard/touch behavior. Обычные окна имеют region/label, не `aria-modal=true`.
- [ ] Clamp после resize viewport, persisted layouts по campaign/device class, command «Карта и переговоры рядом», cascade/reset. Проверить 20 окон, drag за край, минимальный размер, возврат фокуса, close без потери draft, no OS shortcut hijack.
- [ ] На <900 px включить single-window layout с тем же taskbar/store; screenshots desktop/390 px/keyboard evidence; commit `feat: implement a complete desktop window manager`.

## T23. Библиотека кампаний и мастер новой игры

**Files:** `apps/web/src/features/campaign/{CampaignLibrary,NewCampaignWizard,ActorPicker,WorldScopePicker,ScenarioCard}.tsx`, `apps/web/src/features/settings/{AiSettings,CredentialForm,BudgetPanel}.tsx`, `apps/api/src/routes/campaigns.ts`, `tests/e2e/new-campaign.spec.ts`.

**Interfaces:** `CreateCampaignInput:{scenarioDigest:string;playerActorId:string;scope:{mode:'world'|'selected';actorIds:string[]};modelProfile:ModelProfile;credentialRef:string;locale:'ru'|'en'}` → `{campaignId:string}`.

- [ ] Тест выбрать современный сценарий, свою страну, ещё двух участников и custom model; после reload config не сбрасывается:

```ts
await page.getByLabel('ID модели Gemini').fill('gemini-3.8-flash');
await page.getByRole('button', { name: 'Создать кампанию' }).click();
await expect(page.getByText('Активных государств: 3', { exact: true })).toBeVisible();
await page.reload();
await expect(page.getByText('gemini-3.8-flash', { exact: true }).first()).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/new-campaign.spec.ts`.
- [ ] Реализовать сценарии с manifest freshness/license/coverage, полный реестр акторов, мультивыбор без пропадания background world; key storage choice, paid probe consent, economical/balanced/quality/custom. Неверный key/model объясняет проблему до стартового хода.
- [ ] Проверить все 3 эпохи × world/selected × RU/EN; создание не требует выбора великой державы; scope expansion explicit. Современный старт не показывает состав мира 1991 года.
- [ ] First-run tutorial проходит создание/карту/дипломатию/ход; библиотека resume/archive/delete с подтверждением. Evidence/commit `feat: deliver campaign setup and Gemini settings`.

## T24. Дипломатия, входящие и редактор соглашений в окнах

**Files:** `apps/web/src/features/diplomacy/{DiplomacyWindow,RoomList,Conversation,Participants,Agenda,Inbox,TreatyEditor,TreatyDiff,SignaturePanel}.tsx`, `tests/e2e/diplomacy.spec.ts`.

**Interfaces:** Room/Message/Treaty projections T15–T18; shell `openWindow('diplomacy',roomId)`; streaming разделяет provisional/final; command send требует explicit UI action.

- [ ] Тест трёхстороннего договора с контрпредложением и разными подписями:

```ts
await expect(page.getByText('Подписано: 2 из 3', { exact: true })).toBeVisible();
await expect(page.getByText('Договор вступил в силу', { exact: true })).toHaveCount(0);
await page.getByRole('button', { name: 'Сравнить версии' }).click();
await expect(page.getByRole('region', { name: 'Изменения договора' })).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/diplomacy.spec.ts`.
- [ ] Комнаты с отличимыми делегатами/флагами/ролями, повестка, приглашения, side channels, reply-to, explicit statements, поиск по истории, черновики по room ID, unread count. Входящий urgent request открывает нужный контекст через уведомление, но не крадёт фокус сам.
- [ ] Treaty editor отображает clauses/obligations/deadlines/visibility/version/signatures; важное согласие требует явной кнопки. Закрытие окна не удаляет переговоры. Проверить длинные сообщения, вставку Markdown, ошибки retry/cancel, typing во время входящего stream.
- [ ] Real-provider smoke: отличающиеся позиции трёх стран, counteroffer, самостоятельное приглашение. Evidence/commit `feat: deliver rich diplomatic conversations and agreements`.

## T25. Кабинет, досье и понятные AI-обоснования

**Files:** `apps/web/src/features/cabinet/{CabinetWindow,AdvisorChat,ActionComposer,ActionQueue,Reports,CountryDossier}.tsx`, `tests/e2e/cabinet.spec.ts`.

**Interfaces:** ActionIntent, ObjectiveResult, authorized country/report projections. Advisor rationale — краткое содержательное объяснение по доступным фактам, не raw thinking.

- [ ] Тест различия обсуждения и приказа:

```ts
await page.getByRole('textbox', { name: 'Вопрос советнику или поручение' }).fill('Что будет, если предложить посредничество?');
await page.getByRole('button', { name: 'Отправить советнику' }).click();
await expect(page.getByText('Приказ выполняется', { exact: true })).toHaveCount(0);
await expect(page.getByRole('button', { name: 'Подготовить поручение' })).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/cabinet.spec.ts`.
- [ ] Реализовать advisor roles, альтернативы/риски, preview/confirm действий, queue/due/cancel, ресурсы и неопределённость, направленные отношения с причинными ссылками. Числа источников/оценок различимы.
- [ ] Досье показывает актуальное руководство/период/организации/обязательства только по player knowledge. Проверить разные страны, выполненный/частичный/проваленный приказ, pending clarification и blocked safety.
- [ ] Evidence/commit `feat: connect advisers and country dossiers to actionable policy`.

## T26. Хроника, причинные связи, прошлое и финал

**Files:** `apps/web/src/features/chronicle/{ChronicleWindow,EventCard,Timeline,EventCauses,HistoryCompare,CampaignFinale}.tsx`, `apps/api/src/routes/events.ts`, `tests/e2e/chronicle.spec.ts`.

**Interfaces:** canonical events с public evidence/cause projection, cursor pagination; `openWindow('map',null)` + focusTerritories; view revision/date не меняет current revision.

- [ ] Тест связи события и карты:

```ts
await page.getByRole('button', { name: 'Показать на карте' }).first().click();
await expect(page.getByRole('region', { name: 'Карта мира', exact: true })).toBeVisible();
await page.getByLabel('Дата просмотра').fill('1991-12-26');
await expect(page.getByText('Просмотр прошлого — без изменения кампании')).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/chronicle.spec.ts`.
- [ ] Фильтры actor/region/date/category/importance, доступные sources, отличия history/estimate/campaign/rumor, причинные ссылки, before-after. Пустая хроника объясняет следующий ход; error сохраняет позицию списка.
- [ ] Финальная хроника и scorecard опираются на события/цели, экспорт readable report; продолжить песочницу/создать ветку. Проверить 10 000 событий виртуализованным списком и отсутствие утечки engine visibility.
- [ ] Evidence/commit `feat: make alternate history inspectable and replayable`.

## T27. Полный редактор сценариев и безопасный импорт

**Files:** `apps/web/src/features/scenario-editor/{EditorWindow,ActorEditor,AnchorEditor,GeographyEditor,SourcePanel,ValidationReport}.tsx`, `packages/geography/src/split-region.ts`, `apps/api/src/routes/scenario-drafts.ts`, `packages/history/src/scenario-import.ts`, `tests/tasks/T27.test.ts`, `tests/e2e/scenario-editor.spec.ts`.

**Interfaces:** `importScenario(bytes:Uint8Array):Promise<ScenarioPack>`; `splitRegion(input:{territoryId:string;line:GeoJSON.LineString;geometry:GeoJSON.Polygon|GeoJSON.MultiPolygon}):{parts:GeoJSON.FeatureCollection;parentId:string}`; `publishScenario(pack:ScenarioPack):Promise<{digest:string}>`.

- [ ] Тест path traversal и невозможности опубликовать неизвестного участника:

```ts
await expect(importScenario(zipWithParentTraversal)).rejects.toThrow('UNSAFE_ARCHIVE_PATH');
await expect(publishScenario(anchorWithUnknownActor)).rejects.toThrow('CONTENT_INVALID');
expect(splitRegion(validSplit).parts.features).toHaveLength(2);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T27.test.ts` и `pnpm exec playwright test tests/e2e/scenario-editor.spec.ts`.
- [ ] Создание/копирование пакета, actors/relations/anchors/sources, date/lifetime validation, ownership и геометрические разбиения, previews, license metadata, draft vs published. Мастер произвольной даты выдаёт review report, не штамп «исторически достоверно».
- [ ] Ограничения: compressed 50 MiB, uncompressed 250 MiB, ≤10 000 files; MIME/schema/checksum; запрет symlinks, absolute/parent paths, remote executable resources. Geometry split проверяет non-overlap, area conservation с установленной tolerance и descendant IDs; не меняет старые кампании.
- [ ] Evidence/commit `feat: ship an editable versioned scenario authoring tool`.

## T28. Автосохранение, ветки, экспорт и миграции

**Files:** `packages/engine/src/branch.ts`, `packages/db/src/{saves,save-migrations}.ts`, `apps/api/src/routes/{saves,exports,imports}.ts`, `apps/web/src/features/campaign/SaveManager.tsx`, `tests/tasks/T28.test.ts`, `tests/e2e/saves.spec.ts`.

**Interfaces:** `exportCampaign(input:{campaignId:string;mode:'save'|'chronicle';includeSpoilers:boolean}):Promise<Uint8Array>`; `importCampaign(bytes:Uint8Array,ownerId:string):Promise<{campaignId:string}>`; `branchCampaign(campaignId:string,revision:number):Promise<{campaignId:string}>`.

- [ ] Тест hash эквивалентности после экспорта и отсутствия ключа:

```ts
const archive = await exportCampaign(normalSaveRequest);
expect(new TextDecoder().decode(archive)).not.toContain('synthetic-test-secret');
const imported = await importCampaign(archive, 'owner-a');
expect(await canonicalHash(imported.campaignId)).toBe(await canonicalHash(originalId));
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T28.test.ts` и `pnpm exec playwright test tests/e2e/saves.spec.ts`; дополнить проверку распакованных файлов, поскольку compressed bytes alone недостаточны для поиска секрета.
- [ ] Save manifest/version/hashes/scenario digest, manual checkpoints, fork causal history/memory, immutable original branch, stable source identities with remap of local IDs. Canonical hash исключает новый campaign/owner ID и включает нормализованные содержательные факты/события.
- [ ] Tested migrations минимум v1→v2 fixture, future schema reject, corrupted/missing chunk reject, absent geopack error, giant archive reject, full vs player-known export, fresh campaign ID. Удаление не затрагивает общие scenario assets.
- [ ] Evidence/commit `feat: preserve campaigns through saves branches and migrations`.

## T29. Reconnect, offline reading и пользовательские ошибки

**Files:** `apps/api/src/sse/{stream,outbox-reader}.ts`, `apps/web/src/app/{connection,sse-client,offline-cache,error-boundary}.ts`, `apps/web/src/features/settings/Diagnostics.tsx`, `tests/e2e/recovery.spec.ts`.

**Interfaces:** normalized event envelope contracts.md, cache только player projection/drafts; `resumeStream(cursor:number):Promise<void>`; reconnect reconciles revision до применения delta.

- [ ] Тест обрыва сети после отправки:

```ts
await page.getByRole('button', { name: 'Продвинуть время' }).click();
await context.setOffline(true);
await expect(page.getByText('Нет соединения. Сохранённые данные доступны.')).toBeVisible();
await context.setOffline(false);
await expect(page.getByText('Синхронизировано', { exact: true })).toBeVisible();
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/recovery.spec.ts`.
- [ ] Persistent outbox/SSE cursors, dedup consumer, reconnect revision handshake, heartbeat, status-aware retry; interrupted chat сохраняет draft и failed state. Кэш offline удаляется при logout/удалении аккаунта; auth responses/credentials не кэшируются.
- [ ] Проверить expired cursor→snapshot resync, repeated events, два tab одной кампании, DB unavailable, provider 429/invalid key/safety/timeout, reload after commit. Отмена не обещает возврат денег. Offline play не генерирует фальшивые ответы.
- [ ] Evidence/commit `feat: recover gracefully from network and provider failures`.

## T30. Контроль времени, уведомления и автоход

**Files:** `apps/web/src/desktop/{GameClock,NotificationCenter,AutoAdvanceControls}.tsx`, `apps/worker/src/handlers/auto-advance.ts`, `packages/engine/src/time-control.ts`, `tests/e2e/time-control.spec.ts`.

**Interfaces:** `AutoAdvanceConfig:{enabled:boolean;intervalSeconds:number;stopOn:'important'|'critical';dailyTokenLimit:number}`; `shouldScheduleNext(input:{config:AutoAdvanceConfig;lastHeartbeatAgeSeconds:number;needsPlayerDecision:boolean;budgetAvailable:boolean}):boolean`.

- [ ] Тест прекращения фона:

```ts
expect(shouldScheduleNext({ config, lastHeartbeatAgeSeconds: 31,
  needsPlayerDecision: false, budgetAvailable: true })).toBe(false);
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/time-control.spec.ts`; pure helper дополнительно в `tests/tasks/T30.test.ts` через Vitest.
- [ ] UI день/неделя/месяц/до события, review pending commitments, estimate, explicit auto consent. Taskbar показывает game date и stage; urgent notifications имеют разумное grouping и действие открыть room/event.
- [ ] Проверить deadline crossing, большой jump, confirmation-required stop, heartbeat loss, daily budget, tab focus, no focus theft, sound opt-in, accessible notification history. На завершении события показывать canonical results, не spoilers будущего подшага.
- [ ] Evidence/commit `feat: give players reliable control over time and interruptions`.

## T31. Security/privacy hardening и очистка данных

**Files:** `apps/api/src/security/{headers,origin,upload,url-fetch,redaction,limits}.ts`, `packages/ai/src/prompt-boundaries.ts`, `apps/api/src/routes/privacy.ts`, `tests/tasks/T31.test.ts`, `docs/security/{threat-model,privacy,data-retention}.md`.

**Interfaces:** `sanitizeMarkdown(text:string):string`, `allowSourceUrl(url:string):Promise<boolean>`, `redactDiagnostic(value:unknown):unknown`; domain tools — allowlisted pure/game commands, не shell/SQL/fetch.

- [ ] Тест XSS/SSRF/секретов:

```ts
expect(sanitizeMarkdown('<img src=x onerror=alert(1)>')).not.toContain('onerror');
expect(await allowSourceUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
expect(JSON.stringify(redactDiagnostic(secretDiagnostic))).not.toContain('synthetic-test-secret');
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T31.test.ts`.
- [ ] Threat model по ключам, actor secrets, user isolation, импортам, model output, SSE и pipeline; enforce CSP/Origin/session policies, streaming limits, source-fetch redirect/DNS/private IP controls, ZIP rules, sanitize metadata и Unicode display spoofing для model IDs/имён.
- [ ] Canary prompt-injection suite в user/chat/scenario/source data; чужая информация не попадает в response или retrieval. Delete campaign/key/account clears own caches/queues, retention backups описан. Raw prompts off by default, диагностический opt-in явно ограничен.
- [ ] Dependency/license/secret scan, тест public startup guard, проверка provider safety failures без обхода; evidence/commit `security: harden trust boundaries and user data lifecycle`.

## T32. Оценка качества ИИ и исторических развилок

**Files:** `tests/evals/{diplomacy,history,memory,realpolitik,adversarial}.json`, `tools/evals/{runner,rubric,report,live-budget}.ts`, `tests/tasks/T32.test.ts`, `docs/quality/evidence/ai-evaluation.md`.

**Interfaces:** `EvalCase:{id:string;scenarioDigest:string;setupEventIds:string[];input:string;requiredBehaviors:string[];forbiddenBehaviors:string[];rubric:string[]}`; `runEvaluation(input:{modelIds:string[];caseIds:string[];repetitions:number;maxMoneyMicros:number|null}):Promise<EvalReport>`; report содержит results/usage/unknown/failures, не только общий score.

- [ ] Добавить offline negative tests для schema failures и ложного judge pass:

```ts
expect(scoreHardInvariants(invalidOutcome).passed).toBe(false);
expect(acceptEval({ hardFailures: 1, meanRubric: 5 })).toBe(false);
```

- [ ] Red/green: `pnpm exec vitest run tests/tasks/T32.test.ts`, `pnpm eval:offline`. `scoreHardInvariants` возвращает `{passed:boolean;issues:string[]}`, `acceptEval` требует нулевые hard failures.
- [ ] Собрать минимум 60 содержательных cases и 40 adversarial cases. Для каждой preset модели: 30 ключевых cases ×3 повтора live плюс остальное offline/replay; расходы предварительно ограничить и получить доступ к подходящему ключу. Не расходовать user key на большой benchmark без согласованного бюджета.
- [ ] Rubric и пороги из release-gates; LLM judge только вспомогателен, ≥20% live результатов и все провалы оцениваются человеком/независимым содержательным review. Нужны контрфактические пары: та же реплика при другом доверии, логистике, секрете или действующем договоре должна получать контекстно различный результат.
- [ ] Исправить prompt/context/schema, повторить именно failing cases и регрессию обеих моделей; evidence/commit `test: evaluate historical and diplomatic AI quality`.

## T33. UX, доступность и визуальная полировка

**Files:** `tests/e2e/{accessibility,visual-regression,keyboard,mobile,localization}.spec.ts`, `docs/quality/evidence/ux-review.md`; менять конкретные проблемные UI-файлы, не ослаблять snapshots ради зелёного теста.

**Interfaces:** все пользовательские controls имеют stable role/name; axe scan после каждого критического экрана; manual keyboard и screen reader checklist из release-gates.

- [ ] Задать тесты desktop 1440×900, laptop 1366×768, tablet 1024×768, mobile 390×844 и 320 CSS px reflow/zoom; обе локали и 200% browser zoom:

```ts
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations.filter(v => ['serious','critical'].includes(v.impact ?? ''))).toEqual([]);
await expect(page).toHaveScreenshot('desktop-diplomacy.png', { animations: 'disabled' });
```

- [ ] Red/green: `pnpm exec playwright test tests/e2e/accessibility.spec.ts tests/e2e/visual-regression.spec.ts tests/e2e/keyboard.spec.ts tests/e2e/mobile.spec.ts tests/e2e/localization.spec.ts`.
- [ ] Просмотреть реальные screenshots: типографика, XP consistency, button states, map contrast, chat density, readably-sized icons, window overlap. Проверить keyboard-only создание кампании→конференция→подпись→ход→сохранение и screen reader reading order.
- [ ] Провести 5 пользовательских usability-сессий по фиксированным заданиям, если доступны участники; отсутствие участников отмечается как непроведённая внешняя проверка, не заменяется выдуманными результатами. Обязательный expert walkthrough выполняется независимо. Critical path ошибок/мобильного ввода — ноль блокирующих проблем.
- [ ] Evidence со screenshot review и исправлениями; commit `design: polish windowed gameplay and accessibility`.

## T34. Производительность, длительная игра и нагрузка

**Files:** `tools/benchmarks/{map,world,soak,load,context}.ts`, `tests/e2e/performance.spec.ts`, `docs/quality/evidence/performance.md`.

**Interfaces:** benchmark report всегда включает hardware/browser/build/content digest/profile/latency model/sample size. Искусственная LLM latency отделена от live latency.

- [ ] Создать workload 200+ акторов, ≥5 000 территорий или фактическое большее число из content manifest, 10 000 событий и 50 000 сообщений; fake only for deterministic load. Проверить repeated snapshot hashes и memory heap trend.

```ts
expect(report.replayHash).toBe(report.liveProjectionHash);
expect(report.duplicateCommittedEffects).toBe(0);
expect(report.actorReviewsOverdue).toBe(0);
```

- [ ] Запустить `pnpm exec tsx tools/benchmarks/soak.ts` и `pnpm exec playwright test tests/e2e/performance.spec.ts`; пороги из release-gates. Зафиксировать baseline до оптимизации.
- [ ] Оптимизировать tile/geometry delivery, event/message virtualization, memoized selectors, SQL indexes, context retrieval и staggered role work. Не ухудшать secrecy/history scope для ускорения. Два масштаба — world и selected 10/30 actors.
- [ ] Offline soak 1 000 подшагов; live soak минимум 50 содержательных подшагов при разрешённом бюджете с memory probes через 10/25/50; concurrency test 20 активных кампаний на серверном стенде. Измерить стоимость, не оценивать её по числу стран.
- [ ] Evidence/commit `perf: validate full-world and long-campaign operation`.

## T35. Развёртывание, backups, лицензии и руководство

**Files:** `infra/{Dockerfile.web,Dockerfile.api,Dockerfile.worker,Dockerfile.geography,compose.yml,reverse-proxy.conf}`, `infra/compose.geography.yml`, `tools/backup.ts`, `tools/restore.ts`, `README.md`, `docs/operations/{deploy,backup-restore,migrations,incident-runbook}.md`, `docs/user/{getting-started,ai-keys,scenarios,troubleshooting}.md`, `THIRD_PARTY_NOTICES.md`, `.github/workflows/release.yml`.

**Interfaces:** `docker compose -f infra/compose.yml up --build`; health/readiness разделяют process/DB/worker, не требуют успешного платного Gemini-вызова. Secrets поступают извне, images не содержат ключей.

- [ ] Acceptance clean install: clone/archive → env по примеру → compose → bootstrap/login → seed content → первая настоящая кампания. Проверить public/private deploy modes и отсутствие dev auth bypass.
- [ ] Запустить documented commands на чистом окружении, не только на машине разработчика; проверить graceful shutdown, SSE proxy buffering/timeouts, durable volumes, schema migration lock, immutable assets и backward-compatible rolling update. Поставить закреплённый PostGIS/GEOS/GDAL geography build/editing image и Tippecanoe 2.79.0; готовая карта читается без геосборки при каждом старте. PMTiles Range запрос возвращает 206/корректный Content-Range; ETag/digest не меняются между запусками.
- [ ] Backup/PostgreSQL restore в отдельный namespace с проверкой content artifacts и campaign hash; ежедневные snapshots, документированное хранение 30 дней по умолчанию; пользователь видит задержку окончательного исчезновения данных из backups. Master keys резервируются отдельно от encrypted data с инструкцией восстановления.
- [ ] RU/EN руководство: установка, key trust, реальные расходы, модели, сроки источников, окна/горячие клавиши, diplomacy, failure/retry, импорт/экспорт, удаление, обновление. Notices включают CShapes CC BY-NC-SA и derivative changes, Natural Earth, библиотеки и оригинальные/внешние assets.
- [ ] Evidence/commit `ops: package a deployable documented noncommercial release`. Публичную публикацию и расходы инфраструктуры выполнять только при наличии необходимых пользовательских параметров/полномочий.

## T36. Полная приёмка, повторный аудит и финальная передача

**Files:** `tools/verify-release.ts`, `docs/quality/evidence/{release-audit,release-manifest,known-limitations}.md`; обновить `docs/quality/release-gates.md` фактическими evidence-ссылками, не менять критерии ради PASS.

**Interfaces:** `pnpm verify:release` проверяет наличие результатов обязательных suites и артефактов, не считает missing/skipped зелёными. Выход 0 только при выполнении объективных gates; human/content sign-off — отдельный явный статус.

- [ ] Пройти R01–R28, сценарии A01–A18 и gates Q01–Q10. Для каждого требования предъявить путь реализации, тест и результат, а не фразу «реализовано».
- [ ] Run clean CI, content/license checks, real Gemini smoke обоих ID, historical review, world/selected campaigns, full conference/treaty/initiative path, imports/replay, fault recovery, accessibility/visual и deployment restore.
- [ ] Завести каждый дефект P0/P1/P2 с шагами воспроизведения, ответственным TNN и regression test. Исправить P0/P1 и нарушающие обязательные требования P2; не маскировать критичность переименованием.
- [ ] Выполнить повторный полный аудит после исправлений; выявленная регрессия возвращает affected tasks в работу. Если нужен внешний ключ/домен/контентный reviewer — честно остановить соответствующий gate и запросить недостающий ресурс.
- [ ] Передать запускаемый release artifact/tag, инструкции, данные с notices, проверенную ссылку deployment при наличии, test report, measured AI cost/latency и честные ограничения. Не называть финалом внутренний срез, demo mode или один красивый экран.

## 2. Контрольные точки проекта

| Контрольная точка | Необходимые задачи | Что предъявляется |
|---|---|---|
| Надёжная основа | T01–T04 | Изолированное состояние, contracts, vault, воспроизводимый build |
| Настоящий мир | T05–T09 | Три проверенных пакета, география, temporal facts, память |
| Работающий AI runtime | T10–T14 | Настоящие Gemini calls, durable jump, validation/replay |
| Полная дипломатическая механика | T15–T19 | Конференции, инициативы, действующие договоры и последствия |
| Полный игровой интерфейс | T20–T26 | XP desktop, окна, карта, кабинет, переговоры, хроника |
| Законченный пользовательский продукт | T27–T30 | Editor, saves, branches, reconnect/offline, time controls |
| Кандидат релиза | T31–T35 | Security, AI evals, UX, performance, deployment/restore |
| Финальный релиз | T36 | Вся матрица + повторный аудит + подтверждённые артефакты |

Это последовательные проверки качества одного полного релиза, не список независимых MVP.

## 3. Что агент не должен делать

- Подменять заданные Gemini ID по собственному вкусу или скрыто использовать key разработчика.
- Делать один огромный prompt всей планеты со всеми секретами для каждого сообщения.
- Генерировать новую геометрию LLM-текстом и применять её без проверяемого редактора.
- Объявлять все страны подписавшими соглашение из одной красивой NPC-реплики.
- Использовать современный список стран в историческом пакете без temporal reconstruction.
- Превращать Jump Forward в непрерывную дорогую генерацию, пока пользователь отсутствует.
- Удалять журнал ради сжатия контекста либо восстанавливать владение из prose summary.
- Считать schema-valid ответ исторически истинным и рациональным по определению.
- Отмечать live tests пройденными по fake provider, отсутствующий source — подтверждённым, непросмотренный screenshot — качественным.
- Бесконечно расширять scope вместо закрытия принятой спецификации.

## 4. Начало исполнения

Перед реализацией подтвердить предложенные продуктовые границы и режим запуска. Затем начать T01, не перегенерировать этот план с нуля. В конце каждой рабочей сессии оставить текущую задачу, фактические результаты, следующий конкретный шаг и блокеры. Все знания, необходимые следующему агенту, должны находиться в документах/коде, а не только в истории чата.
