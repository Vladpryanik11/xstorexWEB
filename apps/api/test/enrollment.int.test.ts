import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/config.js';
import { signCms } from '../src/enrollment/cms.js';
import { certPem, createTestCa } from './helpers/enrollment-identity.js';
import { devicePlist, type FakeIosCa, signDeviceResponse, TEST_UDID } from './helpers/fake-ios.js';
import { testEnv } from './test-env.js';

const SITE = 'http://localhost:3000';
// biome-ignore lint/style/noNonNullAssertion: set by integration environment
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
const redis = new Redis(process.env.REDIS_URL_TEST ?? '');
let app: INestApplication;
let ca: FakeIosCa;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-enrollment-'));
  ca = await createTestCa();
  const path = join(dir, 'device-ca.pem');
  await writeFile(path, certPem(ca.certificate));
  app = await createApp(loadConfig(testEnv({ ENROLL_TRUST_ANCHORS_PATH: path })));
});
beforeEach(async () => {
  await resetDatabase(process.env.DATABASE_URL_TEST ?? '');
  await redis.flushdb();
});
afterAll(async () => {
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function start(options: { userId?: string; next?: string; expired?: boolean } = {}) {
  const nonce = randomBytes(32).toString('base64url');
  await db.enrollmentSession.create({
    data: {
      nonce,
      userId: options.userId,
      next: options.next,
      expiresAt: new Date(Date.now() + (options.expired ? -1000 : 900_000)),
    },
  });
  return nonce;
}

function callback(nonce: string, body: Buffer) {
  return request(app.getHttpServer())
    .post(`/api/v1/enrollment/callback?s=${nonce}`)
    .set('Content-Type', 'application/pkcs7-signature')
    .send(body);
}
async function enroll(options: Parameters<typeof start>[0] = {}) {
  const nonce = await start(options);
  const res = await callback(nonce, await signDeviceResponse({ challenge: nonce }, ca));
  return { nonce, res, token: new URL(res.headers.location ?? SITE).searchParams.get('t') };
}
const code = (res: { headers: Record<string, string> }) =>
  new URL(res.headers.location ?? SITE).searchParams.get('error');
const complete = (token: string | null, agent = request.agent(app.getHttpServer())) =>
  agent.post('/api/v1/enrollment/complete').set('Origin', SITE).send({ token });

it('signs a new device in and hands over a session bound to the device', async () => {
  const { res, token } = await enroll({ next: '/app/test' });
  expect(res.status).toBe(301);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const hash = createHash('sha256')
    .update(token ?? '')
    .digest('hex');
  expect(await redis.ttl(`enroll:done:${hash}`)).toBeGreaterThan(290);
  expect(await redis.exists(`enroll:done:${token}`)).toBe(0);
  const agent = request.agent(app.getHttpServer());
  const done = await complete(token, agent);
  expect(done.status).toBe(201);
  expect(done.body).toEqual({ next: '/app/test' });
  const device = await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } });
  expect(device.name).toBe('iPhone 14 Pro');
  expect((await db.session.findFirstOrThrow()).deviceId).toBe(device.id);
  expect((await agent.get('/api/v1/auth/me')).body.user.role).toBe('user');
});

it('expired nonce', async () => {
  const { nonce, res } = await enroll({ expired: true });
  expect(code(res)).toBe('ENROLLMENT_EXPIRED');
  expect((await db.enrollmentSession.findUniqueOrThrow({ where: { nonce } })).status).toBe(
    'expired',
  );
  expect(await db.user.count()).toBe(0);
});

it('nonce is single use and replay leaves completed state intact', async () => {
  const { nonce } = await enroll();
  const second = await callback(nonce, await signDeviceResponse({ challenge: nonce }, ca));
  expect(code(second)).toBe('ENROLLMENT_EXPIRED');
  expect(await db.user.count()).toBe(1);
  expect((await db.enrollmentSession.findUniqueOrThrow({ where: { nonce } })).status).toBe(
    'completed',
  );
});

it('challenge mismatch is invalid', async () => {
  const nonce = await start();
  const res = await callback(nonce, await signDeviceResponse({ challenge: 'other' }, ca));
  expect(code(res)).toBe('ENROLLMENT_INVALID');
  expect((await db.enrollmentSession.findUniqueOrThrow({ where: { nonce } })).status).toBe(
    'failed',
  );
  expect(await db.user.count()).toBe(0);
});

it('the same device signs back into the same account', async () => {
  await enroll();
  const first = await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } });
  expect((await enroll()).token).toBeTruthy();
  expect(await db.user.count()).toBe(1);
  expect((await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } })).userId).toBe(
    first.userId,
  );
});

it('link mode attaches the device to the selected signed-in owner', async () => {
  const owner = await db.user.create({ data: { email: 'owner@xstorex.ru' } });
  expect((await enroll({ userId: owner.id })).token).toBeTruthy();
  expect((await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } })).userId).toBe(owner.id);
  expect(await db.user.count()).toBe(1);
});

it('refuses a device owned by someone else', async () => {
  await enroll();
  const original = await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } });
  const other = await db.user.create({ data: {} });
  expect(code((await enroll({ userId: other.id })).res)).toBe('DEVICE_OWNED');
  expect((await db.device.findUniqueOrThrow({ where: { udid: TEST_UDID } })).userId).toBe(
    original.userId,
  );
});

it('the hand-off token works once', async () => {
  const { token } = await enroll();
  expect((await complete(token)).status).toBe(201);
  expect((await complete(token)).body.code).toBe('ENROLLMENT_EXPIRED');
  expect(await db.session.count()).toBe(1);
});

it('rejects a blocked owner during callback and before completion', async () => {
  const { token } = await enroll();
  const owner = await db.user.findFirstOrThrow();
  await db.user.update({ where: { id: owner.id }, data: { blockedAt: new Date() } });
  expect((await complete(token)).body.code).toBe('ACCOUNT_BLOCKED');
  expect(code((await enroll()).res)).toBe('ACCOUNT_BLOCKED');
  expect(await db.session.count()).toBe(0);
});

it('rejects an untrusted signer, a CA signer and a tampered CMS without creating users', async () => {
  const unknown = await createTestCa();
  const nonce = await start();
  expect(code(await callback(nonce, await signDeviceResponse({ challenge: nonce }, unknown)))).toBe(
    'ENROLLMENT_INVALID',
  );
  const nonce2 = await start();
  expect(
    code(
      await callback(
        nonce2,
        await signCms(
          devicePlist({
            udid: TEST_UDID,
            product: 'iPhone15,2',
            version: '22B83',
            challenge: nonce2,
          }),
          ca,
        ),
      ),
    ),
  ).toBe('ENROLLMENT_INVALID');
  const nonce3 = await start();
  const der = await signDeviceResponse({ challenge: nonce3 }, ca);
  const at = der.indexOf(Buffer.from(TEST_UDID));
  der[at] = 0x58;
  expect(code(await callback(nonce3, der))).toBe('ENROLLMENT_INVALID');
  expect(await db.user.count()).toBe(0);
});

it('claims concurrent callbacks only once', async () => {
  const nonce = await start();
  const der = await signDeviceResponse({ challenge: nonce }, ca);
  const results = await Promise.all([callback(nonce, der), callback(nonce, der)]);
  expect(
    results.filter((r) => new URL(r.headers.location ?? SITE).searchParams.has('t')),
  ).toHaveLength(1);
  expect(await db.user.count()).toBe(1);
});

it('never changes ownership during concurrent first sign-ins for the same device', async () => {
  const a = await start();
  const b = await start();
  const results = await Promise.all([
    callback(a, await signDeviceResponse({ challenge: a }, ca)),
    callback(b, await signDeviceResponse({ challenge: b }, ca)),
  ]);
  expect(results.every((r) => new URL(r.headers.location ?? SITE).searchParams.has('t'))).toBe(
    true,
  );
  expect(await db.user.count()).toBe(1);
  expect(await db.device.count()).toBe(1);
});

it('bounds the raw device response to 64 KiB', async () => {
  const nonce = await start();
  expect((await callback(nonce, Buffer.alloc(65537))).status).toBe(413);
  expect(await db.user.count()).toBe(0);
});
