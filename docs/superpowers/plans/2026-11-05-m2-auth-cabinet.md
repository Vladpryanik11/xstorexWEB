# M2 Sign-in and Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor signs in from Safari on iPhone/iPad through a signed Profile Service `.mobileconfig` (UDID), or from any browser with an email code. Signed-in users see «Ваши устройства» and «Профиль»; admins find users and devices by email or UDID.

**Architecture:**
- API: new modules `enrollment` (profile generation, CMS verification, one-time token), `devices`, `profile`; `auth` gains user sessions and email codes.
- Mail goes through a new `notifications` BullMQ queue; the worker sends it over SMTP (Mailpit in development). M7 adds logging, templates for the remaining events and SMTP settings.
- Web: the shell reads the session on the server; account pages live in an `(account)` route group whose layout redirects guests.

**Tech Stack:** M1 stack plus `pkijs` 3.x and `asn1js` 3.x (CMS sign and verify through WebCrypto, RSA and ECDSA keys), `nodemailer` 7.x (worker), Mailpit (`axllent/mailpit`, pinned by digest) for development and tests.

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` — §3.1 (`auth`, `enrollment`, `devices`), §4.1, §5 (`User`, `Session`, `EnrollmentSession`, `Device`), §6.2 (signed-in header), §6.3 (`/signin`, `/enroll/done`, `/devices`, `/profile`, admin «пользователи и устройства»), §7, §9 («разбор ответа iOS по записанным примерам», e2e «вход через симуляцию ответа iOS») → M2. Builds on M1 (sessions, guards, rate limit, audit, typed client).

## Owner decisions this plan depends on

1. **Signing certificate for `.mobileconfig`.** Production uses the Let's Encrypt certificate that Caddy already holds for `SITE_DOMAIN`: the `caddydata` volume is mounted read-only into `api`. Development uses a self-signed certificate (iOS then shows «Не проверено», which is expected).
2. **A UDID already owned by another account** cannot be linked to the signed-in account (`DEVICE_OWNED`), because rights are bound to the device. Moving devices between accounts is an admin action (M5 adds the rights side).
3. **One email per account.** Linking an email that belongs to another account fails with `EMAIL_TAKEN`; account merging is out of scope.
4. **Real-device test.** Before the milestone closes the owner installs the profile on a real iPhone through a public HTTPS host (staging VPS or a tunnel). The recorded response contains the device UDID, so it stays out of git unless the owner allows it.

## Global Constraints

- All M0 and M1 Global Constraints hold.
- Enrollment session TTL: 15 minutes. One-time `/enroll/done` token TTL: 5 minutes, single use. Email code: 6 digits, TTL 10 minutes, 5 attempts.
- User session TTL: 30 days, extended back to 30 days on use when fewer than 15 remain. Staff session TTL stays 12 hours.
- `.mobileconfig`: `Content-Type: application/x-apple-aspen-config`, file name `xstore-signin.mobileconfig`, `PayloadType` `Profile Service`, `PayloadIdentifier` `ru.xstorex.enroll`, `PayloadDisplayName` «Xstore — вход», `PayloadOrganization` «Xstore», `DeviceAttributes` `UDID, PRODUCT, VERSION, SERIAL`. `SERIAL` is requested by the spec but never stored.
- Rate limits (Redis, from M1): profile download 10 per 10 min per IP; callback 20 per 10 min per IP; code request 3 per 15 min per email and 10 per hour per IP; code verify 10 per 10 min per IP.
- Never log UDIDs in full outside the audit log: pino `redact` plus a `maskUdid(udid)` helper (`00008110-…A1B2`) for messages.
- Email addresses are normalized with `trim().toLowerCase()` everywhere.

## Review Focus

1. **Expired or reused enrollment** (profile installed after 15 minutes, the same nonce posted twice): Safari opens `/enroll/done?error=ENROLLMENT_EXPIRED` with «Время входа истекло» and «Попробовать снова» → Task 4 int tests `expired nonce`, `nonce is single use`.
2. **Desktop or non-Safari browser on `/signin`:** the email form is primary and the text explains that the profile works only in Safari on iPhone/iPad → Task 7 e2e `desktop sign-in offers email`.
3. **Device owned by another account** during «Добавить устройство» → `DEVICE_OWNED` page with a support link, no change to either account → Task 4 int test `refuses a device owned by someone else`.
4. **Code guessing and account probing:** the sixth wrong code invalidates the code; the request endpoint always answers 204 → Task 5 int tests `five attempts then dead`, `no enumeration`.
5. **Email with capitals or spaces** (` Ivan@Mail.RU `): the same account every time → Task 5 int test `normalizes email`.

---

### Task 1: Users, devices and enrollment data model

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m2_devices`)
- Create: `packages/shared/src/devices.ts`, `packages/shared/src/auth.ts` (+ exports)
- Modify: `packages/shared/src/errors.ts`
- Test: `packages/shared/src/devices.test.ts`, `packages/db/test/devices.int.test.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum DeviceStatus { new pending processing active blocked expired }`, `enum EnrollmentStatus { pending completed failed expired }`.
  - `Device { id; userId → User; udid String @unique; product String; iosVersion String; name String; status DeviceStatus @default(new); appleAccountId String?; registeredAt DateTime?; createdAt }` (the `AppleAccount` relation arrives in M3).
  - `EnrollmentSession { nonce String @id; status EnrollmentStatus @default(pending); userId String?; deviceId String?; next String?; expiresAt; createdAt }`.
  - `Session.deviceId String?` → `Device` (`onDelete: SetNull`).
  - `InstallEvent.deviceId` gets its relation to `Device`.
- Produces (`@xstore/shared`):
  - Codes and messages: `ENROLLMENT_EXPIRED` «Время входа истекло. Начните заново.», `ENROLLMENT_INVALID` «Не удалось проверить ответ устройства. Попробуйте ещё раз.», `DEVICE_OWNED` «Это устройство уже привязано к другому аккаунту. Напишите в поддержку.», `ACCOUNT_BLOCKED` «Аккаунт заблокирован», `CODE_INVALID` «Неверный или устаревший код», `EMAIL_TAKEN` «Эта почта уже привязана к другому аккаунту».
  - `normalizeEmail(raw: string): string`; `emailSchema = z.string().trim().toLowerCase().pipe(z.email())`.
  - `udidSchema = z.string().regex(/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/)` (pre-2018 40-hex and the newer 8-16 form); `maskUdid(udid: string): string`.
  - `deviceModelName(product: string): string` — table for iPhone XS (`iPhone11,2`) through current models and common iPads; unknown products return the input.
  - `DeviceView = { id, name, model, status, statusLabel, registeredAt: string | null, createdAt: string }`; `deviceStatusLabel: Record<DeviceStatus, string>` = Новое / Ожидает регистрации / Регистрируется в Apple (до 72 часов) / Активно / Заблокировано / Срок истёк.

- [x] **Step 1: Write the failing tests**

```ts
it('accepts both UDID formats', () => {
  expect(udidSchema.safeParse('00008110-001A2B3C4D5E6F70').success).toBe(true);
  expect(udidSchema.safeParse('a'.repeat(40)).success).toBe(true);
  expect(udidSchema.safeParse('00008110001A2B3C4D5E6F70').success).toBe(false);
});
it('masks a UDID', () => { expect(maskUdid('00008110-001A2B3C4D5E6F70')).toBe('00008110-…6F70'); });
it('names known models', () => { expect(deviceModelName('iPhone15,2')).toBe('iPhone 14 Pro'); });
it('normalizes email', () => { expect(normalizeEmail(' Ivan@Mail.RU ')).toBe('ivan@mail.ru'); });
// devices.int.test.ts
it('a UDID belongs to one device only', async () => { /* second create → P2002 */ });
```

- [x] **Step 2: Run them to verify they fail** — Run: `pnpm --filter @xstore/shared test && pnpm --filter @xstore/db test:int`. Expected: FAIL.
- [x] **Step 3: Implement the schema (`pnpm db:migrate --name m2_devices`) and the shared module.**
- [x] **Step 4: Run them to verify they pass.** Expected: PASS.
- [x] **Step 5: Commit** — `git commit -m "feat(db): devices, enrollment sessions and device contracts"`

---

### Task 2: Notifications queue and SMTP delivery

**Files:**
- Modify: `packages/shared/src/queues.ts` (`QueueName.notifications`, `notificationJob`)
- Create: `apps/worker/src/notifications/{mailer,templates}.ts`, `apps/worker/src/queues/notifications.ts`
- Create: `apps/api/src/notifications/{notifications.module,notify.service}.ts`
- Modify: `infra/docker-compose.dev.yml` (Mailpit: SMTP `127.0.0.1:1025`, UI `127.0.0.1:8025`), `.github/workflows/ci.yml` (start Mailpit in `integration` and `e2e`), `.env.example`, worker config
- Test: `apps/worker/src/notifications/templates.test.ts`, `apps/worker/test/notifications.int.test.ts`

**Interfaces:**
- Env: `SMTP_URL=smtp://localhost:1025` (prod `smtps://user:pass@host:465`), `MAIL_FROM="Xstore <noreply@xstorex.ru>"`, `MAILPIT_API=http://localhost:8025` (tests only).
- Produces:
  - `notificationJob = z.discriminatedUnion('template', [z.object({ template: z.literal('email-code'), to: emailSchema, vars: z.object({ code: z.string().regex(/^\d{6}$/) }) })])`. M3–M7 add members to this union.
  - `renderEmail(job: NotificationJob): { subject: string; text: string; html: string }` — `email-code`: subject «Код для входа в Xstore», text «Ваш код: 123456. Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.»; HTML escapes every variable.
  - `NotifyService.send(job: NotificationJob): Promise<void>` (API) — adds the job with `removeOnComplete: true` and `removeOnFail: 100` so codes do not linger in Redis.
  - Worker `createNotificationsWorker(deps)` sends with nodemailer (pool off, 10 s timeouts); SMTP errors are retried by the default job options.

- [x] **Step 1: Write the failing tests**

```ts
it('renders the code email with escaping', () => {
  const m = renderEmail({ template: 'email-code', to: 'a@b.ru', vars: { code: '123456' } });
  expect(m.subject).toBe('Код для входа в Xstore');
  expect(m.text).toContain('123456');
});
// notifications.int.test.ts — real Redis + Mailpit
it('delivers an email through SMTP', async () => {
  await queue.add('send', { template: 'email-code', to: 'test@xstorex.ru', vars: { code: '654321' } });
  await expect.poll(() => mailpitLatest('test@xstorex.ru'), { timeout: 10_000 }).toContain('654321');
});
```

- [x] **Step 2: Run them to verify they fail.** Run: `pnpm infra:up && pnpm --filter @xstore/worker test && pnpm --filter @xstore/worker test:int`. Expected: FAIL.
- [x] **Step 3: Implement the queue, templates, mailer, API service and Mailpit wiring.**
- [x] **Step 4: Run them to verify they pass.** Expected: PASS.
- [x] **Step 5: Commit** — `git commit -m "feat(notifications): mail queue with SMTP delivery and Mailpit for development"`

---

### Task 3: Signed enrollment profile

**Parallel implementation scope (approved 2026-11-05):** branch `codex/m2-enrollment-core` implements only the standalone profile builder, CMS signing/verification and PEM identity loader, with tests. This keeps the work independent of M1 and the M3 core libraries. Task 3 as a whole and milestone M2 remain open: the endpoint, enrollment persistence, session hand-off, environment/Docker wiring, development certificate command and real-iPhone check belong to the later integration.

**Standalone contract:** `SigningIdentity = { certificate: Certificate; chain: Certificate[]; privateKey: CryptoKey }`, where `certificate` is the leaf and `chain` excludes the leaf. The loader accepts leaf-first certificate-chain PEM and RSA PKCS#1/PKCS#8 or ECDSA P-256 SEC1/PKCS#8 private keys, checks that the key matches the leaf, imports it as non-extractable and caches successful loads for one hour. A failed renewal fails closed and may be retried immediately after repair. CMS verification requires caller-supplied trust anchors; embedded certificates never establish trust by themselves. Domain certificates used to sign the outgoing profile and Apple trust anchors used to verify a device response are separate inputs at integration.

**Verification of the standalone scope:** API unit tests cover RSA/ECDSA, intermediate chains, certificate dates, corrupted content/signatures, untrusted roots, malformed/ambiguous CMS, XML escaping and certificate renewal. When OpenSSL is available, tests independently verify generated signatures and read both DER and streaming BER signatures created by OpenSSL. This does not replace a real-device test or complete the HTTP flow.

**Chain validation:** the standalone verifier bounds the certificate pool to 32 unique certificates, paths to 16 certificates and search to 128 steps. It builds simple signature-verified paths before calling the PKIjs policy validator on a fixed path, preventing PKIjs 3.x recursive issuer cycles. It also enforces CA path-length constraints, leaf signing key usage and rejection of unsupported critical extensions. Manufacturer-specific certificate purpose and device identity checks remain part of callback integration and real-device validation. Outgoing CMS uses primitive attached content (including zero bytes), DER-sorted certificates and `SignerInfo.version = 1`.

**Files:**
- Create: `apps/api/src/enrollment/{enrollment.module,enrollment.controller,profile-builder,cms,signing-identity}.ts`
- Create: `apps/api/scripts/dev-certs.ts` (script `dev:certs`), git-ignored output `infra/dev-certs/`
- Modify: `apps/api/src/config/config.ts`, `.env.example`, `.gitignore`, `infra/docker-compose.yml` (api mounts `caddydata:/caddy:ro`)
- Test: `apps/api/src/enrollment/profile-builder.test.ts`, `apps/api/src/enrollment/cms.test.ts`

**Interfaces:**
- Env: `ENROLL_CERT_PATH`, `ENROLL_KEY_PATH` (PEM; the cert file may hold the chain). Dev: `infra/dev-certs/enroll.crt|key`. Prod: `/caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/<SITE_DOMAIN>/<SITE_DOMAIN>.crt|.key` (verify the exact path on the server in Task 9).
- Produces:
  - `buildEnrollmentProfile(input: { nonce: string; siteUrl: string; payloadUuid: string }): string` — XML plist with the Global Constraints values, `PayloadContent: { URL: '<siteUrl>/api/v1/enrollment/callback?s=<nonce>', DeviceAttributes: [...], Challenge: nonce }`, `PayloadVersion 1`, `PayloadUUID`.
  - `signCms(content: Buffer, identity: SigningIdentity): Promise<Buffer>` — DER `SignedData`, attached content, SHA-256, signed attributes, every chain certificate included. Works with RSA and ECDSA P-256 keys.
  - `verifyCms(der: Buffer, opts: { anchors: Certificate[]; now?: Date }): Promise<{ content: Buffer; signer: Certificate }>` — checks the signed-attributes digest, the signature with the signer certificate, and the chain from the CMS certificate set to one of the anchors. Throws `CmsError`. Task 4 uses it for device responses.
  - `loadSigningIdentity(certPath, keyPath): Promise<SigningIdentity>` — cached for 1 hour, so a renewed Caddy certificate is picked up.
  - `GET /enrollment/profile?next=&link=1` → creates `EnrollmentSession` (nonce = 32 random bytes base64url, `userId` set only when `link=1` and a user session exists, `next` kept only when it starts with `/` and not `//`) and returns the signed profile.

- [x] **Step 1: Write the failing tests**

```ts
it('builds a Profile Service payload pointing at the callback', () => {
  const p = parsePlist(Buffer.from(buildEnrollmentProfile({ nonce: 'n1', siteUrl: 'https://xstorex.ru', payloadUuid: UUID })));
  expect(p.PayloadType).toBe('Profile Service');
  expect(p.PayloadContent).toEqual({ URL: 'https://xstorex.ru/api/v1/enrollment/callback?s=n1',
    DeviceAttributes: ['UDID', 'PRODUCT', 'VERSION', 'SERIAL'], Challenge: 'n1' });
});
it('signs with an RSA identity and the signature verifies', async () => {
  const der = await signCms(Buffer.from('hello'), rsaIdentity);
  expect((await verifyCms(der, { anchors: [testCa] })).content.toString()).toBe('hello');
});
it('signs with an ECDSA identity', async () => { /* same with P-256 */ });
it('rejects a signer outside the anchors', async () => { /* other CA → CmsError */ });
it('openssl agrees', async () => { /* `openssl cms -verify -CAfile ca.pem -inform DER` exits 0 when openssl is on PATH; skipped otherwise */ });
```

- [x] **Step 2: Run them to verify they fail** — `pnpm --filter @xstore/api test`. Expected: FAIL.
- [x] **Step 3: Implement `profile-builder.ts`, `cms.ts` (`signCms` and `verifyCms`), `signing-identity.ts`, the profile endpoint and `dev:certs`.**
- [x] **Step 4: Run them to verify they pass.** Expected: PASS.
- [x] **Step 5: Commit** — `git commit -m "feat(enrollment): signed Profile Service mobileconfig"`

---

### Task 4: Enrollment callback and session hand-off

**Files:**
- Create: `apps/api/src/enrollment/{device-response,enroll.service}.ts`
- Create: `apps/api/test/helpers/fake-ios.ts`, `apps/api/test/fixtures/ios/README.md`
- Add: `apps/api/certs/AppleIncRootCertificate.pem` (from `https://www.apple.com/appleca/AppleIncRootCertificate.cer`, converted to PEM)
- Modify: `apps/api/src/app.ts` (raw body parser for the callback route)
- Test: `apps/api/src/enrollment/device-response.test.ts`, `apps/api/test/enrollment.int.test.ts`

**Interfaces:**
- Env: `ENROLL_TRUST_ANCHORS_PATH` (default `apps/api/certs/AppleIncRootCertificate.pem`; tests point it at the fake iOS CA).
- Consumes: `verifyCms` from Task 3.
- Produces:
  - `parseDeviceResponse(content: Buffer): { udid: string; product: string; version: string; challenge: string }` — plist keys `UDID`, `PRODUCT`, `VERSION`, `CHALLENGE`; validates `udid` with `udidSchema`.
  - `POST /enrollment/callback?s=<nonce>` (raw body `application/pkcs7-signature`, ≤ 64 KB, Origin-exempt). Steps: rate limit → load `EnrollmentSession` (missing → `ENROLLMENT_INVALID`; `expiresAt` passed or status not `pending` → `ENROLLMENT_EXPIRED`) → `verifyCms` → `parseDeviceResponse` → `challenge === nonce` → in one transaction: device by UDID; owner rules (owned + link mode by another user → `DEVICE_OWNED`; owner blocked → `ACCOUNT_BLOCKED`; no device → create `User` (unless link mode) and `Device` named `deviceModelName(product)`); mark the session `completed` → store `enroll:done:<sha256(token)>` = `{ userId, deviceId, next }` in Redis for 300 s → `301 Location: <SITE_URL>/enroll/done?t=<token>`. Every failure answers `301 Location: <SITE_URL>/enroll/done?error=<CODE>` and marks the session `failed` (expired sessions `expired`).
  - `POST /enrollment/complete { token }` → `GETDEL`; creates a user session with `deviceId`; sets the cookie; returns `{ next: string }` (default `/devices`). Unknown token → 400 `ENROLLMENT_EXPIRED`.
  - `signDeviceResponse(fields, ca): Promise<Buffer>` test helper (fake device certificate issued by a test CA, signed with `signCms`).

- [ ] **Step 1: Write the failing tests**

```ts
// device-response.test.ts
it('parses the device plist', () => {
  expect(parseDeviceResponse(plistOf({ UDID: UDID, PRODUCT: 'iPhone15,2', VERSION: '22B83', CHALLENGE: 'n1', SERIAL: 'X' })))
    .toEqual({ udid: UDID, product: 'iPhone15,2', version: '22B83', challenge: 'n1' });
});
it('rejects a tampered payload', async () => { /* flip a content byte → CmsError */ });
// enrollment.int.test.ts
it('signs a new device in and hands over a session', async () => {
  const nonce = await startEnrollment();
  const res = await api.post(`/api/v1/enrollment/callback?s=${nonce}`)
    .set('Content-Type', 'application/pkcs7-signature').send(await signDeviceResponse({ challenge: nonce }, fakeCa));
  expect(res.status).toBe(301);
  const t = new URL(res.headers.location).searchParams.get('t');
  const done = await agent.post('/api/v1/enrollment/complete').set('Origin', SITE).send({ token: t });
  expect(done.body).toEqual({ next: '/devices' });
  expect((await agent.get('/api/v1/auth/me')).body.user.role).toBe('user');
});
it('expired nonce', async () => { /* expiresAt in the past → Location …?error=ENROLLMENT_EXPIRED */ });
it('nonce is single use', async () => { /* second POST → ENROLLMENT_EXPIRED */ });
it('challenge mismatch is invalid', async () => { /* → ENROLLMENT_INVALID */ });
it('the same device signs back into the same account', async () => { /* two enrollments → one User */ });
it('link mode attaches the device to the signed-in user', async () => { /* … */ });
it('refuses a device owned by someone else', async () => { /* link mode, UDID of user B → DEVICE_OWNED, B unchanged */ });
it('the hand-off token works once', async () => { /* second complete → 400 */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement `parseDeviceResponse`, `EnrollService`, the callback and complete endpoints, and the fake iOS helper.** `fixtures/ios/README.md` explains how to record a real response (Task 9) and that it must not be committed without the owner's consent.
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(enrollment): verify iOS responses and hand off sessions"`

---

### Task 5: Email code sign-in and email linking

**Files:**
- Create: `apps/api/src/auth/{email-code.service,email-auth.controller}.ts`
- Create: `apps/api/src/profile/{profile.module,profile.controller}.ts` (email part)
- Modify: `apps/api/src/config/config.ts`, `.env.example` (`AUTH_SECRET`, 32+ random bytes base64)
- Test: `apps/api/test/email-auth.int.test.ts`

**Interfaces:**
- Produces:
  - `EmailCodeService.issue(email): Promise<void>` — `crypto.randomInt(0, 1_000_000)` zero-padded; Redis `auth:code:<sha256(email)>` = `{ mac: HMAC-SHA256(AUTH_SECRET, email + ':' + code), attempts: 0 }`, `EX 600`; enqueues `email-code`.
  - `EmailCodeService.verify(email, code): Promise<boolean>` — timing-safe compare; each failure increments `attempts`; at 5 the key is deleted; success deletes the key.
  - `POST /auth/email/request { email }` → always 204 (rate-limited).
  - `POST /auth/email/verify { email, code }` → user by email or a new one (`role user`), user session, cookie, 204; wrong → 400 `CODE_INVALID`; blocked user → 403 `ACCOUNT_BLOCKED`.
  - `POST /profile/email/request { email }` and `POST /profile/email/verify { email, code }` (signed in) → sets `User.email`; email of another user → 409 `EMAIL_TAKEN`.

- [ ] **Step 1: Write the failing tests**

```ts
it('signs in with the emailed code', async () => {
  await agent.post('/api/v1/auth/email/request').set('Origin', SITE).send({ email: 'u@xstorex.ru' });
  const code = await mailpitCode('u@xstorex.ru');
  expect((await agent.post('/api/v1/auth/email/verify').set('Origin', SITE).send({ email: 'u@xstorex.ru', code })).status).toBe(204);
});
it('five attempts then dead', async () => { /* 5 wrong → the right code also fails */ });
it('no enumeration', async () => { /* unknown and known emails both 204, same body */ });
it('normalizes email', async () => { /* request ' U@XSTOREX.RU ', verify 'u@xstorex.ru' → same user */ });
it('rate-limits the fourth request per email', async () => { /* 429 */ });
it('refuses an email that belongs to another user', async () => { /* EMAIL_TAKEN */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the service and controllers.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): email code sign-in and email linking"`

---

### Task 6: Devices, sessions and profile API

**Files:**
- Create: `apps/api/src/devices/{devices.module,devices.controller,devices.service}.ts`
- Modify: `apps/api/src/profile/profile.controller.ts`, `apps/api/src/auth/session.service.ts` (sliding expiry, `lastSeenAt`), `packages/shared/src/client.ts`
- Test: `apps/api/test/devices.int.test.ts`, `apps/api/test/profile.int.test.ts`

**Interfaces:**
- Produces (all `@RequireAuth()`, user sessions only):
  - `GET /devices` → `{ devices: DeviceView[]; currentDeviceId: string | null }` (`currentDeviceId` from the session).
  - `PATCH /devices/:id { name }` (1–40 chars, trimmed) → `DeviceView`; another user's device → 404.
  - `GET /devices/:id/installs` → `Page<{ app: AppCard; createdAt }>` (empty until M4).
  - `GET /profile` → `{ email: string | null; createdAt }`.
  - `GET /profile/sessions` → `{ id; createdAt; lastSeenAt; ip; userAgent; current: boolean }[]`; `DELETE /profile/sessions/:id`.
  - `GET /auth/me` now returns `{ user: { id, email, role }; session: { kind: SessionKind; deviceId: string | null } }`.
  - `SessionService.resolve` extends user sessions per Global Constraints and updates `lastSeenAt` at most every 5 minutes; when extended, `AuthGuard` re-sets the cookie.
  - Client methods: `me()`, `devices()`, `renameDevice()`, `deviceInstalls()`, `profile()`, `sessions()`, `revokeSession()`, `requestEmailCode()`, `verifyEmailCode()`, `linkEmail*()`, `completeEnrollment()`, `logout()`.

- [ ] **Step 1: Write the failing tests** — `lists only my devices`, `rename validates length`, `cannot rename a foreign device (404)`, `revoking a session signs that browser out`, `session is extended when half-expired`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): devices, sessions and profile endpoints"`

---

### Task 7: Session-aware shell and sign-in pages

**Files:**
- Modify: `apps/web/src/shell/SiteShell.tsx` (async, reads the session), `apps/web/src/auth/session.ts`
- Create: `apps/web/src/auth/{is-ios-safari,safe-next}.ts`
- Create: `apps/web/app/(site)/signin/page.tsx`, `apps/web/app/(site)/signin/email/page.tsx` + `EmailSignIn.tsx` (client), `apps/web/app/(site)/enroll/done/page.tsx` + `EnrollDone.tsx` (client), `apps/web/app/signout/route.ts`
- Create: `apps/web/public/signin/step-{1,2,3}.svg` (own drawings of the iOS steps; no screenshots)
- Test: `apps/web/src/auth/is-ios-safari.test.ts`, `apps/web/src/auth/safe-next.test.ts`, `apps/web/e2e/signin.spec.ts`

**Interfaces:**
- Produces:
  - `isIosSafari(userAgent: string): boolean` — iPhone/iPad/iPod, or `Macintosh` with `Mobile/` (iPadOS desktop mode), and not `CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA|Instagram|FBAN|Telegram`.
  - `safeNext(raw: string | undefined, fallback = '/devices'): string` — only paths that start with `/` and not `//` or `/\`.
  - `/signin`: on iOS Safari — title «Вход через профиль», three numbered steps with the SVGs («Нажмите „Установить профиль“», «Откройте Настройки → Профиль загружен → Установить», «Safari откроется сам, и вы войдёте»), button «Установить профиль» → `/api/v1/enrollment/profile?next=…` (`&link=1` when `?link=1`), link «Войти по почте». Elsewhere — the email form first and the note «Вход по профилю работает в Safari на iPhone и iPad».
  - `/signin/email`: step 1 email → step 2 six-digit code (`inputmode="numeric"`, `autocomplete="one-time-code"`), «Отправить код ещё раз» after 60 s.
  - `/enroll/done`: `?t=` → calls `completeEnrollment`, then `location.replace(next)`; `?error=` → message from `errorMessages` and button «Попробовать снова» → `/signin`.
  - `/signout` (GET route handler): requires `Sec-Fetch-Site` `same-origin` or `none`, calls `POST /auth/logout` with the cookie and `Origin: SITE_URL`, clears the cookie, redirects to `/`.
  - `SiteShell` passes `signedIn = session?.session.kind === 'user'` (staff sessions keep the guest header on the public site).

- [ ] **Step 1: Write the failing tests**

```ts
it('detects Safari on iPhone and iPad desktop mode', () => {
  expect(isIosSafari(UA_IPHONE_SAFARI)).toBe(true);
  expect(isIosSafari(UA_IPAD_DESKTOP)).toBe(true);
  expect(isIosSafari(UA_IPHONE_CHROME)).toBe(false);
  expect(isIosSafari(UA_WINDOWS_CHROME)).toBe(false);
});
it('safeNext refuses other origins', () => {
  expect(safeNext('//evil.com')).toBe('/devices');
  expect(safeNext('/app/tg')).toBe('/app/tg');
});
// e2e/signin.spec.ts
test('desktop sign-in offers email', async ({ page }) => { /* desktop-chromium: email field visible, note visible */ });
test('iPhone sign-in offers the profile', async ({ page }) => { /* mobile-webkit UA: «Установить профиль» href has /api/v1/enrollment/profile */ });
test('email sign-in reaches the devices page', async ({ page }) => { /* code from Mailpit → /devices, header shows «Выйти» */ });
test('simulated iOS response signs in', async ({ page, request }) => {
  // request.get profile → parse nonce from the signed plist → POST fake device response (maxRedirects: 0)
  // page.goto(location) → lands on /devices with the device card
});
test('expired enrollment shows retry', async ({ page }) => { /* /enroll/done?error=ENROLLMENT_EXPIRED → «Попробовать снова» */ });
test('sign-out returns the guest header', async ({ page }) => { /* … */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** The e2e API server gets `ENROLL_TRUST_ANCHORS_PATH` of the fake CA and the dev signing identity.
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS in both projects.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): sign-in by profile and by email, enrollment hand-off, sign-out"`

---

### Task 8: «Ваши устройства», «Профиль» and the admin users area

**Files:**
- Create: `apps/web/app/(account)/layout.tsx` (guard: no user session → `redirect('/signin?next=' + path)`), `apps/web/app/(account)/devices/page.tsx`, `apps/web/app/(account)/profile/page.tsx`, `apps/web/src/account/{DeviceCard,RenameDevice,SessionsList,EmailForm}.tsx`
- Modify: `apps/web/src/app-page/install-button-state.ts`
- Create: `apps/api/src/admin-users/{admin-users.module,admin-users.controller}.ts`
- Create: `apps/web/app/admin/users/page.tsx`, `apps/web/app/admin/users/[id]/page.tsx`, `apps/web/app/admin/devices/[id]/page.tsx`
- Test: `apps/web/src/app-page/install-button-state.test.ts`, `apps/api/test/admin-users.int.test.ts`, `apps/web/e2e/account.spec.ts`

**Interfaces:**
- Produces:
  - `installButtonState` adds `InstallCtx.devices: { status: DeviceStatus }[]` and the state `add_device` («Добавить устройство», `/signin?link=1&next=/app/<slug>`) for a signed-in user with no devices. Other signed-in cases stay `unavailable` until M4/M5.
  - `/devices`: one `DeviceCard` per device (name with rename, model, status label, «Добавлено …»; rights and actions arrive in M3–M6), «Это устройство» marker for `currentDeviceId`, «Добавить устройство» → `/signin?link=1`, install history (empty state «Установок пока нет»).
  - `/profile`: «Почта для уведомлений» (shows the email or the code form), «Активные сеансы» with «Завершить», button «Выйти».
  - Admin API (`support` reads, `admin` writes, audited): `GET /admin/users?q=` (email contains, or UDID prefix ≥ 6 chars), `GET /admin/users/:id` (devices, sessions count, created), `POST /admin/users/:id/block` (sets `blockedAt`, deletes all sessions), `POST /admin/users/:id/unblock`, `PATCH /admin/users/:id { role }` (admin only; an admin cannot change their own role), `GET /admin/devices/:id`, `POST /admin/devices/:id/status { status: 'blocked' | 'new' }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('signed-in user without devices is offered to add one', () => {
  expect(installButtonState({ signedIn: true, devices: [], app: FREE_APP }).kind).toBe('add_device');
});
// admin-users.int.test.ts
it('finds a user by UDID prefix', async () => { /* q=00008110 → the owner */ });
it('blocking ends every session', async () => { /* user agent → 401 afterwards */ });
it('an admin cannot demote themselves', async () => { /* 409 */ });
// e2e/account.spec.ts
test('guest is sent to sign in from /devices', async ({ page }) => { /* → /signin?next=%2Fdevices */ });
test('rename a device', async ({ page }) => { /* … */ });
test('end another session', async ({ page }) => { /* … */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the pages, the admin API and admin pages.** Run the design skill «Verification» on `/devices` and `/profile` at 390px and 1280px; the header must show the signed-in variant with the active item.
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): devices and profile pages, admin users and devices"`

---

### Task 9: Milestone gate and real-device check

- [ ] **Step 1: Full local gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Expected: all pass.
- [ ] **Step 2: Production compose** — confirm the Caddy certificate path inside `/caddy`, set `ENROLL_CERT_PATH`/`ENROLL_KEY_PATH`, run `bash infra/smoke.sh`; extend it with `curl -kfsS -o /dev/null -w '%{content_type}' https://localhost/api/v1/enrollment/profile | grep -q aspen-config`.
- [ ] **Step 3: Real iPhone (owner)** — on a public HTTPS host: download the profile in Safari, check that iOS shows «Проверено», install, confirm Safari opens `/enroll/done` and lands on `/devices`, confirm no profile remains in Settings. If iOS refuses the ECDSA-signed profile, switch the site certificate to RSA with Caddy `key_type rsa2048` and repeat. Record the raw callback body to a file outside git, then run `IOS_REAL_FIXTURE=<path> pnpm --filter @xstore/api test -- device-response` (a test that runs only when the variable is set and checks that the real response verifies against the Apple root).
- [ ] **Step 4: Request review** — `superpowers:requesting-code-review` on the M2 branch.
- [ ] **Step 5: Docs** — README/CLAUDE.md: Mailpit URL, `dev:certs`, new env variables. Commit `docs: M2 commands and environment`.
