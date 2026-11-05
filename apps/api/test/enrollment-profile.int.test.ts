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
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { verifyCms } from '../src/enrollment/cms.js';
import { certPem, createTestCa, keyPem, testIdentity } from './helpers/enrollment-identity.js';
import { testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: set by integration environment
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
const redis = new Redis(process.env.REDIS_URL_TEST ?? '');
let app: INestApplication;
let dir: string;
let ca: Awaited<ReturnType<typeof createTestCa>>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-enroll-profile-'));
  ca = await createTestCa();
  const identity = await testIdentity('RSA', ca);
  const cert = join(dir, 'enroll.crt');
  const key = join(dir, 'enroll.key');
  await writeFile(cert, certPem(identity.certificate) + certPem(ca.certificate));
  await writeFile(key, await keyPem(identity.privateKey));
  app = await createApp(loadConfig(testEnv({ ENROLL_CERT_PATH: cert, ENROLL_KEY_PATH: key })));
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

function profile(query: Record<string, string> = {}, cookie?: string) {
  const req = request(app.getHttpServer())
    .get('/api/v1/enrollment/profile')
    .query(query)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  return cookie ? req.set('Cookie', cookie) : req;
}

it('downloads a signed Profile Service and stores a fresh 15-minute nonce', async () => {
  const res = await profile({ next: '/app/test' });
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/x-apple-aspen-config');
  expect(res.headers['content-disposition']).toContain('xstore-signin.mobileconfig');
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body[0]).toBe(0x30);
  const row = await db.enrollmentSession.findFirstOrThrow();
  expect(row.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(row).toMatchObject({ userId: null, status: 'pending', next: '/app/test' });
  expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000)).toBe(15);
  const verified = await verifyCms(res.body, { anchors: [ca.certificate] });
  const xml = verified.content.toString();
  expect(xml).toContain(`callback?s=${row.nonce}`);
  expect(xml).toContain(`<key>Challenge</key><string>${row.nonce}</string>`);
});

it.each(['https://evil.example', '//evil.example', '/\\evil.example'])(
  'does not store an external next URL: %s',
  async (next) => {
    expect((await profile({ next })).status).toBe(200);
    expect((await db.enrollmentSession.findFirstOrThrow()).next).toBeNull();
  },
);

it('links only to the signed-in user when link mode is requested', async () => {
  const user = await db.user.create({ data: {} });
  const session = await app.get(SessionService).create(user.id, 'user', {});
  expect((await profile({ link: '1' }, `xs_session=${session.token}`)).status).toBe(200);
  expect((await db.enrollmentSession.findFirstOrThrow()).userId).toBe(user.id);
});

it('requires a user session for link mode', async () => {
  expect((await profile({ link: '1' })).status).toBe(401);
  expect(await db.enrollmentSession.count()).toBe(0);
});

it('does not link an ordinary sign-in profile to an existing browser session', async () => {
  const user = await db.user.create({ data: {} });
  const session = await app.get(SessionService).create(user.id, 'user', {});
  expect((await profile({}, `xs_session=${session.token}`)).status).toBe(200);
  expect((await db.enrollmentSession.findFirstOrThrow()).userId).toBeNull();
});

it('rate-limits profile downloads to ten per ten minutes', async () => {
  for (let i = 0; i < 10; i++) expect((await profile()).status).toBe(200);
  expect((await profile()).status).toBe(429);
  expect(await db.enrollmentSession.count()).toBe(10);
});
