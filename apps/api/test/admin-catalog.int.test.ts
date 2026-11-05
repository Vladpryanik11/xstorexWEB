import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName } from '@xstore/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { seedApp, seedCategory, seedCollection } from './helpers/seed-catalog.js';
import { testEnv } from './test-env.js';

const SITE = 'http://localhost:3000';
const config = loadConfig(testEnv());
const db = createPrismaClient(config.databaseUrl);
const redis = new Redis(config.redisUrl);
const systemQueue = new Queue(QueueName.system, { connection: new Redis(config.redisUrl) });
const media = `${config.s3.publicUrl}/${config.s3.bucketPrefix}media`;
let app: INestApplication;
let adminCookie: string;
let supportCookie: string;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

const as = (cookie: string) => {
  const server = () => request(app.getHttpServer());
  const withAuth = (r: request.Test) => r.set('Origin', SITE).set('Cookie', cookie);
  return {
    get: (path: string) => server().get(`/api/v1${path}`).set('Cookie', cookie),
    post: (path: string, body?: object) => withAuth(server().post(`/api/v1${path}`)).send(body),
    patch: (path: string, body: object) => withAuth(server().patch(`/api/v1${path}`)).send(body),
    put: (path: string, body: object) => withAuth(server().put(`/api/v1${path}`)).send(body),
    delete: (path: string) => withAuth(server().delete(`/api/v1${path}`)),
  };
};
const admin = () => as(adminCookie);
const support = () => as(supportCookie);
const publicGet = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

async function staffCookie(role: 'admin' | 'support'): Promise<string> {
  const user = await db.user.create({ data: { email: `${role}@xstorex.ru`, role } });
  const { token } = await app.get(SessionService).create(user.id, 'staff', {});
  return `xs_session=${token}`;
}

/** A complete app that publishes without blockers. */
async function readyApp(slug = 'ready-app', versions?: Parameters<typeof seedApp>[1]['versions']) {
  const category = await seedCategory(db, { slug: `cat-${slug}`, name: 'Утилиты' });
  return seedApp(db, {
    slug,
    name: 'Готовое приложение',
    status: 'draft',
    categoryId: category.id,
    iconKey: 'apps/x/icon-512.png',
    rightsBasis: 'Договор с разработчиком № 7',
    versions,
  });
}

beforeAll(async () => {
  app = await createApp(config);
});

beforeEach(async () => {
  await resetDatabase(config.databaseUrl);
  await redis.flushdb();
  adminCookie = await staffCookie('admin');
  supportCookie = await staffCookie('support');
});

afterAll(async () => {
  await app.close();
  await systemQueue.close();
  await db.$disconnect();
  redis.disconnect();
});

describe('apps', () => {
  it('lists apps of every status and filters them', async () => {
    await seedApp(db, { slug: 'yandex-maps', name: 'Яндекс Карты' });
    await seedApp(db, { slug: 'draft-app', name: 'Черновик', status: 'draft', versions: [] });
    const all = await admin().get('/admin/apps');
    expect(all.status).toBe(200);
    expect(all.body.items.map((a: { slug: string }) => a.slug).sort()).toEqual([
      'draft-app',
      'yandex-maps',
    ]);
    expect(all.body.nextCursor).toBeNull();
    const drafts = await admin().get('/admin/apps?status=draft');
    expect(drafts.body.items.map((a: { slug: string }) => a.slug)).toEqual(['draft-app']);
    const found = await admin().get(`/admin/apps?q=${encodeURIComponent('яндекс')}`);
    expect(found.body.items.map((a: { slug: string }) => a.slug)).toEqual(['yandex-maps']);
    expect((await admin().get('/admin/apps?status=gone')).status).toBe(400);
  });

  it('shows the card with blockers', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A', status: 'draft', versions: [] });
    const res = await admin().get(`/admin/apps/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      slug: 'a',
      status: 'draft',
      screenshots: [],
      publishBlockers: ['NO_RIGHTS_BASIS', 'NO_ICON', 'NO_PUBLISHED_VERSION', 'NO_CATEGORY'],
    });
    expect((await admin().get('/admin/apps/nope')).status).toBe(404);
  });

  it('every mutation writes an audit row', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A', developer: 'Старый' });
    const res = await admin().patch(`/admin/apps/${id}`, {
      developer: 'ООО Разработчик',
      rating: 4.7,
      ratingCount: 1500,
      languages: ['RU', 'EN'],
      itunesId: '284882215',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      developer: 'ООО Разработчик',
      rating: 4.7,
      languages: ['RU', 'EN'],
    });
    const audit = await db.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'app.update', entity: 'App', entityId: id });
    expect(audit[0]?.diff).toMatchObject({
      developer: { from: 'Старый', to: 'ООО Разработчик' },
      rating: { from: null, to: 4.7 },
    });
  });

  it('a slug change keeps slugs unique', async () => {
    await seedApp(db, { slug: 'taken', name: 'T' });
    const { id } = await seedApp(db, { slug: 'mine', name: 'M' });
    const clash = await admin().patch(`/admin/apps/${id}`, { slug: 'taken' });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('CONFLICT');
    expect((await admin().patch(`/admin/apps/${id}`, { slug: 'renamed' })).body.slug).toBe(
      'renamed',
    );
  });

  it('refuses an unknown category', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A' });
    const res = await admin().patch(`/admin/apps/${id}`, { categoryId: 'missing' });
    expect(res.status).toBe(400);
  });

  it('publishing an incomplete app returns the blockers', async () => {
    const { id } = await seedApp(db, {
      slug: 'a',
      name: 'A',
      status: 'draft',
      rightsBasis: '   ',
      versions: [{ version: '1.0', status: 'draft' }],
    });
    const res = await admin().post(`/admin/apps/${id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'PUBLISH_BLOCKED',
      message: 'Нельзя опубликовать: заполните обязательные поля',
      details: ['NO_RIGHTS_BASIS', 'NO_ICON', 'NO_PUBLISHED_VERSION', 'NO_CATEGORY'],
    });
    expect((await db.app.findUniqueOrThrow({ where: { id } })).status).toBe('draft');
  });

  it('publishes a complete app, hides it on a complaint and unhides it', async () => {
    const { id } = await readyApp();
    const published = await admin().post(`/admin/apps/${id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');
    expect((await publicGet('/catalog/apps/ready-app')).status).toBe(200);

    expect((await admin().post(`/admin/apps/${id}/hide`, { reason: '' })).status).toBe(400);
    const hidden = await admin().post(`/admin/apps/${id}/hide`, {
      reason: 'Жалоба правообладателя',
    });
    expect(hidden.body).toMatchObject({ status: 'hidden', hiddenReason: 'Жалоба правообладателя' });
    expect((await publicGet('/catalog/apps/ready-app')).status).toBe(404);

    const back = await admin().post(`/admin/apps/${id}/unhide`);
    expect(back.body).toMatchObject({ status: 'published', hiddenReason: null });
    expect((await publicGet('/catalog/apps/ready-app')).status).toBe(200);
    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(['app.publish', 'app.hide', 'app.unhide']);
  });

  it('unhide refuses an app that is not hidden', async () => {
    const { id } = await readyApp();
    expect((await admin().post(`/admin/apps/${id}/unhide`)).status).toBe(409);
  });
});

describe('media', () => {
  it('uploads an icon through a presigned PUT and commits it', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A' });
    const ticket = await admin().post(`/admin/apps/${id}/media/icon`, {
      contentType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(ticket.status).toBe(200);
    expect(ticket.body.key).toMatch(new RegExp(`^apps/${id}/icon-[a-f0-9]{32}\\.png$`));
    expect(new URL(ticket.body.url).origin).toBe(config.s3.publicUrl);
    const put = await fetch(ticket.body.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: PNG,
    });
    expect(put.status).toBe(200);

    const done = await admin().post(`/admin/apps/${id}/media/icon/commit`, {
      key: ticket.body.key,
    });
    expect(done.status).toBe(200);
    expect(done.body.iconUrl).toBe(`${media}/${ticket.body.key}`);
    expect((await db.auditLog.findMany()).map((a) => a.action)).toEqual(['app.media']);
  });

  it('refuses a key of another app or kind, a missing object and a non-image', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A' });
    const other = await seedApp(db, { slug: 'b', name: 'B' });
    const ticket = await admin().post(`/admin/apps/${other.id}/media/icon`, {
      contentType: 'image/png',
      sizeBytes: 100,
    });
    expect(
      (await admin().post(`/admin/apps/${id}/media/icon/commit`, { key: ticket.body.key })).status,
    ).toBe(400);
    expect(
      (await admin().post(`/admin/apps/${other.id}/media/banner/commit`, { key: ticket.body.key }))
        .status,
    ).toBe(400);
    expect(
      (await admin().post(`/admin/apps/${other.id}/media/icon/commit`, { key: ticket.body.key }))
        .status,
    ).toBe(400);
    await fetch(ticket.body.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('<html>not an image</html>'),
    });
    expect(
      (await admin().post(`/admin/apps/${other.id}/media/icon/commit`, { key: ticket.body.key }))
        .status,
    ).toBe(400);
    expect(
      (
        await admin().post(`/admin/apps/${id}/media/video`, {
          contentType: 'image/png',
          sizeBytes: 1,
        })
      ).status,
    ).toBe(400);
  });

  it('adds, reorders and deletes screenshots', async () => {
    const { id } = await seedApp(db, { slug: 'a', name: 'A' });
    const keys: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await admin().post(`/admin/apps/${id}/media/screenshot`, {
        contentType: 'image/png',
        sizeBytes: PNG.length,
      });
      await fetch(t.body.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: PNG,
      });
      expect(
        (await admin().post(`/admin/apps/${id}/media/screenshot/commit`, { key: t.body.key }))
          .status,
      ).toBe(200);
      keys.push(t.body.key);
    }
    const [k0, k1, k2] = keys as [string, string, string];
    expect(
      (await admin().put(`/admin/apps/${id}/screenshots/order`, { keys: [k2, k0] })).status,
    ).toBe(400);
    const ordered = await admin().put(`/admin/apps/${id}/screenshots/order`, {
      keys: [k2, k0, k1],
    });
    expect(ordered.status).toBe(200);
    expect(ordered.body.screenshots.map((s: { key: string }) => s.key)).toEqual([k2, k0, k1]);
    const removed = await admin().delete(`/admin/apps/${id}/screenshots/1`);
    expect(removed.status).toBe(200);
    expect(removed.body.screenshots.map((s: { key: string }) => s.key)).toEqual([k2, k1]);
    expect((await admin().delete(`/admin/apps/${id}/screenshots/5`)).status).toBe(404);
  });
});

describe('versions', () => {
  it('an encrypted version cannot be published', async () => {
    const { id } = await readyApp('enc', [{ version: '1.0', status: 'draft', encrypted: true }]);
    const [version] = (await admin().get(`/admin/apps/${id}/versions`)).body;
    const res = await admin().post(`/admin/versions/${version.id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'PUBLISH_BLOCKED', details: ['ENCRYPTED'] });
  });

  it('publishing a newer version changes the public latest version', async () => {
    const { id } = await readyApp('ready-app', [
      { version: '1.0', publishedAt: new Date('2026-10-01T00:00:00Z') },
      { version: '2.0', status: 'draft' },
    ]);
    await admin().post(`/admin/apps/${id}/publish`);
    expect((await publicGet('/catalog/apps/ready-app')).body.version).toBe('1.0');

    const versions = (await admin().get(`/admin/apps/${id}/versions`)).body as {
      id: string;
      version: string;
    }[];
    const v2 = versions.find((v) => v.version === '2.0');
    const changelog = await admin().patch(`/admin/versions/${v2?.id}`, {
      changelog: 'Исправления',
    });
    expect(changelog.body.changelog).toBe('Исправления');
    const res = await admin().post(`/admin/versions/${v2?.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'published', publishedAt: expect.any(String) });
    const detail = await publicGet('/catalog/apps/ready-app');
    expect(detail.body.version).toBe('2.0');
    expect(detail.body.versions[0].changelog).toBe('Исправления');

    await admin().post(`/admin/versions/${v2?.id}/unpublish`);
    expect((await publicGet('/catalog/apps/ready-app')).body.version).toBe('1.0');
    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual([
      'app.publish',
      'version.update',
      'version.publish',
      'version.unpublish',
    ]);
  });
});

describe('categories', () => {
  it('creates, renames, reorders and deletes', async () => {
    const games = await admin().post('/admin/categories', { name: 'Игры', icon: 'games' });
    expect(games.status).toBe(201);
    expect(games.body).toMatchObject({ slug: 'igry', name: 'Игры', icon: 'games', appCount: 0 });
    const tools = await admin().post('/admin/categories', { name: 'Утилиты', icon: 'tools' });
    expect(
      (await admin().post('/admin/categories', { name: 'Игры', icon: 'games' })).body.slug,
    ).toBe('igry-2');

    const renamed = await admin().patch(`/admin/categories/${tools.body.id}`, {
      name: 'Инструменты',
    });
    expect(renamed.body.name).toBe('Инструменты');

    const list = (await admin().get('/admin/categories')).body as { id: string }[];
    const ids = list.map((c) => c.id).reverse();
    expect((await admin().put('/admin/categories/order', { ids: ids.slice(1) })).status).toBe(400);
    const ordered = await admin().put('/admin/categories/order', { ids });
    expect(ordered.body.map((c: { id: string }) => c.id)).toEqual(ids);

    await seedApp(db, { slug: 'g', name: 'G', categoryId: games.body.id });
    const refused = await admin().delete(`/admin/categories/${games.body.id}`);
    expect(refused.status).toBe(409);
    expect((await admin().delete(`/admin/categories/${tools.body.id}`)).status).toBe(204);
    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual([
      'category.create',
      'category.create',
      'category.create',
      'category.update',
      'category.order',
      'category.delete',
    ]);
  });
});

describe('collections', () => {
  it('creates a collection, sets its items and order', async () => {
    const a = await seedApp(db, { slug: 'a', name: 'A' });
    const b = await seedApp(db, { slug: 'b', name: 'B' });
    const picks = await admin().post('/admin/collections', {
      title: 'Выбор редакции',
      layout: 'grid3',
      source: 'manual',
    });
    expect(picks.status).toBe(201);
    expect(picks.body).toMatchObject({
      slug: 'vybor-redaktsii',
      limit: 12,
      onHome: true,
      items: [],
    });
    const items = await admin().put(`/admin/collections/${picks.body.id}/items`, {
      items: [
        { appId: b.id, pinned: true },
        { appId: a.id, pinned: false },
      ],
    });
    expect(items.status).toBe(200);
    expect(items.body.items).toEqual([
      expect.objectContaining({ appId: b.id, slug: 'b', position: 0, pinned: true }),
      expect.objectContaining({ appId: a.id, slug: 'a', position: 1, pinned: false }),
    ]);
    expect(
      (
        await admin().put(`/admin/collections/${picks.body.id}/items`, {
          items: [{ appId: 'nope', pinned: false }],
        })
      ).status,
    ).toBe(400);
    const list = await publicGet('/catalog/lists/vybor-redaktsii');
    expect(list.body.items.map((i: { slug: string }) => i.slug)).toEqual(['b', 'a']);

    const top = await seedCollection(db, { slug: 'top', title: 'Топ', source: 'top_downloads' });
    const ordered = await admin().put('/admin/collections/order', { ids: [picks.body.id, top.id] });
    expect(ordered.body.map((c: { id: string }) => c.id)).toEqual([picks.body.id, top.id]);
    const patched = await admin().patch(`/admin/collections/${top.id}`, {
      onHome: false,
      limit: 30,
    });
    expect(patched.body).toMatchObject({ onHome: false, limit: 30 });
    expect((await admin().delete(`/admin/collections/${top.id}`)).status).toBe(204);
    const actions = (await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (x) => x.action,
    );
    expect(actions).toEqual([
      'collection.create',
      'collection.items',
      'collection.order',
      'collection.update',
      'collection.delete',
    ]);
  });
});

describe('jobs', () => {
  it('failed jobs are listed and retried', async () => {
    const worker = new Worker(
      QueueName.system,
      async () => {
        throw new Error(`boom ${'x'.repeat(800)}`);
      },
      { connection: new Redis(config.redisUrl, { maxRetriesPerRequest: null }) },
    );
    const failed = new Promise<void>((resolve) => worker.on('failed', () => resolve()));
    const job = await systemQueue.add('ping', { secret: 'do-not-leak' }, { attempts: 1 });
    await failed;
    await worker.close();

    const list = await support().get('/admin/jobs/failed');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      {
        id: job.id,
        queue: 'system',
        name: 'ping',
        failedReason: expect.stringMatching(/^boom x+/),
        attemptsMade: 1,
        finishedOn: expect.any(String),
      },
    ]);
    expect(list.body[0].failedReason.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(list.body)).not.toContain('do-not-leak');
    expect((await admin().get('/admin/jobs/failed?queue=ipa')).body).toEqual([]);
    expect((await admin().get('/admin/jobs/failed?queue=nope')).status).toBe(400);

    expect((await support().post(`/admin/jobs/system/${job.id}/retry`)).status).toBe(403);
    const retried = await admin().post(`/admin/jobs/system/${job.id}/retry`);
    expect(retried.status).toBe(200);
    expect(await (await systemQueue.getJob(job.id as string))?.getState()).toBe('waiting');
    expect((await admin().get('/admin/jobs/failed')).body).toEqual([]);
    expect((await admin().post(`/admin/jobs/system/${job.id}/retry`)).status).toBe(409);
    expect((await admin().post('/admin/jobs/system/missing/retry')).status).toBe(404);
    const audit = await db.auditLog.findMany();
    expect(audit.map((a) => [a.action, a.entityId])).toEqual([['job.retry', `system:${job.id}`]]);
  });
});

describe('access', () => {
  it('support cannot mutate', async () => {
    const { id } = await readyApp();
    expect((await support().get('/admin/apps')).status).toBe(403);
    expect((await support().patch(`/admin/apps/${id}`, { name: 'X' })).status).toBe(403);
    expect((await support().post(`/admin/apps/${id}/publish`)).status).toBe(403);
    expect((await support().post('/admin/categories', { name: 'X', icon: 'x' })).status).toBe(403);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('guests get 401', async () => {
    expect((await publicGet('/admin/apps')).status).toBe(401);
    expect((await publicGet('/admin/jobs/failed')).status).toBe(401);
  });
});
