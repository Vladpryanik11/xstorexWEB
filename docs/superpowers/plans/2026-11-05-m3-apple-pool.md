# M3 Apple Account Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin adds Apple Developer accounts by App Store Connect API key; the worker keeps each account ready to sign (wildcard App ID, distribution certificate, Ad Hoc profile), registers devices into the right account, watches certificates through OCSP and reacts to revocation, blocked accounts and expiring memberships.

**Architecture:**
- New Node-only packages: `@xstore/secrets` (AES-256-GCM with key versions; decrypt export restricted by lint) and `@xstore/apple` (ASC client, error classification, account choice, key/CSR/p12 helpers).
- API `apple` module: admin endpoints for accounts, alerts and device registration; it encrypts keys on input and only enqueues work.
- Worker `apple` queue does all ASC calls under a per-account Redis lock: `setupAccount`, `registerDevice`, `pollProcessing`, `ocspCheck`, `handleRevocation`, `membershipCheck`.
- A small `Alert` table feeds the admin and an `admin-alert` email.

**Tech Stack:** M2 stack plus `jose` 6.x (ES256 JWT), `node-forge` 1.3.x (RSA key, CSR, PKCS#12), `pkijs`/`asn1js` (OCSP, from M2).

**Spec:** `docs/superpowers/specs/2026-11-02-xstore-design.md` — §2 («Подпись»), §3.1 (`apple`, `devices`), §4.2 steps 3–5, §4.6, §5 (Apple models, `Enc` rule), §6.3 (admin «аккаунты Apple»), §7, §8 (ASC error kinds), §12 → M3. Builds on M2 (`Device`, notifications queue).

## Owner decisions this plan depends on

1. **Wildcard App ID `*`** (the identifier Xcode uses for its own wildcard), so every app keeps its bundle id. If ASC refuses `*` for an account, the fallback is `ru.xstorex.*`, which forces a bundle id change on every app (spec §12 limits stay the same).
2. **Fill accounts in order.** A new device goes to the fullest account of its tier that still has a slot, so one signed copy serves as many devices as possible (spec §4.3 note).
3. **Certificate rotation.** 30 days before a distribution certificate expires the worker issues a new one and a new profile, and never revokes the old one (that would kill installed apps). If Apple's certificate limit is reached the admin gets an alert to free a slot in developer.apple.com.
4. **`membershipExpiresAt` is entered by the admin.** The ASC API does not expose membership dates.
5. **New tables and fields** (approved 2026-11-05, already in spec §5): `Alert` (admin alerts), `Device.ascDeviceId`, `Device.includedInRevision`, `AppleAccount.usedIphoneSlots`/`usedIpadSlots` (Apple counts 100 per device family), `ProvisioningProfile.ascProfileId`.

## Global Constraints

- All M0–M2 Global Constraints hold.
- Encrypted field format: `v<keyVersion>.<iv b64url>.<tag b64url>.<ciphertext b64url>`, AES-256-GCM, 12-byte IV. Keys: `MASTER_KEY_V<n>` (32 bytes, base64), current version `MASTER_KEY_CURRENT`. Missing key → the process refuses to start.
- `@xstore/secrets/decrypt` may be imported only by `packages/apple`, `apps/worker/**` and `apps/api/src/apple/**`. Lint enforces it (Biome `noRestrictedImports` with overrides).
- Secrets never leave the process: not in API responses, logs, job data, `AuditLog.diff` or error messages. Job payloads carry ids only.
- ASC base URL `https://api.appstoreconnect.apple.com` (overridable by `ASC_BASE_URL` for tests only); JWT ES256, `aud` `appstoreconnect-v1`, lifetime 15 minutes.
- Device names sent to Apple: `xs-<first 8 chars of Device.id>`, no personal data.
- Profile names: `Xstore AdHoc r<revision>`; profile type `IOS_APP_ADHOC`; certificate type `DISTRIBUTION`.
- Every ASC write for an account runs inside `withAccountLock(accountId)`.
- Job schedules: `ocspCheck` every 10 minutes, `pollProcessing` every 30 minutes, `membershipCheck` daily at 06:00 Europe/Moscow.
- Settings (`Setting`, with defaults in code): `devices.lowSlotsThreshold` 10, `apple.minMembershipDays` 7, `apple.certRotateDays` 30, `apple.membershipWarnDays` 30.

## Review Focus

1. **Two registrations on one account at the same moment:** both devices end up in the final profile; revisions go 1→2→3 with no gaps or overwrite → Task 6 int test `parallel registrations serialize`.
2. **ASC answers 429 or 401:** 429 retries later without marking the account; 401/403 marks it `auth_error` and raises a critical alert → Task 3 test `classifies errors`, Task 5 int test `auth error marks the account`.
3. **UDID already on the Apple team** (re-enrollment, manual add): reused, no second slot → Task 6 int test `reuses an existing Apple device`.
4. **Every account full:** device becomes `pending`, a `low_slots` alert appears, and adding an account registers the waiting devices → Task 6 int test `waits for a slot`.
5. **OCSP responder unreachable:** status stays as it was, no revocation flow, an alert only when the last good check is older than 1 hour → Task 7 int test `responder down is not revocation`.

---

### Task 1: `@xstore/secrets`

**Files:**
- Create: `packages/secrets/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}`, `packages/secrets/src/{keyring,encrypt,decrypt,index}.ts`, `apps/worker/src/cli/rotate-secrets.ts`
- Modify: `biome.json` (restricted import + overrides), `.env.example` (`MASTER_KEY_V1` dev value, `MASTER_KEY_CURRENT=1`), `apps/api/src/app.module.ts` and `apps/worker/src/main.ts` pino `redact` lists
- Test: `packages/secrets/src/secrets.test.ts`, `apps/api/test/redaction.int.test.ts`

**Interfaces:**
- Produces:
  - `loadKeyring(env: NodeJS.ProcessEnv): Keyring` — `{ current: number; keys: Map<number, Buffer> }`; throws naming the bad variable.
  - `@xstore/secrets/encrypt`: `encryptSecret(plain: Buffer | string, keyring: Keyring): string`.
  - `@xstore/secrets/decrypt`: `decryptSecret(enc: string, keyring: Keyring): Buffer`; `reencrypt(enc, keyring): string` (for rotation).
  - Errors: `SecretFormatError`, `SecretKeyMissingError`, `SecretTamperedError` — messages never include input.
  - CLI `pnpm --filter @xstore/worker secrets:rotate` (`apps/worker/src/cli/rotate-secrets.ts`): re-encrypts every `*Enc` column with `MASTER_KEY_CURRENT`, in batches of 100, and prints only counts. Later milestones register their `Enc` columns in its table list.

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips', () => { expect(decryptSecret(encryptSecret('p8', ring), ring).toString()).toBe('p8'); });
it('uses a fresh IV each time', () => { expect(encryptSecret('x', ring)).not.toBe(encryptSecret('x', ring)); });
it('detects tampering', () => { const e = encryptSecret('x', ring); expect(() => decryptSecret(flipLastChar(e), ring)).toThrow(SecretTamperedError); });
it('decrypts old versions after rotation', () => {
  const old = encryptSecret('x', ringV1);
  expect(reencrypt(old, ringV1V2).startsWith('v2.')).toBe(true);
});
it('names a missing key', () => { expect(() => loadKeyring({ MASTER_KEY_CURRENT: '2' })).toThrow(/MASTER_KEY_V2/); });
// redaction.int.test.ts — logs captured from a request carrying privateKey/p12/password fields contain none of the values
```

- [ ] **Step 2: Run them to verify they fail** — `pnpm install && pnpm --filter @xstore/secrets test`. Expected: FAIL.
- [ ] **Step 3: Implement the package, the Biome rule and the redaction lists** (`*.privateKey`, `*.p12`, `*.p12Password`, `*.password`, `*.ascPrivateKeyEnc`).
- [ ] **Step 4: Verify the lint rule bites** — add `import { decryptSecret } from '@xstore/secrets/decrypt'` to `apps/api/src/catalog/catalog.service.ts`, run `pnpm lint`, expect an error, remove the line.
- [ ] **Step 5: Run the tests to verify they pass.** Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(secrets): versioned AES-256-GCM secrets with restricted decrypt"`

---

### Task 2: Apple data model

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (+ migration `m3_apple`), `packages/shared/src/errors.ts`
- Create: `packages/shared/src/apple.ts`
- Test: `packages/db/test/apple.int.test.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum AppleTier { standard reliable }`, `enum AppleAccountStatus { active auth_error blocked }`, `enum OcspStatus { unknown good revoked }`, `enum CertStatus { active rotated revoked expired }`.
  - `AppleAccount { id; title; teamId; tier; status @default(active); membershipExpiresAt DateTime; deviceLimit Int @default(100); usedIphoneSlots Int @default(0); usedIpadSlots Int @default(0); ascKeyId; ascIssuerId; ascPrivateKeyEnc; wildcardBundleAscId String?; lastRevokedAt DateTime?; createdAt; updatedAt }`, `CHECK (deviceLimit BETWEEN 1 AND 100)`.
  - `AppleCertificate { id; accountId; ascCertificateId; serial; p12Enc; p12PasswordEnc; expiresAt; status CertStatus @default(active); ocspStatus @default(unknown); checkedAt DateTime?; lastGoodCheckAt DateTime?; createdAt }`.
  - `ProvisioningProfile { id; accountId; revision Int; ascProfileId; certificateId; profileBlob Bytes; udids String[]; expiresAt; createdAt }`, `@@unique([accountId, revision])`.
  - `Device`: `appleAccountId` relation, `ascDeviceId String?`, `includedInRevision Int?`, `tierWanted AppleTier?`.
  - `Alert { id; kind String; severity String /* info|warning|critical */; title; details Json?; dedupeKey String? @unique; createdAt; resolvedAt DateTime? }`.
- Produces (`@xstore/shared`): codes `NO_SLOTS` «Свободных мест нет, мы зарегистрируем устройство, как только они появятся», `ASC_AUTH` «Apple отклонил ключ доступа», `ASC_KEY_INVALID` «Ключ App Store Connect не подошёл», `CERT_LIMIT` «У аккаунта Apple закончился лимит сертификатов»; `AppleAccountView` (no secret fields), `AlertView`.

- [ ] **Step 1: Write the failing test** — `deviceLimit above 100 is refused by the database`, `profile revision is unique per account`.
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement the schema** (`pnpm db:migrate --name m3_apple`, add the `CHECK` constraint to the SQL).
- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(db): Apple accounts, certificates, profiles and alerts"`

---

### Task 3: `@xstore/apple` — ASC client, keys and account choice

**Files:**
- Create: `packages/apple/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}`
- Create: `packages/apple/src/{asc-client,asc-errors,jwt,keys,pick-account,index}.ts`
- Create: `packages/apple/test/fake-asc.ts` (in-memory ASC over `node:http`), `packages/apple/test/fixtures/*.json`
- Modify: `packages/ios/src/` (+ `mobileprovision.ts`, export `parseMobileProvision`)
- Test: `packages/apple/src/*.test.ts`, `packages/ios/src/mobileprovision.test.ts`

**Interfaces:**
- Produces:
  - `createAscClient(opts: { keyId; issuerId; privateKeyPem; baseUrl?; fetch?; now?: () => Date }): AscClient` with `listDevices()` (follows `links.next`, `limit=200`), `findDeviceByUdid(udid)`, `registerDevice({ name, udid })`, `listCertificates()`, `createCertificate(csrPem)`, `findBundleId('*')`, `createWildcardBundleId()`, `createAdHocProfile({ name, bundleIdAscId, certificateAscId, deviceAscIds })` → `{ ascProfileId, profileContent: Buffer, expiresAt }`, `deleteProfile(id)`. Each call has a 30 s timeout.
  - `AscError extends Error { kind: 'auth' | 'rate_limited' | 'no_slots' | 'already_exists' | 'cert_limit' | 'not_found' | 'other'; status: number; retryAfterSec?: number }`; `classifyAscError(status, body): AscError['kind']`: 401/403 → `auth`; 429 → `rate_limited`; 409 with a detail matching `/already exists/i` → `already_exists`; 409 matching `/maximum number of (devices|certificates)/i` → `no_slots` or `cert_limit`; 404 → `not_found`; else `other`. The regexes are checked against recorded real responses in Task 10.
  - `signAscJwt({ keyId, issuerId, privateKeyPem, now }): Promise<string>`.
  - `generateKeyAndCsr(commonName: string): { privateKeyPem: string; csrPem: string }` (RSA 2048); `buildP12({ privateKeyPem, certificateDer, password }): Buffer`; `randomP12Password(): string` (24 chars).
  - `pickAccount(accounts: PickableAccount[], want: { tier: AppleTier; deviceClass: 'IPHONE' | 'IPAD'; now: Date; minMembershipDays: number; exclude?: string[] }): string | null` — eligible: `status active`, same tier, has an `active` certificate, membership beyond `now + minMembershipDays`, used slots of that class `< deviceLimit`, not excluded. Order: used slots desc, then `createdAt` asc.
  - `deviceClassOf(product: string): 'IPHONE' | 'IPAD'` — `iPad*` → IPAD, everything else IPHONE.
  - `startFakeAsc(port: number): Promise<FakeAsc>` and the script `pnpm --filter @xstore/apple fake-asc` (port 3199), so integration tests and the Playwright `webServer` list can run against it with `ASC_BASE_URL=http://localhost:3199`.
  - `@xstore/ios`: `parseMobileProvision(buf: Buffer): { uuid; name; teamId; expiresAt: Date; udids: string[]; certificatesDer: Buffer[]; entitlements: Record<string, unknown> }` (reads the CMS content without verifying it).

- [ ] **Step 1: Write the failing tests**

```ts
it('signs a JWT ASC accepts', async () => {
  const { payload, protectedHeader } = await jwtVerify(await signAscJwt(KEY), publicKey, { audience: 'appstoreconnect-v1' });
  expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: KEY.keyId, typ: 'JWT' });
  expect(payload.exp! - payload.iat!).toBe(900);
});
it('classifies errors', () => {
  expect(classifyAscError(401, {})).toBe('auth');
  expect(classifyAscError(429, {})).toBe('rate_limited');
  expect(classifyAscError(409, fixture('device-exists'))).toBe('already_exists');
  expect(classifyAscError(409, fixture('device-limit'))).toBe('no_slots');
});
it('pages through devices', async () => { /* fake ASC with 450 devices → 450 */ });
it('fills the fullest eligible account first', () => {
  expect(pickAccount([acc('a', 40), acc('b', 99), acc('c', 100)], WANT)).toBe('b');
});
it('skips accounts with membership ending within 7 days', () => { /* … */ });
it('counts iPad slots separately', () => { /* full on iPhone, free on iPad → picked for IPAD */ });
it('builds a p12 that opens with its password', () => { /* forge.pkcs12 parse → key + cert */ });
it('reads a mobileprovision', () => { /* fixture built in test with signCms → udids, expiresAt, teamId */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement the package and `FakeAsc`** (devices, certificates, bundle ids, profiles; switches to force 401, 429, device limit and certificate limit).
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): App Store Connect client, key helpers and account choice"`

---

### Task 4: Admin accounts API and account setup job

**Files:**
- Create: `apps/api/src/apple/{apple.module,accounts.controller,alerts.controller,accounts.service}.ts`
- Create: `apps/worker/src/apple/{lock,setup-account,profiles,certificates,alerts}.ts`, `apps/worker/src/queues/apple.ts`
- Modify: `packages/shared/src/queues.ts` (`QueueName.apple`, job schemas), `packages/shared/src/queues.ts` notification union (`admin-alert`), `apps/worker/src/notifications/templates.ts`
- Test: `apps/api/test/apple-accounts.int.test.ts`, `apps/worker/test/setup-account.int.test.ts`

**Interfaces:**
- Produces:
  - `withAccountLock<T>(redis, accountId, fn: () => Promise<T>): Promise<T>` — `SET lock:apple:<id> <token> NX PX 120000`, refreshed every 40 s while `fn` runs, released by compare-and-delete Lua; busy → throws `LockBusyError` (retried by job backoff).
  - `ensureCertificate(deps, account): Promise<AppleCertificate>` — uses an `active` row not expiring within `apple.certRotateDays`; else key + CSR → `createCertificate` → p12 → encrypted row; previous active row becomes `rotated`. `cert_limit` → critical alert `cert_limit:<accountId>`, throws.
  - `regenerateProfile(deps, account): Promise<ProvisioningProfile>` — ENABLED devices of the account from ASC, current certificate, wildcard bundle id → new profile `revision = max + 1` → row → delete the previous ASC profile → keep the last 3 rows → devices in `udids` that have `includedInRevision = null` get this revision and status `active`.
  - `raiseAlert(db, notify, alert: { kind; severity; title; details?; dedupeKey? })` — inserts unless `dedupeKey` exists; emails every admin with an email (`admin-alert`).
  - Job `apple:setupAccount { accountId }`: under the lock — `listDevices` → used slots per class; wildcard bundle id (find or create); `ensureCertificate`; `regenerateProfile`.
  - API (`@Roles('admin')`, audited, secrets never echoed):
    - `GET /admin/apple-accounts` → `AppleAccountView[]` (slots used/limit per class, status, active certificate expiry and OCSP, latest revision).
    - `POST /admin/apple-accounts { title, tier, teamId, membershipExpiresAt, deviceLimit, ascKeyId, ascIssuerId, privateKey }` → calls `listDevices` with the plaintext key first (`ASC_KEY_INVALID` on failure), then stores `encryptSecret(privateKey)` and enqueues `setupAccount`.
    - `PATCH /admin/apple-accounts/:id` (title, tier, deviceLimit, membershipExpiresAt, status `active`↔`blocked`), `PUT /admin/apple-accounts/:id/key` (same validation), `POST /admin/apple-accounts/:id/sync`.
    - `GET /admin/apple-accounts/:id` (certificates, last profiles, devices on the account).
    - `GET /admin/alerts?open=1` (support and admin), `POST /admin/alerts/:id/resolve`.

- [ ] **Step 1: Write the failing tests**

```ts
// apple-accounts.int.test.ts (FakeAsc)
it('adds an account without ever returning the key', async () => {
  const res = await admin.post('/api/v1/admin/apple-accounts').send(NEW_ACCOUNT);
  expect(JSON.stringify(res.body)).not.toContain('PRIVATE KEY');
  const row = await db.appleAccount.findFirstOrThrow();
  expect(row.ascPrivateKeyEnc.startsWith('v1.')).toBe(true);
  expect(JSON.stringify(await db.auditLog.findMany())).not.toContain('PRIVATE KEY');
});
it('refuses a key ASC rejects', async () => { /* FakeAsc 401 → 400 ASC_KEY_INVALID, nothing stored */ });
// setup-account.int.test.ts
it('prepares a fresh account', async () => { /* wildcard created, one active certificate, profile r1 */ });
it('rotates a certificate close to expiry without revoking it', async () => { /* old → rotated, new active, profile r2 */ });
it('raises one alert at the certificate limit', async () => { /* run twice → one Alert */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): account onboarding, certificates, profiles and alerts"`

---

### Task 5: Account health jobs — auth errors and membership

**Files:**
- Create: `apps/worker/src/apple/{health,membership}.ts`
- Modify: `apps/worker/src/queues/apple.ts` (repeatable jobs registered on start), `apps/worker/src/apple/*.ts` (catch `auth`)
- Test: `apps/worker/test/account-health.int.test.ts`

**Interfaces:**
- Produces:
  - `onAscError(deps, accountId, err: AscError)`: `auth` → account `auth_error`, critical alert `asc_auth:<accountId>` with the count of active devices on it, rethrow as unrecoverable (`UnrecoverableError`, no retries); `rate_limited` → `DelayedError` after `retryAfterSec ?? 60`; other kinds rethrow for normal retries.
  - Job `apple:membershipCheck` (daily): accounts with `membershipExpiresAt` within `apple.membershipWarnDays` → warning alert, dedupe `membership:<accountId>:<YYYY-MM-DD of expiry>`; already expired → status `blocked`, critical alert.

- [ ] **Step 1: Write the failing tests** — `auth error marks the account` (FakeAsc 401 during setup → `auth_error`, one critical alert, job failed without retries), `429 retries later` (account stays `active`, job delayed), `warns 30 days before membership ends, once`.
- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): handle ASC auth errors, rate limits and membership expiry"`

---

### Task 6: Device registration

**Files:**
- Create: `apps/worker/src/apple/{register-device,poll-processing}.ts`
- Modify: `apps/api/src/apple/` (+ `devices-admin.controller.ts`), `packages/shared/src/queues.ts`, notification templates (`device-active`)
- Test: `apps/worker/test/register-device.int.test.ts`

**Interfaces:**
- Produces:
  - Job `apple:registerDevice { deviceId, tier, excludeAccountIds?: string[] }`:
    1. Device already `active` on a non-excluded account → done.
    2. `pickAccount` (tier, class, settings) → `null` → device `pending` + `tierWanted`, `low_slots` alert, done.
    3. Under the account lock: `findDeviceByUdid` or `registerDevice` (`already_exists` → find); `no_slots` → bump used slots to the limit, retry with the next account (`exclude` + this one).
    4. Store `appleAccountId`, `ascDeviceId`, `registeredAt`; update used slots; ASC status `ENABLED` → `regenerateProfile` (device becomes `active`), otherwise status `processing`.
    5. When the tier's free slots across active accounts fall below `devices.lowSlotsThreshold` → `low_slots:<tier>:<YYYY-MM-DD>` warning.
  - Job `apple:pollProcessing` (every 30 min): devices in `processing` grouped by account → `listDevices` → ENABLED ones → one `regenerateProfile` per account → `device-active` email to the owner when an email exists («Устройство готово к установке приложений»).
  - After `setupAccount` succeeds, devices in `pending` with a matching `tierWanted` are re-enqueued (oldest first, at most the free slots).
  - Admin API: `POST /admin/devices/:id/register { tier }` (audited). M5 enqueues the same job after payment.

- [ ] **Step 1: Write the failing tests**

```ts
it('registers a device and includes it in a new profile', async () => { /* device active, includedInRevision 2, profile udids contain it */ });
it('reuses an existing Apple device', async () => { /* FakeAsc already has the UDID → no POST /devices, used slots unchanged */ });
it('moves on when Apple says the account is full', async () => { /* account A no_slots → registered on B */ });
it('waits for a slot', async () => { /* no account → pending + low_slots alert; add account → setup → device active */ });
it('parallel registrations serialize', async () => {
  // worker concurrency 2, two devices, one account → final profile has both UDIDs, revisions [1, 2, 3]
});
it('keeps processing devices out of the profile until Apple enables them', async () => { /* PROCESSING → processing; poll after ENABLED → active + email */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): device registration with account choice and processing poll"`

---

### Task 7: OCSP watch and revocation handling

**Files:**
- Create: `packages/apple/src/ocsp.ts`, `packages/apple/certs/AppleWWDRCAG{2,3,4,5,6}.pem` (public intermediates from `https://www.apple.com/certificateauthority/`)
- Create: `apps/worker/src/apple/{ocsp-check,revocation}.ts`
- Modify: notification templates (`reinstall-apps`)
- Test: `packages/apple/src/ocsp.test.ts`, `apps/worker/test/ocsp.int.test.ts`

**Interfaces:**
- Produces:
  - `checkOcsp(certDer: Buffer, opts: { issuers: Buffer[]; fetch?; timeoutMs = 10_000 }): Promise<'good' | 'revoked' | 'unknown'>` — issuer chosen by matching issuer name and key id; request with a SHA-1 `CertID` to the AIA OCSP URL (`POST`, `application/ocsp-request`); response signature checked against the issuer or a delegated responder certificate signed by it; network or parse failure → throws `OcspUnavailableError`.
  - Job `apple:ocspCheck` (every 10 min): every `active`/`rotated` certificate → `checkOcsp`; `good` → `ocspStatus good`, `checkedAt`, `lastGoodCheckAt`; `revoked` → `ocspStatus revoked`, status `revoked`, enqueue `handleRevocation`; `OcspUnavailableError` → `checkedAt` only, warning alert `ocsp_stale:<certId>` when `lastGoodCheckAt` is older than 1 hour.
  - Job `apple:handleRevocation { certificateId }`: account `lastRevokedAt = now` → `ensureCertificate` → `regenerateProfile` → `invalidateAccountBuilds(accountId)` (exported no-op in M3, implemented in M4) → `reinstall-apps` email to every owner of an active device on the account («Переустановите приложения: сертификат обновлён») → warning alert `revoked:<certId>`.
  - Expired certificates (`expiresAt < now`) → status `expired`, excluded from checks.

- [ ] **Step 1: Write the failing tests**

```ts
// ocsp.test.ts — test CA + an in-process OCSP responder built with pkijs
it('reports good', async () => { expect(await checkOcsp(goodCert, { issuers: [ca], fetch: responder })).toBe('good'); });
it('reports revoked', async () => { /* … */ });
it('refuses a response signed by a stranger', async () => { /* → OcspUnavailableError */ });
// ocsp.int.test.ts
it('a revoked certificate is replaced and users are told', async () => { /* new cert, profile r+1, emails in Mailpit */ });
it('responder down is not revocation', async () => { /* fetch throws → status unchanged, no handleRevocation, alert after 1 h */ });
```

- [ ] **Step 2: Run them to verify they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): OCSP watch and automatic certificate replacement"`

---

### Task 8: Moving devices off a blocked account

**Files:**
- Modify: `apps/api/src/apple/accounts.controller.ts`, `apps/worker/src/apple/register-device.ts`
- Test: `apps/api/test/apple-migrate.int.test.ts`

**Interfaces:**
- Produces:
  - `GET /admin/apple-accounts/:id/affected` → active/processing devices on the account with owner email and last install (M4).
  - `POST /admin/apple-accounts/:id/migrate { deviceIds: string[] }` (admin confirms in the UI; audited) → `registerDevice` with `excludeAccountIds: [id]` for each. The device keeps its old account until the new registration finishes, then `appleAccountId` and `includedInRevision` switch. M5 adds the warranty filter (`warrantyDays`).

- [ ] **Step 1: Write the failing test** — `migrates selected devices to free accounts` (two devices → account B, A untouched for unselected device), `refuses devices from another account` (400).
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apple): admin-confirmed device migration between accounts"`

---

### Task 9: Admin and cabinet UI for Apple

**Files:**
- Create: `apps/web/app/admin/apple/page.tsx`, `apps/web/app/admin/apple/new/page.tsx`, `apps/web/app/admin/apple/[id]/page.tsx`, `apps/web/app/admin/alerts/page.tsx`
- Modify: `apps/web/app/admin/devices/[id]/page.tsx` (register with tier), `apps/web/src/admin/AdminShell.tsx` (nav + open alerts badge), `apps/web/src/account/DeviceCard.tsx`
- Test: `apps/web/e2e/admin-apple.spec.ts`

**Interfaces:**
- Produces:
  - Accounts table: title, tier («Стандарт»/«Надёжный»), status, iPhone and iPad slots `used / limit`, certificate expiry and OCSP badge, membership date (red within 30 days). New account form: the `.p8` file is read in the browser and sent as text; the key field is write-only. Detail page: certificates, last 3 profile revisions, devices, «Синхронизировать», «Заменить ключ», «Перенести устройства» (checkbox list + confirm dialog).
  - Alerts page: open first, severity colors, «Решено».
  - `DeviceCard`: for `processing` shows «Apple обрабатывает устройство, обычно до 72 часов. Мы пришлём письмо, когда всё будет готово.»; for `pending` «Ждём свободное место в аккаунте Apple».
  - The e2e API server runs against `FakeAsc` (`ASC_BASE_URL`).

- [ ] **Step 1: Write the failing e2e test** — admin adds an account with a fake key, sees slots `0 / 100` and certificate «Действует», registers a seeded device, the cabinet shows «Активно».
- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement the pages.**
- [ ] **Step 4: Run it to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): Apple accounts and alerts in admin, device status in the cabinet"`

---

### Task 10: Milestone gate with a real Apple account

- [ ] **Step 1: Full local gate** — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e`. Expected: all pass.
- [ ] **Step 2: Real ASC run (owner provides one Apple Developer account with an Admin API key)** — add it through the admin on a dev stack with real `ASC_BASE_URL`; confirm the wildcard App ID, one new distribution certificate, a profile `Xstore AdHoc r1`; register the owner's iPhone; confirm `ENABLED`/`PROCESSING` handling. Save the 409 bodies seen (device exists, device limit if reachable, certificate limit) as fixtures with team ids and names replaced, and adjust `classifyAscError` if the texts differ.
- [ ] **Step 3: OCSP against Apple** — run `ocspCheck` once against the real certificate; expect `good`.
- [ ] **Step 4: Secrets audit** — `docker compose logs api worker | grep -E "BEGIN (EC )?PRIVATE KEY|p12" ` returns nothing; `SELECT diff FROM "AuditLog"` has no key material.
- [ ] **Step 5: Request review** — `superpowers:requesting-code-review` on the M3 branch, with `backend-api-security` focus on secrets.
- [ ] **Step 6: Docs** — README/CLAUDE.md: `MASTER_KEY_*`, key rotation (`reencrypt` script `pnpm --filter @xstore/worker secrets:rotate`), adding an Apple account. Commit `docs: M3 Apple accounts and secrets`.
