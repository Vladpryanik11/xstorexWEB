# Xstore

Магазин IPA-приложений для iPhone с установкой из Safari: вход по UDID, регистрация устройств в пуле аккаунтов Apple Developer, серверная подпись (zsign), OTA-установка, тарифы и оплата через Platega, админка. Подробности: `docs/superpowers/specs/2026-11-02-xstore-design.md`.

Монорепо pnpm + Turborepo: `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` (BullMQ + zsign), `packages/shared`, `packages/db`, `packages/ui`, `infra/`.

## Требования

- Node 24
- pnpm 12.16.1 (версия задана в `packageManager`, подойдёт `corepack enable`)
- Docker Desktop (Postgres, Redis и MinIO для разработки)

## Первый запуск

```bash
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres, Redis, MinIO на 127.0.0.1
pnpm db:migrate    # миграции Prisma в базу xstore
pnpm dev           # web, api и worker
```

Порты: web 3000, api 3001, Postgres 5432, Redis 6379, MinIO 9000 (S3) и 9001 (консоль). Остановить хранилища: `pnpm infra:down`.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm build` | сборка всех пакетов |
| `pnpm dev` | запуск web, api и worker в режиме разработки |
| `pnpm lint` | Biome: проверка форматирования и линтер |
| `pnpm format` | Biome: автоформатирование |
| `pnpm typecheck` | проверка типов TypeScript |
| `pnpm test` | модульные тесты (Vitest) |
| `pnpm test:int` | интеграционные тесты, нужны Postgres и Redis (`pnpm infra:up`) |
| `pnpm test:e2e` | Playwright (`mobile-webkit` и `desktop-chromium`), сам собирает и запускает web на порту 3100 |
| `pnpm infra:up` / `pnpm infra:down` | хранилища для разработки |
| `pnpm db:migrate` | миграции базы разработки |

Перед коммитом: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Тот же набор гоняет CI (`.github/workflows/ci.yml`: `check`, `integration`, `e2e`, `docker`) на pull request и на push в `main`.

Первый запуск Playwright: `pnpm --filter @xstore/web exec playwright install webkit chromium`. Сборка web берёт шрифты из Google Fonts, нужен интернет.

## Production-стек

`infra/docker-compose.yml` поднимает web, api, worker, Postgres, Redis, MinIO и Caddy; наружу публикует порты 80 и 443 только Caddy. Конфигурация берётся из `.env` (домены `SITE_DOMAIN` и `DL_DOMAIN`, пароли `POSTGRES_PASSWORD` и `MINIO_ROOT_PASSWORD`; на сервере задайте настоящие значения).

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
bash infra/smoke.sh    # проверка: health API, главная страница, zsign в worker
```

Образы собираются из корня репозитория, например `docker build -f apps/api/Dockerfile .`.

## Windows

- CLI Docker Desktop может отсутствовать в PATH уже открытых оболочек. Добавьте `C:\Program Files\Docker\Docker\resources\bin` (в Git Bash: `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`) или откройте новую оболочку.
- Работающий dev-сервер API держит файл движка Prisma. Остановите его перед `pnpm build` и `pnpm typecheck`.
- `infra/smoke.sh` запускайте в Git Bash.
