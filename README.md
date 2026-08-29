# NestJS Starter Kit

Рабочий каркас продакшн-бэкенда: **NestJS + GraphQL (Apollo) + MongoDB (Mongoose) + Redis (BullMQ) + ClickHouse**.

Это не «hello world» и не туториал. Это скелет, устройство которого повторяет
боевые проекты: те же конфиги, та же раскладка модулей, та же дисциплина
тестов. Задача — чтобы ты клонировал, запустил, и дальше писал **свои** модули
по образцу, не изобретая каркас заново.

Комментарии в коде — часть обучения. Они объясняют не «что делает строка»,
а **почему решено так**, и что ломается при другом решении. Читай их.

---

## Быстрый старт

```bash
# 1. Зависимости (только pnpm — npm/yarn заблокированы через only-allow)
pnpm install

# 2. Переменные окружения
cp .env-cmdrc.json.example .env-cmdrc.json

# 3. Базы: mongo + redis + clickhouse
pnpm db:up

# 4. Миграции ClickHouse (Mongo миграций не требует — схема в коде)
pnpm ch:migrate

# 5. Демо-данные
pnpm seed

# 6. Запуск в watch-режиме
pnpm local
```

Поднимется:

| адрес | что это |
|---|---|
| http://localhost:9800/health |healthcheck (его дёргает хостинг) |
| http://localhost:9800/gql | GraphQL playground |
| http://localhost:9800/swg | Swagger по REST-части |
| http://localhost:9800/que | BullBoard — очереди, job'ы, ретраи (логин `admin`, пароль = `PLATFORM_KEY`) |

Проверь, что живое:

```bash
curl -s -X POST http://localhost:9800/gql \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-admin-key' \
  -d '{"query":"mutation { userCreate(payload:{email:\"a@b.c\", name:\"Alice\"}) { _id email } }"}'
```

---

## Команды

| команда | что делает |
|---|---|
| `pnpm local` | dev-сервер с watch и debug |
| `pnpm check` | Biome: линт + формат с автофиксом. **Запускается сам перед build** |
| `pnpm build` | сборка через webpack (см. ниже, почему не голый tsc) |
| `pnpm test:unit` | unit-тесты — без БД, быстрые |
| `pnpm test:e2e` | e2e — поднимает реальный Nest и реальные базы |
| `pnpm prisma:test:deploy` | миграции в тестовую базу (нужна один раз, см. ниже) |
| `pnpm test:all` | и то и другое |
| `pnpm db:up` / `pnpm db:down` | контейнеры с базами |
| `pnpm ch:migrate` | миграции ClickHouse |
| `pnpm ch:railway-cmd` | собирает startCommand для ClickHouse на Railway из `clickhouse/*.xml` |
| `pnpm seed` | демо-данные |
| `pnpm explain` | показывает, идут ли горячие запросы по индексу (IXSCAN) или перебирают коллекцию (COLLSCAN) |
| `pnpm prisma:local:gen` | новая миграция Postgres (нужен `DATABASE_URL`) |
| `pnpm prisma:sync` | пересобрать `schema.prisma` из `src/modules/**/*.prisma` |

---

## Что где лежит

```
src/
├── main.ts                  точка входа: pipes, filters, helmet, swagger, shutdown hooks
├── config.ts                ВСЁ чтение process.env — здесь и больше нигде
├── preload.ts               reflect-metadata + TZ, до первого декоратора
│
├── app/                     инфраструктурный слой, без бизнес-логики
│   ├── index.ts             AppModule — композиционный корень
│   ├── app.enum.ts          ВСЕ очереди и имена job'ов проекта
│   ├── app.controller.ts    /health — проверяет ЗАВИСИМОСТИ, не себя
│   ├── exception/           один глобальный фильтр на http и graphql
│   └── graphql/             generic-пагинация, фильтры, базовый сервис
│
├── guard/                   ApiKeyGuard, ServiceTokenGuard, @Public()
│
├── libs/                    техслой, переносимый между проектами как есть
│   ├── mongoose/            база для доменных Mongo-сервисов
│   ├── prisma/              Postgres: клиент, пул, расширения (soft delete)
│   └── clickhouse/          клиент + свой раннер миграций + .sql
│
├── utils/                   ЧИСТЫЕ функции. Их дешевле всего покрыть тестами
│
├── modules/                 бизнес. Четыре штуки, четыре разных архетипа:
│   ├── user/                CRUD через GraphQL — самый частый вид модуля
│   ├── order/               очередь: cron → queue → processor, ретраи, идемпотентность
│   ├── analytics/           ClickHouse: append-only события и агрегаты
│   └── invoice/             Postgres/Prisma: транзакции, переходы статусов, soft delete
│
└── instrument.ts            Sentry — ДО всего остального, иначе трейсинг пуст
```

Рядом с `src/`:

```
clickhouse/                  конфиги ClickHouse — ИСТОЧНИК ПРАВДЫ
├── config.d/
│   ├── zz-system-log-ttl.xml    политика логов (одинакова везде)
│   └── zz-memory.xml            размер (функция RAM инстанса)
└── users.d/
    └── zz-disable-profiler.xml  размер (функция RAM инстанса)
```

На Railway конфиг некуда примонтировать, поэтому его пишет стартовая команда,
а XML нельзя передать строкой — парсер съедает бэкслеши и сервис ложится.
Отсюда base64, отсюда же и правило: **base64 руками не редактируем**, меняем
XML и перегенерируем `pnpm ch:railway-cmd`. Локально монтируется только файл
политики: числа памяти посчитаны под конкретный инстанс, а сколько памяти
у твоего Docker — знает только он. Подробности — в
`../docs/CLOUDFLARE-RAILWAY.md`, раздел 10.

### Анатомия модуля — держись её

```
modules/<name>/
├── index.ts            @Module + реэкспорты. Точка входа модуля
├── <name>.entity.ts    Mongoose-схема И GraphQL-тип в одном классе
├── <name>.enum.ts      enum'ы + registerEnumType
├── <name>.input.ts     что клиенту РАЗРЕШЕНО прислать (+ валидация)
├── <name>.output.ts    что отдаём наружу
├── <name>.service.ts   бизнес-правила. Тестируется без GraphQL и без HTTP
├── <name>.resolver.ts  тонкий слой: аргументы → вызов сервиса. Никаких if
├── <name>.queue.ts     кто КЛАДЁТ в очередь (+ @Cron)
├── <name>.helpers.ts   чистые функции решений — самое тестируемое место
├── processors/         кто БЕРЁТ из очереди
├── *.spec.ts           unit-тесты рядом с кодом
└── e2e/*.e2e-spec.ts   e2e рядом с модулем
```

Заведи новый модуль — скопируй `user/`, переименуй, добавь в `modules/modules.ts`.
Если не добавил — резолвера просто не будет в схеме. Это правильное поведение:
недоделанный модуль не уезжает в прод сам по себе.

---

## Почему собираем webpack'ом, а не `tsc`

В `tsconfig.json` есть алиасы (`@src/*`, `@modules/*`). Голый `tsc` их **не
переписывает** — они остаются в `dist/` как есть, и приложение падает в рантайме
на `Cannot find module '@src/config'`. Webpack резолвит их на этапе сборки
(`tsconfig-paths-webpack-plugin`).

В `webpack.config.js` обязателен `keep_classnames` / `keep_fnames` у Terser: Nest
DI, code-first GraphQL и class-validator читают имена классов через рефлексию.
Минификация имён ломает контейнер **только в проде** — тот самый баг, который
локально не воспроизводится.

---

## Дальше

- `docs/ARCHITECTURE.md` — почему такой стек и когда брать другой
- `docs/EXERCISES.md` — упражнения по возрастанию сложности
- `CLAUDE.md` — правила работы, в том числе с ИИ-ассистентом
- `.claude-tasks/` — задачи ЭТОГО проекта. Шаблон общий и лежит
  в родительской папке (`../.claude-tasks/TEMPLATE.md`): своей копии тут нет
  намеренно, два шаблона одного и того же разойдутся


---

## Второй слой хранения: Postgres + Prisma

Включается ОДНОЙ переменной. Пусто → приложение работает на Mongo и в базу,
которой нет, не стучится; модуль `invoice` в схеме GraphQL просто не появляется.

```bash
DATABASE_URL=postgresql://starter:starter@localhost:54811/starter?schema=public
pnpm db:up                 # поднимет и postgres тоже
pnpm prisma:local:gen      # применит миграции
```

Что там показано: пул соединений в строке подключения (у Postgres жёсткий
потолок, и три реплики с дефолтами съедают его целиком), схема, собранная
из кусочков в модулях, миграции по окружениям с промоушеном local → dev → prod,
и soft-delete расширением, которое **запрещает** `delete()` вместо того чтобы
молча подменить его на `update()`.

## Безопасность

`ServiceTokenGuard` глобальный: задан `SERVICE_TOKEN` — бэкенд отвечает только
своим сервисам, всё остальное 401. `@Public()` открывает `/health` — список
публичного должен быть коротким и явным, потому что «забыл повесить guard»
не должно означать «открыто всему интернету».

Sentry обязателен: `instrument.ts` инициализируется до Nest, фильтр исключений
отправляет 5xx, а каждый проглатывающий `catch` идёт через
`reportError(logger, error, { operation, extra })` — логирует И репортит.
Немых `catch` в проекте нет ни одного.


---

## Тестовая база для e2e

E2E поднимают настоящий контейнер и ходят в настоящие базы, поэтому тестовому
Postgres нужны и база, и миграции:

```bash
docker compose exec -T postgres psql -U starter -d starter -c "CREATE DATABASE starter_test OWNER starter;"
pnpm prisma:test:deploy
```

Обрати внимание: `prisma:test:*` применяет набор миграций **`local`**, а не
какой-то отдельный «test». Так и задумано — тестовая база проверяет ровно тот
набор, который ты сейчас разрабатываешь и собираешься промоутить дальше.
Отдельный тестовый набор означал бы, что e2e проверяют не то, что поедет в dev.

## Почему в TEST задан SERVICE_TOKEN

Пустой токен **выключает** `ServiceTokenGuard`. Если оставить его пустым в
тестовом профиле, весь e2e будет зеленеть, ни разу не пройдя через проверку,
которая стоит в проде, — ложный зелёный ровно того вида, который дороже всего.
Поэтому в `TEST` токен задан, хелпер его шлёт, и есть отдельный тест на то,
что запрос БЕЗ него отвергается.
