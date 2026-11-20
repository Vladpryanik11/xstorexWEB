import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { mailpitMessages, waitForMail } from '@xstore/mail/testing';
import {
  fakeOcspFetch,
  makeKit,
  makeOcspResponse,
  TEST_OCSP_HOST,
  TEST_UDID,
  type TestKit,
} from '@xstore/signing/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { DeviceWaitingNotifier } from '../src/apple/device-waiting.notifier.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { SITE, seedPlan } from './helpers/billing.js';
import { testEnv } from './test-env.js';

const DAY = 24 * 3600_000;
const OWNER = `owner-${Date.now()}@xstorex.test`;
const KEY = Buffer.alloc(32, 3).toString('base64');

let dir: string;
let app: INestApplication;
let quietApp: INestApplication | null = null;
let ocspBody: Buffer | 'fail' = Buffer.alloc(0);
let logs: string[] = [];
const db = createPrismaClient(
  // biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
  process.env.DATABASE_URL_TEST!,
);
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redis = new Redis(process.env.REDIS_URL_TEST!);
let adminCookie: string;
let supportCookie: string;

const ocspFetch = fakeOcspFetch(async () => {
  if (ocspBody === 'fail') throw new Error('network');
  return ocspBody;
});

const logStream = new Writable({
  write(chunk, _enc, done) {
    logs.push(String(chunk));
    done();
  },
});

function as(cookie: string, target = () => app) {
  const server = () => request(target().getHttpServer());
  return {
    get: (path: string) => server().get(`/api/v1${path}`).set('Cookie', cookie),
    post: (path: string, body?: object) =>
      server().post(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
    del: (path: string) =>
      server().delete(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie),
  };
}
const admin = () => as(adminCookie);

async function cookieFor(userId: string, kind: 'staff' | 'user'): Promise<string> {
  const { token } = await app.get(SessionService).create(userId, kind, {});
  return `xs_session=${token}`;
}

/** A buyer whose subscription runs `from`..`from + days` and holds a bound device. */
async function boundDevice(
  opts: { udid?: string; from?: Date; days?: number; assignedAt?: Date; product?: string } = {},
) {
  const email = `b${Math.random().toString(36).slice(2)}@example.ru`;
  const from = opts.from ?? new Date(Date.now() - DAY);
  const user = await db.user.create({ data: { email, role: 'user' } });
  const device = await db.device.create({
    data: {
      userId: user.id,
      udid: opts.udid ?? TEST_UDID,
      product: opts.product ?? 'iPhone16,2',
      iosVersion: '18.1',
      name: 'iPhone 15 Pro Max',
      status: 'pending',
    },
  });
  const subscription = await db.subscription.create({
    data: { userId: user.id, deviceId: device.id, assignedAt: opts.assignedAt ?? new Date() },
  });
  await db.entitlement.create({
    data: {
      subscriptionId: subscription.id,
      planCode: 'month',
      durationDays: opts.days ?? 30,
      startsAt: from,
      expiresAt: new Date(from.getTime() + (opts.days ?? 30) * DAY),
    },
  });
  return { email, user, device };
}

const upload = (kit: TestKit, password = kit.password) => ({
  p12: kit.p12.toString('base64'),
  password,
  profile: kit.profile.toString('base64'),
});

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-certs-'));
  const anchorPath = join(dir, 'anchor.pem');
  await writeFile(anchorPath, makeKit().anchor.toString());
  const env = {
    SITE_URL: SITE,
    LOG_LEVEL: 'debug',
    MASTER_KEY_CURRENT: '1',
    MASTER_KEY_V1: KEY,
    SIGNING_TEST_ANCHOR_PATH: anchorPath,
    ADMIN_NOTIFY_EMAIL: OWNER,
  };
  app = await createApp(loadConfig(testEnv(env)), {
    logStream,
    ocsp: { fetchFn: ocspFetch, allowedHosts: [TEST_OCSP_HOST] },
  });
});

beforeEach(async () => {
  await resetDatabase(
    // biome-ignore lint/style/noNonNullAssertion: checked above
    process.env.DATABASE_URL_TEST!,
  );
  await redis.flushdb();
  await seedPlan(db);
  const a = await db.user.create({ data: { email: 'admin@xstorex.ru', role: 'admin' } });
  const s = await db.user.create({ data: { email: 'support@xstorex.ru', role: 'support' } });
  adminCookie = await cookieFor(a.id, 'staff');
  supportCookie = await cookieFor(s.id, 'staff');
  ocspBody = 'fail';
  logs = [];
});

afterAll(async () => {
  await app.close();
  await quietApp?.close();
  await db.$disconnect();
  redis.disconnect();
  await rm(dir, { recursive: true, force: true });
});

describe('waiting list', () => {
  it('waiting lists a newly bound device with full udid', async () => {
    const { email, device } = await boundDevice();
    const res = await admin().get('/admin/devices/waiting');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: device.id,
        email,
        udid: TEST_UDID,
        model: 'iPhone 15 Pro Max',
        family: 'iphone',
        reason: 'new',
        overdue: false,
      }),
    ]);
    expect((await admin().get('/admin/devices/waiting/count')).body).toEqual({ count: 1 });
  });

  it('overdue after 24 h', async () => {
    await boundDevice({ assignedAt: new Date(Date.now() - 25 * 3600_000) });
    const res = await admin().get('/admin/devices/waiting');
    expect(res.body[0]).toMatchObject({ reason: 'new', overdue: true });
  });

  it('device without live subscription is not listed and refuses upload', async () => {
    const { device } = await boundDevice({ from: new Date(Date.now() - 40 * DAY) });
    expect((await admin().get('/admin/devices/waiting')).body).toEqual([]);
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_ACCESS');
  });

  it('active files expiring within 7 days are listed as expiring, not counted', async () => {
    const { device } = await boundDevice();
    const kit = makeKit({ notAfter: new Date(Date.now() + 5 * DAY) });
    expect(
      (await admin().post(`/admin/devices/${device.id}/certificate`, upload(kit))).status,
    ).toBe(201);
    const res = await admin().get('/admin/devices/waiting');
    expect(res.body).toEqual([
      expect.objectContaining({ id: device.id, reason: 'expiring', overdue: false }),
    ]);
    expect(res.body[0].expiresAt).toBeTruthy();
    expect((await admin().get('/admin/devices/waiting/count')).body).toEqual({ count: 0 });
  });
});

describe('upload', () => {
  it('upload makes device ready and mails buyer', async () => {
    const { email, device } = await boundDevice();
    const kit = makeKit();
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, upload(kit));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: device.id, status: 'active', waiting: null });
    expect(res.body.certificates).toHaveLength(1);
    expect(res.body.certificates[0]).toMatchObject({ status: 'active', teamId: 'TEAM123456' });
    expect(JSON.stringify(res.body)).not.toMatch(/p12|password|profile"/i);

    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('active');
    const [row] = await db.deviceCertificate.findMany({ where: { deviceId: device.id } });
    expect(row?.status).toBe('active');
    expect(row?.p12Enc.startsWith('v1.')).toBe(true);
    expect(row?.p12Enc).not.toContain(kit.p12.toString('base64').slice(0, 40));
    expect(row?.p12PasswordEnc).not.toContain(kit.password);

    const [mail] = await waitForMail(email);
    expect(mail?.subject).toBe('iPhone готов, можно ставить');

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'device.certificate.upload' },
    });
    expect(audit.entityId).toBe(device.id);
    expect(JSON.stringify(audit.diff)).toContain(row?.certSerial);
    expect(JSON.stringify(audit.diff)).not.toContain(TEST_UDID);
    expect((await admin().get('/admin/devices/waiting')).body).toEqual([]);
  });

  it('says iPad to an iPad buyer', async () => {
    const { email, device } = await boundDevice({ product: 'iPad13,1' });
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    const [mail] = await waitForMail(email);
    expect(mail?.subject).toBe('iPad готов, можно ставить');
  });

  it('accepts a kit for another iPhone while strict checks are off', async () => {
    const { device } = await boundDevice();
    const res = await admin().post(
      `/admin/devices/${device.id}/certificate`,
      upload(makeKit({ udids: ['00008110-FFFFFFFFFFFFFFFF'] })),
    );
    expect(res.status).toBe(201);
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe('active');
  });

  it('refused upload leaves device pending', async () => {
    const { email, device } = await boundDevice();
    const res = await admin().post(
      `/admin/devices/${device.id}/certificate`,
      upload(makeKit(), 'wrong'),
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('P12_INVALID');
    expect(await db.deviceCertificate.count()).toBe(0);
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).status).toBe(
      'pending',
    );
    expect(await mailpitMessages(email)).toEqual([]);
  });

  it.each([
    ['wrong password', (k: TestKit) => upload(k, 'wrong'), 'P12_INVALID'],
    [
      'profile not signed by Apple',
      (k: TestKit) => ({ ...upload(k), profile: k.profileXml.toString('base64') }),
      'PROFILE_INVALID',
    ],
  ])('%s', async (_name, body, code) => {
    const { device } = await boundDevice();
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, body(makeKit()));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
  });

  it('second upload replaces and sends reinstall mail', async () => {
    const { email, device } = await boundDevice();
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    await waitForMail(email, 1);
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    expect(res.status).toBe(201);
    const rows = await db.deviceCertificate.findMany({
      where: { deviceId: device.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.status)).toEqual(['replaced', 'active']);
    expect(rows[0]?.endedAt).toBeTruthy();
    const letters = await waitForMail(email, 2);
    expect(letters[1]?.subject).toBe('Переустановите приложения');
  });

  it('upload does not ask OCSP while strict checks are off', async () => {
    const { device } = await boundDevice();
    const kit = makeKit();
    ocspBody = await makeOcspResponse(kit, 'revoked');
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, upload(kit));
    expect(res.status).toBe(201);
  });

  it('an unanswered OCSP check does not block the upload', async () => {
    const { device } = await boundDevice();
    ocspBody = 'fail';
    expect(
      (await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()))).status,
    ).toBe(201);
  });

  it('never logs password, p12 or encrypted blobs', async () => {
    const { device } = await boundDevice();
    const kit = makeKit({ password: 'секрет-123' });
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(kit));
    await admin().post(`/admin/devices/${device.id}/certificate`, {
      ...upload(kit),
      password: 'другой-секрет',
    });
    const all = logs.join('\n');
    expect(all).not.toContain('секрет-123');
    expect(all).not.toContain('другой-секрет');
    expect(all).not.toContain(kit.p12.toString('base64').slice(0, 32));
    const row = await db.deviceCertificate.findFirstOrThrow();
    expect(all).not.toContain(row.p12Enc.slice(0, 32));
  });

  it('body over 1.5 MB', async () => {
    const { device } = await boundDevice();
    const res = await admin().post(`/admin/devices/${device.id}/certificate`, {
      p12: 'A'.repeat(1_700_000),
      password: '',
      profile: 'AAAA',
    });
    expect(res.status).toBe(413);
  });

  it('unknown device', async () => {
    const res = await admin().post('/admin/devices/nope/certificate', upload(makeKit()));
    expect(res.status).toBe(404);
  });
});

describe('delete and card', () => {
  it('delete returns device to the list', async () => {
    const { device } = await boundDevice();
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    const res = await admin().del(`/admin/devices/${device.id}/certificate`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'processing', waiting: { reason: 'deleted' } });
    expect((await db.deviceCertificate.findFirstOrThrow()).status).toBe('deleted');
    expect((await admin().get('/admin/devices/waiting')).body[0]).toMatchObject({
      reason: 'deleted',
    });
    expect((await admin().del(`/admin/devices/${device.id}/certificate`)).status).toBe(404);
  });

  it('card shows history without secrets', async () => {
    const { device, email } = await boundDevice();
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    const res = await admin().get(`/admin/devices/${device.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: device.id, email, udid: TEST_UDID, live: true });
    expect(res.body.certificates[0]).not.toHaveProperty('p12Enc');
  });
});

describe('access', () => {
  it('support role is forbidden', async () => {
    const { device } = await boundDevice();
    const support = as(supportCookie);
    expect((await support.get('/admin/devices/waiting')).status).toBe(403);
    expect((await support.get('/admin/devices/waiting/count')).status).toBe(403);
    expect((await support.get(`/admin/devices/${device.id}`)).status).toBe(403);
    expect(
      (await support.post(`/admin/devices/${device.id}/certificate`, upload(makeKit()))).status,
    ).toBe(403);
    expect((await support.del(`/admin/devices/${device.id}/certificate`)).status).toBe(403);
  });

  it('without a master key the upload is unavailable', async () => {
    quietApp ??= await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
    const { device } = await boundDevice();
    const res = await as(adminCookie, () => quietApp as INestApplication).post(
      `/admin/devices/${device.id}/certificate`,
      upload(makeKit()),
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SIGNING_UNAVAILABLE');
  });
});

describe('buyer waiting status', () => {
  it('GET /access tells since when a new device waits, and drops it once ready', async () => {
    const assignedAt = new Date(Date.now() - 3 * 3600_000);
    const { user, device } = await boundDevice({ assignedAt });
    const buyer = as(await cookieFor(user.id, 'user'));
    const before = (await buyer.get('/access')).body.state.device;
    expect(before.ready).toBe(false);
    expect(before.waitingSince).toBe(assignedAt.toISOString());
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    const after = (await buyer.get('/access')).body.state.device;
    expect(after.ready).toBe(true);
    expect(after.waitingSince).toBeUndefined();
  });

  it('after the files are deleted the wait counts from that moment', async () => {
    const { user, device } = await boundDevice({ assignedAt: new Date(Date.now() - 5 * DAY) });
    await admin().post(`/admin/devices/${device.id}/certificate`, upload(makeKit()));
    const deletedAt = Date.now();
    await admin().del(`/admin/devices/${device.id}/certificate`);
    const state = (await as(await cookieFor(user.id, 'user')).get('/access')).body.state;
    expect(state.device.updating).toBe(true);
    expect(new Date(state.device.waitingSince).getTime()).toBeGreaterThanOrEqual(deletedAt - 1000);
  });
});

describe('owner notification', () => {
  it('owner gets a mail about a new device when ADMIN_NOTIFY_EMAIL is set', async () => {
    const { email, device } = await boundDevice();
    const before = (await mailpitMessages(OWNER)).length;
    await app.get(DeviceWaitingNotifier).deviceBound(device.id);
    const letters = await waitForMail(OWNER, before + 1);
    const last = letters.at(-1);
    expect(last?.subject).toBe('Новый iPhone ждёт сертификата');
    expect(last?.text).toContain(email);
    expect(last?.text).not.toContain(TEST_UDID);
  });

  it('the buyer gets «iPhone подключён, готовим его» at the first bind', async () => {
    const { email, device } = await boundDevice();
    await app.get(DeviceWaitingNotifier).deviceBound(device.id);
    const [mail] = await waitForMail(email);
    expect(mail?.subject).toBe('iPhone подключён, готовим его');
  });
});
