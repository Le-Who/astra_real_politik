# Astra Realpolitik

Некоммерческий проект браузерной игры альтернативной истории с AI-дипломатией, динамической мировой картой и оконным интерфейсом в стиле Windows XP.

## Текущее состояние

Реализация начата по плану T01–T36. Созданы TypeScript workspace, Fastify API с `/health`, React/Vite оболочка запуска RU/EN и точечные проверки. Это технический фундамент, **не готовая игра**: миры, AI, сохранения и игровые окна ещё предстоит реализовать.

## Запуск разработки

Нужен pnpm 10.28.2. `pnpm install` загрузит закреплённый Node 24.20.0 для проекта, не заменяя системный Node.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Открыть `http://127.0.0.1:5173`. API слушает `127.0.0.1:3001`; health не требует БД/AI-ключа. Сейчас переменные API_HOST/API_PORT задаются в окружении процесса; файл `.env.example` — образец, автоматической загрузки `.env` пока нет. Начальная оболочка и Vite proxy используют стандартный порт API 3001.

```sh
pnpm exec vitest run tests/tasks/T01.test.ts
pnpm exec playwright install chromium
pnpm exec playwright test tests/e2e/T01-startup.spec.ts
pnpm build
pnpm typecheck
pnpm lint
```

В процессе разработки запускать только затронутые тесты. Полные прогоны ограничены тремя; журнал находится в [статусе реализации](docs/quality/evidence/development-status.md). Скрипты `content:validate`, `eval:offline`, `eval:live`, `verify:release` зарезервированы под инструменты T05/T32/T36 и пока не реализованы. Не запускать live evaluations без отдельного лимита расходов.

## Проверки PostgreSQL

Хранилище T03 использует настоящий PostgreSQL: транзакционный журнал, snapshots с hash, проекции, fencing и outbox. Пока это внутренний модуль сервера; HTTP-доступ к игровым данным ещё не подключён.

Для Docker: `docker compose -f infra/compose.test.yml up -d --wait`. PostgreSQL доступен только на loopback-порту 55432. Пароль в этом файле предназначен исключительно для пустой локальной тестовой БД, не production.

В PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgresql://astra_test:astra-local-test-only@127.0.0.1:55432/astra_test'
pnpm --filter @astra/contracts build
pnpm --filter @astra/engine build
pnpm exec vitest run tests/tasks/T03.test.ts
```

Тест создаёт и удаляет только собственный случайный schema namespace. Без выделенной БД с именем `astra_test*` он завершается ошибкой, а не пропускается. Для проверки на этой Windows-машине использованы portable-бинарники PostgreSQL 18.6, не Docker; подробности и команды — в [T03 evidence](docs/quality/evidence/T03.md).

Начать с [оглавления документации](docs/README.md). Основной маршрут разработки описан в [плане реализации](docs/superpowers/plans/2026-09-05-astra-realpolitik.md).

Географические источники и их лицензии описаны отдельно в документации; исходные геоданные в текущую версию репозитория не включены.
