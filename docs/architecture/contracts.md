# Контракты Astra Realpolitik

Контракты ниже — нормативная граница планируемой реализации. TypeScript-фрагменты описывают обязательные формы, не являются уже созданным SDK. Реальные runtime-схемы Zod и JSON Schema генерируются из единого определения в T02. Дополнительные поля допускаются только через согласованную версию, не случайное расширение ответов модели.

## 1. Идентификаторы, даты, evidence

```ts
type Id = string;
type GameDate = string; // ISO YYYY-MM-DD; проверять календарную корректность
type Revision = number; // целое >= 0
type Digest = string; // SHA-256 canonical JSON / bytes
type Visibility =
  | { kind: 'public' }
  | { kind: 'actors'; actorIds: Id[] }
  | { kind: 'engine' };

interface Evidence {
  id: Id;
  url: string;
  title: string;
  publisher: string;
  sourcePublishedAt: string | null;
  retrievedAt: string;
  observedAt: GameDate | null;
  availableFrom: GameDate;
  validFrom: GameDate;
  validTo: GameDate | null;
  digest: Digest;
  licenseId: string;
  confidence: 'verified' | 'contested' | 'estimated';
}

interface Fact {
  id: Id;
  subjectId: Id;
  predicate: string;
  value: string | number | boolean | null;
  unit: string | null;
  validFrom: GameDate;
  validTo: GameDate | null;
  availableFrom: GameDate;
  evidenceIds: Id[];
  visibility: Visibility;
  origin: 'historical' | 'scenario_estimate' | 'campaign' | 'actor_belief';
}
```

ID не выводится из текущего названия. Внешние ISO/COW/GW/UN-коды хранятся как alias с периодом действия. Переименование, объединение и распад не меняют старые события. Размеры чисел, допустимые units и временные границы проверяются runtime; неизвестное значение — `null`, не ноль.

## 2. Мир

```ts
interface Actor {
  id: Id;
  name: string;
  kind: 'state' | 'dependency' | 'organization' | 'nonstate';
  existsFrom: GameDate;
  existsTo: GameDate | null;
  playable: boolean;
  publicProfileFactIds: Id[];
  privateGoalFactIds: Id[];
}
interface Territory {
  id: Id;
  geometryId: Id;
  controllerId: Id | null;
  controlStatus: 'single' | 'mixed' | 'unknown' | 'not_applicable';
  competingControllerIds: Id[];
  controlAsOf: GameDate;
  controlEvidenceIds: Id[];
  controlReviewStatus: 'unreviewed' | 'verified' | 'contested' | 'scenario_estimate' | 'campaign';
  claimantIds: Id[];
  recognitionFactIds: Id[];
}
interface Relation {
  fromActorId: Id;
  toActorId: Id;
  trust: number; // [-100,100]
  threat: number; // [0,100]
  respect: number; // [0,100]
  ideologicalAffinity: number; // [-100,100]
  economicDependence: number; // [0,100]
  domesticAcceptability: number; // [-100,100]
  commitmentReliability: number; // [0,100]
  reasonEventIds: Id[];
}
interface WorldState {
  campaignId: Id;
  revision: Revision;
  date: GameDate;
  scenarioDigest: Digest;
  actors: Record<Id, Actor>;
  territories: Record<Id, Territory>;
  facts: Record<Id, Fact>;
  relations: Relation[];
  activeTreatyIds: Id[];
  pendingActionIds: Id[];
}
interface ResourceTransfer {
  fromAccountId: Id;
  toAccountId: Id;
  amount: number; // конечное положительное число; шкала определяется unit
  unit: string;
  causeEventId: Id;
}
interface ConflictState {
  id: Id;
  participantIds: Id[];
  theaterTerritoryIds: Id[];
  objectiveFactIds: Id[];
  status: 'crisis' | 'active' | 'ceasefire' | 'settled';
  escalation: number; // [0,100], не вероятность автоматически начавшейся войны
}
```

Организации, конфликты, бюджеты, кабинеты и планы хранятся нормализованными записями с конкретными схемами соответствующих задач; `Fact` не используется как бесконтрольная замена всем доменным типам. `WorldState` — snapshot envelope; большие списки сообщений, геометрий и evidence передаются отдельно по ссылкам.

## 3. Команды, предложения и события — три разных объекта

Уточнение контроля: структура исходного `TerritorialAssessment` и порядок создания геометрии закреплены в [современной карте](modern-geography.md). `change_control` устанавливает single control указанного актора, очищает competing controllers, ставит дату события и `controlReviewStatus:'campaign'`: это истина игры, не новое утверждение о реальности. Смена на mixed/unknown выполняется только `set_control_assessment`. Канонические изменения контроля связаны с причинным событием; source evidence и причины игры не смешиваются. `unreviewed` запрещён в публикуемом стартовом наборе и новых canonical effects.

```ts
interface CommandEnvelope {
  commandId: Id;
  campaignId: Id;
  expectedRevision: Revision;
  idempotencyKey: string;
  type: 'send_message' | 'ask_advisor' | 'confirm_action' | 'cancel_action'
      | 'advance_time' | 'sign_treaty' | 'cancel_job' | 'branch_campaign'
      | 'finish_campaign';
  payload: unknown; // discriminated runtime-schema для каждого type
}

type WorldOperation =
  | { kind: 'change_control'; territoryId: Id;
      fromActorId: Id | null; toActorId: Id }
  | { kind: 'set_control_assessment'; territoryId: Id;
      controlStatus: Territory['controlStatus']; controllerId: Id | null;
      competingControllerIds: Id[]; controlAsOf: GameDate; controlEvidenceIds: Id[];
      controlReviewStatus: Territory['controlReviewStatus'] }
  | { kind: 'set_claimants'; territoryId: Id; claimantIds: Id[] }
  | { kind: 'record_recognition'; territoryId: Id; fact: Fact }
  | { kind: 'transfer_resource'; transfer: ResourceTransfer; reservationId: Id }
  | { kind: 'upsert_conflict'; conflict: ConflictState }
  | { kind: 'upsert_relation'; relation: Relation }
  | { kind: 'record_fact'; fact: Fact }
  | { kind: 'transition_treaty'; treatyId: Id; from: TreatyStatus; to: TreatyStatus }
  | { kind: 'schedule_action'; actionId: Id; dueDate: GameDate }
  | { kind: 'resolve_action'; actionId: Id;
      outcome: 'success' | 'partial' | 'failed' | 'cancelled' }
  | { kind: 'create_actor'; actor: Actor }
  | { kind: 'end_actor'; actorId: Id; successorIds: Id[]; date: GameDate };

interface EventProposal {
  proposalId: Id;
  title: string;
  summary: string;
  occursOn: GameDate;
  causeEventIds: Id[];
  evidenceIds: Id[];
  actorIds: Id[];
  territoryIds: Id[];
  visibility: Visibility;
  rationaleSummary: string;
  operations: WorldOperation[];
}
interface WorldProposal {
  schemaVersion: 1;
  baseRevision: Revision;
  fromDate: GameDate;
  toDate: GameDate;
  events: EventProposal[];
  needsPlayerDecision: boolean;
}
interface CanonicalEvent extends EventProposal {
  eventId: Id;
  campaignId: Id;
  revision: Revision;
  jobId: Id;
  createdAt: string;
  modelCallIds: Id[];
}
interface ValidationIssue {
  code: 'UNKNOWN_ID' | 'STALE_REVISION' | 'UNAUTHORIZED'
      | 'TEMPORAL_CONFLICT' | 'RESOURCE_CONFLICT' | 'MISSING_CONSENT'
      | 'CONTRADICTORY_EFFECTS' | 'INVALID_EVIDENCE' | 'SCHEMA_INVALID';
  path: string;
  message: string;
}
type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

interface ApplyResult { state: WorldState; events: CanonicalEvent[] }
```

`WorldProposal` не содержит owner ID, credential ID или SQL. Полномочия `transition_treaty` сверяются с реальным состоянием подписей/сроков. `record_fact` не обходит специальные операции контроля/признания/договоров/ресурсов/конфликтов. Для денег и запасов T19 реализует типизированные ledger transfers, а не запись произвольного факта «денег стало больше»; сервер создаёт reservation после проверки исполнимого решения, модель не вправе выдать себе новый резерв. Изменение признания не изменяет контроль автоматически. `causeEventIds` допускают ссылки на более ранние события либо ранее объявленные proposal IDs в той же порции; движок преобразует локальные ссылки в canonical IDs, запрещает циклы и ссылки вперёд.

## 4. Дипломатия

```ts
type TreatyStatus = 'draft' | 'proposed' | 'negotiating' | 'agreed'
  | 'signed' | 'ratified' | 'active' | 'fulfilled' | 'expired'
  | 'suspended' | 'breached' | 'terminated';
interface RoomMember {
  actorId: Id;
  role: 'chair' | 'delegate' | 'observer';
  joinedAtSequence: number;
  disclosedMessageIds: Id[];
}
interface Room {
  id: Id;
  campaignId: Id;
  kind: 'bilateral' | 'conference' | 'organization' | 'public' | 'side_channel';
  title: string;
  members: RoomMember[];
  agenda: string[];
  parentRoomId: Id | null;
}
interface Message {
  id: Id;
  roomId: Id;
  sequence: number;
  speakerActorId: Id;
  text: string;
  date: GameDate;
  visibility: Visibility;
  status: 'draft' | 'generating' | 'committed' | 'failed';
  citedEventIds: Id[];
  proposalIds: Id[];
}
interface TreatyClause {
  id: Id;
  kind: 'ceasefire' | 'trade' | 'sanctions' | 'aid' | 'access'
      | 'guarantee' | 'recognition' | 'territory' | 'statement';
  obligorIds: Id[];
  beneficiaryIds: Id[];
  terms: string;
  dueDate: GameDate | null;
  visibility: Visibility;
  conditionFactIds: Id[];
  verificationRuleId: Id;
}
interface Treaty {
  id: Id;
  version: number;
  contentHash: Digest;
  partyIds: Id[];
  clauses: TreatyClause[];
  status: TreatyStatus;
  requiresRatification: boolean;
  signatures: { actorId: Id; contentHash: Digest; signedOn: GameDate }[];
}
```

`verificationRuleId` ссылается на allowlist декларативных проверок, не JavaScript из LLM. Организация дополнительно хранит quorum, voting rule, eligibility, срок членства и область мандата. Большинство/единогласие/вето моделируются правилами конкретного пакета; универсальная кнопка «все согласны» отсутствует.

## 5. AI adapter

```ts
type AiRole = 'intent' | 'delegate' | 'chair' | 'world' | 'arbiter'
  | 'advisor' | 'historian' | 'memory';
interface ModelProfile {
  id: Id;
  roles: Record<AiRole, { modelId: string; thinking: 'low' | 'medium' | 'high' | null }>;
  maxParallelCalls: number;
  maxCallsPerSubstep: number;
  dailyTokenLimit: number;
  dailyMoneyLimitMicros: number | null;
}
interface AiRequest {
  attemptId: Id;
  credentialRef: Id;
  role: AiRole;
  modelId: string;
  systemInstruction: string;
  input: string;
  responseSchema: Record<string, unknown> | null;
  thinking: 'low' | 'medium' | 'high' | null;
  maxOutputTokens: number;
}
type AiResult =
  | { status: 'completed'; text: string; parsed: unknown;
      inputTokens: number | null; outputTokens: number | null; providerCallId: string | null }
  | { status: 'failed' | 'ambiguous' | 'cancelled';
      code: string; retryable: boolean; usageKnown: boolean };
interface AiGateway {
  generate(request: AiRequest, signal: AbortSignal): Promise<AiResult>;
}
```

Runtime ID модели не ограничен enum двух presets. `thinking=null` означает не посылать неподдерживаемое поле, а не автоматическую подмену. Статус complete проверяется до JSON parse. Отсутствующий usage — `null`, не 0. Частичный stream хранится отдельно и не выдаётся за completed. Adapter объединяет потоковые text deltas, но не отправляет thought content клиенту.

Нормализованные события браузера: `job.started`, `job.stage`, `message.delta`, `message.committed`, `world.committed`, `job.paused`, `job.failed`, `job.cancelled`, `job.completed`. У каждого envelope: `campaignId`, `jobId`, `sequence`, `revision`, `type`, валидируемый `data`; доставку фильтрует сервер по владельцу и знанию игрока. SSE sequence — монотонный номер в кампании; реконнект использует Last-Event-ID или query cursor с проверкой доступа.

## 6. Транзакционные правила

Таблицы: `users`, `sessions`, `credentials`, `scenario_versions`, `source_records`, `actor_aliases`, `campaigns`, `campaign_members`, `world_snapshots`, `world_events`, `facts`, `relations`, `territory_control`, `rooms`, `room_members`, `messages`, `treaties`, `treaty_versions`, `treaty_signatures`, `actions`, `action_reservations`, `actor_memories`, `jobs`, `job_steps`, `ai_attempts`, `usage_reservations`, `outbox`, `save_manifests`, `content_reviews`.

- Unique `(owner_id,idempotency_key)` у command: хранить hash команды. Повтор с тем же key и другим payload → 409.
- Unique `(campaign_id,revision,event_index)` и `event_id`; unique effect identity исключает повторное применение.
- Unique `(job_id,stage,actor_scope,input_hash)` у завершённой стадии; новая генерация получает новый attempt ID.
- `UPDATE campaigns SET revision=revision+1 ... WHERE revision=expectedRevision`; ноль обновлённых строк → rollback/conflict.
- Worker lease имеет fencing token и срок; просроченный worker не может commit после перевыдачи lease.
- Journal, projections, job checkpoint и outbox пишутся одним commit; outbox допускает повторную доставку.
- Никаких открытых SQL-транзакций/долгих блокировок на время ожидания Gemini.
- `cancel_job` проверяет владельца и job identity, но устаревшая world revision не запрещает остановить собственную генерацию. Отмена не создаёт world effects; существующий commit остаётся окончательным.
- Индексы по owner, campaign, date, actor, room, visibility, dueDate; cursor pagination для хроники/сообщений.
- Перед UI-фильтрацией сервер строит player projection; скачивание скрытого полного snapshot обычным GET запрещено.

## 7. API приложения

Все пути ниже с префиксом `/api/v1`; модификации требуют session, CSRF/Origin и owner access. Массивы больших данных пагинированы.

| Метод и путь | Контракт |
|---|---|
| `GET /session` | Текущий пользователь, режим deployment, никаких секретов |
| `GET /preferences`, `PATCH /preferences` | Owner-scoped UI locale, scale, window layouts; без credential values |
| `POST /credentials` | Ввод ключа и storage choice; возвращает reference/mask |
| `DELETE /credentials/:id` | Отзыв ключа и блокирование pending calls |
| `GET /models?credentialRef=` | Каталог и cached capability status |
| `POST /models/probe` | Явно разрешённый короткий тест с лимитом tokens |
| `GET /scenarios` | Версии, эпохи, coverage, лицензии |
| `POST /scenario-drafts` | Создать собственный пакет/копию |
| `POST /scenario-drafts/:id/validate` | Schema/geography/content report |
| `POST /scenario-drafts/:id/publish` | Закрепить валидную версию |
| `POST /campaigns` | Создать из digest и config |
| `GET /campaigns` | Библиотека своих кампаний, cursor, статус сохранения |
| `PATCH /campaigns/:id/config` | Profile, active scope, auto-time policy; сохраняет новую settings revision, активный job остаётся на закреплённом config |
| `POST /campaigns/:id/heartbeat` | Сигнал активного клиента для явно включённого автохода; не запускает AI сам по себе |
| `GET /campaigns/:id/state` | Player projection на revision/date |
| `GET /campaigns/:id/actors/:actorId` | Разрешённое досье, directed relations, известные обязательства |
| `GET /campaigns/:id/advisor/messages` | История собственных вопросов/ответов советников |
| `GET /campaigns/:id/reports` | Разрешённые standing reports кабинета |
| `GET /campaigns/:id/actions` | Очередь собственных поручений, статусы и уточнения |
| `GET /campaigns/:id/objectives` | Цели кампании и evidence-backed progress |
| `POST /campaigns/:id/commands` | CommandEnvelope → accepted job/conflict |
| `GET /campaigns/:id/events` | Хроника с date/actor/territory/cursor |
| `GET /campaigns/:id/stream` | SSE событий по разрешённой видимости |
| `POST /campaigns/:id/rooms` | Участники, kind, agenda, visibility |
| `GET /rooms/:id/messages` | Только доступная история |
| `POST /rooms/:id/members` | Invite/remove/disclose; отдельная schema операции |
| `POST /campaigns/:id/treaties` | Версионированный проект |
| `POST /treaties/:id/versions` | Новый текст/статьи, инвалидирует прежние согласия |
| `GET /jobs/:id` | Состояние, этапы, ошибка, доступные действия |
| `POST /jobs/:id/retry` | Новый bounded attempt после проверки revision/budget |
| `POST /campaigns/:id/saves` | Именованный checkpoint |
| `POST /campaigns/:id/exports` | Игровое сохранение либо публичная хроника |
| `POST /imports` | Проверка и создание новой кампании |
| `DELETE /campaigns/:id` | Подтверждённое удаление с описанной политикой backups |
| `GET /usage` | Scoped estimates/actual/unknown/reservations |

Ошибки: 400 schema, 401 session, 403 forbidden, 404 absent/not-visible, 409 revision/idempotency conflict, 413 size, 422 semantic/capability, 429 local limit, 503 unavailable. Долгие операции отвечают 202 и job ID. Ошибки провайдера не возвращают ключи или raw prompt.
