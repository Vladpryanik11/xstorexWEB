import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { seedApp, seedCategory } from './helpers/seed-catalog.js';
import { testEnv } from './test-env.js';

/** Simple IPA upload (spec 2026-11-24): section + subcategory put an app into the catalog. */

const SITE = 'http://localhost:3000';
const config = loadConfig(testEnv());
const db = createPrismaClient(config.databaseUrl);
const redis = new Redis(config.redisUrl);
let app: INestApplication;
let cookie: string;

const server = () => request(app.getHttpServer());
const admin = {
  get: (path: string) => server().get(`/api/v1${path}`).set('Cookie', cookie),
  post: (path: string, body?: object) =>
    server().post(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
  patch: (path: string, body: object) =>
    server().patch(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
  delete: (path: string) =>
    server().delete(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie),
};
const publicGet = (path: string) => server().get(`/api/v1${path}`);
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);

/** What a fresh upload leaves behind: a draft with the IPA's icon and one draft version. */
const uploaded = (slug: string, name = slug) =>
  seedApp(db, {
    slug,
    name,
    status: 'draft',
    iconKey: `apps/${slug}/icon-512.png`,
    versions: [{ version: '1.0', status: 'draft', sizeBytes: 5n * 1024n ** 2n }],
  });

beforeAll(async () => {
  app = await createApp(config);
});

beforeEach(async () => {
  await resetDatabase(config.databaseUrl);
  await redis.flushdb();
  const user = await db.user.create({ data: { email: 'admin@xstorex.ru', role: 'admin' } });
  cookie = `xs_session=${(await app.get(SessionService).create(user.id, 'staff', {})).token}`;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

describe('section and subcategory', () => {
  it('choosing both puts the app into the catalog by itself', async () => {
    const music = await seedCategory(db, { slug: 'music', name: 'Музыка' });
    const { id } = await uploaded('spotify', 'Spotify');

    const first = await admin.patch(`/admin/apps/${id}`, { section: 'premium' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'draft', publishBlockers: ['NO_CATEGORY'] });

    const done = await admin.patch(`/admin/apps/${id}`, { categoryId: music.id });
    expect(done.body).toMatchObject({
      status: 'published',
      section: 'premium',
      publishBlockers: [],
    });
    expect((await publicGet('/catalog/apps/spotify')).body.version).toBe('1.0');
    expect(slugs((await publicGet('/catalog/sections/premium')).body.items)).toEqual(['spotify']);
  });

  it('removed keeps the old App Store flag; clearing the section takes the app down', async () => {
    const cat = await seedCategory(db, { slug: 'games', name: 'Игры' });
    const { id } = await uploaded('flappy');
    await admin.patch(`/admin/apps/${id}`, { section: 'removed', categoryId: cat.id });
    expect((await db.app.findUniqueOrThrow({ where: { id } })).removedFromAppStore).toBe(true);
    expect(slugs((await publicGet('/catalog/sections/removed')).body.items)).toEqual(['flappy']);

    const back = await admin.patch(`/admin/apps/${id}`, { section: null });
    expect(back.body).toMatchObject({ status: 'draft', publishBlockers: ['NO_SECTION'] });
    expect((await publicGet('/catalog/apps/flappy')).status).toBe(404);
  });

  it('renaming a published app keeps it public', async () => {
    const cat = await seedCategory(db, { slug: 'music', name: 'Музыка' });
    const { id } = await uploaded('spotify', 'Spotify');
    await admin.patch(`/admin/apps/${id}`, { section: 'premium', categoryId: cat.id });
    const res = await admin.patch(`/admin/apps/${id}`, { name: 'Spotify Premium' });
    expect(res.body).toMatchObject({ status: 'published', name: 'Spotify Premium' });
  });

  it('an encrypted upload never goes public', async () => {
    const cat = await seedCategory(db, { slug: 'games', name: 'Игры' });
    const { id } = await seedApp(db, {
      slug: 'old',
      name: 'Old',
      status: 'draft',
      iconKey: 'apps/old/icon-512.png',
      versions: [{ version: '1.0', status: 'draft', encrypted: true }],
    });
    const res = await admin.patch(`/admin/apps/${id}`, { section: 'removed', categoryId: cat.id });
    expect(res.body).toMatchObject({ status: 'draft', publishBlockers: ['NO_VERSION'] });
  });
});

describe('list', () => {
  it('shows what the one-screen admin needs and filters by section', async () => {
    const cat = await seedCategory(db, { slug: 'music', name: 'Музыка' });
    const a = await uploaded('a');
    await uploaded('b');
    await admin.patch(`/admin/apps/${a.id}`, { section: 'premium', categoryId: cat.id });

    const all = await admin.get('/admin/apps');
    const row = all.body.items.find((i: { slug: string }) => i.slug === 'a');
    expect(row).toMatchObject({
      section: 'premium',
      categoryId: cat.id,
      latestVersion: '1.0',
      sizeBytes: 5 * 1024 ** 2,
      encrypted: false,
      status: 'published',
      publishBlockers: [],
    });
    expect(slugs((await admin.get('/admin/apps?section=premium')).body.items)).toEqual(['a']);
    expect(slugs((await admin.get('/admin/apps?section=none')).body.items)).toEqual(['b']);
  });
});

describe('hide and delete', () => {
  it('hides without a reason and shows again', async () => {
    const cat = await seedCategory(db, { slug: 'music', name: 'Музыка' });
    const { id } = await uploaded('a');
    await admin.patch(`/admin/apps/${id}`, { section: 'premium', categoryId: cat.id });
    const hidden = await admin.post(`/admin/apps/${id}/hide`, {});
    expect(hidden.body).toMatchObject({ status: 'hidden', hiddenReason: 'Скрыто администратором' });
    expect((await publicGet('/catalog/apps/a')).status).toBe(404);
    const shown = await admin.post(`/admin/apps/${id}/unhide`);
    expect(shown.body).toMatchObject({ status: 'published', hiddenReason: null });
  });

  it('deletes an app with its versions', async () => {
    const { id } = await uploaded('gone');
    const res = await admin.delete(`/admin/apps/${id}`);
    expect(res.status).toBe(204);
    expect(await db.app.count()).toBe(0);
    expect(await db.appVersion.count()).toBe(0);
    expect((await admin.get(`/admin/apps/${id}`)).status).toBe(404);
    expect((await db.auditLog.findMany()).map((a) => a.action)).toEqual(['app.delete']);
    expect((await admin.delete(`/admin/apps/${id}`)).status).toBe(404);
  });
});

describe('uploads on the server', () => {
  it('lists unfinished and turned-down uploads, newest first', async () => {
    const owner = await db.user.findFirstOrThrow();
    const base = { ownerId: owner.id, purpose: 'catalog' as const, bucket: 'b', partSize: 1 };
    await db.ipaUpload.create({
      data: {
        ...base,
        key: 'k1',
        fileName: 'old.ipa',
        sizeBytes: 1n,
        status: 'rejected',
        rejectCode: 'IPA_ENCRYPTED',
        createdAt: new Date(Date.now() - 8 * 864e5),
      },
    });
    await db.ipaUpload.create({
      data: { ...base, key: 'k2', fileName: 'done.ipa', sizeBytes: 1n, status: 'ready' },
    });
    await db.ipaUpload.create({
      data: {
        ...base,
        key: 'k3',
        fileName: 'bad.ipa',
        sizeBytes: 2n,
        status: 'rejected',
        rejectCode: 'IPA_ENCRYPTED',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await db.ipaUpload.create({
      data: { ...base, key: 'k4', fileName: 'busy.ipa', sizeBytes: 3n, status: 'inspecting' },
    });
    const res = await admin.get('/admin/uploads');
    expect(res.status).toBe(200);
    expect(res.body.map((u: { fileName: string }) => u.fileName)).toEqual(['busy.ipa', 'bad.ipa']);
    expect(res.body[1]).toMatchObject({
      status: 'rejected',
      rejectCode: 'IPA_ENCRYPTED',
      sizeBytes: 2,
    });
  });
});

describe('catalog subcategories', () => {
  it('filters a section by subcategory and lists the subcategories in use', async () => {
    const music = await seedCategory(db, { slug: 'music', name: 'Музыка' });
    const games = await seedCategory(db, { slug: 'games', name: 'Игры' });
    await seedCategory(db, { slug: 'empty', name: 'Пусто' });
    for (const [slug, categoryId, section] of [
      ['s1', music.id, 'premium'],
      ['s2', games.id, 'premium'],
      ['s3', games.id, 'removed'],
    ] as const) {
      const { id } = await uploaded(slug);
      await admin.patch(`/admin/apps/${id}`, { section, categoryId });
    }
    expect(slugs((await publicGet('/catalog/sections/premium?category=games')).body.items)).toEqual(
      ['s2'],
    );
    const cats = await publicGet('/catalog/sections/premium/categories');
    expect(cats.status).toBe(200);
    expect(cats.body.map((c: { slug: string }) => c.slug).sort()).toEqual(['games', 'music']);
    expect(
      (await publicGet('/catalog/sections/removed/categories')).body.map(
        (c: { slug: string }) => c.slug,
      ),
    ).toEqual(['games']);
    expect((await publicGet('/catalog/sections/popular/categories')).status).toBe(404);
  });
});
