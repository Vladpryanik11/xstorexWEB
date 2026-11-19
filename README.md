# Xstore

Магазин IPA-приложений для iPhone с установкой из Safari: публичный каталог, подписки, подключение iPhone по UDID, регистрация устройств в пуле аккаунтов Apple Developer, серверная подпись (zsign), OTA-установка, тарифы и оплата через Platega, админка. Подробности: `docs/superpowers/specs/2026-11-02-xstore-design.md`.

## План покупки и входа

Обновлённые сценарии: [покупка подписки и подключение iPhone](docs/superpowers/specs/2026-11-06-purchase-and-activation-design.md). Первая покупка проходит без обязательного входа и UDID; подписка активируется сразу после подтверждения оплаты. Подключение устройства выполняется позже и не меняет оплаченный период. Вход и восстановление — по коду на почту.

Три сценария и их проверки: [M5, задачи 7–9](docs/superpowers/plans/2026-11-05-m5-billing.md). Основа аккаунта и подключения: [M2](docs/superpowers/plans/2026-11-05-m2-auth-cabinet.md). Это план будущей реализации; текущий публичный каталог ещё не выполняет пользовательский checkout.

Монорепо pnpm + Turborepo: `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` (BullMQ + zsign), `packages/shared`, `packages/db`, `packages/ui`, `packages/ios` (разбор IPA), `packages/billing` (платёжные провайдеры fake и Platega), `packages/mail` (письма по SMTP), `infra/`. Пакеты `ios`, `billing` и `mail` — только для Node (API и воркер), в `apps/web` их не импортируем.

## Требования

- Node 24
- pnpm 12.16.1 (версия задана в `packageManager`, подойдёт `corepack enable`)
- Docker Desktop (Postgres, Redis и MinIO для разработки)

## Первый запуск

```bash
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres, Redis, MinIO, Mailpit на 127.0.0.1
pnpm db:migrate    # миграции Prisma в базу xstore
pnpm dev           # web, api и worker
```

Порты: web 3000, api 3001, Postgres 5432, Redis 6379, MinIO 9000 (S3) и 9001 (консоль), Mailpit 1025 (SMTP) и 8025 (письма в браузере). Остановить хранилища: `pnpm infra:down`.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm build` | сборка всех пакетов |
| `pnpm dev` | запуск web, api и worker в режиме разработки |
| `pnpm lint` | Biome: проверка форматирования и линтер |
| `pnpm format` | Biome: автоформатирование |
| `pnpm typecheck` | проверка типов TypeScript |
| `pnpm test` | модульные тесты (Vitest) |
| `pnpm test:int` | интеграционные тесты, нужны Postgres, Redis, MinIO и Mailpit (`pnpm infra:up`) |
| `pnpm test:e2e` | Playwright (`mobile-webkit` и `desktop-chromium`), собирает и запускает API, web (3100) и воркер |
| `pnpm infra:up` / `pnpm infra:down` | хранилища для разработки |
| `pnpm db:migrate` | миграции базы разработки |
| `pnpm db:seed:demo` | демо-каталог: 23 приложения с иконками, скриншотами и текстами (нужна сборка `@xstore/db`) |

Перед коммитом: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. CI (`.github/workflows/ci.yml`) на pull request и на push в `main` проверяет почти то же. Job `check` вместо `pnpm lint` (`biome check .`) запускает `pnpm biome ci .`: те же правила Biome в режиме CI, только чтение. Затем идут `pnpm typecheck` и `pnpm test`. `integration` запускает `pnpm test:int`, `e2e` запускает `pnpm test:e2e`, `docker` собирает production-стек через Compose, запускает его с миграциями и проверяет `infra/smoke.sh`, затем удаляет тестовые контейнеры и volumes. Проверка использует `.env.example` и localhost в изолированном runner; локальный набор образы не собирает.

Первый запуск Playwright: `pnpm infra:up`, `pnpm --filter @xstore/api enroll:dev-cert && pnpm --filter @xstore/api enroll:test-ca`, затем `pnpm --filter @xstore/web exec playwright install --with-deps webkit chromium` (установка системных библиотек Linux требует прав администратора). Сборка web берёт шрифты из Google Fonts, нужен интернет.

E2E очищает и наполняет синтетическими данными только базу из `DATABASE_URL_TEST` (имя должно оканчиваться на `_test`), использует `REDIS_URL_TEST` и бакеты с `S3_BUCKET_PREFIX_TEST`. Эти значения должны быть отделены от рабочих данных. Интеграционные и E2E-тесты запускайте последовательно: оба набора очищают тестовую базу. Небольшие IPA в `apps/web/e2e/fixtures` содержат созданные для тестов plist, иконку и синтетический Mach-O, без сторонних приложений.

### Демо-каталог

`pnpm db:seed:demo` заменяет каталог локальной базы (приложения, версии, категории, подборки, установки) на 23 настоящих приложения: иконки и скриншоты из App Store, тексты написаны для Xstore. Сотрудники и настройки остаются. Скрипт работает только с базой на `localhost`. Данные и картинки лежат в `packages/db/demo/` (`catalog.json`, `media/<slug>/`). IPA в демо нет: страницы приложений открываются, установка не работает.

### Учётная запись админа

Админ входит по почте, паролю и коду из приложения-аутентификатора (TOTP). Создать админа или сбросить ему пароль и ключ TOTP:

```bash
pnpm --filter @xstore/api build
pnpm --filter @xstore/api admin:create -- --email admin@xstorex.ru
```

Команда спросит пароль (не короче 12 символов, ввод не отображается; можно передать через stdin) и один раз выведет ссылку `otpauth://` для приложения-аутентификатора. При сбросе все сессии этого пользователя закрываются. В production: `docker compose -f infra/docker-compose.yml --env-file .env exec api node apps/api/dist/cli/create-admin.js --email <почта>`.

Админка открывается по `/admin`. Администратор управляет приложениями, версиями, изображениями, категориями, подборками и повторным запуском заданий. Сотрудник поддержки видит только `/admin/jobs` без кнопки повтора.

В `/admin/apps/upload` можно выбрать несколько IPA до 10 ГБ каждый. После обрыва связи, паузы или перезагрузки страницы выберите тот же файл: уже отправленные части сохраняются в MinIO. После проверки откройте карточку, заполните основание для распространения и категорию, опубликуйте версию, затем приложение. Основание, иконка, категория и опубликованная незашифрованная версия обязательны; недостающие поля показаны в карточке.

Для загрузки из браузера `S3_PUBLIC_URL` должен быть доступен пользователю, а CORS MinIO должен разрешать origin сайта (`SITE_URL` в разработке, `https://SITE_DOMAIN` в production). `S3_ENDPOINT` — внутренний адрес хранилища для API/воркера, `S3_ACCESS_KEY` / `S3_SECRET_KEY` — его учётные данные, `S3_REGION` — регион. SSR обращается к API через `API_INTERNAL_URL`; браузер использует `/api/v1` на адресе сайта.

### Витрина `/dev/ui`

Страница `/dev/ui` показывает шапку и компоненты `@xstore/ui`. Она открывается, только когда задана переменная `XSTORE_DEV_PAGES=1`, иначе отдаёт 404. Turbo пропускает переменную в задачу `dev`.

```bash
XSTORE_DEV_PAGES=1 pnpm dev                 # Git Bash
$env:XSTORE_DEV_PAGES='1'; pnpm dev         # PowerShell
```

Адрес: http://localhost:3000/dev/ui. Параметры: `?auth=1` показывает шапку вошедшего пользователя, `&path=/devices` подсвечивает пункт меню, `&w=hero` включает прозрачный вариант шапки для главной. E2E-тесты включают переменную сами (`apps/web/playwright.config.ts`).

### Оплата в разработке

`PAYMENT_PROVIDER=fake` (по умолчанию в `.env.example`) хранит платежи в Redis и подписывает вебхуки ключом `FAKE_PAYMENT_WEBHOOK_SECRET`. При `NODE_ENV=production` API с `fake` не запускается; production compose задаёт `PAYMENT_PROVIDER=platega`. С `XSTORE_DEV_PAGES=1` API открывает `POST /api/v1/billing/dev/fake-payments/<id>/pay` и `/fail`: они меняют статус фейкового платежа и проводят его тем же путём, что и вебхук. Страница `/dev/pay/<id>` на сайте (тоже только с `XSTORE_DEV_PAGES=1`) играет платёжную страницу: кнопки «Оплатить» и «Отказать» вызывают эти маршруты с сервера Next.js и возвращают в мастер `/get/<orderId>`. Так весь путь «Оплата → Мой доступ» проходится локально без ключей Platega; e2e-тесты (`purchase-*.spec.ts`) идут тем же путём и читают письма с кодом входа из Mailpit (`MAILPIT_API_URL`).

### Подключение iPhone в разработке

Профиль подключения подписывается парой `ENROLL_CERT_PATH` / `ENROLL_KEY_PATH` (PEM). Локально: `pnpm --filter @xstore/api enroll:dev-cert` пишет самоподписанную пару в `.secrets/enroll/` (в git не попадает), пути вставьте в `.env`. Ответ iPhone проверяется по Apple Root CA; для тестовых устройств `pnpm --filter @xstore/api enroll:test-ca` создаёт там же тестовый корень `test-anchor.pem` (`ENROLL_TEST_ANCHOR_PATH`, при `NODE_ENV=production` API его не принимает) и ключ тестового устройства. E2E (`connect-iphone.spec.ts`) берёт эти файлы сам и играет iOS: скачивает профиль и отправляет подписанный ответ. Без них падают только тесты подключения. «iPhone готов» наступает, когда админ загружает файлы поставщика (раздел ниже); для ручной проверки без файлов с `XSTORE_DEV_PAGES=1` остаётся `POST /api/v1/devices/dev/mine/ready`.

Настоящий ответ iOS (содержит UDID, хранится вне git) проверяется так: `IOS_REAL_FIXTURE=<путь> pnpm --filter @xstore/api exec vitest run device-response.real`. Без переменной этот тест пропускается.

### Сертификаты поставщика (Н3)

Своего аккаунта Apple нет: владелец копирует UDID в админке «Ждут сертификата» (`/admin/devices`), отправляет поставщику и загружает присланные `.p12`, пароль и `.mobileprovision` на странице устройства. API проверяет подпись профиля Apple, пароль, UDID в профиле, сертификат из профиля, сроки (не меньше суток), wildcard App ID и спрашивает OCSP Apple об отзыве; файлы и пароль хранятся только зашифрованными мастер-ключом (`MASTER_KEY_CURRENT`, `MASTER_KEY_V<n>`, обязательны в production; без них загрузка отвечает 503). Расшифровывают их только `apps/api/src/apple` и воркер (правило Biome). Воркер каждые 10 минут (`certificates:check`) помечает истёкшие и отозванные файлы, устройство уходит в «Обновляем доступ, обычно до 24 часов» и снова попадает в список. `ADMIN_NOTIFY_EMAIL` — адрес владельца для письма «Новый iPhone ждёт сертификата» (без него письма нет).

Тестовые файлы делает `@xstore/signing/testing` (`makeKit`): свой тестовый корень, которому API доверяет только через `SIGNING_TEST_ANCHOR_PATH` (в production запрещён). Playwright создаёт такой комплект при каждом запуске во временной папке и передаёт корень e2e-API сам. Ручная проверка с настоящим iPhone и файлами поставщика — `docs/superpowers/plans/2026-11-19-n3-real-iphone-check.md`.

### Письма

Пакет `@xstore/mail` (только API и воркер) отправляет письма «Оплата прошла, доступ до <дата>» и «Код для входа» по SMTP: адрес `SMTP_URL`, отправитель `MAIL_FROM`. В разработке письма ловит Mailpit из `pnpm infra:up`: http://127.0.0.1:8025. Каждое письмо пишется в `NotificationLog` (тема, адрес, статус, ошибка; текст письма и код входа не хранятся). «Оплата прошла» уходит не больше одного раза на заказ (`dedupeKey`), каким бы путём ни прошла оплата; неудачная отправка остаётся со статусом `failed` и сама не повторяется. Ошибка почты не роняет вебхук и задания сверки. Интеграционные тесты читают письма через API Mailpit (`MAILPIT_API_URL`, `SMTP_URL_TEST`) и не очищают его: каждый тест пишет на свой адрес. В production `SMTP_URL` и `MAIL_FROM` обязательны.

## Production-стек

`infra/docker-compose.yml` поднимает web, api, worker, Postgres, Redis, MinIO и Caddy; наружу публикует порты 80 и 443 только Caddy. Конфигурация берётся из `.env` (домены `SITE_DOMAIN` и `DL_DOMAIN`, пароли `POSTGRES_PASSWORD` и `MINIO_ROOT_PASSWORD`; на сервере задайте настоящие значения). API и воркер ходят в MinIO с учётными данными `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, presigned-ссылки выдаются на `https://DL_DOMAIN`; при старте API создаёт недостающие бакеты (`S3_BUCKET_PREFIX` + `originals`, `media`, `signed`, `uploads`).

Профиль подключения iPhone подписывается сертификатом Caddy для `SITE_DOMAIN`. Caddy хранит ключ в томе `caddydata` с доступом только для root, поэтому сервис `enroll-cert` (`infra/enroll-cert-sync.sh`) читает том только на чтение и копирует сертификат и ключ в том `enrollcert` для пользователя API; продление подхватывается в течение 5 минут, API перечитывает файлы без перезапуска. Пока новая пара не читается (не пара, нет файла), API подписывает прежним действующим сертификатом и один раз пишет в журнал предупреждение `enrollment signer: new files not loaded…`. Папку выпускающего центра в хранилище Caddy задаёт `CADDY_CERT_ISSUER`: по умолчанию Let's Encrypt (`acme-v02.api.letsencrypt.org-directory`), `local` для localhost, `acme.zerossl.com-v2-dv90` для ZeroSSL.

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
bash infra/smoke.sh    # health API, каталог, главная, zsign, вход для гостя по ссылке профиля, сертификат у API
```

Образы собираются из корня репозитория, например `docker build -f apps/api/Dockerfile .`.

## Windows

- CLI Docker Desktop может отсутствовать в PATH уже открытых оболочек. Добавьте `C:\Program Files\Docker\Docker\resources\bin` (в Git Bash: `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`) или откройте новую оболочку.
- Работающий dev-сервер API держит файл движка Prisma. Остановите его перед `pnpm build` и `pnpm typecheck`.
- `infra/smoke.sh` запускайте в Git Bash.
