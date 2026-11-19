# Н3 «Сертификаты от поставщика» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключённое устройство живой подписки появляется в админке в разделе «Ждут сертификата» с почтой и UDID; владелец загружает присланные поставщиком `.p12`, пароль и `.mobileprovision`; сайт проверяет файлы, хранит их зашифрованными, делает устройство готовым и пишет покупателю. Отзыв и окончание срока воркер замечает сам и возвращает устройство в список.

**Architecture:** Новый Node-пакет `@xstore/signing` — чистый разбор и проверка `.p12` и `.mobileprovision` и запрос OCSP (без секретов в состоянии, без БД). `@xstore/secrets` переносится из ветки Codex и шифрует `.p12` и пароль мастер-ключом. Модуль `apps/api/src/apple` — единственное место API, где расшифровываются файлы; он принимает загрузку, ведёт `DeviceCertificate` и статус устройства, пишет аудит и письма. Воркер раз в 10 минут проверяет OCSP и сроки. Web админки — раздел `/admin/devices`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Next.js App Router, Zod, Vitest, Playwright; новое — `node-forge` 1.4.x (PKCS#12; та же версия, что в ветке Codex), уже есть `pkijs` 3.x + `asn1js` 3.x (CMS профиля, OCSP), `plist` 3.1.1.

**Spec:** [Сертификаты от поставщика](../specs/2026-11-19-certificate-supplier-design.md) (главный), [Xstore v2](../specs/2026-11-18-xstore-v2-design.md) §2, §4 шаг 2, §5, §10, §11. Порядок вех — [план v2](2026-11-18-v2-roadmap.md), Н3. Справочник: ветка `codex/m3-core-libraries` (`packages/secrets`), ревью `/mnt/project-files/reviews/2026-11-05-codex-m2-m3.md`.

## Global Constraints

- Все ограничения Н1 и Н2 действуют (ответы `{ code, message }`, тексты ошибок в `packages/shared/src/errors.ts`, Origin-проверка, аудит, даты Europe/Moscow, без Tailwind, вёрстка по скиллу `xstore-design`).
- Исключение из правила Н2 «UDID в админке только маской»: полный UDID показывается только роли `admin` в списке «Ждут сертификата» и на карточке устройства. В логах, аудите и письмах — только `maskUdid`.
- `.p12` и пароль хранятся только как строки `encryptSecret` (AES-256-GCM, формат `v<версия>.<iv>.<tag>.<данные>`). В логах, аудите, ответах API и ошибках их нет ни в каком виде. `decryptSecret` импортируется только в `apps/api/src/apple/**` и `apps/worker/src/**` — правило Biome.
- Размеры: `.p12` ≤ 50 КБ, `.mobileprovision` ≤ 1 МБ, пароль 0–128 символов. Тело запроса загрузки ≤ 1,5 МБ (JSON с base64), только на этом маршруте.
- Профиль принимается, только если CMS-подпись профиля проверяется до Apple Root CA (`apps/api/src/enrollment/apple-root-ca.pem`, переносится в `@xstore/signing`); тестовый корень — только при `NODE_ENV !== 'production'` через `SIGNING_TEST_ANCHOR_PATH`.
- Минимальный остаток срока при загрузке — 1 день (`min(certNotAfter, profileExpiresAt) > now + 24 ч`). Предупреждение «истекает» — за 7 дней.
- Статусы устройства: `pending` — файлов не было ни разу; `active` — есть `DeviceCertificate` со статусом `active`; `processing` — файлы были, но действующих нет (отозван, истёк, удалён). Тексты для покупателя: `pending` — «Готовим ваш iPhone, обычно до 24 часов»; `processing` — «Обновляем доступ, обычно до 24 часов»; `active` — «iPhone готов». На iPad «iPad» вместо «iPhone».
- Покупателю не показываются слова «сертификат», «профиль», «UDID», «поставщик».
- Письма покупателю: первая загрузка — `device_ready` «iPhone готов, можно ставить»; любая следующая загрузка для того же устройства — `reinstall_apps` «Переустановите приложения». При отзыве и окончании срока письмо не уходит.
- «Живая подписка» = у `Subscription` с этим `deviceId` есть `Entitlement` с `startsAt ≤ now < expiresAt` и `revokedAt = null`.
- OCSP раз в 10 минут, один запрос на уникальный `certSha1`, таймаут 10 с; неответ или ошибка ничего не меняют, пишутся в журнал задач.

## Review Focus

1. **Поставщик прислал файлы для другого UDID** (опечатка при копировании) — отказ «В профиле нет этого iPhone…», ничего не сохранено → задача 2, тест `profile without this udid is refused`; задача 5, тест `refused upload leaves device pending`.
2. **Владелец загружает файлы второй раз** (замена по гарантии или исправление) — старая запись `replaced`, ровно одна `active`, письмо `reinstall_apps` → задача 5, тест `second upload replaces and sends reinstall mail`.
3. **Один `.p12` поставщика у многих устройств отозван** — все их записи `revoked`, все устройства `processing`, OCSP запрошен один раз → задача 7, тест `one revoked certificate flips every device using it`.
4. **Пароль с кириллицей, пробелами или пустой** — проверяется как есть, без обрезки → задача 2, тест `password is used verbatim`.
5. **Подписка закончилась, пока устройство ждало** — устройство пропадает из списка, загрузка отклоняется `NO_ACCESS` → задача 5, тест `device without live subscription is not listed and refuses upload`.

---

### Task 1: `@xstore/secrets` в main и запрет расшифровки вне `apple` и воркера

**Files:**
- Create: `packages/secrets/**` — перенос из `origin/codex/m3-core-libraries` (`src/encrypt.ts`, `decrypt.ts`, `keyring.ts`, `errors.ts`, `index.ts`, `secrets.test.ts`, `package.json`, `tsconfig*.json`, `vitest.config.ts`, `README.md`)
- Modify: `packages/secrets/package.json` (экспорт `./decrypt` отдельно от `.`), `biome.json` (override), `.env.example`, `pnpm-lock.yaml`, `apps/api/src/config/*`, `apps/worker/src/config.ts`, логгеры pino API и воркера
- Test: `packages/secrets/src/secrets.test.ts`, `apps/api/test/redaction.int.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: Buffer | string, keyring: Keyring): string`, `loadKeyring(env): Keyring` из `@xstore/secrets`; `decryptSecret(blob: string, keyring: Keyring): Buffer` только из `@xstore/secrets/decrypt`.

- [ ] **Step 1:** Перенести пакет из ветки Codex (`git checkout origin/codex/m3-core-libraries -- packages/secrets`), перенести импорты в начало файлов (ревью, п. 10), `pnpm install` — lockfile обновлён.
- [ ] **Step 2:** Run `pnpm --filter @xstore/secrets test` — Expected: 26 passed.
- [ ] **Step 3: Red check.** Временный файл `apps/api/src/admin-billing/tmp-decrypt.ts` с `import { decryptSecret } from '@xstore/secrets/decrypt'`; Run `pnpm lint` — сейчас проходит, хотя должен падать.
- [ ] **Step 4:** В `biome.json` запретить `@xstore/secrets/decrypt` («Расшифровка ключей только в модуле apple и воркере») везде, кроме override для `apps/api/src/apple/**` и `apps/worker/src/**`. Run `pnpm lint` — Expected: FAIL `noRestrictedImports` на временном файле; удалить файл, `pnpm lint` — PASS.
- [ ] **Step 5: Failing test** `apps/api/test/redaction.int.test.ts`: `it('never logs password, p12 or encrypted blobs')` — запрос к `POST /api/v1/admin/devices/x/certificate` с телом `{ password: 'секрет-123', p12: 'QUJD', profile: 'REVG' }` и ловушкой логов; `expect(logs).not.toContain('секрет-123')`, `not.toContain('QUJD')`.
- [ ] **Step 6:** `redact` в pino API и воркера: пути `req.body.password`, `req.body.p12`, `req.body.profile`, `*.p12Enc`, `*.p12PasswordEnc`, `*.password`. `MASTER_KEY_CURRENT=1`, `MASTER_KEY_V1=<base64 32 байта>` в `.env.example` с комментарием «openssl rand -base64 32», в конфиг API и воркера (обязательны при `NODE_ENV=production`). Run тест шага 5 — PASS.
- [ ] **Step 7:** Commit `feat(secrets): шифрование мастер-ключом, расшифровка только в apple и воркере`.

### Task 2: `@xstore/signing` — разбор и проверка файлов поставщика

**Files:**
- Create: `packages/signing/package.json` (только Node, `browser: null`), `src/index.ts`, `src/p12.ts`, `src/profile.ts`, `src/validate.ts`, `src/apple-root-ca.pem` (перенос из `apps/api/src/enrollment/`, enrollment импортирует отсюда), `test/fixtures.ts`
- Modify: `biome.json` (`@xstore/signing` запрещён в `apps/web`)
- Test: `src/p12.test.ts`, `src/profile.test.ts`, `src/validate.test.ts`

**Interfaces:**
- Produces:
  - `parseP12(p12: Buffer, password: string): { certificate: X509Certificate; privateKeyPem: string; chain: X509Certificate[] }` — бросает `SigningError('P12_INVALID')`.
  - `parseMobileProvision(data: Buffer, anchors: X509Certificate[]): MobileProvision` — бросает `SigningError('PROFILE_INVALID')`; `type MobileProvision = { uuid: string; teamId: string; appIdPattern: string; devices: string[]; allDevices: boolean; developerCertSha1: string[]; expiresAt: Date }`.
  - `checkKit(input: { p12: ParsedP12; profile: MobileProvision; udid: string; now: Date }): KitFacts` — бросает `SigningError(code)`; `type KitFacts = { teamId; profileUuid; appIdPattern; certSerial; certSha1; certNotAfter: Date; profileExpiresAt: Date }`.
  - `SigningErrorCode = 'P12_INVALID' | 'PROFILE_INVALID' | 'UDID_NOT_IN_PROFILE' | 'CERT_NOT_IN_PROFILE' | 'KIT_EXPIRED' | 'NOT_WILDCARD' | 'ALL_DEVICES_PROFILE' | 'CERT_REVOKED'`.
  - `test/fixtures.ts`: `makeKit(opts?: { udids?: string[]; appId?: string; allDevices?: boolean; notAfter?: Date; otherCert?: boolean }): { p12: Buffer; password: string; profile: Buffer; anchor: X509Certificate; issuer: X509Certificate }` — тестовый корень → «WWDR» → сертификат разработчика, профиль — plist в CMS, подписанной тестовым корнем. Экспортируется как `@xstore/signing/testing`.

- [ ] **Step 1: Failing tests** `validate.test.ts`, по одному `it` на строку таблицы спецификации §5.2:
  - `valid kit gives facts` — `checkKit(...)` возвращает `teamId: 'TEAM123456'`, `appIdPattern: 'TEAM123456.*'`, `certSha1` = sha1 сертификата из `.p12`.
  - `wrong password` → `P12_INVALID`; `password is used verbatim` — `makeKit` с паролем `' пароль 1 '` открывается ровно им и не открывается `'пароль 1'`; пустой пароль работает.
  - `profile without this udid is refused` → `UDID_NOT_IN_PROFILE` (UDID сравнивается без учёта регистра).
  - `cert from another order` (`otherCert: true`) → `CERT_NOT_IN_PROFILE`.
  - `expires within a day` (`notAfter = now + 23 ч`) → `KIT_EXPIRED`.
  - `explicit app id` (`appId: 'TEAM123456.ru.app'`) → `NOT_WILDCARD`.
  - `ProvisionsAllDevices` → `ALL_DEVICES_PROFILE`.
  - `profile not signed by an anchor` / `garbage bytes` → `PROFILE_INVALID`.
- [ ] **Step 2:** Run `pnpm --filter @xstore/signing test` — Expected: FAIL (модули не существуют).
- [ ] **Step 3:** Реализовать `p12.ts` на `node-forge` (`pkcs12FromAsn1` с паролем как есть; ключ → PEM PKCS#8), `profile.ts` на `pkijs` (`SignedData.verify` с `trustedCerts = anchors`, `checkChain: true`; содержимое — XML plist через `plist`), `validate.ts` — проверки в порядке таблицы спецификации, первая неудачная бросает свой код.
- [ ] **Step 4:** Run `pnpm --filter @xstore/signing test` — PASS; `pnpm --filter @xstore/api test enrollment` — PASS (новый путь к Apple Root CA).
- [ ] **Step 5:** Commit `feat(signing): проверка .p12 и .mobileprovision от поставщика`.

### Task 3: OCSP

**Files:**
- Create: `packages/signing/src/ocsp.ts`, `src/wwdr/*.pem` (публичные Apple WWDR G3–G6 с https://www.apple.com/certificateauthority/), `src/issuers.ts`
- Test: `src/ocsp.test.ts`

**Interfaces:**
- Produces: `checkRevocation(cert: X509Certificate, issuer: X509Certificate, fetchFn?: typeof fetch): Promise<'good' | 'revoked' | 'unknown'>`; `findIssuer(cert: X509Certificate, chain: X509Certificate[]): X509Certificate | null` (сначала цепочка из `.p12`, затем WWDR). URL ответчика — из AIA сертификата; без AIA → `'unknown'`.

- [ ] **Step 1: Failing tests:** `good response` → `'good'`; `revoked response` → `'revoked'`; `timeout after 10 s` (`vi.useFakeTimers`, fetch не отвечает) → `'unknown'`; `response signed by a stranger` → `'unknown'`; `findIssuer prefers chain, falls back to WWDR`. Ответы OCSP строит `test/fixtures.ts` (`makeOcspResponse(status, signer)`).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Реализовать на `pkijs` (`OCSPRequest` SHA-1 CertID, POST `application/ocsp-request`, проверка подписи ответа издателем или делегатом издателя).
- [ ] **Step 4:** Run `pnpm --filter @xstore/signing test` — PASS.
- [ ] **Step 5:** Commit `feat(signing): проверка отзыва сертификата по OCSP`.

### Task 4: Модель `DeviceCertificate`, статусы и письма

**Files:**
- Modify: `packages/db/prisma/schema.prisma`, новая миграция `packages/db/prisma/migrations/<ts>_device_certificate/`, `packages/shared/src/devices.ts`, `packages/shared/src/access.ts`, `packages/mail/src/templates.ts`
- Test: `packages/shared/src/devices.test.ts`, `packages/shared/src/access.test.ts`, `packages/mail/src/templates.test.ts`

**Interfaces:**
- Produces:
  - `model DeviceCertificate { id cuid; deviceId → Device (onDelete: Cascade); status DeviceCertificateStatus @default(active); p12Enc String; p12PasswordEnc String; profile Bytes; profileUuid String; teamId String; appIdPattern String; certSerial String; certSha1 String; certNotAfter DateTime; profileExpiresAt DateTime; uploadedById String → User; createdAt; endedAt DateTime? }`, `enum DeviceCertificateStatus { active replaced revoked expired deleted }`; индексы `@@index([certSha1, status])`, `@@index([deviceId, createdAt])`; частичный уникальный индекс SQL `CREATE UNIQUE INDEX device_certificate_one_active ON "DeviceCertificate"("deviceId") WHERE status = 'active'`.
  - `deviceStatusLabel.processing = 'Обновляем доступ, обычно до 24 часов'`.
  - `MailTemplate` += `'device_ready' | 'reinstall_apps' | 'admin_device_waiting'`.

- [ ] **Step 1: Failing tests:**
  - `devices.test.ts`: `processing reads «Обновляем доступ»` — `deviceStatusText('processing', 'ipad')` = `'Обновляем доступ, обычно до 24 часов'`; `pending` без изменений.
  - `access.test.ts`: `processing is not ready and needs no help` → `{ ready: false, needsHelp: false }`.
  - `templates.test.ts`: `device_ready` — тема `iPhone готов, можно ставить`, текст содержит адрес сайта и не содержит `UDID`, `сертификат`; `device_ready` с `family: 'ipad'` — «iPad»; `reinstall_apps` — тема `Переустановите приложения`, текст «Мы обновили доступ. Откройте сайт в Safari на iPhone и установите приложения заново.»; `admin_device_waiting` — тема `Новый iPhone ждёт сертификата`, текст содержит почту покупателя, `<SITE_URL>/admin/devices`, не содержит UDID.
- [ ] **Step 2:** Run `pnpm --filter @xstore/shared --filter @xstore/mail test` — FAIL.
- [ ] **Step 3:** Модель, миграция (`pnpm db:migrate`), тексты, шаблоны (`MailData` += `family?: DeviceFamily; buyerEmail?: string`).
- [ ] **Step 4:** Run те же тесты и `pnpm typecheck` — PASS.
- [ ] **Step 5:** Commit `feat(db): DeviceCertificate, статус «Обновляем доступ», письма о готовности`.

### Task 5: API: модуль `apple` — список, загрузка, удаление

**Files:**
- Create: `apps/api/src/apple/apple.module.ts`, `device-certificates.service.ts`, `device-certificates.controller.ts`, `anchors.ts`
- Modify: `apps/api/src/app.ts` (JSON-парсер 1,5 МБ только для `POST /api/v1/admin/devices/:id/certificate`, до общего), `apps/api/src/app.module.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/admin-devices.ts` (схемы и типы), `apps/api/src/enrollment/enrollment.service.ts` (письмо владельцу)
- Test: `apps/api/test/admin-devices.int.test.ts`

**Interfaces:**
- Consumes: `parseP12`, `parseMobileProvision`, `checkKit`, `checkRevocation`, `findIssuer`, `makeKit` (задачи 2–3); `encryptSecret`, `decryptSecret` (задача 1); `DeviceCertificate` (задача 4).
- Produces (все `@Roles('admin')`, префикс `/api/v1/admin/devices`):
  - `GET /waiting` → `WaitingDevice[]`: `{ id; email; model; family; udid (полный); reason: 'new' | 'revoked' | 'expired' | 'deleted' | 'expiring'; since: string (ISO: время привязки или `endedAt`); expiresAt?: string; overdue: boolean (> 24 ч) }`, сортировка по `since` по возрастанию. `expiring` — `active` с `min(certNotAfter, profileExpiresAt) < now + 7 дней`.
  - `GET /:id` → `DeviceCard`: поля `WaitingDevice` + `status` + `certificates: { id; status; teamId; certSerial; certNotAfter; profileExpiresAt; createdAt; endedAt }[]` (без `p12Enc`, `p12PasswordEnc`, `profile`).
  - `GET /waiting/count` → `{ count: number }` (без `expiring`).
  - `POST /:id/certificate` body `{ p12: base64; password: string; profile: base64 }` → `201 DeviceCard`; ошибки `422 { code }` с кодами задачи 2, `NO_ACCESS` (нет живой подписки), `404 NOT_FOUND`.
  - `DELETE /:id/certificate` → `200 DeviceCard`; `active` → `deleted`, устройство `processing`.
  - `ErrorCode` += коды задачи 2 с текстами спецификации §5.2 дословно; `UDID_NOT_IN_PROFILE`: «В профиле нет этого iPhone. Проверьте, что поставщику отправлен UDID <маска>».

- [ ] **Step 1: Failing tests** (`admin-devices.int.test.ts`, фикстуры `makeKit`, якорь — тестовый корень через `SIGNING_TEST_ANCHOR_PATH`, OCSP — подменённый `fetch` с `'good'`):
  - `waiting lists a newly bound device with full udid` — после привязки (хелпер из `enrollment.int.test.ts`) `GET /waiting` содержит `{ udid, email, reason: 'new', overdue: false }`.
  - `overdue after 24 h` — `since` 25 ч назад → `overdue: true`.
  - `upload makes device ready and mails buyer` — `POST` → 201, устройство `active`, одна запись `active`, в Mailpit письмо `iPhone готов, можно ставить`, в аудите `device.certificate.upload` с `certSerial` и маской UDID; в строке БД `p12Enc` начинается с `v1.` и не равен base64 исходника.
  - `refused upload leaves device pending` — чужой UDID → 422 `UDID_NOT_IN_PROFILE`, записей нет, статус `pending`, писем нет.
  - `second upload replaces and sends reinstall mail` — две загрузки → статусы `[replaced, active]`, письмо `Переустановите приложения`.
  - `revoked at upload is refused` — OCSP `'revoked'` → 422 `CERT_REVOKED`.
  - `device without live subscription is not listed and refuses upload` — право истекло → нет в `/waiting`, `POST` → 422 `NO_ACCESS`.
  - `delete returns device to the list` — `DELETE` → `deleted`, статус `processing`, в `/waiting` `reason: 'deleted'`.
  - `support role is forbidden` → 403 на все маршруты; `body over 1.5 MB` → 413.
  - `owner gets a mail about a new device when ADMIN_NOTIFY_EMAIL is set` — привязка → письмо `Новый iPhone ждёт сертификата`; без переменной писем нет.
- [ ] **Step 2:** Run `pnpm --filter @xstore/api exec vitest run test/admin-devices.int.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать. Загрузка в одной транзакции под `SELECT … FOR UPDATE` устройства: проверка живой подписки, `checkKit`, OCSP (`'unknown'` не мешает загрузке), прежняя `active` → `replaced` с `endedAt`, новая `active`, устройство `active`; письмо и аудит — после коммита, их ошибки логируются и не откатывают загрузку (как в `checkout.service.ts`). Письмо `device_ready`, если у устройства раньше не было записей, иначе `reinstall_apps`. Сброс кэша подписанных сборок не нужен: в Н4 ключ кэша — `DeviceCertificate.id`.
- [ ] **Step 4:** Run тест шага 2 — PASS; `pnpm --filter @xstore/api test` — PASS.
- [ ] **Step 5:** Commit `feat(api): загрузка сертификатов поставщика в админке`.

### Task 6: Web админки «Ждут сертификата»

**Files:**
- Create: `apps/web/app/admin/(devices)/devices/page.tsx`, `apps/web/app/admin/(devices)/devices/[id]/page.tsx`, `apps/web/src/admin/WaitingDevices.tsx`, `apps/web/src/admin/CertificateUpload.tsx`
- Modify: `apps/web/src/admin/AdminShell.tsx` (пункт «Ждут сертификата» со счётчиком из `/waiting/count`), `apps/web/src/admin/admin.module.css`
- Test: `apps/web/src/admin/WaitingDevices.test.tsx`, `CertificateUpload.test.tsx`, `apps/web/e2e/admin-devices.spec.ts`

**Interfaces:**
- Consumes: маршруты задачи 5, `DataTable`, `FormField`.

- [ ] **Step 1: Failing tests:**
  - `WaitingDevices`: строка показывает почту, модель, UDID, причину по-русски (`new` «Новое», `revoked` «Отозван», `expired` «Истёк», `deleted` «Удалён», `expiring` «Истекает через N дн.»), «ждёт 25 ч» с классом подсветки при `overdue`; кнопка «Скопировать» вызывает `navigator.clipboard.writeText(udid)` и меняет подпись на «Скопировано» на 2 с; ссылка «Загрузить сертификат» ведёт на `/admin/devices/<id>`.
  - `CertificateUpload`: поля «Файл .p12», «Пароль», «Файл .mobileprovision»; без файлов кнопка «Загрузить» неактивна; ответ 422 показывает текст ошибки над формой; файл больше лимита отклоняется до отправки с текстом «Файл слишком большой»; при успехе — «Сертификат загружен, покупателю отправлено письмо» и история обновлена.
  - E2E `admin-devices.spec.ts`: админ входит, видит подключённое тестовое устройство в списке, загружает `makeKit` (файлы пишет `global-setup`), строка исчезает, на карточке статус «Готов».
- [ ] **Step 2:** Run `pnpm --filter @xstore/web test admin` — FAIL.
- [ ] **Step 3:** Реализовать по `xstore-design`; файлы читаются `FileReader` в base64 в браузере, пароль — `type="password"`, `autocomplete="off"`. Пустой список — «Все устройства готовы».
- [ ] **Step 4:** Run юнит-тесты и `pnpm --filter @xstore/web exec playwright test admin-devices --trace off` — PASS. Скриншоты 390 и 1280 в `/mnt/project-files/screenshots/2026-11-19-n3/`.
- [ ] **Step 5:** Commit `feat(admin): раздел «Ждут сертификата» и загрузка файлов`.

### Task 7: Воркер: отзыв и окончание срока

**Files:**
- Create: `apps/worker/src/certificates/check.ts`, `apps/worker/src/queues/certificates.ts`
- Modify: `packages/shared/src/queues.ts` (`QueueName.certificates`), `apps/worker/src/main.ts` (повторяемая задача `check` каждые 10 минут, `jobId` фиксированный)
- Test: `apps/worker/src/certificates/check.test.ts`, `apps/worker/test/certificates.int.test.ts`

**Interfaces:**
- Consumes: `checkRevocation`, `findIssuer` (задача 3), `decryptSecret` + `parseP12` (для цепочки издателя), `DeviceCertificate`.
- Produces: `runCertificateCheck(deps: { prisma; keyring; fetchFn; now: Date; log }): Promise<{ checked: number; revoked: number; expired: number; unknown: number }>`.

- [ ] **Step 1: Failing tests** (int, фикстуры `makeKit` + `makeOcspResponse`):
  - `one revoked certificate flips every device using it` — три устройства с одним `.p12`; OCSP `'revoked'` → все три записи `revoked` с `endedAt`, устройства `processing`, `fetchFn` вызван 1 раз.
  - `expired kit` — `profileExpiresAt < now` → `expired`, устройство `processing`, OCSP не вызывается.
  - `unknown changes nothing` — fetch бросает → статусы прежние, `unknown: 1`, в логе `certSha1` без секретов.
  - `no mail on revoke` — писем нет.
- [ ] **Step 2:** Run `pnpm --filter @xstore/worker exec vitest run certificates` — FAIL.
- [ ] **Step 3:** Реализовать: выбрать `active`, сгруппировать по `certSha1`, сначала сроки, потом OCSP по группе; обновление статусов — `updateMany` по `certSha1` и `status: 'active'` (гонка с новой загрузкой не затирает свежую запись, у неё другой `certSha1` или она загружена после — проверка `createdAt <= startedAt`).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(worker): отзыв и окончание срока сертификатов поставщика`.

### Task 8: Сквозная проверка и реальный iPhone

**Files:**
- Modify: `apps/web/e2e/connect-iphone.spec.ts` (сценарий 1 v2 §12 до «iPhone готов»), `README.md` (раздел «Сертификаты поставщика»: переменные, тестовый корень), `CLAUDE.md` (команды и переменные Н3)
- Create: `docs/superpowers/plans/2026-11-19-n3-real-iphone-check.md` (чек-лист ручной проверки)

- [ ] **Step 1: Failing E2E:** `ready after admin upload` — покупатель подключил iPhone → «Готовим ваш iPhone, обычно до 24 часов»; админ загружает файлы (API-хелпер) → после перезагрузки `/access` и окно приложения показывают «iPhone готов»; отзыв (вызов `runCertificateCheck` через тестовый маршрут воркера или прямой update) → «Обновляем доступ, обычно до 24 часов».
- [ ] **Step 2:** Run `pnpm --filter @xstore/web exec playwright test connect-iphone --trace off` — FAIL, затем исправить недостающее — PASS.
- [ ] **Step 3:** Полный набор: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e` — всё зелёное, вывод в PR.
- [ ] **Step 4:** Ручная проверка с владельцем (чек-лист): подключить iPhone владельца на VPS → UDID в админке → файлы поставщика → «iPhone готов» и письмо. Установка приложений — в Н4.
- [ ] **Step 5:** Commit `test(e2e): готовность iPhone после загрузки сертификата`, PR, ревью Codex, слияние по команде владельца.

## Не входит в Н3

- Подпись и установка (Н4); кэш подписанных сборок будет ключиться по `DeviceCertificate.id`.
- CLI ротации мастер-ключа (`secrets:rotate`) — до запуска, в Н6.
- Обмен с поставщиком по API, Telegram-уведомления владельцу.
