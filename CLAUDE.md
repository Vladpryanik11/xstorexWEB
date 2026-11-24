# Xstore (xstorex.ru)

Магазин IPA-приложений для iPhone и iPad с установкой из Safari: публичный каталог из двух разделов («Удалённые», «Премиум») с подкатегориями, подписка на весь каталог сразу после оплаты (экран-мастер «Оплата → iPhone → Установка»), подключение iPhone через профиль, регистрация устройств в пуле аккаунтов Apple Developer, серверная подпись (zsign), OTA-установка, тарифы и оплата через Platega, админка. Визуальный язык — «белый, голубой, синий» с обтекаемыми формами (`docs/superpowers/specs/2026-11-17-premium-ui-design.md`); от diyorde.com взята структура страниц.

Главный документ: `docs/superpowers/specs/2026-11-18-xstore-v2-design.md` (спецификация v2), порядок работ — `docs/superpowers/plans/2026-11-18-v2-roadmap.md`. Старая спецификация `2026-11-02-xstore-design.md` — справочник по техническим решениям. Перед любой работой сверяйся со спецификацией v2. Если задача ей противоречит, сначала обнови спецификацию вместе с владельцем.

## Общение

- С владельцем общаемся на русском.
- Интерфейс сайта только на русском, без i18n и переключателя языка.

## Процесс (обязателен)

1. Новая функция или изменение поведения → `superpowers:brainstorming` → спецификация в `docs/superpowers/specs/`.
2. Одобренная спецификация → `superpowers:writing-plans` → план в `docs/superpowers/plans/`. Одна веха (M0–M7) — один план.
3. Выполнение плана → `superpowers:subagent-driven-development` или `superpowers:executing-plans`.
4. Любой код → `superpowers:test-driven-development`: сначала падающий тест.
5. Баг → `superpowers:systematic-debugging` до любых правок.
6. Перед словами «готово» → `superpowers:verification-before-completion`: команды запущены, вывод показан.
7. Конец вехи → `superpowers:requesting-code-review`.

Код без одобренной спецификации и плана не пишем.

## Скиллы и плагины проекта

| Когда | Что использовать |
|---|---|
| Любая вёрстка, страницы, компоненты, админка | проектный скилл `xstore-design` (токены и шапка), спецификация `2026-11-17-premium-ui-design.md`, плагин `frontend-design` |
| Next.js, React | `frontend-mobile-development` (nextjs-app-router-patterns) |
| TypeScript, Node, тесты JS | `javascript-typescript`, `typescript-lsp` |
| NestJS API, архитектура бэкенда | `backend-development`, `api-scaffolding` (user scope) |
| Схема БД, Prisma, миграции | `database-design` (user scope) |
| Безопасность: секреты, вебхуки, авторизация | `backend-api-security`, `security-guidance` (хук предупреждает при правках) |
| CI/CD, Docker, деплой | `cicd-automation` |
| Ревью | `comprehensive-review`, `superpowers:requesting-code-review` |
| Обновление этого файла | `claude-md-management` |

## Жёсткие правила

- Только IPA с правами на распространение; ответственность за права — на владельце. Поле «основание для распространения» не обязательно и в админке не показывается (решение владельца 2026-11-24, `docs/superpowers/specs/2026-11-24-simple-ipa-upload-design.md`). Взломанные приложения и «Premium»-моды не добавляем.
- Оплата только через Platega. Telegram Stars не используем.
- Файлы DIYORDE (логотип, оформление, тексты) в продукт не попадают. Копируем только стили и структуру. Иконки и скриншоты самих приложений (это материалы из App Store) брать можно, решение владельца от 2026-11-18.
- Шапка сайта — белая плавающая пилюля по разделу 5 спецификации `2026-11-17-premium-ui-design.md`.
- Готовые компоненты (21st.dev, Aceternity, Magic UI, Motion Primitives, React Bits, Uiverse) берём только после согласования с владельцем, с прямой ссылкой; переносим на CSS Modules и токены Xstore, Tailwind не добавляем.
- Секреты (ключи ASC `.p8`, `.p12`, пароли, ключи Platega, мастер-ключ) не попадают в код, git, логи и ответы API. В базе они хранятся только зашифрованными.
- Закрытые ключи Apple расшифровывают только модуль `apple` и воркер.

## Структура и команды

Монорепо pnpm + Turborepo: `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` (BullMQ + zsign), `packages/shared`, `packages/db`, `packages/ui`, `packages/ios` (разбор IPA), `packages/billing` (провайдеры fake и Platega), `packages/mail` (письма SMTP), `infra/`. `ios`, `billing`, `mail` — только для Node (API и воркер), не для `apps/web`. Требуется Node 24, pnpm 12.16.1, Docker Desktop. Подробнее для разработчика: `README.md`.

Порты: web 3000, api 3001, Postgres 5432, Redis 6379, MinIO 9000 (S3) и 9001 (консоль), Mailpit 1025 (SMTP) и 8025 (письма). Тестовые e2e-серверы: web 3100, api 3101.

Команды из корня:

- `cp .env.example .env`, `pnpm install` — первая настройка.
- `pnpm infra:up` / `pnpm infra:down` — Postgres, Redis, MinIO, Mailpit для разработки (`infra/docker-compose.dev.yml`, только 127.0.0.1).
- `pnpm db:migrate` — миграции Prisma.
- `pnpm dev` — web, api и worker; `pnpm build` — сборка.
- `pnpm lint` (Biome), `pnpm format`, `pnpm typecheck`.
- `pnpm test` — модульные; `pnpm test:int` — интеграционные (нужны `pnpm infra:up`); `pnpm test:e2e` — Playwright.
- Полный набор перед «готово»: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`.
- Каталог в админке (с 2026-11-24): один экран `/admin/apps` — перетащить IPA, выбрать раздел и подкатегорию, приложение публикуется само; карточек нет.
- M1: админка `/admin` (пароль + TOTP); создать сотрудника: `pnpm --filter @xstore/api admin:create -- --email <почта>` после сборки API. Поддержка читает только задания, редакторы доступны администратору.
- Перед E2E: `pnpm infra:up`, `pnpm --filter @xstore/api enroll:dev-cert && pnpm --filter @xstore/api enroll:test-ca` (подпись профиля и тестовый корень в `.secrets/enroll/`, только не для production), `pnpm --filter @xstore/web exec playwright install --with-deps webkit chromium`. Playwright запускает API, web и воркер; использует `DATABASE_URL_TEST`, `REDIS_URL_TEST`, `S3_BUCKET_PREFIX_TEST`. Не запускать `test:int` и `test:e2e` одновременно — оба очищают тестовую базу.
- Оплата в разработке: `PAYMENT_PROVIDER=fake` и `XSTORE_DEV_PAGES=1` (в API и web) — страница `/dev/pay/<id>` вместо Platega; с `fake` при `NODE_ENV=production` API не стартует. E2E включают это сами.
- Н2 подключение iPhone: `ENROLL_CERT_PATH`/`ENROLL_KEY_PATH` подписывают профиль (локально — из `enroll:dev-cert`; в production compose — сертификат Caddy, копирует сервис `enroll-cert`, папка выпускающего центра `CADDY_CERT_ISSUER`); `ENROLL_TEST_ANCHOR_PATH` — тестовый корень, в production запрещён. Настоящий ответ iOS: `IOS_REAL_FIXTURE=<путь> pnpm --filter @xstore/api exec vitest run device-response.real`, без переменной тест пропускается.
- Н3 сертификаты поставщика: `MASTER_KEY_CURRENT` + `MASTER_KEY_V<n>` (base64 32 байт, обязательны в production) шифруют `.p12` и пароли; `ADMIN_NOTIFY_EMAIL` — письмо владельцу о новом iPhone; `SIGNING_TEST_ANCHOR_PATH` — тестовый корень профилей, в production запрещён (E2E создают комплект сами). Админка `/admin/devices`, воркер `certificates:check` каждые 10 минут. Подробнее — `README.md`, раздел «Сертификаты поставщика».
- Н4 подпись и установка: воркер подписывает zsign (`ZSIGN_BIN`, лимиты `SIGNING_*`), копии в бакете `signed` убирает `maintenance:evictSigned` (настройки `signing.cacheTtlDays`, `signing.cacheMaxGb`); админка `/admin/signing`. Настоящий zsign — стадия `zsign-test` образа воркера. Подробнее — `README.md`, раздел «Подпись и установка».
- M1 окружение: `API_INTERNAL_URL` для SSR и прокси `/api`; `S3_ENDPOINT` для сервера, `S3_PUBLIC_URL` для браузера, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_PREFIX`. CORS MinIO разрешает origin сайта; все секреты — в `.env`. Подробности в `README.md` и `.env.example`.

Production: `docker compose -f infra/docker-compose.yml --env-file .env up -d --build` (порты 80/443 публикует только Caddy), проверка `bash infra/smoke.sh`. Образы собираются из корня: `docker build -f apps/api/Dockerfile .`.

CI (`.github/workflows/ci.yml`): `check`, `integration`, `e2e`, `docker` на pull request и push в `main`.

Windows: CLI Docker Desktop может не быть в PATH (`C:\Program Files\Docker\Docker\resources\bin`); работающий dev-сервер API блокирует движок Prisma, остановите его перед `pnpm build` и `pnpm typecheck`; `infra/smoke.sh` запускается в Git Bash.
