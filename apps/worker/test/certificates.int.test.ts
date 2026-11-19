import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, type PrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { mailpitMessages } from '@xstore/mail/testing';
import { type Keyring, loadKeyring } from '@xstore/secrets';
import { encryptSecret } from '@xstore/secrets/encrypt';
import {
  fakeOcspFetch,
  makeKit,
  makeOcspResponse,
  sha1Hex,
  TEST_OCSP_HOST,
  type TestKit,
} from '@xstore/signing/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { runCertificateCheck } from '../src/certificates/check.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const DAY = 24 * 3600_000;
let db: PrismaClient;
let keyring: Keyring;
let ownerId: string;
const lines: string[] = [];
const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });

beforeAll(() => {
  db = createPrismaClient(process.env.DATABASE_URL_TEST ?? '');
  keyring = loadKeyring({
    MASTER_KEY_CURRENT: '1',
    MASTER_KEY_V1: randomBytes(32).toString('base64'),
  });
});
afterAll(async () => db.$disconnect());

beforeEach(async () => {
  await resetDatabase(process.env.DATABASE_URL_TEST ?? '');
  lines.length = 0;
  ownerId = (await db.user.create({ data: { role: 'admin', email: 'owner@xstorex.test' } })).id;
});

/** A device with live access and `kit` as its working files. */
async function deviceWith(kit: TestKit, overrides: { profileExpiresAt?: Date } = {}) {
  const user = await db.user.create({
    data: { email: `buyer-${randomBytes(4).toString('hex')}@xstorex.test` },
  });
  const device = await db.device.create({
    data: {
      userId: user.id,
      udid: `00008110-${randomBytes(8).toString('hex').toUpperCase()}`,
      product: 'iPhone16,1',
      iosVersion: '22B83',
      name: 'iPhone 15 Pro',
      status: 'active',
    },
  });
  const cert = await db.deviceCertificate.create({
    data: {
      deviceId: device.id,
      p12Enc: encryptSecret(kit.p12, keyring),
      p12PasswordEnc: encryptSecret(kit.password, keyring),
      profile: new Uint8Array(kit.profile),
      profileUuid: 'uuid',
      teamId: 'TEAM123456',
      appIdPattern: 'TEAM123456.*',
      certSerial: kit.certificate.serialNumber,
      certSha1: sha1Hex(kit.certificate.raw),
      certNotAfter: new Date(kit.certificate.validTo),
      profileExpiresAt: overrides.profileExpiresAt ?? new Date(Date.now() + 300 * DAY),
      uploadedById: ownerId,
    },
  });
  return { device, cert };
}

const run = (fetchFn: typeof fetch) =>
  runCertificateCheck({
    db,
    keyring,
    fetchFn,
    allowedHosts: [TEST_OCSP_HOST],
    now: new Date(),
    logger,
  });

it('one revoked certificate flips every device using it', async () => {
  const kit = makeKit();
  const rows = [await deviceWith(kit), await deviceWith(kit), await deviceWith(kit)];
  const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked'));

  expect(await run(fetchFn)).toEqual({ checked: 1, revoked: 3, expired: 0, unknown: 0 });
  expect(fetchFn.calls).toBe(1);
  for (const { device, cert } of rows) {
    const after = await db.deviceCertificate.findUniqueOrThrow({ where: { id: cert.id } });
    expect(after.status).toBe('revoked');
    expect(after.endedAt).toBeInstanceOf(Date);
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe(
      'processing',
    );
  }
});

it('a good answer changes nothing', async () => {
  const kit = makeKit();
  const { device, cert } = await deviceWith(kit);
  const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));
  expect(await run(fetchFn)).toEqual({ checked: 1, revoked: 0, expired: 0, unknown: 0 });
  expect((await db.deviceCertificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe(
    'active',
  );
  expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('active');
});

it('expired kit: marked expired, device processing, no OCSP request', async () => {
  const kit = makeKit();
  const { device, cert } = await deviceWith(kit, {
    profileExpiresAt: new Date(Date.now() - 60_000),
  });
  const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));

  expect(await run(fetchFn)).toEqual({ checked: 0, revoked: 0, expired: 1, unknown: 0 });
  expect(fetchFn.calls).toBe(0);
  const after = await db.deviceCertificate.findUniqueOrThrow({ where: { id: cert.id } });
  expect(after.status).toBe('expired');
  expect(after.endedAt).toBeInstanceOf(Date);
  expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe(
    'processing',
  );
});

it('unknown changes nothing and logs the fingerprint, never the files', async () => {
  const kit = makeKit({ password: 'секрет-пароль' });
  const { device, cert } = await deviceWith(kit);
  const fetchFn = fakeOcspFetch(async () => {
    throw new Error('network down');
  });

  expect(await run(fetchFn)).toEqual({ checked: 1, revoked: 0, expired: 0, unknown: 1 });
  expect((await db.deviceCertificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe(
    'active',
  );
  expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('active');
  const log = lines.join('\n');
  expect(log).toContain(cert.certSha1);
  expect(log).not.toContain('секрет-пароль');
  expect(log).not.toContain(cert.p12Enc);
  expect(log).not.toContain(kit.p12.toString('base64').slice(0, 40));
});

it('a file uploaded after the check started is left alone', async () => {
  const kit = makeKit();
  const { device } = await deviceWith(kit);
  const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked'));
  const res = await runCertificateCheck({
    db,
    keyring,
    fetchFn,
    allowedHosts: [TEST_OCSP_HOST],
    now: new Date(Date.now() - 60_000),
    logger,
  });
  expect(res.revoked).toBe(0);
  expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('active');
});

it('without a keyring only the dates are checked', async () => {
  const kit = makeKit();
  await deviceWith(kit);
  const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked'));
  const res = await runCertificateCheck({
    db,
    keyring: null,
    fetchFn,
    allowedHosts: [TEST_OCSP_HOST],
    now: new Date(),
    logger,
  });
  expect(res).toEqual({ checked: 0, revoked: 0, expired: 0, unknown: 0 });
  expect(fetchFn.calls).toBe(0);
});

it('no mail on revoke', async () => {
  const kit = makeKit();
  const { device } = await deviceWith(kit);
  const buyer = await db.user.findFirstOrThrow({ where: { devices: { some: { id: device.id } } } });
  await run(fakeOcspFetch(await makeOcspResponse(kit, 'revoked')));
  await new Promise((r) => setTimeout(r, 300));
  const letters = await mailpitMessages(buyer.email ?? '');
  expect(letters).toHaveLength(0);
});
