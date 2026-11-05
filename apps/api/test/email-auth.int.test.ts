import { createHash, createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import type { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadWorkerConfig } from '../../worker/src/config.js';
import { createNotificationsWorker } from '../../worker/src/queues/notifications.js';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { mailpitCode, mailpitUrl } from './helpers/mailpit.js';
import { testEnv } from './test-env.js';

const SITE = 'http://localhost:3000';
const EMAIL = 'u@xstorex.ru';
// biome-ignore lint/style/noNonNullAssertion: set by test environment
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
const redis = new Redis(process.env.REDIS_URL_TEST ?? '', { maxRetriesPerRequest: null });
let app: INestApplication;
let worker: Worker | undefined;
const codeKey = (email = EMAIL) => `auth:code:${createHash('sha256').update(email).digest('hex')}`;

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv()));
});
beforeEach(async () => {
  await worker?.close();
  await redis.flushdb();
  await resetDatabase(process.env.DATABASE_URL_TEST ?? '');
  await fetch(`${mailpitUrl()}/api/v1/messages`, { method: 'DELETE' });
  worker = createNotificationsWorker({
    connection: redis,
    config: loadWorkerConfig({ ...testEnv(), SMTP_URL: process.env.SMTP_URL }),
  });
  worker.on('error', () => {});
  await worker.waitUntilReady();
});
afterAll(async () => {
  await worker?.close();
  await app?.close();
  await db.$disconnect();
  redis.disconnect();
});

const req = (email = EMAIL, path = '/auth/email/request', cookie?: string) => {
  const call = request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set('Origin', SITE)
    .send({ email });
  return cookie ? call.set('Cookie', cookie) : call;
};
const verify = (code: string, email = EMAIL, agent = request.agent(app.getHttpServer())) =>
  agent.post('/api/v1/auth/email/verify').set('Origin', SITE).send({ email, code });

it('signs in with the emailed code and issues a user session', async () => {
  expect((await req()).status).toBe(204);
  const code = await mailpitCode(EMAIL);
  const agent = request.agent(app.getHttpServer());
  expect((await verify(code, EMAIL, agent)).status).toBe(204);
  expect((await agent.get('/api/v1/auth/me')).body.user).toMatchObject({
    email: EMAIL,
    role: 'user',
  });
  expect((await db.session.findFirstOrThrow()).kind).toBe('user');
});

it('stores only the keyed code MAC under a hashed email key with a ten-minute TTL', async () => {
  expect((await req()).status).toBe(204);
  const code = await mailpitCode(EMAIL);
  const stored = JSON.parse((await redis.get(codeKey())) ?? '{}');
  const secret = Buffer.from(testEnv().AUTH_SECRET ?? '', 'base64');
  expect(stored).toEqual({
    mac: createHmac('sha256', secret).update(`${EMAIL}:${code}`).digest('hex'),
    attempts: 0,
  });
  expect(await redis.ttl(codeKey())).toBeGreaterThan(590);
  expect(await redis.ttl(codeKey())).toBeLessThanOrEqual(600);
  expect(await db.user.count()).toBe(0);
});

it('five attempts then dead', async () => {
  await req();
  const code = await mailpitCode(EMAIL);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) expect((await verify(wrong)).body.code).toBe('CODE_INVALID');
  expect((await verify(code)).body.code).toBe('CODE_INVALID');
  expect(await redis.exists(codeKey())).toBe(0);
  expect(await db.session.count()).toBe(0);
});

it('no enumeration', async () => {
  await db.user.create({ data: { email: 'known@xstorex.ru' } });
  const known = await req('known@xstorex.ru');
  const unknown = await req('unknown@xstorex.ru');
  expect(known.status).toBe(204);
  expect(unknown.status).toBe(204);
  expect(known.text).toBe(unknown.text);
  expect(await db.user.count()).toBe(1);
});

it('normalizes email and reuses the existing account', async () => {
  const existing = await db.user.create({ data: { email: EMAIL } });
  expect((await req(' U@XSTOREX.RU ')).status).toBe(204);
  expect((await verify(await mailpitCode(EMAIL))).status).toBe(204);
  expect(await db.user.count()).toBe(1);
  expect((await db.session.findFirstOrThrow()).userId).toBe(existing.id);
});

it('rate-limits the fourth request per email, across normalized spellings', async () => {
  for (let i = 0; i < 3; i++) expect((await req()).status).toBe(204);
  const blocked = await req(' U@XSTOREX.RU ');
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
});

it('rate-limits the eleventh request per IP even for different recipients', async () => {
  for (let i = 0; i < 10; i++) expect((await req(`u${i}@xstorex.ru`)).status).toBe(204);
  expect((await req('another@xstorex.ru')).status).toBe(429);
});

it('consumes a valid code once even when verification is concurrent', async () => {
  await req();
  const code = await mailpitCode(EMAIL);
  const results = await Promise.all([verify(code), verify(code)]);
  expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  expect(await db.session.count()).toBe(1);
});

it('refuses an expired code without creating an account', async () => {
  await req();
  const code = await mailpitCode(EMAIL);
  await redis.del(codeKey());
  expect((await verify(code)).body.code).toBe('CODE_INVALID');
  expect(await db.user.count()).toBe(0);
});

it('refuses a blocked user after a valid code', async () => {
  await db.user.create({ data: { email: EMAIL, blockedAt: new Date() } });
  await req();
  const res = await verify(await mailpitCode(EMAIL));
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('ACCOUNT_BLOCKED');
  expect(await db.session.count()).toBe(0);
});

it('links an email to the signed-in account only after verification', async () => {
  const user = await db.user.create({ data: {} });
  const session = await app.get(SessionService).create(user.id, 'user', {});
  const cookie = `xs_session=${session.token}`;
  expect((await req(EMAIL, '/profile/email/request', cookie)).status).toBe(204);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBeNull();
  const res = await request(app.getHttpServer())
    .post('/api/v1/profile/email/verify')
    .set('Origin', SITE)
    .set('Cookie', cookie)
    .send({ email: EMAIL, code: await mailpitCode(EMAIL) });
  expect(res.status).toBe(204);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(EMAIL);
});

it('refuses an email that belongs to another user', async () => {
  await db.user.create({ data: { email: EMAIL } });
  const other = await db.user.create({ data: {} });
  const session = await app.get(SessionService).create(other.id, 'user', {});
  const cookie = `xs_session=${session.token}`;
  await req(EMAIL, '/profile/email/request', cookie);
  const res = await request(app.getHttpServer())
    .post('/api/v1/profile/email/verify')
    .set('Origin', SITE)
    .set('Cookie', cookie)
    .send({ email: EMAIL, code: await mailpitCode(EMAIL) });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('EMAIL_TAKEN');
  expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).email).toBeNull();
});

it('requires a user session for linking and rejects cross-origin requests', async () => {
  expect((await req(EMAIL, '/profile/email/request')).status).toBe(401);
  const staff = await db.user.create({ data: { role: 'admin' } });
  const session = await app.get(SessionService).create(staff.id, 'staff', {});
  expect((await req(EMAIL, '/profile/email/request', `xs_session=${session.token}`)).status).toBe(
    403,
  );
  expect(
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/email/request')
        .set('Origin', 'https://other.example')
        .send({ email: EMAIL })
    ).status,
  ).toBe(403);
});

it('email sign-in never grants staff privileges to an administrator', async () => {
  await db.user.create({ data: { email: EMAIL, role: 'admin' } });
  await req();
  const agent = request.agent(app.getHttpServer());
  expect((await verify(await mailpitCode(EMAIL), EMAIL, agent)).status).toBe(204);
  expect((await agent.get('/api/v1/admin/apps')).status).toBe(403);
});
