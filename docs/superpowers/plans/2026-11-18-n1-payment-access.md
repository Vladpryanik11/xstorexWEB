# Н1 «Оплата и доступ» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Гость из окна приложения попадает на экран-мастер, вводит почту, оплачивает (фейковый провайдер, затем Platega), сразу получает доступ на 30 дней, задаёт пароль, позже входит паролем или кодом и видит срок на странице «Мой доступ».

**Architecture:** Новый Node-пакет `@xstore/billing` держит провайдера оплаты и единственную функцию применения платежа; его используют API (вебхук, создание заказа) и воркер (сверка зависших заказов). Расчёт сроков и состояний доступа — чистые функции в `@xstore/shared`. Письма отправляет `MailService` в API через SMTP (Mailpit в разработке). Web добавляет мастер `/get`, `/pricing`, `/signin`, `/access` и подключает окно установки к состоянию доступа.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ/Redis, Next.js App Router, Zod, Vitest, Playwright; новое — `nodemailer` 7.x, Mailpit (dev/CI).

**Spec:** [Xstore v2](../specs/2026-11-18-xstore-v2-design.md) §2, §4 (шаг 1), §5, §6, §10 (тариф, заказы, ручная выдача), §11, §12. Порядок вех — [план v2](2026-11-18-v2-roadmap.md). Технические решения из [M5](2026-11-05-m5-billing.md) (задачи 1–5) и [M2](2026-11-05-m2-auth-cabinet.md) (код на почту, `claimProvisional`) используются как справочник; где они расходятся с этим планом, прав этот план.

## Global Constraints

- Все ограничения M0–M2 действуют: ответы API `{ code, message, details? }`, коды и русские тексты в `packages/shared/src/errors.ts`, Origin-проверка на изменяющих запросах, аудит действий админа, секреты не в логах, не в данных задач, не в ответах API.
- Один тариф: `durationDays = 30`, цена в целых рублях > 0 задаётся в админке; коммерческая цена не сеется. Сид разработки — тариф `month` за 1 ₽ с пометкой «только для разработки».
- Период: первая оплата и оплата после перерыва — `startsAt = paidAt`; продление — `startsAt = max(paidAt, конец последнего неотозванного периода этой подписки)`; `expiresAt = startsAt + 30 суток` (UTC). Подключение устройства даты не меняет.
- `paidAt` — время подтверждения у провайдера, одинаковое при повторе вебхука и сверке; возврат браузера с платёжной страницы оплатой не считается.
- Одна подписка — одно устройство; в Н1 устройство не назначается (`Subscription.deviceId` = null).
- Неоплаченный заказ живёт 24 часа. Пока результат платежа неизвестен, второй платёж по той же подписке не создаётся.
- Вебхук: `POST /api/v1/billing/webhooks/:provider`, сырое тело ≤ 64 КБ, без Origin-проверки, аутентификация провайдером, затем перечитать статус, сумму и валюту у провайдера. Сверка: каждые 5 минут заказы в `pending` старше 10 минут.
- Почта при оплате — контакт, а не доказательство владения. Гость всегда получает отдельный аккаунт покупки (`isProvisional = true`, `email = null`, `checkoutEmail`). Введённая почта никогда не выдаёт сессию существующего аккаунта.
- Код на почту: 6 цифр, 10 минут, 5 неверных попыток, повторная отправка через 60 секунд. Лимиты: запрос кода 3 за 10 минут на почту и 10 за 10 минут на IP; вход паролем 5 за 15 минут на IP.
- Пароль покупателя: 8–128 символов, argon2id (`apps/api/src/auth/password.ts`).
- Сессия покупателя живёт `max(now + 30 дней, конец доступа + 7 дней)` и продлевается при визитах по тому же правилу. Сессии сотрудников не меняются.
- Тексты для человека (спецификация v2): «Подписка начнётся сразу после оплаты», «Проверяем оплату…», «Доступ активен до <дата>», «Мой доступ», «Войти». Слова «аккаунт», «UDID», «профиль» в интерфейсе не используются. Даты по-русски в часовом поясе Europe/Moscow: «18 декабря 2026».
- Письма Н1: «Оплата прошла, доступ до <дата>» и «Код для входа». Тема и текст на русском, без ссылок, открывающих доступ без входа.
- `PAYMENT_PROVIDER=fake|platega`; `fake` запрещён при `NODE_ENV=production` (процесс не стартует).
- Без Tailwind; вёрстка по скиллу `xstore-design`.

## Review Focus

1. **Два быстрых нажатия «Оплатить» без cookie** должны дать один заказ и один платёж → задача 4, тест `concurrent guest checkout creates one order`.
2. **Человек ввёл чужую почту** (или свою, уже известную сервису) — он не получает чужой доступ, а владелец почты после входа кодом получает этот подарок без потери своих данных → задача 7, тесты `checkout email is not a credential` и `claim moves provisional purchases into verified account`.
3. **Повтор вебхука, вебхук и сверка одновременно** — одни права, одни даты → задачи 3 и 5.
4. **Человек вернулся с Platega раньше вебхука** — видит «Проверяем оплату…», а не ошибку и не повторную оплату → задача 8, тест `return before webhook shows checking state`.
5. **Человек закрыл вкладку после оплаты и потерял cookie** — после входа кодом видит тот же срок → задача 7 `code login restores paid access with same dates`, задача 11 E2E.

## Зависимости и порядок

- Ветка от актуального `main`. Задача 9 начинается после слияния PR #17 (окно установки и разделы); остальные от него не зависят.
- Задача 12 (Platega) выполняется, когда владелец пришлёт документацию мерчанта и ключи. До этого всё работает на фейковом провайдере, веха без задачи 12 считается готовой к ревью, но не к продаже.

## Карта файлов

| Что | Файлы | Задача |
|---|---|---|
| Модель | `packages/db/prisma/schema.prisma`, миграция `n1_billing` | 1 |
| Контракты и правила сроков | `packages/shared/src/{billing,access}.ts` | 1, 2 |
| Провайдер и применение платежа | `packages/billing/src/*` | 3 |
| Заказы, вебхук, «Мой доступ» API | `apps/api/src/billing/*` | 4 |
| Сверка и истечение заказов | `apps/worker/src/billing/*` | 5 |
| Письма | `apps/api/src/mail/*`, `infra/docker-compose.dev.yml` | 6 |
| Вход покупателя | `apps/api/src/auth/{customer-auth.service,email-code.service,claim-provisional}.ts` | 7 |
| Мастер и тарифы | `apps/web/app/(site)/{get,pricing}/*`, `apps/web/src/checkout/*` | 8 |
| Окно установки, вход, «Мой доступ», шапка | `apps/web/src/{install-sheet,auth,access}/*`, `apps/web/src/shell/*` | 9, 10 |
| Админка | `apps/api/src/admin-billing/*`, `apps/web/app/admin/(billing)/*` | 11 |
| Platega | `packages/billing/src/platega/*` | 12 |
| Проверка вехи | `apps/web/e2e/purchase-*.spec.ts` | 13 |

---

### Task 1: Модель подписок и заказов

**Files:**
- Modify: `packages/db/prisma/schema.prisma`, `packages/shared/src/errors.ts`, `packages/shared/src/index.ts`
- Create: миграция `pnpm db:migrate --name n1_billing`, `packages/shared/src/billing.ts`
- Test: `packages/shared/src/billing.test.ts`, `packages/db/test/billing.int.test.ts`

**Interfaces:**
- Produces (Prisma):
  - `Plan { id, code String @unique, title, durationDays Int, priceRub Int, active Boolean, sort Int, createdAt, updatedAt }`; CHECK `priceRub > 0`, `durationDays > 0`. Полей `kind`, `tier`, `features` нет (этап 2).
  - `Subscription { id, userId, deviceId String? @unique, assignedAt DateTime?, autoRenew Boolean @default(false), createdAt, updatedAt }`.
  - `enum OrderStatus { created pending paid failed expired refunded }`.
  - `Order { id, userId, subscriptionId, planId, planSnapshot Json, checkoutEmail String, checkoutKey String @unique, returnTo String?, amountRub Int, status OrderStatus, provider String, providerPaymentId String? @unique, redirectUrl String?, paidAt DateTime?, expiresAt DateTime, createdAt, updatedAt }`; индекс `(status, createdAt)`.
  - `Entitlement { id, subscriptionId, planCode, durationDays, startsAt, expiresAt, orderId String? @unique, grantedById String?, note String?, revokedAt DateTime?, createdAt }`; индекс `(subscriptionId, expiresAt)`; CHECK `expiresAt > startsAt`.
  - `PaymentEvent { id, provider, eventKey String @unique, payload Json, result String?, processedAt DateTime?, createdAt }`.
  - `EmailCode { id, email, codeHash, attempts Int @default(0), expiresAt, usedAt DateTime?, createdAt }`; индекс `(email, createdAt)`.
  - `NotificationLog { id, template, to, subject, status (sent|failed), error String?, createdAt }`.
- Produces (`@xstore/shared`): `planViewSchema { code, title, durationDays, priceRub }`, `orderViewSchema { id, status, amountRub, paidAt: string|null, returnTo: string|null, accessUntil: string|null }`, `checkoutRequestSchema { checkoutKey: uuid, email, returnTo?: string, acceptTerms: literal(true) }`, `PlanSnapshot { code, title, durationDays, priceRub }`.
- Produces (errors): `CHECKOUT_IN_PROGRESS` «Оплата уже начата, подождите несколько секунд», `PLAN_UNAVAILABLE` «Подписка сейчас недоступна», `PAYMENT_PENDING` «Проверяем оплату», `PAYMENT_FAILED` «Оплата не прошла. Попробуйте ещё раз», `PAYMENT_PROVIDER_DOWN` «Платёжный сервис не отвечает. Попробуйте через минуту», `WEAK_PASSWORD` «Пароль должен быть от 8 до 128 символов».

- [ ] **Step 1: Write failing tests** — `packages/db/test/billing.int.test.ts`: `entitlement with dates belongs to subscription without device`; `duplicate checkoutKey rejected`; `second entitlement for same orderId rejected`; `plan with priceRub 0 rejected by CHECK`; `entitlement expiresAt <= startsAt rejected`. `billing.test.ts`: `checkoutRequestSchema rejects missing acceptTerms`, `orderViewSchema accepts paid order with null returnTo`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/shared test && pnpm --filter @xstore/db test:int`. Expected: FAIL (нет моделей и схем).
- [ ] **Step 3: Implement** схему, CHECK-ограничения в SQL миграции, схемы и коды ошибок; сид разработки `month` 1 ₽ в `packages/db/prisma/seed.ts` только при `NODE_ENV !== 'production'`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(billing): модель подписок, заказов и прав`

---

### Task 2: Правила сроков, сессии и состояния доступа

**Files:**
- Create: `packages/shared/src/access.ts`
- Test: `packages/shared/src/access.test.ts`

**Interfaces:**
- Produces:
  - `type RightLike = { startsAt: Date; expiresAt: Date; revokedAt: Date | null }`
  - `nextWindow(existing: RightLike[], durationDays: number, paidAt: Date): { startsAt: Date; expiresAt: Date }`
  - `accessUntil(rights: RightLike[], now: Date): Date | null` — конец непрерывной цепочки, начинающейся с действующего сейчас периода; `null`, если сейчас доступа нет.
  - `userSessionExpiry(now: Date, until: Date | null): Date` = `max(now + 30 суток, until + 7 суток)`.
  - `type AccessState = { kind: 'none' } | { kind: 'payment_pending'; orderId: string } | { kind: 'active'; until: Date; subscriptionId: string; deviceReady: boolean }` и `accessState(input: { signedIn: boolean; subscriptions: { id: string; rights: RightLike[]; deviceReady: boolean }[]; pendingOrderId: string | null; now: Date }): AccessState`. Приоритет: действующая подписка → ожидающий заказ → `none`.
  - `formatRuDate(d: Date): string` — «18 декабря 2026», зона Europe/Moscow.

- [ ] **Step 1: Write failing tests** с фиксированным временем: оплата `2026-11-18T12:00:00Z` → `expiresAt 2026-12-18T12:00:00Z`; продление при конце `2026-12-18T12:00:00Z`, оплаченное `2026-12-10T09:00:00Z`, → `startsAt 2026-12-18T12:00:00Z`; оплата после перерыва начинается в `paidAt`; отозванный период не продлевает цепочку; `accessUntil` склеивает два смежных периода; `userSessionExpiry` при `until = null` даёт +30 дней, при `until` через 60 дней даёт `until + 7`; `accessState` отдаёт `active` даже при наличии ожидающего заказа; `formatRuDate(new Date('2026-12-18T21:30:00Z'))` → «19 декабря 2026».
- [ ] **Step 2: Run** `pnpm --filter @xstore/shared test`. Expected: FAIL.
- [ ] **Step 3: Implement** функции в `access.ts`, экспорт из `index.ts`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(billing): расчёт сроков доступа и сессий`

---

### Task 3: Пакет `@xstore/billing`: провайдер и применение платежа

**Files:**
- Create: `packages/billing/{package.json,tsconfig.json,vitest.config.ts}`, `packages/billing/src/{index,provider,fake-provider,apply-payment}.ts`
- Test: `packages/billing/src/fake-provider.test.ts`, `packages/billing/test/apply-payment.int.test.ts`

**Interfaces:**
- Consumes: Prisma-модели задачи 1, `nextWindow` задачи 2.
- Produces:
  - `interface PaymentProvider { name: string; createPayment(i: { orderId: string; amountRub: number; description: string; returnUrl: string; idempotencyKey: string }): Promise<{ providerPaymentId: string; redirectUrl: string }>; authenticateWebhook(headers: Record<string, string | undefined>, rawBody: Buffer): { providerPaymentId: string; eventKey: string }; getPayment(id: string): Promise<{ status: 'pending' | 'paid' | 'failed'; amountRub: number; currency: string; paidAt: Date | null }> }`
  - `createFakeProvider(redis: Redis, opts: { siteUrl: string; webhookSecret: string }): PaymentProvider & { setStatus(id: string, status: 'paid' | 'failed', paidAt?: Date): Promise<void> }` — платежи в Redis (`xs:fakepay:<id>`), `redirectUrl` = `${siteUrl}/dev/pay/<id>`, вебхук подписан HMAC-SHA256 `webhookSecret` в заголовке `x-fake-signature`.
  - `applyPayment(db: PrismaClient, provider: PaymentProvider, providerPaymentId: string, source: { kind: 'webhook' | 'reconcile' | 'return'; eventKey?: string; payload?: unknown }): Promise<{ result: 'granted' | 'already' | 'pending' | 'failed' | 'mismatch' | 'unknown_order'; orderId?: string; accessUntil?: Date }>` — в одной транзакции под `pg_advisory_xact_lock` по подписке: перечитать статус у провайдера, сверить сумму и валюту `RUB`, при `paid` впервые записать `paidAt` и одно `Entitlement` через `nextWindow`, записать `PaymentEvent` (если есть `eventKey`). Повторный вызов возвращает `already` без изменений.
- Решение: `paidAt` берётся от провайдера; если провайдер его не отдаёт, используется время первого подтверждения на сервере, сохранённое в `Order.paidAt`, и дальше не меняется.

- [ ] **Step 1: Write failing tests** — `apply-payment.int.test.ts`: `paid payment grants 30 days from provider paidAt`; `replayed webhook returns already and keeps dates`; `concurrent applyPayment calls create one entitlement` (`Promise.all` из 5 вызовов); `amount mismatch writes no rights and returns mismatch`; `failed status marks order failed`; `renewal starts after current period end`. `fake-provider.test.ts`: `same idempotencyKey returns same payment`; `webhook with wrong signature throws`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/billing test && pnpm --filter @xstore/billing test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** пакет по образцу `packages/ios` (только Node, сайт его не импортирует; правило Biome `noRestrictedImports` запрещает `@xstore/billing` в `apps/web`).
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(billing): провайдер оплаты и идемпотентное применение платежа`

---

### Task 4: API: заказ, вебхук, «Мой доступ»

**Files:**
- Create: `apps/api/src/billing/{billing.module,checkout.controller,webhooks.controller,access.controller,checkout.service,provider.provider}.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/config/config.ts`, `.env.example`, `packages/shared/src/client.ts`, `apps/api/src/auth/session.service.ts`
- Test: `apps/api/test/checkout.int.test.ts`, `apps/api/test/webhooks.int.test.ts`, `apps/api/src/config/config.test.ts`

**Interfaces:**
- Consumes: `applyPayment`, `createFakeProvider` (задача 3), `userSessionExpiry`, `accessUntil`, `accessState` (задача 2).
- Produces:
  - `GET /billing/plan` → `PlanView` активного тарифа или 404 `PLAN_UNAVAILABLE`. Публичный.
  - `POST /billing/checkout` body `checkoutRequestSchema` → `{ orderId, redirectUrl }`. Rate limit 10 за 10 минут по IP. Без сессии: создать `User { isProvisional: true, checkoutEmail }`, `Subscription`, `Order`, сессию `user` и cookie. С сессией покупателя: использовать его подписку (продление) или создать первую. Блокировка `pg_advisory_xact_lock(hashtext(checkoutKey))` до создания пользователя; повтор с тем же ключом и той же сессией возвращает тот же заказ; без сессии — 409 `CHECKOUT_IN_PROGRESS`. Если у подписки есть заказ `pending` моложе 24 часов — вернуть его `redirectUrl`, новый платёж не создаётся. `returnTo` проходит `safeNext`.
  - `GET /billing/orders/:id` → `OrderView`; только владелец, иначе 404. При `status = pending` сначала вызывает `applyPayment(..., { kind: 'return' })`.
  - `POST /billing/webhooks/:provider` → 204; сырое тело ≤ 64 КБ, Origin-исключение, `authenticateWebhook`, затем `applyPayment`. После `granted` — письмо «Оплата прошла» (задача 6).
  - `GET /access` → `{ state: AccessState, email: string | null, hasPassword: boolean }` для сессии покупателя; без сессии `{ state: { kind: 'none' } }`.
  - `SessionService.create/resolve` для `kind = user` берут срок из `userSessionExpiry(now, accessUntil(rights))`.
  - Config: `PAYMENT_PROVIDER` (`fake|platega`), `FAKE_PAYMENT_WEBHOOK_SECRET`; `fake` при `NODE_ENV=production` → ошибка конфигурации.

- [ ] **Step 1: Write failing tests** — `checkout.int.test.ts`: `guest checkout creates provisional user, order and session cookie`; `concurrent guest checkout creates one order` (два запроса с одним `checkoutKey` без cookie → один `Order`, один `User`, второй ответ 409); `checkout email is not a credential` (почта существующего подтверждённого пользователя → новый временный аккаунт, у существующего ни одной новой сессии); `pending order is reused instead of new payment`; `foreign order id returns 404`; `returnTo outside site is dropped`. `webhooks.int.test.ts`: `webhook paid grants access visible in GET /access`; `replayed webhook keeps dates`; `bad signature returns 401 and writes nothing`; `session expiry extends to access end plus 7 days after payment`. `config.test.ts`: `fake provider refused in production`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** модуль, клиентские методы `getPlan`, `checkout`, `getOrder`, `getAccess` в `packages/shared/src/client.ts`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(billing): оплата без регистрации и мгновенный доступ`

---

### Task 5: Воркер: сверка и истечение заказов

**Files:**
- Create: `apps/worker/src/billing/{reconcile,expire-orders}.ts`, `apps/worker/src/queues/billing.ts`
- Modify: `packages/shared/src/queues.ts` (`QueueName.billing`), `apps/worker/src/main.ts`, `apps/worker/src/deps.ts`
- Test: `apps/worker/test/billing.int.test.ts`

**Interfaces:**
- Consumes: `applyPayment`, провайдер (задача 3) — воркер создаёт его из тех же переменных окружения.
- Produces: повторяющиеся задачи `billing:reconcile` (каждые 5 минут: заказы `pending` старше 10 минут → `applyPayment(..., { kind: 'reconcile' })`) и `billing:expireOrders` (каждые 15 минут: `created`/`pending` старше 24 часов, у которых провайдер вернул `failed`, → `expired`; если провайдер говорит `pending`, заказ не трогаем и пишем предупреждение в лог).

- [ ] **Step 1: Write failing tests** — `reconcile grants access for missed webhook`; `reconcile and webhook together create one entitlement`; `order older than 24h with provider failed becomes expired`; `order older than 24h still pending at provider stays pending`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/worker test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** очереди и расписание через `upsertJobScheduler`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(billing): сверка зависших оплат`

---

### Task 6: Письма

**Files:**
- Create: `apps/api/src/mail/{mail.module,mail.service,templates}.ts`
- Modify: `apps/api/src/config/config.ts`, `.env.example`, `infra/docker-compose.dev.yml` (Mailpit `axllent/mailpit`, SMTP 127.0.0.1:1025, веб 127.0.0.1:8025), `.github/workflows/ci.yml` (сервис Mailpit в `integration` и `e2e`), `README.md`
- Test: `apps/api/src/mail/templates.test.ts`, `apps/api/test/mail.int.test.ts`

**Interfaces:**
- Produces: `MailService.send(template: 'payment_paid' | 'login_code', to: string, data: { until?: Date; code?: string }): Promise<void>` — `nodemailer` по `SMTP_URL`, отправитель `MAIL_FROM`; результат пишется в `NotificationLog` (код в лог не попадает). Ошибка отправки не роняет запрос: статус `failed` и строка в логе.
- Шаблоны: `payment_paid` — тема «Оплата прошла, доступ до <дата>», текст с датой и адресом сайта; `login_code` — тема «Код для входа», текст «Ваш код: <код>. Он действует 10 минут».

- [ ] **Step 1: Write failing tests** — `templates.test.ts`: тема `payment_paid` для `2026-12-18T12:00:00Z` — «Оплата прошла, доступ до 18 декабря 2026»; `login_code` содержит код и «10 минут». `mail.int.test.ts` (через API Mailpit `GET http://127.0.0.1:8025/api/v1/messages`): `payment webhook sends payment_paid mail`; `NotificationLog never stores the code`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** сервис, шаблоны, подключить вызов в вебхуке задачи 4.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mail): письма об оплате и коды входа`

---

### Task 7: Вход покупателя: пароль и код на почту

**Files:**
- Create: `apps/api/src/auth/{customer-auth.service,email-code.service,claim-provisional,customer-auth.controller}.ts`
- Modify: `apps/api/src/auth/auth.module.ts`, `packages/shared/src/auth.ts`, `packages/shared/src/client.ts`
- Test: `apps/api/test/customer-auth.int.test.ts`, `apps/api/src/auth/claim-provisional.test.ts`

**Interfaces:**
- Consumes: `MailService` (задача 6), `SessionService`, `hashPassword/verifyPassword`.
- Produces:
  - `POST /auth/password` `{ password }` — для текущей сессии покупателя задаёт `passwordHash`. 204.
  - `POST /auth/login` `{ email, password }` — кандидаты: подтверждённый пользователь `role = user` с этим `email` и временные аккаунты с `checkoutEmail = email` и паролем (не больше 5). Первый совпавший → новая сессия. Если кандидатов нет — всё равно одна проверка по фиктивному хешу. Ошибка `INVALID_CREDENTIALS`.
  - `POST /auth/code/request` `{ email }` → 204 всегда (не раскрывает, есть ли такая почта); код хранится SHA-256, письмо `login_code`.
  - `POST /auth/code/verify` `{ email, code }` → находит или создаёт подтверждённого `User { email }`, выполняет `claimProvisional`, отзывает сессии перенесённых временных аккаунтов, выдаёт новую сессию. Ошибка `CODE_INVALID`.
  - `claimProvisional(tx, verifiedUserId: string, email: string): Promise<{ moved: number }>` — под `pg_advisory_xact_lock(hashtext(email))` переносит подписки и заказы временных аккаунтов с `checkoutEmail = email` на подтверждённого пользователя, даты прав не меняются, временные аккаунты блокируются (`blockedAt`). Сотрудники и другие подтверждённые аккаунты не трогаются.
  - Восстановление пароля = вход кодом, затем `POST /auth/password`.

- [ ] **Step 1: Write failing tests** — `set password after payment then login with email and password`; `wrong password returns INVALID_CREDENTIALS`; `code login restores paid access with same dates`; `claim moves provisional purchases into verified account`; `claim never touches staff or another verified account`; `sixth wrong code attempt invalidates the code`; `code request for unknown email returns 204 and sends mail`; `old provisional session stops working after claim`; `password shorter than 8 returns WEAK_PASSWORD`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** сервисы и контроллер с лимитами из Global Constraints.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(auth): вход покупателя паролем и кодом на почту`

---

### Task 8: Web: мастер «Оплата» и страница тарифа

**Files:**
- Create: `apps/web/app/(site)/get/page.tsx`, `apps/web/app/(site)/get/[orderId]/page.tsx`, `apps/web/app/(site)/pricing/page.tsx`, `apps/web/app/dev/pay/[id]/page.tsx`, `apps/web/src/checkout/{Wizard,StepBar,PayStep,PaidStep,PasswordForm}.tsx`, `apps/web/src/checkout/wizard-step.ts`, `*.module.css`
- Test: `apps/web/src/checkout/wizard-step.test.ts`, `apps/web/src/checkout/PayStep.test.tsx`

**Interfaces:**
- Consumes: клиент `getPlan`, `checkout`, `getOrder`, `getAccess`; `POST /auth/password`.
- Produces:
  - `wizardStep(input: { order: OrderView | null; access: AccessState }): 'pay' | 'checking' | 'paid' | 'failed'`. `paid` — пока шаги 2–3 (Н2–Н4) не готовы, после блока «Доступ активен» показывается заглушка «Подключение iPhone появится в ближайшее время» (только для разработки, в прод веха не выходит).
  - `/get?app=<slug>`: строка шагов «1 Оплата · 2 iPhone · 3 Установка», иконка и название приложения, цена, «1 месяц», «для одного iPhone», «Подписка начнётся сразу после оплаты», поле почты, галочка «Согласен с условиями» (ссылка `/terms`), кнопка «Оплатить N ₽». `checkoutKey` = `crypto.randomUUID()` один раз на открытие страницы, хранится в `sessionStorage`. Действующего подписчика сразу ведёт в «Мой доступ» (в Н4 — на шаг установки).
  - `/get/[orderId]`: «Проверяем оплату…» с опросом `getOrder` раз в 2 секунды до 2 минут, затем «Доступ активен до <дата>» и форма «Придумайте пароль» (кнопка «Сохранить» и ссылка «Пропустить»).
  - `/pricing`: один тариф, что входит, кнопка «Оформить доступ» → `/get`.
  - `/dev/pay/[id]` (только при `XSTORE_DEV_PAGES=1`): кнопки «Оплатить» и «Отказать», серверный маршрут вызывает `setStatus` и отправляет вебхук; секрет в браузер не попадает.

- [ ] **Step 1: Write failing tests** — `wizardStep`: `pending order → checking`, `paid order → paid`, `failed order → failed`; `return before webhook shows checking state`. `PayStep.test.tsx`: кнопка неактивна без почты и галочки; текст кнопки «Оплатить 299 ₽» для цены 299; повторное нажатие отправляет тот же `checkoutKey`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** страницы по скиллу `xstore-design` (пилюли, токены, Manrope/Inter).
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): экран-мастер оплаты и страница тарифа`

---

### Task 9: Web: окно установки знает о доступе (после PR #17)

**Files:**
- Modify: компонент окна установки из PR #17, `apps/web/src/app-page/install-button-state.ts`
- Test: `apps/web/src/app-page/install-button-state.test.ts`

**Interfaces:**
- Consumes: `GET /access` (задача 4).
- Produces: `installButtonState(ctx: { device: 'ios' | 'desktop'; access: AccessState; app: { slug: string; latestVersion: { encrypted: boolean } | null } }): { kind: 'buy' | 'resume' | 'soon' | 'desktop' | 'unavailable'; label: string; href?: string; signinHref?: string }`. `none` → «Установить» на `/get?app=<slug>` и «Уже оплачивали? Войти»; `payment_pending` → «Продолжить оплату» на `/get/<orderId>`; `active` → «Скоро можно будет установить» (неактивна до Н2–Н4); компьютер без доступа → «Установить можно с iPhone или iPad» и «Оформить доступ».

- [ ] **Step 1: Write failing tests** на каждое состояние выше; `signinHref` возвращает на `/?app=<slug>`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** и подключить окно к `GET /access` (запрос с клиента после открытия окна, чтобы главная оставалась кэшируемой).
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): окно приложения учитывает оплаченный доступ`

---

### Task 10: Web: вход, «Мой доступ», шапка

**Files:**
- Create: `apps/web/app/(site)/signin/page.tsx`, `apps/web/app/(site)/access/page.tsx`, `apps/web/src/auth/{SigninForm,CodeForm}.tsx`, `apps/web/src/access/AccessCard.tsx`
- Modify: `apps/web/src/shell/{nav.ts,Header.tsx,MobileMenu.tsx}`
- Test: `apps/web/src/shell/nav.test.ts`, `apps/web/src/auth/SigninForm.test.tsx`, `apps/web/src/access/AccessCard.test.tsx`

**Interfaces:**
- Consumes: `POST /auth/login`, `/auth/code/*`, `/auth/password`, `/auth/logout`, `GET /access`.
- Produces:
  - `/signin?next=`: почта и пароль, кнопка «Войти»; ссылка «Войти по коду из письма» переключает на код (поле почты, «Получить код», поле кода, «Отправить код повторно» через 60 секунд). После входа — переход на `safeNext(next)` или `/access`.
  - `/access`: «Доступ активен до <дата>» или «Доступа нет» с кнопкой «Оформить доступ»; строка устройства «Устройство ещё не подключено» (Н1); кнопка «Продлить» → `/get`; «Задать пароль», если пароля нет; «Написать в поддержку» → `/support`; «Выйти». Работает на компьютере.
  - `navFor(state: { signedIn: boolean; hasAccess: boolean })`: гость — «Тарифы» и «Войти»; вошедший — «Мой доступ».

- [ ] **Step 1: Write failing tests** — `navFor` для гостя и вошедшего; `SigninForm` показывает «Неверная почта или пароль» на `INVALID_CREDENTIALS`; кнопка повторной отправки кода неактивна 60 секунд; `AccessCard` для `active` показывает «Доступ активен до 18 декабря 2026», для `none` — «Оформить доступ».
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test`. Expected: FAIL.
- [ ] **Step 3: Implement** страницы и шапку (шапка-пилюля по разделу 5 `2026-11-17-premium-ui-design.md`).
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): вход покупателя, «Мой доступ» и шапка`

---

### Task 11: Админка: тариф, заказы, ручная выдача

**Files:**
- Create: `apps/api/src/admin-billing/{admin-billing.module,plan.controller,orders.controller,grants.controller}.ts`, `apps/web/app/admin/(billing)/{plan,orders,subscriptions}/page.tsx`
- Modify: `apps/web/src/admin/AdminShell.tsx` (пункты «Тариф», «Заказы», «Подписки»)
- Test: `apps/api/test/admin-billing.int.test.ts`

**Interfaces:**
- Produces (все `@Roles('admin')`, аудит):
  - `GET/PATCH /admin/billing/plan` `{ title, priceRub, active }` — цена целая > 0; изменение не трогает оплаченные заказы (`planSnapshot`).
  - `GET /admin/billing/orders?email=&status=&cursor=` — почта, сумма, статус, `paidAt`, срок.
  - `GET /admin/billing/subscriptions?email=` — подписки, сроки, устройство.
  - `POST /admin/billing/grants` `{ email, days: 1..365, note }` — найти или создать подтверждённого пользователя с этой почтой, создать подписку (если нет) и `Entitlement` с `grantedById`, начало `max(now, конец текущего доступа)`.
  - `POST /admin/billing/orders/:id/refund` `{ note }` — отмечает возврат, сделанный в кабинете Platega: `status = refunded`, `revokedAt` у прав заказа. Деньги не двигает.

- [ ] **Step 1: Write failing tests** — `price change keeps paid order snapshot`; `grant 30 days creates entitlement with grantedById and audit`; `grant extends after current access end`; `refund revokes access visible in GET /access`; `support role gets 403`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test:int`. Expected: FAIL.
- [ ] **Step 3: Implement** API и страницы админки на существующих `DataTable`/`FormField`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): тариф, заказы, подписки и ручная выдача`

---

### Task 12: Адаптер Platega (когда будут документация и ключи)

**Files:**
- Create: `packages/billing/src/platega/{platega-provider,PLATEGA.md}.ts|md`, `packages/billing/test/fixtures/platega/*.json`
- Modify: `apps/api/src/billing/provider.provider.ts`, `apps/worker/src/deps.ts`, `.env.example` (`PLATEGA_BASE_URL`, `PLATEGA_MERCHANT_ID`, `PLATEGA_SECRET` — только в `.env`)
- Test: `packages/billing/src/platega/platega-provider.test.ts`

**Interfaces:**
- Produces: `createPlategaProvider(cfg): PaymentProvider` по контракту задачи 3.

- [ ] **Step 1: Записать в `PLATEGA.md`** из документации мерчанта: адреса, заголовки и подпись, создание платежа, статусы и их соответствие `pending|paid|failed`, где взять `paidAt`, повтор с тем же ключом, подпись вебхука, **есть ли рекуррентные платежи**. Обезличенные примеры ответов — в `fixtures`.
- [ ] **Step 2: Write failing tests** на примерах: точное тело и заголовки создания; разбор `paid` с `paidAt`; неверная подпись вебхука; тайм-аут создания не создаёт второй платёж с другим ключом.
- [ ] **Step 3: Run** `pnpm --filter @xstore/billing test`. Expected: FAIL.
- [ ] **Step 4: Implement** адаптер.
- [ ] **Step 5: Run the same command.** Expected: PASS.
- [ ] **Step 6: Отметить в спецификации v2 §6** итог по автопродлению (есть / нет) и согласовать с владельцем задачу автосписания в Н5.
- [ ] **Step 7: Commit** `feat(billing): адаптер Platega`

---

### Task 13: Проверка вехи

**Files:**
- Create: `apps/web/e2e/purchase-first-visit.spec.ts`, `apps/web/e2e/purchase-recovery.spec.ts`
- Test: эти файлы

- [ ] **Step 1: Write E2E** (WebKit, iPhone): `first visit: app window → /get → email → pay on fake page → access active → set password`; `renewal adds 30 days after current end` (вход, «Продлить», оплата, дата в «Мой доступ» сдвинулась на 30 дней); `lost cookie: clear cookies → signin by code from Mailpit → same date in Мой доступ`; `desktop: pay from computer, access page works`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test:e2e -- --trace off`. Expected: PASS.
- [ ] **Step 3: Полный набор** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Expected: всё зелёное (в облачной сессии e2e — в CI).
- [ ] **Step 4: Скриншоты** мастера, «Мой доступ», входа (iPhone и компьютер) в `/mnt/project-files/screenshots/<дата>-n1/`.
- [ ] **Step 5: Ревью** `superpowers:requesting-code-review`, независимое ревью Codex. PR сливается только по команде владельца.
