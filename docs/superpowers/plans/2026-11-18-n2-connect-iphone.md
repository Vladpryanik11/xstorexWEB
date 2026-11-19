# Н2 «Подключение iPhone» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подписчик на iPhone или iPad нажимает «Подключить iPhone», ставит подписанный профиль, iOS возвращает данные устройства, сервер навсегда привязывает устройство к доступу, мастер показывает «Готово, iPhone подключён», а «Мой доступ» и окно приложения — «Готовим ваш iPhone». На компьютере вместо этого шага — уведомление «Откройте сайт на iPhone, чтобы подключить его».

**Architecture:** Модуль `apps/api/src/enrollment` собирает Profile Service `.mobileconfig`, подписывает его CMS сертификатом сайта (Let's Encrypt от Caddy, в разработке самоподписанный), принимает подписанный ответ iOS, проверяет цепочку до Apple Root CA и привязывает устройство к подписке покупателя. Правила привязки — чистые функции в `@xstore/shared`. Web добавляет шаг мастера `/get/iphone` и показывает состояние устройства в «Мой доступ» и окне приложения. Регистрация устройства в Apple — веха Н3; в Н2 устройство остаётся в статусе `pending`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js App Router, Zod, Vitest, Playwright; новое — `pkijs` 3.x + `asn1js` 3.x (CMS через WebCrypto, RSA и ECDSA P-256), `plist` 3.1.1 (уже в `packages/ios`). Версии — последние стабильные, вышедшие не позже чем за две недели до начала работ.

**Spec:** [Xstore v2](../specs/2026-11-18-xstore-v2-design.md) §2 (устройства, смена iPhone, шаг подключения), §3.2 (кнопки окна), §4 шаг 2 и «Правила», §5 («Мой доступ»), §7, §12 (сценарии 1 и 3). Порядок вех — [план v2](2026-11-18-v2-roadmap.md). Технические решения [M2](2026-11-05-m2-auth-cabinet.md) (задачи 3–4: профиль, CMS, разбор ответа iOS) — справочник; где они расходятся с этим планом, прав этот план.

## Global Constraints

- Все ограничения Н1 действуют (ответы `{ code, message }`, тексты в `packages/shared/src/errors.ts`, Origin-проверка, аудит, секреты не в логах и ответах, даты Europe/Moscow, без Tailwind, вёрстка по скиллу `xstore-design`).
- `.mobileconfig`: `Content-Type: application/x-apple-aspen-config`, имя файла `xstore-connect.mobileconfig`, `PayloadType` `Profile Service`, `PayloadIdentifier` `ru.xstorex.enroll`, `PayloadDisplayName` «Xstore — подключение iPhone», `PayloadOrganization` «Xstore», `DeviceAttributes` `UDID, PRODUCT, VERSION`, `Challenge` = nonce, URL ответа `<SITE_URL>/api/v1/enrollment/callback?s=<nonce>`.
- Nonce: 32 случайных байта base64url, живёт 15 минут, одноразовый; хранит `userId` и `sessionId` того, кто скачал профиль.
- Ответ iOS: `application/pkcs7-signature`, сырое тело ≤ 64 КБ, без Origin-проверки. Цепочка подписи — до Apple Root CA (публичный сертификат в репозитории). Дополнительный тестовый корень принимается только при `NODE_ENV !== 'production'` через `ENROLL_TEST_ANCHOR_PATH`.
- Подпись профиля: `ENROLL_CERT_PATH`, `ENROLL_KEY_PATH` (PEM). В проде это сертификат Caddy для `SITE_DOMAIN`: служба `enroll-cert` читает том `caddydata` (только чтение) и копирует пару в том `enrollcert` с правами для API, API монтирует его только для чтения; файл перечитывается при смене `mtime`, без перезапуска. Ключ не попадает в логи и ответы.
- В этапе 1 у покупателя не больше одного устройства. Устройство привязывается к подписке навсегда; другое устройство к этому доступу не привязывается (`DEVICE_LIMIT`). Покупка второго доступа для второго устройства — не в Н2.
- Устройство, привязанное к другому покупателю, не переносится (`DEVICE_OWNED`). UDID никогда не даёт вход и не создаёт пользователя.
- Подключать можно только при активном доступе (`NO_ACCESS`). Подключение не меняет даты доступа.
- Статусы устройства для человека: нет устройства — «Подключить iPhone»; `pending`/`processing` — «Готовим ваш iPhone, обычно до 24 часов»; `active` — «iPhone готов». На iPad везде «iPad» вместо «iPhone» (по `PRODUCT` устройства или, до подключения, по браузеру).
- Тексты: «Подключить iPhone», «Вернитесь в Safari», «Готово, iPhone подключён», «Откройте сайт на iPhone, чтобы подключить его». Слова «профиль», «UDID», «сертификат» в интерфейсе не используются; исключение — подписи к скриншотам, где дословно цитируется экран iOS («Профиль загружен», «Установить»).
- UDID в админке и логах только маской `maskUdid`.

## Review Focus

1. **iOS отправил ответ дважды или человек поставил профиль второй раз** — одно устройство, одна привязка, без ошибки → задача 3, тест `same device twice is idempotent`.
2. **Профиль поставлен позже 15 минут** — понятное «Время подключения истекло» и кнопка «Попробовать снова», без привязки → задача 3, тест `expired nonce`.
3. **Человек вернулся в Safari, не поставив профиль** — подсказка, где нажать в Настройках, а не ошибка → задача 4, тест `return without callback shows hint`.
4. **Cookie потерян между скачиванием и ответом iOS** — привязка всё равно проходит по nonce, после входа «Мой доступ» показывает устройство → задача 3, тест `callback binds by nonce owner without browser session`; задача 6 E2E.
5. **Caddy обновил сертификат** — следующий профиль подписан новым сертификатом без перезапуска API → задача 2, тест `reloads identity when files change`.

## Зависимости и порядок

- Начинать после слияния PR #18 (Н1) — ветка от актуального `main`. Если владелец решит не сливать до конца Н2, работа продолжается в той же ветке.
- Задача 1 закрывает переносы из итогового ревью Н1, которые касаются устройства и подписок.
- Задача 6 (реальный iPhone) — с владельцем на VPS; остальное делается без устройства на записанных ответах.

## Карта файлов

| Что | Файлы | Задача |
|---|---|---|
| Правила устройства и доступа, переносы Н1 | `packages/shared/src/{devices,access}.ts`, `apps/api/src/auth/claim-provisional.ts`, `packages/mail/src/send.ts` | 1 |
| Профиль и CMS | `apps/api/src/enrollment/{profile,cms,identity,apple-root}.ts`, `apps/api/scripts/enroll-dev-cert.ts` | 2 |
| API подключения | `apps/api/src/enrollment/{enrollment.controller,enrollment.service,device-response}.ts` | 3 |
| Шаг мастера | `apps/web/app/(site)/get/iphone/page.tsx`, `apps/web/src/checkout/{ConnectStep,ConnectGuide}.tsx` | 4 |
| Окно, «Мой доступ», админка | `apps/web/src/app-page/install-button-state.ts`, `apps/web/src/access/AccessCard.tsx`, `apps/web/app/admin/(billing)/subscriptions/page.tsx` | 5 |
| Прод, E2E, реальный iPhone | `infra/docker-compose.yml`, `.env.example`, `apps/web/e2e/connect-iphone.spec.ts` | 6 |

---

### Task 1: Правила устройства и переносы из Н1

**Files:**
- Modify: `packages/shared/src/devices.ts`, `packages/shared/src/access.ts`, `apps/api/src/billing/checkout.service.ts` (сборка `/access`), `apps/api/src/auth/claim-provisional.ts`, `packages/mail/src/send.ts`
- Test: `packages/shared/src/devices.test.ts`, `packages/shared/src/access.test.ts`, `apps/api/test/customer-auth.int.test.ts`, `packages/mail/test/mail.int.test.ts`

**Interfaces:**
- Produces:
  - `deviceFamily(product: string): 'iphone' | 'ipad'` — по префиксу `iPad`, иначе `iphone`.
  - `bindDecision(input: { udidOwnerId: string | null; buyerId: string; buyerDeviceUdid: string | null; udid: string; hasAccess: boolean }): { ok: true; reuse: boolean } | { ok: false; code: 'NO_ACCESS' | 'DEVICE_OWNED' | 'DEVICE_LIMIT' }`.
  - `AccessState` для `active` получает `device: null | { model: string; family: 'iphone' | 'ipad'; ready: boolean }` вместо `deviceReady`; устройство берётся из любой подписки покупателя, к которой оно привязано (не только из выбранной для продления). `ready` = статус `active`.
  - `deviceStatusLabel`: `pending` и `processing` → «Готовим ваш iPhone, обычно до 24 часов», `active` → «iPhone готов» (старое «до 72 часов» убрать).
- Переносы Н1: письмо «Оплата прошла» берёт дату по цепочке всех подписок покупателя (как `buyerAccessUntil`); `claimProvisional` после переноса подписок переставляет ещё не начавшиеся права перенесённых подписок в конец цепочки покупателя (длительность сохраняется, `startsAt = max(startsAt, конец цепочки)`), чтобы не было перекрытий.

- [ ] **Step 1: Write failing tests** — `deviceFamily('iPad13,1') === 'ipad'`, `deviceFamily('iPhone16,2') === 'iphone'`; `bindDecision`: нет доступа → `NO_ACCESS`; UDID у другого покупателя → `DEVICE_OWNED`; у покупателя другое устройство → `DEVICE_LIMIT`; тот же UDID у того же покупателя → `{ ok: true, reuse: true }`; `accessState` отдаёт устройство из невыбранной подписки; `payment mail date follows buyer chain`; `claim moves future rights after the buyer chain`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/shared test && pnpm --filter @xstore/api test:int && pnpm --filter @xstore/mail test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** функции и правки; обновить всех потребителей `deviceReady` (web-тесты и компоненты компилируются с новым полем).
- [ ] **Step 4: Run the same command plus** `pnpm --filter @xstore/web test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): правила подключения устройства и цепочка прав при объединении`

---

### Task 2: Подписанный профиль подключения

**Files:**
- Create: `apps/api/src/enrollment/{profile,cms,identity}.ts`, `apps/api/src/enrollment/apple-root-ca.pem`, `apps/api/scripts/enroll-dev-cert.ts`
- Modify: `apps/api/src/config/config.ts`, `.env.example`, `.gitignore` (`.secrets/`), `apps/api/package.json` (скрипт `enroll:dev-cert`, зависимости `pkijs`, `asn1js`, `plist`)
- Test: `apps/api/src/enrollment/{profile,cms,identity}.test.ts`

**Interfaces:**
- Produces:
  - `buildEnrollmentProfile(input: { nonce: string; siteUrl: string; payloadUuid: string }): string` — XML plist по Global Constraints, `PayloadVersion 1`.
  - `signCms(content: Buffer, identity: SigningIdentity): Promise<Buffer>` — DER `SignedData`, вложенное содержимое, SHA-256, подписанные атрибуты, все сертификаты цепочки; RSA и ECDSA P-256.
  - `verifyCms(der: Buffer, opts: { anchors: X509[]; now?: Date }): Promise<{ content: Buffer; signer: X509 }>` — проверяет дайджест атрибутов, подпись и цепочку до одного из `anchors`; ошибки — `CmsError`.
  - `IdentityStore.get(): Promise<SigningIdentity>` — читает `ENROLL_CERT_PATH`/`ENROLL_KEY_PATH`, кэширует по `mtime`.
  - `signDeviceResponse(fields: { UDID: string; PRODUCT: string; VERSION: string; CHALLENGE: string }, ca: TestCa): Promise<Buffer>` и `createTestCa(): Promise<TestCa>` — только для тестов (экспорт из `apps/api/test/support/ios.ts`).
  - Скрипт `pnpm --filter @xstore/api enroll:dev-cert` создаёт самоподписанный сертификат в `.secrets/enroll/` для разработки и CI.

- [ ] **Step 1: Write failing tests** — разбор `buildEnrollmentProfile` через `plist` даёт все значения из Global Constraints; `signCms` → `verifyCms` с якорем = корень цепочки возвращает исходное содержимое для RSA 2048 и для ECDSA P-256; подмена одного байта содержимого → `CmsError`; чужой корень → `CmsError`; просроченный сертификат подписанта при `now` после срока → `CmsError`; `reloads identity when files change` (замена файлов → другой отпечаток сертификата без пересоздания стора).
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test -- enrollment`. Expected: FAIL.
- [ ] **Step 3: Implement** на `pkijs` с `crypto.webcrypto`; `apple-root-ca.pem` — публичный «Apple Root CA» с apple.com/certificateauthority, отпечаток SHA-256 записать в комментарий файла и проверить в тесте.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(enrollment): подписанный профиль подключения iPhone`

---

### Task 3: API подключения и привязка устройства

**Files:**
- Create: `apps/api/src/enrollment/{enrollment.module,enrollment.controller,enrollment.service,device-response}.ts`, `apps/api/test/enrollment.int.test.ts`, `apps/api/test/support/ios.ts`
- Modify: `apps/api/src/app.module.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/client.ts`, `apps/api/src/billing/webhooks.controller.ts` или отдельный dev-контроллер

**Interfaces:**
- Consumes: задача 1 `bindDecision`, `deviceFamily`; задача 2 `buildEnrollmentProfile`, `signCms`, `verifyCms`, `IdentityStore`; `buyerSubscription`/`pickSubscription` из Н1.
- Produces:
  - `GET /enrollment/profile` — сессия покупателя с активным доступом (гость → 401, без доступа → 403 `NO_ACCESS`, устройство уже есть → 409 `DEVICE_LIMIT`); создаёт `EnrollmentSession`, отдаёт подписанный `.mobileconfig`. Лимит 10 за 10 минут на покупателя.
  - `POST /enrollment/callback?s=<nonce>` — проверяет nonce (существует, `pending`, не истёк), что сессия-источник жива, CMS и цепочку, `CHALLENGE === nonce`, разбирает `UDID/PRODUCT/VERSION` (`parseDeviceResponse(content: Buffer)` в `device-response.ts`). Под блокировками `checkout:<userId>`, затем `hashtext(subscriptionId)` применяет `bindDecision`: создаёт или переиспользует `Device { userId, udid, product, iosVersion, name: deviceModelName(product), status: 'pending' }` и ставит `Subscription.deviceId`, `assignedAt` на подписку из `buyerSubscription`. Помечает `EnrollmentSession` `completed`/`failed`/`expired`. Всегда отвечает `301` на `<SITE_URL>/get/iphone?r=<connected|ENROLLMENT_EXPIRED|DEVICE_OWNED|DEVICE_LIMIT|NO_ACCESS|ENROLLMENT_FAILED>`. Аудит `device.bind`.
  - Только при `XSTORE_DEV_PAGES=1`: `POST /devices/dev/mine/{ready|pending}` для своей сессии — переключает статус своего устройства (до Н3 так проверяются состояния интерфейса).
  - Клиент: `api.enrollmentProfileUrl(): string`, `api.devSetDeviceStatus(status)`.

- [ ] **Step 1: Write failing tests** — `connects device to buyer subscription` (одно устройство, `Subscription.deviceId` установлен, даты прав не изменились, редирект `?r=connected`); `same device twice is idempotent`; `guest cannot download profile` (401); `no access` (403 `NO_ACCESS`); `foreign owner is unchanged` (`?r=DEVICE_OWNED`); `second device is refused` (`?r=DEVICE_LIMIT`); `tampered payload`, `challenge mismatch` (`?r=ENROLLMENT_FAILED`, устройство не создано); `expired nonce`; `nonce is single use`; `revoked source session rejects callback`; `callback binds by nonce owner without browser session`; `UDID never logged` (лог-шпион не видит UDID целиком); `dev status route is 404 without XSTORE_DEV_PAGES`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test:int -- enrollment`. Expected: FAIL.
- [ ] **Step 3: Implement** модуль; тестовый корень из `ENROLL_TEST_ANCHOR_PATH` подключается только вне production (конфиг падает при старте, если он задан в production).
- [ ] **Step 4: Run** `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(enrollment): подключение iPhone и привязка к доступу`

---

### Task 4: Web: шаг «Подключить iPhone»

**Files:**
- Create: `apps/web/app/(site)/get/iphone/page.tsx`, `apps/web/src/checkout/{ConnectStep,ConnectGuide}.tsx`, `apps/web/src/checkout/connect-step.ts`, `*.module.css`
- Modify: `apps/web/src/checkout/{Wizard,PaidStep,StepBar}.tsx`, `apps/web/app/(site)/get/page.tsx`
- Test: `apps/web/src/checkout/connect-step.test.ts`, `apps/web/src/checkout/ConnectStep.test.tsx`, `apps/web/app/(site)/get/iphone/page.test.tsx`

**Interfaces:**
- Consumes: `getAccess` (задача 1 `device`), задача 3 `enrollmentProfileUrl`, `deviceKind` из `apps/web/src/app-page/device.ts`.
- Produces:
  - `connectStep(input: { device: 'ios' | 'desktop'; access: AccessState; result: string | null; waiting: boolean }): 'signin' | 'no_access' | 'guide' | 'waiting' | 'connected' | 'preparing' | 'ready' | 'open_on_phone' | 'error'`.
  - `/get/iphone`: без сессии → `/signin?next=/get/iphone`; без доступа → «Оформить доступ» на `/get`.
    - iPhone/iPad без устройства: строка шагов на шаге 2, три иллюстрации с подписями («Нажмите «Подключить iPhone» и «Разрешить»», «Откройте Настройки → «Профиль загружен»», «Нажмите «Установить» и вернитесь в Safari»), кнопка «Подключить iPhone» (ссылка на профиль). После нажатия — «Ждём подключения…», опрос `getAccess` раз в 3 секунды до 15 минут и подсказка «Вернитесь в Safari, когда нажмёте «Установить»».
    - `?r=connected` или устройство появилось — «Готово, iPhone подключён», затем «Готовим ваш iPhone, обычно до 24 часов».
    - `?r=<код ошибки>` — текст из `errors.ts` и «Попробовать снова».
    - Компьютер — уведомление «Откройте сайт на iPhone, чтобы подключить его» (без QR-кода, решение владельца 19.11).
  - `/get/[orderId]` после оплаты: вместо заглушки разработки — «Дальше: подключить iPhone» (iPhone) или то же уведомление (компьютер). `/get` для подписчика без устройства ведёт на `/get/iphone`, с устройством — на `/access`.
  - Иллюстрации — собственные схематичные рисунки в CSS/SVG без материалов Apple; настоящие скриншоты подставляются после задачи 6.

- [ ] **Step 1: Write failing tests** — `connectStep` для каждого состояния, включая `return without callback shows hint` (`waiting` и устройство не появилось → подсказка); `ConnectStep`: на iPad тексты «iPad»; на компьютере уведомление «Откройте сайт на iPhone» и нет кнопки подключения; ошибка `DEVICE_OWNED` показывает текст из `errors.ts`; опрос останавливается после появления устройства и после 15 минут; страница: гость → редирект на вход.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** по скиллу `xstore-design`.
- [ ] **Step 4: Run the same command,** затем проверка в браузере (Playwright chromium, 390 и 1280) с записанным ответом iOS через тестовый корень. Expected: PASS, без горизонтальной прокрутки.
- [ ] **Step 5: Commit** `feat(web): шаг мастера «Подключить iPhone»`

---

### Task 5: Web: состояние устройства в окне, «Мой доступ» и админке

**Files:**
- Modify: `apps/web/src/app-page/install-button-state.ts`, `apps/web/src/catalog/AppPreview.tsx`, `apps/web/src/access/AccessCard.tsx`, `apps/web/app/admin/(billing)/subscriptions/page.tsx`, `apps/api/src/admin-billing/admin-billing.service.ts`
- Test: `apps/web/src/app-page/install-button-state.test.ts`, `apps/web/src/access/AccessCard.test.tsx`, `apps/api/test/admin-billing.int.test.ts`

**Interfaces:**
- Consumes: задача 1 `AccessState.device`.
- Produces:
  - `installButtonState` для `active`: без устройства на iOS → `{ kind: 'connect', label: 'Подключить iPhone', href: '/get/iphone' }` («iPad» на iPad); устройство не готово → `{ kind: 'preparing', label: 'Готовим ваш iPhone, до 24 часов' }` (неактивна); готово → `soon` как в Н1 (до Н4).
  - «Мой доступ»: строка устройства «iPhone 15 Pro · Готовим, обычно до 24 часов» / «· Готов» или «Подключить iPhone» → `/get/iphone`.
  - Админка «Подписки»: модель, статус, UDID маской, дата привязки.

- [ ] **Step 1: Write failing tests** — каждое новое состояние кнопки на iPhone, iPad и компьютере; `AccessCard` для трёх состояний устройства; админ видит UDID только маской (полный UDID отсутствует в ответе API).
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test && pnpm --filter @xstore/api test:int -- admin-billing`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): состояние iPhone в окне приложения и «Мой доступ»`

---

### Task 6: Прод, E2E и проверка на реальном iPhone

**Files:**
- Create: `apps/web/e2e/connect-iphone.spec.ts`
- Modify: `infra/docker-compose.yml` (служба `enroll-cert`: `caddydata` → том `enrollcert`, в `api` только для чтения; `ENROLL_CERT_PATH`/`ENROLL_KEY_PATH`), `.env.example`, `apps/web/playwright.config.ts`, `.github/workflows/ci.yml` (dev-сертификат и тестовый корень для e2e и integration), `infra/smoke.sh` (гостя ссылка подключения отправляет на вход, 302), `README.md`, `CLAUDE.md`
- Test: `apps/web/e2e/connect-iphone.spec.ts`, `apps/api/src/enrollment/device-response.real.test.ts`

**Interfaces:**
- Consumes: всё выше.

- [ ] **Step 1: Write E2E** (WebKit, iPhone) — сценарий 1 спецификации до «Готово, iPhone подключён» (ответ iOS отправляет тест через `signDeviceResponse`); сценарий 3: оплата с компьютера → уведомление «Откройте сайт на iPhone» → на iPhone вход кодом и `/get/iphone` → подключение; окно приложения показывает «Готовим ваш iPhone» после подключения и «Скоро можно будет установить» после dev-переключения в `ready`. Тест `device-response.real.test.ts` выполняется только при `IOS_REAL_FIXTURE=<путь>` и проверяет настоящий ответ iOS против Apple Root CA.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test:e2e -- --trace off`. Expected: PASS (в облачной сессии WebKit — в CI).
- [ ] **Step 3: Полный набор** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Expected: всё зелёное.
- [ ] **Step 4: Реальный iPhone (с владельцем, на VPS с HTTPS)** — оплатить на тестовом провайдере, скачать профиль в Safari, проверить, что iOS показывает «Проверено», установить, вернуться в Safari, увидеть «Готово, iPhone подключён», убедиться, что в Настройках не осталось профиля. Если iOS не принимает подпись ECDSA — перевести сертификат Caddy на RSA (`key_type rsa2048`) и повторить. Сохранить настоящий ответ iOS вне git и прогнать `IOS_REAL_FIXTURE=<путь> pnpm --filter @xstore/api test -- device-response.real`. Сделать три настоящих скриншота и заменить ими иллюстрации задачи 4.
- [ ] **Step 5: Скриншоты** шага подключения (iPhone, iPad, компьютер), «Мой доступ» и окна приложения в `/mnt/project-files/screenshots/<дата>-n2/`; ревью `superpowers:requesting-code-review`, независимое ревью Codex. PR сливается только по команде владельца.
