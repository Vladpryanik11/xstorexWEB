import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName } from '@xstore/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { testEnv } from './test-env.js';

const SITE = 'http://localhost:3000';
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

const config = loadConfig(testEnv());
const db = createPrismaClient(config.databaseUrl);
const redis = new Redis(config.redisUrl);
const ipaQueue = new Queue(QueueName.ipa, { connection: new Redis(config.redisUrl) });
let app: INestApplication;
let adminCookie: string;
let userCookie: string;

type Agent = { cookie: string };
const as = ({ cookie }: Agent) => ({
  post: (path: string, body?: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Origin', SITE)
      .set('Cookie', cookie)
      .send(body),
  get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', cookie),
  delete: (path: string) =>
    request(app.getHttpServer()).delete(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie),
});
const admin = () => as({ cookie: adminCookie });

async function putParts(
  urls: { partNumber: number; url: string }[],
  sizes: number[],
): Promise<{ partNumber: number; etag: string }[]> {
  const out: { partNumber: number; etag: string }[] = [];
  for (const [i, { partNumber, url }] of urls.entries()) {
    const res = await fetch(url, { method: 'PUT', body: Buffer.alloc(sizes[i] ?? 0, partNumber) });
    expect(res.status).toBe(200);
    out.push({ partNumber, etag: res.headers.get('etag') ?? '' });
  }
  return out;
}

const queueJobNames = async (): Promise<string[]> =>
  (await ipaQueue.getJobs(['waiting', 'delayed', 'active'])).map((job) => job.name);

async function staffCookie(role: 'admin' | 'user'): Promise<string> {
  const user = await db.user.create({ data: { email: `${role}@xstorex.ru`, role } });
  const { token } = await app
    .get(SessionService)
    .create(user.id, role === 'admin' ? 'staff' : 'user', {});
  return `xs_session=${token}`;
}

beforeAll(async () => {
  app = await createApp(config);
});

beforeEach(async () => {
  await resetDatabase(config.databaseUrl);
  await redis.flushdb();
  adminCookie = await staffCookie('admin');
  userCookie = await staffCookie('user');
});

afterAll(async () => {
  await app.close();
  await ipaQueue.close();
  await db.$disconnect();
  redis.disconnect();
});

describe('multipart upload', () => {
  it('keeps reporting inspection until the catalog app is attached', async () => {
    const created = await admin().post('/admin/uploads', {
      fileName: 'pending.ipa',
      sizeBytes: 1024,
    });
    await db.ipaUpload.update({ where: { id: created.body.id }, data: { status: 'ready' } });
    const pending = await admin().get(`/admin/uploads/${created.body.id}`);
    expect(pending.body.status).toBe('inspecting');
    expect(pending.body.appId).toBeUndefined();
    const completed = await admin().post(`/admin/uploads/${created.body.id}/complete`, {
      parts: [],
    });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe('inspecting');
  });

  it('re-enqueues a completed upload after a lost enqueue, without uploading bytes again', async () => {
    const created = await admin().post('/admin/uploads', { fileName: 'lost.ipa', sizeBytes: 1024 });
    // The durable state after completing S3 and crashing before enqueue.
    await db.ipaUpload.update({ where: { id: created.body.id }, data: { status: 'uploaded' } });
    expect(await ipaQueue.getJob(`inspect-${created.body.id}`)).toBeUndefined();
    const retry = await admin().post(`/admin/uploads/${created.body.id}/complete`, { parts: [] });
    expect(retry.status).toBe(200);
    expect(await ipaQueue.getJob(`inspect-${created.body.id}`)).toBeTruthy();
  });

  it('an empty parts list cannot complete an unfinished upload', async () => {
    const created = await admin().post('/admin/uploads', {
      fileName: 'unfinished.ipa',
      sizeBytes: 1024,
    });
    const retry = await admin().post(`/admin/uploads/${created.body.id}/complete`, { parts: [] });
    expect(retry.status).toBe(400);
    expect(await ipaQueue.getJob(`inspect-${created.body.id}`)).toBeUndefined();
  });
  it('a ready upload points to its exact catalog app', async () => {
    const created = await admin().post('/admin/uploads', {
      fileName: 'ready.ipa',
      sizeBytes: 1024,
    });
    const app = await db.app.create({ data: { name: 'Ready', slug: 'ready' } });
    const version = await db.appVersion.create({
      data: {
        appId: app.id,
        version: '1',
        build: '1',
        bundleId: 'ru.test.ready',
        sizeBytes: 1024n,
        sha256: 'a'.repeat(64),
        ipaKey: 'ready.ipa',
        encrypted: false,
      },
    });
    await db.ipaUpload.update({
      where: { id: created.body.id },
      data: { status: 'ready', appVersionId: version.id },
    });
    const ready = await admin().get(`/admin/uploads/${created.body.id}`);
    expect(ready.body.appId).toBe(app.id);
    const completed = await admin().post(`/admin/uploads/${created.body.id}/complete`, {
      parts: [],
    });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ status: 'ready', appId: app.id });
  });
  it('uploads two parts through presigned URLs and completes', async () => {
    const up = await admin().post('/admin/uploads', { fileName: 'Тест.ipa', sizeBytes: 70 * MiB });
    expect(up.status).toBe(201);
    expect(up.body).toEqual({
      id: expect.any(String),
      fileName: 'Тест.ipa',
      sizeBytes: 70 * MiB,
      partSize: 64 * MiB,
      status: 'uploading',
    });
    const row = await db.ipaUpload.findUniqueOrThrow({ where: { id: up.body.id } });
    expect(row).toMatchObject({
      purpose: 'catalog',
      bucket: 'xstore-test-originals',
      key: `originals/${up.body.id}.ipa`,
      s3UploadId: expect.any(String),
    });

    const parts = await admin().post(`/admin/uploads/${up.body.id}/parts`, {
      partNumbers: [1, 2],
    });
    expect(parts.status).toBe(200);
    expect(parts.body.urls.map((u: { url: string }) => new URL(u.url).origin)).toEqual([
      config.s3.publicUrl,
      config.s3.publicUrl,
    ]);
    const etags = await putParts(parts.body.urls, [64 * MiB, 6 * MiB]);

    const done = await admin().post(`/admin/uploads/${up.body.id}/complete`, { parts: etags });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('uploaded');
    expect(await queueJobNames()).toContain('inspect');
    const job = (await ipaQueue.getJobs(['waiting']))[0];
    expect(job?.data).toEqual({ uploadId: up.body.id });
    expect(job?.opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
    });

    expect((await admin().get(`/admin/uploads/${up.body.id}`)).body.status).toBe('uploaded');
    const audit = await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['upload.create', 'upload.complete']);
  });

  it('lists parts already uploaded (resume)', async () => {
    const up = await admin().post('/admin/uploads', { fileName: 'a.ipa', sizeBytes: 70 * MiB });
    const { urls } = (
      await admin().post(`/admin/uploads/${up.body.id}/parts`, { partNumbers: [1] })
    ).body;
    const [etag] = await putParts(urls, [64 * MiB]);
    const listed = await admin().get(`/admin/uploads/${up.body.id}/parts`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ parts: [{ partNumber: 1, etag: etag?.etag, size: 64 * MiB }] });
  });

  it('refuses to complete while a part is missing', async () => {
    const up = await admin().post('/admin/uploads', { fileName: 'a.ipa', sizeBytes: 70 * MiB });
    const { urls } = (
      await admin().post(`/admin/uploads/${up.body.id}/parts`, { partNumbers: [1] })
    ).body;
    const etags = await putParts(urls, [64 * MiB]);
    const done = await admin().post(`/admin/uploads/${up.body.id}/complete`, { parts: etags });
    expect(done.status).toBe(400);
    expect(done.body.code).toBe('VALIDATION');
    expect((await admin().get(`/admin/uploads/${up.body.id}`)).body.status).toBe('uploading');
  });

  it('refuses part numbers outside the plan and more than 20 per call', async () => {
    const up = await admin().post('/admin/uploads', { fileName: 'a.ipa', sizeBytes: 70 * MiB });
    const beyond = await admin().post(`/admin/uploads/${up.body.id}/parts`, { partNumbers: [3] });
    expect(beyond.status).toBe(400);
    const big = await admin().post('/admin/uploads', { fileName: 'b.ipa', sizeBytes: 5 * GiB });
    const many = await admin().post(`/admin/uploads/${big.body.id}/parts`, {
      partNumbers: Array.from({ length: 21 }, (_, i) => i + 1),
    });
    expect(many.status).toBe(400);
  });

  it('rejects files over 10 GiB', async () => {
    const res = await admin().post('/admin/uploads', {
      fileName: 'a.ipa',
      sizeBytes: 10 * GiB + 1,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'UPLOAD_TOO_LARGE',
      message: 'Файл больше допустимого размера',
    });
    expect(await db.ipaUpload.count()).toBe(0);
  });

  it('deletes an upload and aborts it in storage', async () => {
    const up = await admin().post('/admin/uploads', { fileName: 'a.ipa', sizeBytes: 70 * MiB });
    const res = await admin().delete(`/admin/uploads/${up.body.id}`);
    expect(res.status).toBe(204);
    expect(await db.ipaUpload.count()).toBe(0);
    expect((await admin().get(`/admin/uploads/${up.body.id}`)).status).toBe(404);
    const audit = await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['upload.create', 'upload.delete']);
  });

  it('returns 404 for an unknown upload', async () => {
    expect((await admin().get('/admin/uploads/nope')).status).toBe(404);
  });
});

describe('access', () => {
  it('guests and plain users get 401/403', async () => {
    const guest = await request(app.getHttpServer())
      .post('/api/v1/admin/uploads')
      .set('Origin', SITE)
      .send({ fileName: 'a.ipa', sizeBytes: 1 });
    expect(guest.status).toBe(401);
    const user = await as({ cookie: userCookie }).post('/admin/uploads', {
      fileName: 'a.ipa',
      sizeBytes: 1,
    });
    expect(user.status).toBe(403);
    expect((await as({ cookie: userCookie }).get('/admin/uploads/x')).status).toBe(403);
  });
});
