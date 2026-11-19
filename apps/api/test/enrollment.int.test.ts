import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { maskUdid } from '@xstore/shared';
import { Redis } from 'ioredis';
import plist from 'plist';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditService } from '../src/audit/audit.service.js';
import { hashToken, SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { verifyCms } from '../src/enrollment/cms.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { SITE } from './helpers/billing.js';
import {
  createTestCa,
  signDeviceResponse,
  type TestCa,
  writeProfileSigner,
  writeTestAnchor,
} from './support/ios.js';
import { testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
const DAY_MS = 24 * 60 * 60 * 1000;
const UDID = '00008110-001A2B3C4D5E6F70';
const OTHER_UDID = '00008120-00ABCDEF01234567';

let dir: string;
let app: INestApplication;
let ca: TestCa;
let signerCert: Awaited<ReturnType<typeof writeProfileSigner>>['certificate'];
let logs: string[] = [];

const logStream = new Writable({
  write(chunk, _enc, done) {
    logs.push(String(chunk));
    done();
  },
});

const server = () => request(app.getHttpServer());

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-enroll-'));
  ca = await createTestCa();
  const signer = await writeProfileSigner(dir);
  signerCert = signer.certificate;
  const anchorPath = await writeTestAnchor(dir, ca);
  const config = loadConfig(
    testEnv({
      SITE_URL: SITE,
      LOG_LEVEL: 'debug',
      XSTORE_DEV_PAGES: '1',
      ENROLL_CERT_PATH: signer.certPath,
      ENROLL_KEY_PATH: signer.keyPath,
      ENROLL_TEST_ANCHOR_PATH: anchorPath,
    }),
  );
  app = await createApp(config, { logStream });
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
  logs = [];
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
  await rm(dir, { recursive: true, force: true });
});

/** A buyer with a live 30-day right that started yesterday, signed in. */
async function buyer(email = `b${Math.random().toString(36).slice(2)}@example.ru`) {
  const user = await db.user.create({ data: { email, role: 'user' } });
  const subscription = await db.subscription.create({ data: { userId: user.id } });
  const startsAt = new Date(Date.now() - DAY_MS);
  const right = await db.entitlement.create({
    data: {
      subscriptionId: subscription.id,
      planCode: 'month',
      durationDays: 30,
      startsAt,
      expiresAt: new Date(startsAt.getTime() + 30 * DAY_MS),
    },
  });
  const { token } = await app.get(SessionService).create(user.id, 'user', {});
  return {
    user,
    subscription,
    right,
    cookie: `xs_session=${token}`,
    sessionId: hashToken(token),
  };
}

/** supertest parser that keeps the response body as raw bytes. */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  stream.on('end', () => cb(null, Buffer.concat(chunks)));
};

const getProfile = (cookie?: string) => {
  const req = server().get('/api/v1/enrollment/profile').buffer(true).parse(binary);
  return cookie ? req.set('Cookie', cookie) : req;
};

/** Downloads the profile and returns the nonce iOS would echo as CHALLENGE. */
async function profileNonce(cookie: string): Promise<string> {
  const res = await getProfile(cookie);
  expect(res.status).toBe(200);
  const { content } = await verifyCms(res.body as Buffer, { anchors: [signerCert] });
  const payload = plist.parse(content.toString('utf8')) as {
    PayloadContent: { Challenge: string; URL: string };
  };
  return payload.PayloadContent.Challenge;
}

const answer = (
  nonce: string,
  fields: Partial<{ UDID: string; PRODUCT: string; VERSION: string; CHALLENGE: string }> = {},
  signWith: TestCa = ca,
) =>
  signDeviceResponse(
    { UDID, PRODUCT: 'iPhone16,1', VERSION: '22B83', CHALLENGE: nonce, ...fields },
    signWith,
  );

const postCallback = (nonce: string | null, body: Buffer, cookie?: string) => {
  const path = nonce === null ? '' : `?s=${encodeURIComponent(nonce)}`;
  const req = server()
    .post(`/api/v1/enrollment/callback${path}`)
    .set('Content-Type', 'application/pkcs7-signature')
    .send(body);
  return cookie ? req.set('Cookie', cookie) : req;
};

function expectResult(res: { status: number; headers: Record<string, string> }, r: string) {
  expect(res.status).toBe(301);
  expect(res.headers.location).toBe(`${SITE}/get/iphone?r=${r}`);
}

describe('GET /enrollment/profile', () => {
  it('serves a signed profile and stores the nonce hash for 15 minutes', async () => {
    const b = await buyer();
    const res = await getProfile(b.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/x-apple-aspen-config');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="xstore-connect.mobileconfig"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const { content } = await verifyCms(res.body as Buffer, { anchors: [signerCert] });
    const payload = plist.parse(content.toString('utf8')) as Record<string, unknown> & {
      PayloadContent: { Challenge: string; URL: string; DeviceAttributes: string[] };
    };
    expect(payload.PayloadType).toBe('Profile Service');
    expect(payload.PayloadIdentifier).toBe('ru.xstorex.enroll');
    const nonce = payload.PayloadContent.Challenge;
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(payload.PayloadContent.URL).toBe(`${SITE}/api/v1/enrollment/callback?s=${nonce}`);

    const rows = await db.enrollmentSession.findMany();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.nonce).not.toBe(nonce);
    expect(row).toMatchObject({ userId: b.user.id, sessionId: b.sessionId, status: 'pending' });
    const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('guest cannot download profile', async () => {
    const res = await getProfile();
    expect(res.status).toBe(401);
    expect(JSON.parse(String(res.body)).code).toBe('UNAUTHORIZED');
  });

  it('a staff session cannot download it', async () => {
    const staff = await db.user.create({ data: { email: 'a@xstorex.ru', role: 'admin' } });
    const { token } = await app.get(SessionService).create(staff.id, 'staff', {});
    const res = await getProfile(`xs_session=${token}`);
    expect(res.status).toBe(403);
  });

  it('no access', async () => {
    const b = await buyer();
    await db.entitlement.update({ where: { id: b.right.id }, data: { revokedAt: new Date() } });
    const res = await getProfile(b.cookie);
    expect(res.status).toBe(403);
    expect(JSON.parse(String(res.body)).code).toBe('NO_ACCESS');
    expect(await db.enrollmentSession.count()).toBe(0);
  });

  it('a buyer with a device gets DEVICE_LIMIT', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    expectResult(await postCallback(nonce, await answer(nonce)), 'connected');
    const res = await getProfile(b.cookie);
    expect(res.status).toBe(409);
    expect(JSON.parse(String(res.body)).code).toBe('DEVICE_LIMIT');
  });

  it('allows 10 downloads in 10 minutes per buyer', async () => {
    const b = await buyer();
    for (let i = 0; i < 10; i += 1) expect((await getProfile(b.cookie)).status).toBe(200);
    const res = await getProfile(b.cookie);
    expect(res.status).toBe(429);
  });
});

describe('POST /enrollment/callback', () => {
  it('connects device to buyer subscription', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const res = await postCallback(nonce, await answer(nonce));
    expectResult(res, 'connected');

    const devices = await db.device.findMany();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      userId: b.user.id,
      udid: UDID,
      product: 'iPhone16,1',
      iosVersion: '22B83',
      name: 'iPhone 15 Pro',
      status: 'pending',
    });
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: b.subscription.id } });
    expect(sub.deviceId).toBe(devices[0]?.id);
    expect(sub.assignedAt).toBeInstanceOf(Date);
    const right = await db.entitlement.findUniqueOrThrow({ where: { id: b.right.id } });
    expect(right.startsAt).toEqual(b.right.startsAt);
    expect(right.expiresAt).toEqual(b.right.expiresAt);
    const enrollment = await db.enrollmentSession.findFirstOrThrow();
    expect(enrollment).toMatchObject({ status: 'completed', deviceId: devices[0]?.id });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'device.bind' } });
    expect(audit).toMatchObject({ actorId: b.user.id, entity: 'device', entityId: devices[0]?.id });
    expect(JSON.stringify(audit.diff)).not.toContain(UDID);
    expect(JSON.stringify(audit.diff)).toContain(maskUdid(UDID));

    const access = await server().get('/api/v1/access').set('Cookie', b.cookie);
    expect(access.body.state.device).toEqual({
      model: 'iPhone 15 Pro',
      family: 'iphone',
      ready: false,
    });
  });

  it('same device twice is idempotent', async () => {
    const b = await buyer();
    const first = await profileNonce(b.cookie);
    const second = await profileNonce(b.cookie);
    expectResult(await postCallback(first, await answer(first)), 'connected');
    const before = await db.subscription.findUniqueOrThrow({ where: { id: b.subscription.id } });
    expectResult(await postCallback(second, await answer(second)), 'connected');
    expect(await db.device.count()).toBe(1);
    const after = await db.subscription.findUniqueOrThrow({ where: { id: b.subscription.id } });
    expect(after.deviceId).toBe(before.deviceId);
    expect(after.assignedAt).toEqual(before.assignedAt);
  });

  it('foreign owner is unchanged', async () => {
    const owner = await buyer();
    const n1 = await profileNonce(owner.cookie);
    expectResult(await postCallback(n1, await answer(n1)), 'connected');
    const device = await db.device.findFirstOrThrow();

    const other = await buyer();
    const n2 = await profileNonce(other.cookie);
    expectResult(await postCallback(n2, await answer(n2)), 'DEVICE_OWNED');
    expect(await db.device.findFirstOrThrow()).toEqual(device);
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: other.subscription.id } });
    expect(sub.deviceId).toBeNull();
    const row = await db.enrollmentSession.findFirstOrThrow({ where: { userId: other.user.id } });
    expect(row.status).toBe('failed');
  });

  it('second device is refused', async () => {
    const b = await buyer();
    const n1 = await profileNonce(b.cookie);
    const n2 = await profileNonce(b.cookie);
    expectResult(await postCallback(n1, await answer(n1)), 'connected');
    expectResult(await postCallback(n2, await answer(n2, { UDID: OTHER_UDID })), 'DEVICE_LIMIT');
    expect(await db.device.count()).toBe(1);
    expect(await db.device.findUnique({ where: { udid: OTHER_UDID } })).toBeNull();
  });

  it('tampered payload', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const der = await answer(nonce);
    const at = der.indexOf(Buffer.from(UDID));
    expect(at).toBeGreaterThan(0);
    der[at] = '1'.charCodeAt(0);
    expectResult(await postCallback(nonce, der), 'ENROLLMENT_FAILED');
    expect(await db.device.count()).toBe(0);
    expect((await db.enrollmentSession.findFirstOrThrow()).status).toBe('failed');
  });

  it('an answer outside the Apple device chain fails', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const stranger = await createTestCa();
    expectResult(await postCallback(nonce, await answer(nonce, {}, stranger)), 'ENROLLMENT_FAILED');
    expect(await db.device.count()).toBe(0);
  });

  it('challenge mismatch', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const other = await profileNonce(b.cookie);
    expectResult(
      await postCallback(nonce, await answer(nonce, { CHALLENGE: other })),
      'ENROLLMENT_FAILED',
    );
    expect(await db.device.count()).toBe(0);
  });

  it('a body that is not a signed answer or is too large fails', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    expectResult(await postCallback(nonce, Buffer.from('hello')), 'ENROLLMENT_FAILED');
    const n2 = await profileNonce(b.cookie);
    expectResult(await postCallback(n2, Buffer.alloc(70 * 1024, 1)), 'ENROLLMENT_FAILED');
    expect(await db.device.count()).toBe(0);
  });

  it('expired nonce', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    await db.enrollmentSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expectResult(await postCallback(nonce, await answer(nonce)), 'ENROLLMENT_EXPIRED');
    expect(await db.device.count()).toBe(0);
    expect((await db.enrollmentSession.findFirstOrThrow()).status).toBe('expired');
  });

  it('an unknown or missing nonce', async () => {
    const fake = 'A'.repeat(43);
    expectResult(await postCallback(fake, await answer(fake)), 'ENROLLMENT_EXPIRED');
    expectResult(await postCallback(null, await answer(fake)), 'ENROLLMENT_FAILED');
  });

  it('nonce is single use', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const der = await answer(nonce);
    expectResult(await postCallback(nonce, der), 'connected');
    // iOS retrying the same answer is told it worked; any other answer for a spent nonce is not.
    expectResult(await postCallback(nonce, der), 'connected');
    expectResult(
      await postCallback(nonce, await answer(nonce, { UDID: OTHER_UDID })),
      'ENROLLMENT_EXPIRED',
    );
    expectResult(await postCallback(nonce, Buffer.from('hello')), 'ENROLLMENT_EXPIRED');
    expect(await db.device.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'device.bind' } })).toBe(1);
    expect((await db.enrollmentSession.findFirstOrThrow()).status).toBe('completed');
  });

  it('an unexpected error while binding marks the nonce failed and logs no UDID', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const spy = vi
      .spyOn(app.get(PrismaService).client, '$transaction')
      .mockRejectedValueOnce(new Error(`boom ${UDID}`));
    try {
      expectResult(await postCallback(nonce, await answer(nonce)), 'ENROLLMENT_FAILED');
    } finally {
      spy.mockRestore();
    }
    expect((await db.enrollmentSession.findFirstOrThrow()).status).toBe('failed');
    expect(await db.device.count()).toBe(0);
    const text = logs.join('');
    expect(text).toContain('enrollment callback failed');
    expect(text).not.toContain(UDID);
  });

  it('a failing audit write does not change a successful result', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    const spy = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValue(new Error('audit down'));
    try {
      expectResult(await postCallback(nonce, await answer(nonce)), 'connected');
    } finally {
      spy.mockRestore();
    }
    expect(await db.auditLog.count({ where: { action: 'device.bind' } })).toBe(1);
  });

  it('revoked source session rejects callback', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    await app.get(SessionService).revoke(b.sessionId);
    expectResult(await postCallback(nonce, await answer(nonce)), 'ENROLLMENT_EXPIRED');

    const c = await buyer();
    const n2 = await profileNonce(c.cookie);
    await db.session.update({
      where: { id: c.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expectResult(await postCallback(n2, await answer(n2)), 'ENROLLMENT_EXPIRED');

    const d = await buyer();
    const n3 = await profileNonce(d.cookie);
    await db.user.update({ where: { id: d.user.id }, data: { blockedAt: new Date() } });
    expectResult(await postCallback(n3, await answer(n3)), 'ENROLLMENT_EXPIRED');
    expect(await db.device.count()).toBe(0);
  });

  it('access that ended after the download gives NO_ACCESS', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    await db.entitlement.update({ where: { id: b.right.id }, data: { revokedAt: new Date() } });
    expectResult(await postCallback(nonce, await answer(nonce)), 'NO_ACCESS');
    expect(await db.device.count()).toBe(0);
  });

  it('callback binds by nonce owner without browser session', async () => {
    const owner = await buyer();
    const other = await buyer();
    const nonce = await profileNonce(owner.cookie);
    // iOS posts without cookies; a cookie of someone else changes nothing.
    expectResult(await postCallback(nonce, await answer(nonce), other.cookie), 'connected');
    const device = await db.device.findFirstOrThrow();
    expect(device.userId).toBe(owner.user.id);
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: owner.subscription.id } });
    expect(sub.deviceId).toBe(device.id);
  });

  it('UDID never logged', async () => {
    const b = await buyer();
    const nonce = await profileNonce(b.cookie);
    expectResult(await postCallback(nonce, await answer(nonce)), 'connected');
    const other = await buyer();
    const n2 = await profileNonce(other.cookie);
    expectResult(await postCallback(n2, await answer(n2)), 'DEVICE_OWNED');
    const n3 = await profileNonce(other.cookie);
    expectResult(await postCallback(n3, await answer(n3, { CHALLENGE: 'x' })), 'ENROLLMENT_FAILED');

    const text = logs.join('');
    expect(text).toContain('/api/v1/enrollment/callback');
    expect(text).toContain(maskUdid(UDID));
    expect(text).not.toContain(UDID);
    for (const n of [nonce, n2, n3]) expect(text).not.toContain(n);
  });
});

describe('dev device status', () => {
  const post = (cookie: string | null, status: string) => {
    const req = server().post(`/api/v1/devices/dev/mine/${status}`).set('Origin', SITE);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('switches the buyer device between ready and pending', async () => {
    const b = await buyer();
    expect((await post(b.cookie, 'ready')).status).toBe(404);
    const nonce = await profileNonce(b.cookie);
    expectResult(await postCallback(nonce, await answer(nonce)), 'connected');
    expect((await post(b.cookie, 'ready')).status).toBe(204);
    expect((await db.device.findFirstOrThrow()).status).toBe('active');
    const access = await server().get('/api/v1/access').set('Cookie', b.cookie);
    expect(access.body.state.device.ready).toBe(true);
    expect((await post(b.cookie, 'pending')).status).toBe(204);
    expect((await db.device.findFirstOrThrow()).status).toBe('pending');
    expect((await post(b.cookie, 'blocked')).status).toBe(404);
    expect((await post(null, 'ready')).status).toBe(401);
  });
});

describe('without XSTORE_DEV_PAGES and a signer', () => {
  let bare: INestApplication;

  beforeAll(async () => {
    bare = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
  });

  afterAll(async () => {
    await bare.close();
  });

  it('dev status route is 404 without XSTORE_DEV_PAGES', async () => {
    const b = await buyer();
    const res = await request(bare.getHttpServer())
      .post('/api/v1/devices/dev/mine/ready')
      .set('Origin', SITE)
      .set('Cookie', b.cookie);
    expect(res.status).toBe(404);
  });

  it('the profile is unavailable without a signer', async () => {
    const b = await buyer();
    const res = await request(bare.getHttpServer())
      .get('/api/v1/enrollment/profile')
      .set('Cookie', b.cookie);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ENROLLMENT_UNAVAILABLE');
    expect(await db.enrollmentSession.count()).toBe(0);
  });
});
