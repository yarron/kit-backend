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
| http://localhost:9000/health |healthcheck (его дёргает хостинг) |
| http://localhost:9000/gql | GraphQL playground |
| http://localhost:9000/swg | Swagger по REST-части |
| http://localhost:9000/que | BullBoard — очереди, job'ы, ретраи (логин `admin`, пароль = `PLATFORM_KEY`) |

Проверь, что живое:

```bash
curl -s -X POST http://localhost:9000/gql \
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
| `pnpm test:all` | и то и другое |
| `pnpm db:up` / `pnpm db:down` | контейнеры с базами |
| `pnpm ch:migrate` | миграции ClickHouse |
| `pnpm seed` | демо-данные |

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
├── guard/                   ApiKeyGuard (в бою — JWT, форма та же)
│
├── libs/                    техслой, переносимый между проектами как есть
│   ├── mongoose/            база для доменных Mongo-сервисов
│   └── clickhouse/          клиент + свой раннер миграций + .sql
│
├── utils/                   ЧИСТЫЕ функции. Их дешевле всего покрыть тестами
│
└── modules/                 бизнес. Три штуки, три разных архетипа:
    ├── user/                CRUD через GraphQL — самый частый вид модуля
    ├── order/               очередь: cron → queue → processor, ретраи, идемпотентность
    └── analytics/           ClickHouse: append-only события и агрегаты
```

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
- `.claude-tasks/TEMPLATE.md` — шаблон задачи
