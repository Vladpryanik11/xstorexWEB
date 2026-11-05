# M4 Signing and OTA Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Установить» on an app page installs the app on the user's registered iPhone: the worker signs the IPA with the account's certificate and profile through zsign (or reuses a cached build), the browser shows «Подписываем N%», and Safari opens a one-time `itms-services://` link.

**Architecture:**
- API `install` module: rights check, cache lookup, one queue job per (version × certificate × profile revision) shared by every waiting user, SSE progress, one-time install tokens and OTA manifests.
- Worker `signing` queue: download the original, run zsign in a temp dir under CPU/memory/time limits, upload to the `signed` bucket, write `SignedBuild`. `maintenance` queue evicts old builds; revocation (M3) now invalidates an account's builds.
- Web: the app page button becomes a state machine; the devices page shows install history.

**Tech Stack:** M3 stack plus `@aws-sdk/lib-storage` (multipart upload with progress), `@bull-board/api` + `@bull-board/express` 6.x, zsign v1.1.3 already in the worker image, `prlimit` from util-linux (present in `node:24-bookworm-slim`).

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` — §3.1 (`signing`, `install`, `storage`), §4.3, §4.6 step 2 («кэш SignedBuild аккаунта сбрасывается»), §5 («Подпись и установка»), §6.3 (`/app/[slug]` button, `/devices` history, admin «задачи подписи, панель очередей bull-board»), §7 (one-time tokens, 15-minute links, zsign limits), §8, §9 («Подпись» test) → M4. Builds on M1 (`AppVersion`, buckets), M2 (devices, sessions with `deviceId`), M3 (certificates, profiles, `includedInRevision`, `invalidateAccountBuilds` stub).

## Owner decisions this plan depends on

1. **Token reuse window.** iOS sometimes fetches the manifest twice. The token is consumed at the first fetch, and the same IP + User-Agent may fetch it again within 120 seconds. After that the link answers 410.
2. **Free apps need only an active device in M4.** M5 adds the paid device right and addon checks to the same rights function.
3. **zsign gets PEM files, not a p12 password on the command line**, so no secret appears in the process list.
4. **Test IPA.** The plan builds a minimal arm64 executable in tests. If zsign refuses it, the owner provides a tiny unsigned test app built in Xcode on any Mac (`apps/worker/test/fixtures/hello.ipa`, under 200 KB).

## Global Constraints

- All M0–M3 Global Constraints hold.
- Install token: 32 random bytes base64url; the DB stores its SHA-256; lifetime 1 hour; bound to user and device.
- Presigned IPA links: `S3_PUBLIC_URL` host (`dl.xstorex.ru`), 15 minutes, `response-content-type=application/octet-stream`.
- Manifest URL: `${SITE_URL}/api/v1/install/<token>/manifest.plist`; `itms-services://?action=download-manifest&url=<encodeURIComponent(manifestUrl)>`.
- Signing limits (env, worker): `SIGNING_TIMEOUT_MS=600000`, `SIGNING_MEMORY_MB=2048`, `SIGNING_CPU_SEC=900`, work dir `TMP_DIR=/work` (a named volume in production compose, not the container layer). Free disk before download must be ≥ 2.5 × IPA size.
- Cache settings: `signing.cacheTtlDays` 14, `signing.cacheMaxGb` 200.
- Progress phases: download 0–30 % (bytes), signing 30–80 % (time estimate at 20 MB/s, capped at 79), upload 80–100 % (bytes).
- Queue job id for signing: `sign:<appVersionId>:<certificateId>:<revision>`.

## Review Focus

1. **iOS fetches the manifest twice:** the second fetch within 120 s from the same client gets the same manifest; a fetch after that, or from another client, gets 410 «Ссылка установки уже использована» → Task 4 int tests `refetch within the window`, `used link is gone`.
2. **Two users tap «Установить» for the same app at once:** one zsign run, both get an install link → Task 4 int test `one signing for concurrent requests`.
3. **zsign hangs or eats memory:** killed at the limit, job `failed` with `SIGNING_FAILED` «Не удалось подписать приложение, мы уже разбираемся», temp dir removed → Task 2 tests `kills on timeout`, `cleans up`.
4. **Device still `processing` or `pending`:** no job is created, the button explains the wait → Task 6 test `waiting device`, Task 4 int test `inactive device is refused`.
5. **App titles with `&`, `<`, quotes or emoji:** the manifest stays valid XML and shows the title as typed → Task 3 test `escapes the title`.

---

### Task 1: Signing data model and rights rules

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m4_signing`), `packages/shared/src/errors.ts`
- Create: `packages/shared/src/install.ts`
- Test: `packages/shared/src/install.test.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum SigningSource { app_version user_upload }`, `enum CertSource { xstore user }`, `enum SigningStatus { queued running done failed }`.
  - `SigningJob { id; userId; deviceId; source; appVersionId String?; userUploadId String?; certSource @default(xstore); userCertificateId String?; options Json?; queueJobId String; status @default(queued); progress Int @default(0); errorCode String?; signedBuildId String?; createdAt; finishedAt DateTime? }`, index `queueJobId`.
  - `SignedBuild { id; sourceKey String; accountId; certificateId; profileRevision Int; ipaKey; sizeBytes BigInt; createdAt; lastUsedAt }`, `@@unique([sourceKey, certificateId, profileRevision])`.
  - `InstallToken { tokenHash String @id; userId; deviceId; signedBuildId String?; buildKey String?; appVersionId String?; title String; bundleId String; bundleVersion String; icon57Url String?; icon512Url String?; expiresAt; usedAt DateTime?; usedIp String?; usedUa String? }` (`buildKey` and the copied metadata let M6 reuse tokens for Signer builds).
- Produces (`@xstore/shared`):
  - `canInstall(input: { device: { status: DeviceStatus }; app: { status: AppStatus; accessLevel: string }; version: { status: VersionStatus; encrypted: boolean } | null; entitlements: EntitlementLike[] ; now: Date }): { ok: true } | { ok: false; reason: InstallDenial }` with `InstallDenial = 'DEVICE_NOT_ACTIVE' | 'APP_NOT_AVAILABLE' | 'NOT_ENTITLED'`. M4 rule: device `active`; app `published` with a published, unencrypted version; `accessLevel` `free` passes, `addon:*` → `NOT_ENTITLED`. `EntitlementLike` is `{ kind: 'device' | 'addon'; planCode: string; expiresAt: Date }`; M5 changes the rule, not the signature.
  - Codes: `DEVICE_NOT_ACTIVE` «Устройство ещё не готово к установке», `APP_NOT_AVAILABLE` «Приложение сейчас недоступно», `NOT_ENTITLED` «Для этого приложения нужен тариф», `SIGNING_FAILED` «Не удалось подписать приложение, мы уже разбираемся», `INSTALL_LINK_EXPIRED` «Ссылка установки устарела», `INSTALL_LINK_USED` «Ссылка установки уже использована».
  - `SigningEvent = { type: 'progress'; percent: number } | { type: 'done' } | { type: 'failed'; code: ErrorCode; message: string }`.

- [ ] **Step 1: Write the failing tests** — `free app on an active device is allowed`, `processing device is refused with DEVICE_NOT_ACTIVE`, `encrypted latest version is not available`, `addon app needs an entitlement`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement** (`pnpm db:migrate --name m4_signing`).
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(signing): data model and install rights"`

---

### Task 2: zsign runner and signature checks

**Files:**
- Create: `apps/worker/src/signing/{zsign,identity-files,disk}.ts`
- Modify: `packages/ios/src/macho.ts` (+ `hasCodeSignature`), `packages/ios/test/helpers/build-macho.ts` (+ `buildExecutable()`), `packages/ios/src/index.ts`
- Create: `apps/worker/test/zsign.container.test.ts`, `apps/worker/test/helpers/{test-identity,test-profile}.ts`
- Modify: `apps/worker/Dockerfile` (+ `test` stage), `apps/worker/package.json` (`test:zsign`), `.github/workflows/ci.yml` (`docker` job runs the test stage)
- Test: `apps/worker/src/signing/zsign.test.ts`

**Interfaces:**
- Produces:
  - `writeIdentityFiles(dir: string, p12: Buffer, password: string): Promise<{ keyPath: string; certPath: string }>` — PEM files with mode `0600`.
  - `runZsign(opts: { zsignBin: string; inputIpa: string; outputIpa: string; keyPath: string; certPath: string; profilePath: string; bundleId?: string; displayName?: string; timeoutMs: number; memoryMb: number; cpuSec: number; signal?: AbortSignal }): Promise<void>` — spawns `prlimit --as=<bytes> --cpu=<sec> -- <zsign> -k key.pem -c cert.pem -m profile.mobileprovision -o out.ipa -z 9 [-b id] [-n name] in.ipa` (check the flags with `zsign -h` in the image first and adjust names, not behavior); kills with `SIGKILL` at `timeoutMs`; non-zero exit → `ZsignError { exitCode, stderrTail }` (last 2 KB, never logged with paths of secrets); argv is never logged.
  - `ensureFreeSpace(dir: string, bytesNeeded: number): Promise<void>` — `fs.statfs`; not enough → `DiskFullError` (retryable, raises an alert once per hour).
  - `hasCodeSignature(macho: Buffer): boolean` — any slice has `LC_CODE_SIGNATURE` (`0x1D`).
  - `buildExecutable()` test helper — arm64 `MH_EXECUTE` with `__PAGEZERO`, `__TEXT` (one `ret`), `__LINKEDIT`, `LC_MAIN`, `LC_LOAD_DYLINKER` and 16 KiB of header padding for zsign to add its load command.

- [ ] **Step 1: Write the failing unit tests** (a fake `zsign` shell script in a temp dir stands in for the binary)

```ts
it('passes PEM files and never a password', async () => {
  await runZsign({ ...OPTS, zsignBin: recorderScript });
  expect(await recordedArgs()).toEqual(expect.arrayContaining(['-k', OPTS.keyPath, '-c', OPTS.certPath, '-m', OPTS.profilePath]));
  expect((await recordedArgs()).join(' ')).not.toMatch(/-p\b/);
});
it('kills on timeout', async () => { await expect(runZsign({ ...OPTS, zsignBin: sleeperScript, timeoutMs: 200 })).rejects.toThrow(ZsignError); });
it('cleans up', async () => { /* job-level helper withTempDir removes the dir after success and after failure */ });
it('reports low disk space', async () => { /* bytesNeeded > free → DiskFullError */ });
```

- [ ] **Step 2: Write the failing container test** (`zsign.container.test.ts`, runs only when `ZSIGN_BIN` is set): build an IPA with `buildExecutable()`, sign with a test identity and a test profile (CMS-signed plist with `ProvisionedDevices`, `Entitlements { 'application-identifier': 'TEAMID1234.*' }`, `DeveloperCertificates`), then assert `Payload/Test.app/_CodeSignature/CodeResources` exists, `embedded.mobileprovision` equals the profile, `hasCodeSignature(main binary)` is true; a second run with `bundleId: 'ru.test.copy'` and `displayName: 'Копия'` changes `Info.plist`.
- [ ] **Step 3: Run them to verify they fail** — `pnpm --filter @xstore/worker test` and `docker build --target test -f apps/worker/Dockerfile .`. Expected: FAIL.
- [ ] **Step 4: Implement the runner, helpers and the Dockerfile `test` stage** (`FROM builder` + zsign binary + `ENV ZSIGN_BIN=/usr/local/bin/zsign` + `RUN pnpm --filter @xstore/worker test:zsign`). If zsign rejects the synthetic executable, stop and ask the owner for `hello.ipa` (owner decision 4).
- [ ] **Step 5: Run them to verify they pass.** Expected: PASS locally and in the image build.
- [ ] **Step 6: Commit** — `git commit -m "feat(worker): zsign runner with limits and signature checks"`

---

### Task 3: Signing job and manifest builder

**Files:**
- Create: `apps/worker/src/queues/signing.ts`, `apps/worker/src/signing/{sign-app-version,progress}.ts`
- Create: `packages/shared/src/manifest.ts`
- Modify: `packages/shared/src/queues.ts` (`QueueName.signing`, `signingJob`), `infra/docker-compose.yml` (worker volume `workertmp:/work`, `TMP_DIR=/work`)
- Test: `packages/shared/src/manifest.test.ts`, `apps/worker/test/signing.int.test.ts`

**Interfaces:**
- Produces:
  - `buildManifest(m: { ipaUrl: string; icon57Url?: string; icon512Url?: string; bundleId: string; bundleVersion: string; title: string }): string` — the standard `items[0].assets` (`software-package`, `display-image`, `full-size-image`) and `metadata` (`bundle-identifier`, `bundle-version`, `kind: software`, `title`), XML-escaped, UTF-8.
  - `signingJob = z.object({ kind: z.literal('app_version'), appVersionId, accountId, certificateId, revision })` (M6 adds `user_upload`).
  - `progressReporter(job, phase)` mapping per Global Constraints; reports at most every 500 ms.
  - Job flow: decrypt the certificate's p12 → identity files → write the profile blob of `revision` → `ensureFreeSpace` → download original (`originals/…`) → `runZsign` → upload `signed/<accountId>/<appVersionId>/<certificateId>-r<revision>.ipa` with `lib-storage` → `SignedBuild` upsert → every `SigningJob` with this `queueJobId` → `done` + `signedBuildId`. Failure on the last attempt → those rows `failed` with `SIGNING_FAILED` (or `DISK_FULL`), an alert `signing_failed:<appVersionId>` once per day.

- [ ] **Step 1: Write the failing tests**

```ts
it('escapes the title', () => {
  const xml = buildManifest({ ...M, title: 'Tom & Jerry <Pro> "2" 🚀' });
  expect(parsePlist(Buffer.from(xml)).items[0].metadata.title).toBe('Tom & Jerry <Pro> "2" 🚀');
});
it('lists the three assets', () => { /* kinds in order */ });
// signing.int.test.ts — real Redis/Postgres/MinIO; zsign replaced by a script that copies input → output
it('signs, stores the build and completes every waiting request', async () => { /* 2 SigningJob rows, 1 queue job → both done, 1 SignedBuild */ });
it('reports monotonic progress up to 100', async () => { /* collected progress values sorted and end at 100 */ });
it('marks requests failed after the last attempt', async () => { /* script exits 1 → SIGNING_FAILED, alert */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** `ZSIGN_BIN` env selects the binary (`/usr/local/bin/zsign` default).
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(worker): signing job with progress and OTA manifest builder"`

---

### Task 4: Install API — request, progress stream, token, manifest

**Files:**
- Create: `apps/api/src/install/{install.module,install.controller,install.service,build-cache,tokens,sse}.ts`
- Modify: `infra/Caddyfile` (SSE route without buffering), `packages/shared/src/client.ts`
- Test: `apps/api/src/install/build-cache.test.ts`, `apps/api/test/install.int.test.ts`

**Interfaces:**
- Produces:
  - `pickUsableBuild(builds: BuildCandidate[], device: { includedInRevision: number }, profiles: { revision; udids; expiresAt }[], udid: string, now: Date): string | null` (pure) — certificate `active` or `rotated` and not expired; profile revision ≥ `includedInRevision`, profile contains the UDID and is valid for more than 1 day; highest revision wins.
  - `POST /install/apps/:slug { deviceId }` (`@RequireAuth`, rate limit `install` 30 per 10 min per user) → `canInstall` (entitlements empty in M4) → cache hit: `{ status: 'ready', itmsUrl, expiresAt }` (token issued) → miss: `SigningJob` row + `addOrJoin(queue, jobId, data)` → `{ status: 'signing', jobId: SigningJob.id }`.
  - `addOrJoin(queue, jobId, data)`: existing job `waiting|active|delayed` → join; `completed|failed` → remove and add again.
  - `GET /install/jobs/:id/events` (owner only) → `text/event-stream`: current state first, then `SigningEvent`s from one shared `QueueEvents('signing')`, heartbeat `: ping` every 15 s, closes after `done`/`failed`.
  - `POST /install/jobs/:id/token` (owner only, job `done`) → `{ itmsUrl, expiresAt }`; rights are checked again.
  - `GET /install/:token/manifest.plist` (public) → `application/xml` manifest with a fresh 15-minute presigned IPA URL; first fetch sets `usedAt/usedIp/usedUa`, writes `InstallEvent`, bumps `SignedBuild.lastUsedAt`; repeat within 120 s from the same IP + UA → same manifest, no new event; otherwise 410 `INSTALL_LINK_USED`; expired → 410 `INSTALL_LINK_EXPIRED`.
  - Caddyfile: `handle /api/v1/install/jobs/* { reverse_proxy api:3001 { flush_interval -1 } }` before the generic `/api/*` handler.
  - Client: `requestInstall(slug, deviceId)`, `installToken(jobId)`, `signingEventsUrl(jobId)`.

- [ ] **Step 1: Write the failing tests**

```ts
// build-cache.test.ts
it('takes the newest build whose profile has the device', () => { /* r3 has udid, r4 does not → r3 */ });
it('skips builds of a revoked certificate', () => { /* … */ });
// install.int.test.ts (worker running with the copy-script zsign)
it('signs on first request and serves the cache on the second', async () => { /* signing → done → token; second request → ready */ });
it('one signing for concurrent requests', async () => { /* two users, same version → one queue job id, both get links */ });
it('streams progress over SSE', async () => { /* events end with done */ });
it('refetch within the window', async () => { /* same IP+UA twice → 200, one InstallEvent */ });
it('used link is gone', async () => { /* other UA → 410 INSTALL_LINK_USED */ });
it('expired link', async () => { /* expiresAt past → 410 INSTALL_LINK_EXPIRED */ });
it('inactive device is refused', async () => { /* processing → 403 DEVICE_NOT_ACTIVE, no SigningJob */ });
it('another user cannot follow my job', async () => { /* 404 */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): install requests, signing progress stream and OTA manifests"`

---

### Task 5: Build cache eviction and invalidation

**Files:**
- Create: `apps/worker/src/maintenance/{evict-signed-builds,invalidate-account-builds}.ts`, `apps/worker/src/queues/maintenance.ts`
- Modify: `apps/worker/src/apple/revocation.ts` (call the real `invalidateAccountBuilds`), `packages/shared/src/queues.ts` (`QueueName.maintenance`)
- Test: `apps/worker/test/maintenance.int.test.ts`

**Interfaces:**
- Produces:
  - `invalidateAccountBuilds(deps, accountId): Promise<number>` — deletes the account's `SignedBuild` rows and objects; unused install tokens pointing at them expire now.
  - Job `maintenance:evictSignedBuilds` (hourly): delete builds unused for `signing.cacheTtlDays`; then, while total size > `signing.cacheMaxGb`, delete the least recently used. Builds with an unused, unexpired install token are kept.

- [ ] **Step 1: Write the failing tests** — `evicts stale builds`, `keeps builds with a live token`, `trims by size, oldest first`, `revocation drops the account's builds`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(worker): signed build eviction and invalidation on revocation"`

---

### Task 6: App page install flow and install history

**Files:**
- Modify: `apps/web/src/app-page/install-button-state.ts`, `apps/web/app/(site)/app/[slug]/page.tsx`
- Create: `apps/web/src/app-page/{InstallButton,DevicePicker}.tsx` (client), `apps/web/app/(site)/help/install/page.tsx`
- Modify: `apps/web/src/account/DeviceCard.tsx` (history list)
- Test: `apps/web/src/app-page/install-button-state.test.ts`, `apps/web/src/app-page/InstallButton.test.tsx`, `apps/web/e2e/install.spec.ts`

**Interfaces:**
- Produces:
  - `InstallCtx` gains `devices: { id; status }[]`, `currentDeviceId: string | null`, `denial?: InstallDenial`; `InstallState.kind` adds `waiting` («Устройство регистрируется», disabled; `pending` → «Ждём место в Apple»), `install` («Установить»), `signing` («Подписываем N%», disabled), `ready` («Установить», `href` = itms URL), `instructions` («Открыть инструкцию», `/help/install`). `NOT_ENTITLED` stays `unavailable` («Нужен тариф») until M5 turns it into `buy`.
  - `InstallButton` (client): tap `install` → `requestInstall` → `ready` → `location.href = itmsUrl` → `instructions`; `signing` → `EventSource` → progress → `done` → `installToken` → `ready` (the next tap opens the link: Safari needs a user gesture) → `failed` → message + «Попробовать снова». More than one active device and no `currentDeviceId` → `DevicePicker` sheet first.
  - `/help/install`: three short steps («Подтвердите установку», «Приложение появится на экране „Домой“», «Если загрузка не началась, нажмите „Установить“ ещё раз») with own illustrations.
  - Devices page: «История установок» (app icon, name, date) per device from `GET /devices/:id/installs`.

- [ ] **Step 1: Write the failing tests**

```ts
it('waiting device', () => { expect(installButtonState({ ...SIGNED_IN, devices: [{ id: 'd', status: 'processing' }] }).kind).toBe('waiting'); });
it('active device can install', () => { /* → install */ });
it('two active devices and no current one asks to pick', () => { /* InstallButton renders DevicePicker on tap */ });
// e2e/install.spec.ts — seeded active device, fake ASC account, copy-script zsign
test('install shows progress, then an itms-services link', async ({ page }) => {
  // sign in by simulated iOS response, open an app, tap «Установить», see «Подписываем», then a link starting with itms-services://
});
test('the manifest behind the link is valid', async ({ request }) => { /* fetch manifest URL from the link → plist with bundle-identifier */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Run the design skill «Verification» for the app page button states at 390px.
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): install button with signing progress and install history"`

---

### Task 7: Admin signing jobs and bull-board

**Files:**
- Create: `apps/api/src/admin-signing/{admin-signing.module,admin-signing.controller}.ts`, `apps/api/src/admin-signing/bull-board.ts`
- Modify: `apps/api/src/app.ts` (mount bull-board), `apps/web/app/admin/signing/page.tsx`, `apps/web/src/admin/AdminShell.tsx`
- Test: `apps/api/test/admin-signing.int.test.ts`

**Interfaces:**
- Produces:
  - `GET /admin/signing-jobs?status=&cursor=` (support and admin) → app, version, masked UDID, status, progress, error code, duration; `POST /admin/signing-jobs/:id/retry` (admin, failed only; audited).
  - bull-board at `/api/v1/admin/queues` for every queue, behind an Express middleware that resolves the session cookie and requires role `admin`. Job payloads already carry ids only (M3 Global Constraints), so bull-board shows nothing secret.
  - Admin page «Подпись» with the table and a link «Очереди» to bull-board.

- [ ] **Step 1: Write the failing tests** — `bull-board requires an admin` (guest 401, support 403, admin 200), `failed signing jobs can be retried`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(admin): signing jobs and queue dashboard"`

---

### Task 8: Milestone gate and real OTA install

- [ ] **Step 1: Full local gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e` and `docker build --target test -f apps/worker/Dockerfile .`. Expected: all pass.
- [ ] **Step 2: Real iPhone (owner)** — on the public HTTPS host with the real Apple account from M3: publish a free app with distribution rights, sign in on the iPhone, tap «Установить», watch the percent, confirm the iOS install prompt, launch the app. Then revoke nothing; run `ocspCheck` and confirm `good`. Note the time from tap to install.
- [ ] **Step 3: Load check** — 5 parallel install requests for one uncached version produce one zsign run (`docker compose logs worker | grep -c "zsign start"` = 1).
- [ ] **Step 4: Request review** — `superpowers:requesting-code-review` on the M4 branch, security focus on tokens, presigned links and zsign isolation.
- [ ] **Step 5: Docs** — README/CLAUDE.md: signing env, `test` image stage, bull-board URL. Commit `docs: M4 signing and install`.
