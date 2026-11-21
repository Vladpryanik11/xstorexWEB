# Н4 «Подпись и установка из Safari» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Покупатель с готовым iPhone жмёт «Установить» у любого приложения каталога; воркер подписывает IPA файлами поставщика этого устройства (zsign), кнопка показывает анимацию по этапам, затем Safari открывает `itms-services://`, и iOS ставит приложение.

**Architecture:** Новые модели `SigningJob`, `SignedBuild`, `InstallToken`. Воркер: очередь `signing` (расшифровка `.p12` → PEM-файлы → zsign с лимитами → потоковая многочастная загрузка в бакет `signed`), очередь `maintenance` (уборка копий раз в час). API: модуль `install` (запрос установки, состояние задачи для опроса, токен, манифест). Н3 при замене/отзыве/удалении файлов удаляет копии устройства. Web: кнопка-круг в окне приложения и на шаге 3 мастера; админка — раздел «Подпись».

**Tech Stack:** как Н3 + `@aws-sdk/lib-storage` (многочастная загрузка), zsign v1.1.3 (уже в образе воркера), `prlimit` (util-linux в `node:24-bookworm-slim`).

**Spec:** [Н4 дизайн](../specs/2026-11-21-n4-signing-install-design.md) (главный), [поставщик](../specs/2026-11-19-certificate-supplier-design.md) §7–8, [v2](../specs/2026-11-18-xstore-v2-design.md) §3.2, §4, §8, §12. Справочник: [план M4 v1](2026-11-05-m4-signing-install.md).

## Global Constraints

- Все ограничения Н1–Н3 действуют (ответы `{ code, message }`, тексты ошибок в `packages/shared/src/errors.ts`, Origin-проверка, аудит, без Tailwind, вёрстка по скиллу `xstore-design`, покупателю не показываются слова «сертификат», «профиль», «UDID», «поставщик» — кроме строки этапа «Подписываем сертификатом вашего iPhone», согласованной владельцем 21.11).
- `decryptSecret` по-прежнему только в `apps/api/src/apple/**` и `apps/worker/src/**`. В модуле `install` API расшифровки нет.
- zsign получает одноразовую перепаковку `.p12` (`packP12`, AES-256, случайный пароль) — пароль поставщика в argv и env не попадает. Файлы `0600` во временной папке задачи (`-t` zsign тоже в ней); папка удаляется в `finally`.
- Лимиты (env воркера): `SIGNING_TIMEOUT_MS=600000`, `SIGNING_MEMORY_MB=2048`, `SIGNING_CPU_SEC=900`, `ZSIGN_BIN=/usr/local/bin/zsign`. Свободное место перед скачиванием ≥ 2,5 × `sizeBytes`.
- Ключ кэша и id задачи очереди: `sign-<appVersionId>-<deviceCertificateId>` (в id задач BullMQ нельзя `:`).
- `Bundle ID` при подписи: `appIdPattern` вида `<TEAM>.*` → не меняется; иначе → `appIdPattern` без префикса `<TEAM>.`.
- Этапы `SigningJob.stage`: `queued` → `downloading` → `signing` → `uploading` → `ready` | `failed`. Сайт опрашивает `GET /install/jobs/:id` раз в секунду.
- Токен установки: 32 случайных байта base64url, в базе SHA-256, срок 1 час, привязан к пользователю и устройству. Повтор манифеста с того же IP + User-Agent в течение 120 с — тот же манифест, иначе 410 `INSTALL_LINK_USED`; просрочен — 410 `INSTALL_LINK_EXPIRED`.
- Ссылка на IPA в манифесте — presigned на 15 минут через `S3_PUBLIC_URL`.
- Уборка: `signing.cacheTtlDays` = 3, `signing.cacheMaxGb` = 10 (`Setting`), раз в час; копии с живым неиспользованным токеном не трогаем.

## Review Focus

1. **Профиль на одно приложение:** `Bundle ID` подменяется на App ID профиля, окно предупреждает «заменит „…“» → задача 1 тест `explicit app id replaces bundle id`, задача 6 тест `warns before replacing the previous app`.
2. **Двойное нажатие:** вторая просьба присоединяется к идущей задаче, zsign один → задача 5 тест `second request joins the running job`.
3. **zsign завис или съел память:** убит по лимиту, `failed` `SIGNING_FAILED`, папка удалена → задача 2 тесты `kills on timeout`, `cleans up`.
4. **Файлы устройства заменили во время/после подписи:** старые копии удалены, новая установка подписывает заново → задача 4 тест `replacing device files drops its builds`.
5. **iOS запрашивает манифест дважды** → задача 5 тесты `refetch within the window`, `used link is gone`.

---

### Task 1: Модель данных и общие правила

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ миграция `n4_signing`), `packages/shared/src/errors.ts`, `packages/shared/src/queues.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/install.ts`, `packages/shared/src/manifest.ts`
- Test: `packages/shared/src/install.test.ts`, `packages/shared/src/manifest.test.ts`

**Interfaces:**
- Prisma: `enum SigningStage { queued downloading signing uploading ready failed }`; `SigningJob { id; userId; deviceId; appVersionId; deviceCertificateId; queueJobId; stage @default(queued); errorCode String?; signedBuildId String?; createdAt; finishedAt? }`; `SignedBuild { id; appVersionId; deviceCertificateId; key; sizeBytes BigInt; bundleId; createdAt; lastUsedAt; @@unique([appVersionId, deviceCertificateId]) }`; `InstallToken { tokenHash @id; userId; deviceId; signedBuildId; appVersionId; expiresAt; usedAt?; usedIp?; usedUa? }`.
- `@xstore/shared`: `signingBundleId(appIdPattern, bundleId): string`; `profileKind(appIdPattern): 'all' | 'single'`; `canInstall({ device, certificate, app, version, family, now })` → `{ ok: true } | { ok: false; reason: 'DEVICE_NOT_READY' | 'APP_NOT_AVAILABLE' | 'WRONG_DEVICE' }`; `stageProgress(stage)` → `{ from, to }` для круга; `buildManifest({ ipaUrl, icon57Url?, icon512Url?, bundleId, bundleVersion, title })`; `signingJob` (zod `{ signingJobId }`), `QueueName.signing`, `QueueName.maintenance`; коды `SIGNING_FAILED`, `INSTALL_LINK_USED`, `INSTALL_LINK_EXPIRED`, `DEVICE_NOT_READY`, `APP_NOT_AVAILABLE`, `WRONG_DEVICE`.

- [ ] **Step 1:** падающие тесты: `wildcard keeps bundle id`, `explicit app id replaces bundle id`, `ready device installs`, `iPad-only app on iPhone is refused`, `encrypted version is not available`, `escapes the title`, `lists the three assets`, `stages fill the ring in order`.
- [ ] **Step 2:** запустить, FAIL.
- [ ] **Step 3:** реализовать, `prisma migrate dev --name n4_signing`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(signing): Н4 data model, install rules and OTA manifest`.

### Task 2: zsign: запуск с лимитами

**Files:**
- Create: `apps/worker/src/signing/{zsign,identity-files,disk,temp}.ts`, тесты рядом.
- Modify: `apps/worker/src/config.ts` (лимиты, `ZSIGN_BIN`), `apps/worker/Dockerfile` (`util-linux` для `prlimit`, если его нет в образе).

**Interfaces:**
- `writeIdentityFiles(dir, privateKeyPem, certificatePem, profile)` → `{ keyPath, certPath, profilePath }`, права `0600`.
- `runZsign({ zsignBin, input, output, keyPath, certPath, profilePath, bundleId?, timeoutMs, memoryMb, cpuSec })` — `prlimit --as=… --cpu=… -- zsign -k -c -m -o -z 1 [-b] input`; SIGKILL по времени; ненулевой код → `ZsignError` (хвост stderr 2 КБ, без путей ключей).
- `ensureFreeSpace(dir, bytes)` → `DiskFullError`.
- `withTempDir(root, fn)` — папка удаляется и после ошибки.

- [ ] Тесты (zsign подменён shell-скриптом): `passes PEM files and never a password`, `passes bundle id only when it changes`, `kills on timeout`, `cleans up`, `reports low disk space`. FAIL → реализация → PASS → commit `feat(worker): zsign runner with limits`.

### Task 3: Задача подписи

**Files:**
- Create: `apps/worker/src/signing/sign.ts`, `apps/worker/src/queues/signing.ts`; Modify: `apps/worker/src/s3.ts` (+ `uploadFile` через `lib-storage`, `size`), `apps/worker/src/main.ts`.
- Test: `apps/worker/test/signing.int.test.ts`.

**Flow:** взять `SigningJob` → действующий `DeviceCertificate` (иначе `failed` `DEVICE_NOT_READY`) → копия уже есть → `ready` → иначе `downloading` (место, скачать оригинал) → `signing` (расшифровать, PEM, zsign) → `uploading` (`signed/<deviceCertificateId>/<appVersionId>.ipa`, многочастно) → `SignedBuild` upsert → все `SigningJob` с этим `queueJobId` → `ready` + `signedBuildId`. Последняя попытка упала → все они `failed` `SIGNING_FAILED`.

- [ ] Тесты: `signs, stores the build and completes every waiting request`, `stages go in order`, `reuses an existing build`, `marks requests failed after the last attempt`, `refuses when device files ended`. FAIL → реализация → PASS → commit `feat(worker): signing job`.

### Task 4: Уборка копий и сброс при смене файлов

**Files:**
- Create: `apps/worker/src/signing/evict.ts`, `apps/worker/src/queues/maintenance.ts`; Modify: `apps/api/src/apple/device-certificates.service.ts` (замена, удаление → удалить копии этих файлов), `apps/worker/src/certificates/check.ts` (отзыв, истечение → удалить копии).
- Test: `apps/worker/test/maintenance.int.test.ts`, дополнение `apps/api/test/admin-devices.int.test.ts`, `apps/worker/test/certificates.int.test.ts`.

- [ ] Тесты: `evicts builds unused for 3 days`, `keeps builds with a live token`, `trims by size, oldest first`, `replacing device files drops its builds`, `revoked certificate drops its builds`. FAIL → реализация → PASS → commit `feat(worker): signed build cleanup`.

### Task 5: API установки

**Files:**
- Create: `apps/api/src/install/{install.module,install.controller,install.service,tokens}.ts`; Modify: `apps/api/src/app.module.ts`, `apps/api/src/billing/access.controller.ts` (в ответ `/access` — `profileKind` и `lastInstalled` устройства), `packages/shared/src/client.ts` / `access.ts`.
- Test: `apps/api/test/install.int.test.ts`.

**Interfaces:**
- `POST /install/apps/:slug` (вход обязателен, лимит 30 за 10 мин) → право → копия есть: `{ stage: 'ready', jobId }` → иначе `SigningJob` + `queue.add(..., { jobId })` или присоединение к идущей → `{ stage, jobId }`.
- `GET /install/jobs/:id` (только владелец) → `{ stage, errorCode? }`.
- `POST /install/jobs/:id/token` (владелец, `ready`; право ещё раз) → `{ itmsUrl, expiresAt }`.
- `GET /install/:token/manifest.plist` (публично) → манифест, `InstallEvent`, `lastUsedAt`.

- [ ] Тесты: `signs on first request and serves the copy on the second`, `second request joins the running job`, `not ready device is refused`, `another user cannot see my job`, `refetch within the window`, `used link is gone`, `expired link`. FAIL → реализация → PASS → commit `feat(api): install requests, tokens and manifests`.

### Task 6: Кнопка «Установить» с анимацией

**Files:**
- Create: `apps/web/src/install/{InstallButton.tsx,InstallButton.module.css,install-flow.ts,ProgressRing.tsx}` + тесты; Modify: `apps/web/src/app-page/install-button-state.ts` (`soon` → `install`), окно приложения (`AppPreview`), шаг 3 мастера, `apps/web/src/api/*`.
- Test: `install-flow.test.ts`, `InstallButton.test.tsx`, `apps/web/e2e/install.spec.ts`.

**Behaviour:** спека Н4 §4. Состояния: `idle` → `confirmReplace` (профиль `single` и есть прошлое приложение) → `working(stage)` → `ready` (открыть `itmsUrl`; если не открылось — «Установить» ещё раз) → `done` | `failed`. Круг: SVG, `stroke-dashoffset`, плавно к `to` этапа, `prefers-reduced-motion` — скачками. Основа — Stateful Button (Aceternity) и Animated Circular Progress Bar (Magic UI), перенесены на CSS Modules и токены.

- [ ] Тесты: `ready device shows Install`, `stages move the ring forward only`, `warns before replacing the previous app`, `failure offers a retry`, e2e `install shows the ring, then an itms-services link with a valid manifest`. FAIL → реализация → проверка вёрстки 390 и 1280 → PASS → commit `feat(web): install button with signing animation`.

### Task 7: Админка

**Files:** `apps/api/src/install/admin-signing.controller.ts`, `apps/web/app/admin/signing/page.tsx`, меню админки, карточка устройства (`профиль на одно приложение / на все`).

- [ ] Тесты: `support sees signing jobs`, `only admin retries a failed job`. FAIL → реализация → PASS → commit `feat(admin): signing jobs`.

### Task 8: Проверка вехи

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e` (в облачном контейнере — по памяти проекта; авторитет — CI).
- [ ] README и CLAUDE.md: переменные подписи, уборка, раздел «Подпись».
- [ ] PR, ревью; слияние только по команде владельца.
- [ ] Ручная проверка владельцем на сервере с файлами поставщика (спека Н4 §8).
