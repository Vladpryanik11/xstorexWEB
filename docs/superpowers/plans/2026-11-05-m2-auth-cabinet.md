# M2 Sign-in and Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A returning visitor signs in by email code; «Подключить iPhone» gets a UDID inside an existing owner session. First checkout creates its own account without mandatory sign-in (M5), and the subscription starts at payment, independently of device connection.

**Revision:** [purchase and subscription design, 2026-11-06](../specs/2026-11-06-purchase-and-activation-design.md). UDID connects a device and is never an account-login credential.

**Architecture:**
- API: new modules `enrollment` (authenticated device connection, CMS verification, session-bound hand-off), `devices`, `profile`; `auth` gains user sessions and email codes.
- Mail goes through a new `notifications` BullMQ queue; the worker sends it over SMTP (Mailpit in development). M7 adds logging, templates for the remaining events and SMTP settings.
- Web: the shell reads the session on the server; account pages live in an `(account)` route group whose layout redirects guests.

**Tech Stack:** M1 stack plus `pkijs` 3.x and `asn1js` 3.x (CMS sign and verify through WebCrypto, RSA and ECDSA keys), `nodemailer` 7.x (worker), Mailpit (`axllent/mailpit`, pinned by digest) for development and tests.

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` — §3.1 (`auth`, `enrollment`, `devices`), §4.1, §5 (`User`, `Session`, `EnrollmentSession`, `Device`), §6.2 (signed-in header), §6.3 (`/signin`, `/enroll/done`, `/devices`, `/profile`, admin «пользователи и устройства»), §7, §9 («разбор ответа iOS по записанным примерам», e2e «вход через симуляцию ответа iOS») → M2. Builds on M1 (sessions, guards, rate limit, audit, typed client).

## Owner decisions this plan depends on

1. **Signing certificate for `.mobileconfig`.** Production uses the Let's Encrypt certificate that Caddy already holds for `SITE_DOMAIN`: the `caddydata` volume is mounted read-only into `api`. Development uses a self-signed certificate (iOS then shows «Не проверено», which is expected).
2. **A UDID already owned by another account** cannot be linked to the signed-in account (`DEVICE_OWNED`), because rights are bound to the device. Moving devices between accounts is an admin action (M5 adds the rights side).
3. **One verified email per account.** Normal linking to an occupied email fails with `EMAIL_TAKEN`. Verified recovery claims only provisional checkout purchases addressed to that email; confirmed accounts and staff are never merged (design §7).
4. **Real-device test.** Before the milestone closes the owner installs the profile on a real iPhone through a public HTTPS host (staging VPS or a tunnel). The recorded response contains the device UDID, so it stays out of git unless the owner allows it.

## Global Constraints

- All M0 and M1 Global Constraints hold.
- Enrollment session TTL: 15 minutes. One-time `/enroll/done` token TTL: 5 minutes, single use. Email code: 6 digits, TTL 10 minutes, 5 attempts.
- User session TTL: 30 days, extended back to 30 days on use when fewer than 15 remain. Staff session TTL stays 12 hours.
- `.mobileconfig`: `Content-Type: application/x-apple-aspen-config`, file name `xstore-connect.mobileconfig`, `PayloadType` `Profile Service`, `PayloadIdentifier` `ru.xstorex.enroll`, `PayloadDisplayName` «Xstore — подключение iPhone», `PayloadOrganization` «Xstore», `DeviceAttributes` `UDID, PRODUCT, VERSION, SERIAL`. `SERIAL` is requested by the spec but never stored.
- Rate limits (Redis, from M1): profile download 10 per 10 min per IP; callback 20 per 10 min per IP; code request 3 per 15 min per email and 10 per hour per IP; code verify 10 per 10 min per IP.
- Never log UDIDs in full outside the audit log: pino `redact` plus a `maskUdid(udid)` helper (`00008110-…A1B2`) for messages.
- Email addresses are normalized with `trim().toLowerCase()` everywhere.
- Enrollment requires a live user session and captures its user and session id; known or unknown UDID never opens an account. Completion cannot recreate a revoked session.
- Provisional checkout accounts have `isProvisional = true`, `email = null`, `checkoutEmail`; normal/staff accounts default to false. Checkout email alone never authorizes an existing account.
- M2 does not require device connection before a later M5 payment; physical registration and paid subscription are separate states.

## Review Focus

1. **Expired or reused enrollment** (profile installed after 15 minutes, the same nonce posted twice): Safari opens `/enroll/done?error=ENROLLMENT_EXPIRED` with «Время входа истекло» and «Попробовать снова» → Task 4 int tests `expired nonce`, `nonce is single use`.
2. **Desktop or non-Safari on `/connect-device`:** explain continuing in Safari; `/signin` offers email on every platform → Task 7 tests `desktop connection explains Safari`, `iPhone sign-in offers email`.
3. **Device owned by another account** during «Добавить устройство» → `DEVICE_OWNED` page with a support link, no change to either account → Task 4 int test `refuses a device owned by someone else`.
4. **Code guessing and account probing:** five wrong codes invalidate the code; the request endpoint always answers 204 → Task 5 int tests `five attempts then dead`, `no enumeration`.
5. **Email with capitals or spaces** (` Ivan@Mail.RU `): the same account every time → Task 5 int test `normalizes email`.

---

### Task 1: Users, devices and enrollment data model

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m2_devices`)
- Modify: `packages/shared/src/auth.ts` (extend M1 auth contract); create `packages/shared/src/devices.ts`, `packages/shared/src/navigation.ts` (+ exports)
- Modify: `packages/shared/src/errors.ts`
- Test: `packages/shared/src/devices.test.ts`, `packages/shared/src/navigation.test.ts`, `packages/db/test/devices.int.test.ts`, `packages/db/test/catalog.int.test.ts` (legacy event preservation and device deletion)

**Interfaces:**
- Produces (Prisma):
  - `enum DeviceStatus { new pending processing active blocked expired }`, `enum EnrollmentStatus { pending completed failed expired }`.
  - `Device { id; userId → User; udid String @unique; product String; iosVersion String; name String; status DeviceStatus @default(new); appleAccountId String?; registeredAt DateTime?; createdAt }` (the `AppleAccount` relation arrives in M3).
  - `User.isProvisional Boolean @default(false)`, `User.checkoutEmail String?`, index `(isProvisional, checkoutEmail)`; CHECK `NOT isProvisional OR (email IS NULL AND checkoutEmail IS NOT NULL)`.
  - `EnrollmentSession { nonce String @id; status EnrollmentStatus @default(pending); userId String; sessionId String; deviceId String?; next String?; expiresAt; createdAt }`, originating session relation cascades on deletion. Identity comes from the authenticated request.
  - `Session.deviceId String?` → `Device` (`onDelete: SetNull`).
  - `InstallEvent.deviceId String?` gets an optional relation to `Device` with `onDelete: SetNull`; migration nulls unmatchable M1 references so catalog event counts survive.
- Produces (`@xstore/shared`):
  - Codes and messages: `ENROLLMENT_EXPIRED` «Время подключения истекло. Попробуйте ещё раз.», `ENROLLMENT_INVALID` «Не удалось проверить ответ устройства. Попробуйте ещё раз.», `DEVICE_OWNED` «Это устройство уже привязано к другому аккаунту. Войдите в него или напишите в поддержку.», `ACCOUNT_BLOCKED` «Аккаунт заблокирован», `CODE_INVALID` «Неверный или устаревший код», `EMAIL_TAKEN` «Эта почта уже привязана к другому аккаунту».
  - `safeNext(raw: string | undefined, fallback = '/devices'): string` in shared/navigation.ts: internal paths only; reject //, backslashes, controls and encoded external-origin bypasses. Both API and web import this one helper.
  - `normalizeEmail(raw: string): string`; `emailSchema = z.string().trim().toLowerCase().pipe(z.email())`.
  - `udidSchema = z.string().regex(/^([0-9a-f]{40}|[0-9A-F]{8}-[0-9A-F]{16})$/)` (pre-2018 40-hex and the newer 8-16 form); `maskUdid(udid: string): string`.
  - `deviceModelName(product: string): string` — table for iPhone XS (`iPhone11,2`) through current models and common iPads; unknown products return the input.
  - `DeviceView = { id, name, model, udidMasked, status, statusLabel, registeredAt: string | null, createdAt: string }`; `renameDeviceSchema` accepts a trimmed 1–40 character name. `deviceStatusLabel: Record<DeviceStatus, string>` = Новое / Ожидает регистрации / Регистрируется в Apple (до 72 часов) / Зарегистрировано в Apple / Заблокировано / Срок истёк. Subscription dates and validity are separate M5 fields; the legacy expired device state does not drive billing.

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 2: Run them to verify they fail** — Run: `pnpm --filter @xstore/shared test && pnpm --filter @xstore/db test:int`. Expected: FAIL.
- [ ] **Step 3: Implement the schema (`pnpm db:migrate --name m2_devices`) and the shared module.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): devices, enrollment sessions and device contracts"`

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
  - `NotifyService.send(job: NotificationJob): Promise<void>` (API) — adds the job with `removeOnComplete: true` and `removeOnFail: true`; use bounded retries, then remove terminal failed jobs so auth codes do not remain in Redis.
  - Worker `createNotificationsWorker(deps)` sends with nodemailer (pool off, 10 s timeouts); SMTP errors are retried by the default job options.

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 2: Run them to verify they fail.** Run: `pnpm infra:up && pnpm --filter @xstore/worker test && pnpm --filter @xstore/worker test:int`. Expected: FAIL.
- [ ] **Step 3: Implement the queue, templates, mailer, API service and Mailpit wiring.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(notifications): mail queue with SMTP delivery and Mailpit for development"`

---

### Task 3: Signed enrollment profile

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
  - `GET /enrollment/profile?next=<internal path>` uses `@RequireUser()` and requires a live user session; it creates EnrollmentSession with 32 random bytes base64url nonce, captured userId/sessionId, and Task 1 shared safeNext. Returns the signed profile; guest →401, never a nullable owner or link-only mode.

- [ ] **Step 1: Write the failing tests**

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

- [ ] **Step 2: Run them to verify they fail** — `pnpm --filter @xstore/api test`. Expected: FAIL.
- [ ] **Step 3: Implement `profile-builder.ts`, `cms.ts` (`signCms` and `verifyCms`), `signing-identity.ts`, the profile endpoint and `dev:certs`.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(enrollment): signed Profile Service mobileconfig"`

---

### Task 4: Authenticated enrollment callback and hand-off

**Files:**
- Create: `apps/api/src/enrollment/{device-response,enroll.service}.ts`, `apps/api/test/helpers/fake-ios.ts`, `apps/api/test/fixtures/ios/README.md`.
- Add: `apps/api/certs/AppleIncRootCertificate.pem` from the official Apple root, converted to PEM.
- Modify: `apps/api/src/enrollment/enrollment.controller.ts`, `apps/api/src/app.ts` (raw callback parser).
- Test: `apps/api/src/enrollment/device-response.test.ts`, `apps/api/test/enrollment.int.test.ts`.

**Interfaces:**
- Env `ENROLL_TRUST_ANCHORS_PATH` defaults to the bundled Apple root; tests use a fake iOS CA.
- Consumes Task 3 `verifyCms`; `parseDeviceResponse(content: Buffer): { udid: string; product: string; version: string; challenge: string }` validates plist `UDID`, `PRODUCT`, `VERSION`, `CHALLENGE`; SERIAL is not stored.
- `GET /enrollment/profile?next=<internal path>` requires a user session; captures `userId`, `sessionId` and server-validated `next` in the nonce before returning Task 3's signed profile.
- `POST /enrollment/callback?s=<nonce>`: raw `application/pkcs7-signature`, ≤64 KB, Origin-exempt. Enrollment profile and completion endpoints are user-session-only via `@RequireUser()`; callback remains nonce- and source-session-bound. Verify nonce/TTL, source DB session, CMS/Apple chain and challenge. Under a nonce/session lock, reuse the same owner's device or create only a Device for the captured owner; foreign owner → `DEVICE_OWNED`, blocked owner → `ACCOUNT_BLOCKED`. Never create User or log in by UDID. Mark completed and store Redis `enroll:done:<sha256(token)> = { userId, sessionId, deviceId, next }`, EX 300; redirect `301 /enroll/done?t=<token>`. Errors redirect with code; failed/expired state is recorded.
- `POST /enrollment/complete { token }` uses `@RequireUser()` and requires the same live originating user session, consumes `GETDEL`, rechecks DB session/owner, updates its `deviceId`, returns `{ next }` (default `/devices`). Expired/replayed token or revoked session → `ENROLLMENT_EXPIRED`; no new identity or session from hand-off alone.
- `signDeviceResponse(fields, ca): Promise<Buffer>` produces fake signed iOS responses for tests.

- [ ] **Step 1: Write failing tests** — `connects inside an existing owner session` asserts unchanged user id and one new Device; `guest cannot start enrollment` → 401/no User; `known UDID cannot log in`; `same device is idempotent`; `foreign owner is unchanged`; `tampered payload`, `challenge mismatch`, `expired nonce`, `nonce/token single use`; `revoked source rejects callback and complete`.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test && pnpm --filter @xstore/api test:int`. Expected: FAIL on missing connection behavior.
- [ ] **Step 3: Implement** `parseDeviceResponse`, controller and EnrollService with the captured-session checks. Fixture README explains recording real responses outside git.
- [ ] **Step 4: Run the same commands.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(enrollment): connect devices inside authenticated owner sessions"`.

---

### Task 5: Email sign-in, linking and verified recovery of checkout accounts

**Files:**
- Create: `apps/api/src/auth/{email-code.service,email-auth.controller,claim-provisional}.ts`, `apps/api/src/profile/{profile.module,profile.controller}.ts`.
- Modify: `apps/api/src/config/config.ts`, `.env.example` (`AUTH_SECRET`, 32+ random bytes base64).
- Test: `apps/api/test/email-auth.int.test.ts`, `apps/api/test/claim-provisional.int.test.ts`.

**Interfaces:**
- `EmailCodeService.issue(email): Promise<void>` uses `crypto.randomInt(0, 1_000_000)`, zero-padded, Redis `auth:code:<sha256(email)> = { mac: HMAC-SHA256(AUTH_SECRET, email + ':' + code), attempts: 0 }`, EX 600; sends `email-code`.
- `verify(email, code): Promise<boolean>` timing-safe comparison; atomically increments failures, removes at 5; success consumes code once. Keep the existing per-email/IP rate limits.
- `POST /auth/email/request { email }` → always 204. `POST /auth/email/verify { email, code }` → consume code → `claimProvisional` → new user cookie, 204. Invalid → `CODE_INVALID`; blocked or staff target → `ACCOUNT_BLOCKED`.
- `claimProvisional(db, verifiedEmail: string): Promise<{ userId: string }>`: serializable transaction/advisory lock on normalized email. Resolve confirmed `role user` target, promote one matching provisional account or create a confirmed user. Lock eligible provisional accounts with the same checkoutEmail; transfer their devices and dependent ownership, retaining ids. Revoke source sessions/enrollment; retire source users by `blockedAt`; return target. Never merge confirmed accounts, staff, blocked users or different contact emails. Source Redis hand-offs also fail because their DB session is gone.
- M2 owns device/session transfer. M4/M6 add their signing/upload ownership to this transaction; M5 adds subscription/order ownership. Recovery conflicts roll back completely and keep purchases available to their original owner/support.
- `POST /profile/email/request|verify` use `@RequireUser()` and remain authenticated. Ordinary occupied email → `EMAIL_TAKEN`; only verified recovery can claim provisional purchases. Changing checkout contact after a paid order requires a valid code to the new email (billing records added in M5).

- [ ] **Step 1: Write failing tests** — `code signs in`, `five failures invalidate code`, `one successful consumption`, `known/unknown request both 204`, `normalized email is one identity`; recovery assertions: only matching provisional data moves, ids survive, confirmed/staff/blocked records do not move, source sessions and in-flight enrollment fail, parallel recovery has one target, plain typed email gives no existing-account session.
- [ ] **Step 2: Run** `pnpm --filter @xstore/api test:int`. Expected: FAIL on new behavior.
- [ ] **Step 3: Implement** the services/controllers and the transaction; do not add a general account-merge endpoint.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): email sign-in and verified recovery of checkout purchases"`.

---

### Task 6: Devices, sessions and profile API

**Files:**
- Create: `apps/api/src/devices/{devices.module,devices.controller,devices.service}.ts`
- Modify: `apps/api/src/profile/profile.controller.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.guard.ts`, `apps/api/src/auth/roles.decorator.ts`, `apps/api/src/auth/session.service.ts` (sliding expiry, `lastSeenAt`), `apps/web/src/auth/session.ts`, `packages/shared/src/client.ts`
- Test: `apps/api/test/devices.int.test.ts`, `apps/api/test/profile.int.test.ts`

**Interfaces:**
- Produces (all user endpoints use `@RequireUser()`; staff sessions are explicitly rejected):
  - `GET /devices` → `{ devices: DeviceView[]; currentDeviceId: string | null }` (`currentDeviceId` from the session).
  - `PATCH /devices/:id { name }` (1–40 chars, trimmed) → `DeviceView`; another user's device → 404.
  - `GET /devices/:id/installs` → `Page<{ app: AppCard; createdAt }>` (empty until M4).
  - `GET /profile` → `{ email: string | null; createdAt }`.
  - `GET /profile/sessions` → `{ id; createdAt; lastSeenAt; ip; userAgent; current: boolean }[]`; `DELETE /profile/sessions/:id`.
  - `GET /auth/me` now returns `{ user: { id, email, role }; session: { kind: SessionKind; deviceId: string | null } }`.
  - `SessionService.resolve` extends user sessions per Global Constraints and updates `lastSeenAt` at most every 5 minutes; when extended, `AuthGuard` re-sets the cookie.
  - Client methods: `me()`, `devices()`, `renameDevice()`, `deviceInstalls()`, `profile()`, `sessions()`, `revokeSession()`, `requestEmailCode()`, `verifyEmailCode()`, `linkEmail*()`, `completeEnrollment()`, `logout()`.

- [ ] **Step 1: Write the failing tests** — `staff session is rejected by user-only endpoints`, `/auth/me returns the shared nested contract for staff and user sessions`, `lists only my devices`, `rename validates length`, `cannot rename a foreign device (404)`, `revoking a session signs that browser out`, `user cookie renews when half-expired`, `staff expiry is unchanged`, `renewed cookie is Secure behind HTTPS proxy`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): devices, sessions and profile endpoints"`

---

### Task 7: Session-aware shell, email sign-in and separate device connection

**Files:**
- Modify: `apps/web/src/shell/SiteShell.tsx`; create `apps/web/src/auth/{session,is-ios-safari}.ts`.
- Create: `apps/web/app/(site)/signin/page.tsx` + `EmailSignIn.tsx`, `apps/web/app/(site)/signin/email/page.tsx` (redirect), `apps/web/app/(site)/connect-device/page.tsx`, `apps/web/app/(site)/enroll/done/page.tsx` + `EnrollDone.tsx`, `apps/web/app/signout/route.ts`.
- Create: `apps/web/public/signin/step-{1,2,3}.svg` (own illustrations).
- Test: `apps/web/src/auth/is-ios-safari.test.ts`, `packages/shared/src/navigation.test.ts`, `apps/web/e2e/signin.spec.ts`.

**Interfaces:**
- `isIosSafari(userAgent: string): boolean`: iPhone/iPad/iPod or Macintosh+Mobile, excluding CriOS/FxiOS/EdgiOS/OPiOS/YaBrowser/GSA/Instagram/FBAN/Telegram.
- Consume Task 1 shared `safeNext`; apply in both web and API before persisting an enrollment/order continuation.
- `/signin`: email then six-digit code on all devices (`inputmode=numeric`, `autocomplete=one-time-code`), resend after 60 s. A live user session skips the form. Preserve safe `next`; `/signin/email` redirects here. No device-only account-login route.
- `/connect-device`: user session required; guest → `/signin?next=…`. Safari shows «Подключить iPhone» and the profile/Settings/return steps; desktop/non-Safari explains continuing in Safari on iPhone/iPad. Profile URL retains the validated original continuation.
- `/enroll/done`: complete with original cookie then replace with server-provided safe next; errors retry connection, not payment. Cookie loss requires email sign-in and a fresh enrollment, preserving the paid order.
- `SiteShell` passes signedIn only for user sessions, including that buyer's own provisional session. Staff sessions keep the public guest header. Sign-out GET requires same-origin/none Sec-Fetch-Site, POSTs logout with Origin, clears cookie and redirects home.

- [ ] **Step 1: Write failing tests** — email form on desktop/iPhone; Safari-only connection instructions; guest cannot connect; safeNext refuses external/backslash/encoded paths; successful simulated callback retains identity and next; expired profile retries connection; lost cookie cannot complete old token; sign-out restores guest header.
- [ ] **Step 2: Run** `pnpm --filter @xstore/web test && pnpm --filter @xstore/web test:e2e`. Expected: FAIL.
- [ ] **Step 3: Implement** pages, shell and guards. Test API uses fake trust anchors and signing identity; query strings do not authorize orders.
- [ ] **Step 4: Run the same commands.** Expected: PASS in both Playwright projects; check keyboard/focus and 390/1280px.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): email login and separate iPhone connection"`.

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
  - Account pages can offer «Подключить iPhone» → `/connect-device?next=…`, but app-page purchase must not require connection first. Keep M1 transitional app states until M5 adds the public offer and three purchase scenarios; do not add a permanent `signin`/`add_device` payment prerequisite.
  - `/devices`: one `DeviceCard` per device (name with rename, model, status label, «Добавлено …»; rights and actions arrive in M3–M6), «Это устройство» marker for `currentDeviceId`, «Подключить iPhone» → `/connect-device`, install history (empty state «Установок пока нет»).
  - `/profile`: «Почта для уведомлений» (shows the email or the code form), «Активные сеансы» with «Завершить», button «Выйти».
  - Admin API (`support` reads, `admin` writes, audited): `GET /admin/users?q=` (email contains, or UDID prefix ≥ 6 chars), `GET /admin/users/:id` (devices, sessions count, created), `POST /admin/users/:id/block` (sets `blockedAt`, deletes all sessions), `POST /admin/users/:id/unblock`, `PATCH /admin/users/:id { role }` (admin only; an admin cannot change their own role), `GET /admin/devices/:id`, `POST /admin/devices/:id/status { status: 'blocked' | 'new' }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('account device action connects without forcing the purchase flow', () => {
  // DeviceCard links /connect-device; app flow is completed in M5, not gated by UDID here.
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
- [ ] **Step 2: Production compose** — confirm the Caddy certificate path inside `/caddy`, set `ENROLL_CERT_PATH`/`ENROLL_KEY_PATH`, run `bash infra/smoke.sh`; check that an unauthenticated profile request answers 401; the authenticated signed-profile response is covered by Task 4 integration tests and the real-device check below.
- [ ] **Step 3: Real iPhone (owner)** — on a public HTTPS host: sign in by email, open /connect-device and download the profile in Safari, check that iOS shows «Проверено», install, confirm Safari opens `/enroll/done` and lands on `/devices`, confirm no profile remains in Settings. If iOS refuses the ECDSA-signed profile, switch the site certificate to RSA with Caddy `key_type rsa2048` and repeat. Record the raw callback body to a file outside git, then run `IOS_REAL_FIXTURE=<path> pnpm --filter @xstore/api test -- device-response` (a test that runs only when the variable is set and checks that the real response verifies against the Apple root).
- [ ] **Step 4: Request review** — `superpowers:requesting-code-review` on the M2 branch.
- [ ] **Step 5: Docs** — README/CLAUDE.md: Mailpit URL, `dev:certs`, new env variables. Commit `docs: M2 commands and environment`.
