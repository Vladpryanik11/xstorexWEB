import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import {
  appCardSchema,
  appDetailSchema,
  categoryViewSchema,
  collectionViewSchema,
  homeViewSchema,
  pageSchema,
} from '@xstore/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/config.js';
import { seedApp, seedCategory, seedCollection, seedInstalls } from './helpers/seed-catalog.js';
import { testEnv } from './test-env.js';

const config = loadConfig(testEnv());
const db = createPrismaClient(config.databaseUrl);
const media = `${config.s3.publicUrl}/${config.s3.bucketPrefix}media`;
const CACHE = 'public, max-age=60, stale-while-revalidate=300';
let app: INestApplication;

const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);
const appPage = pageSchema(appCardSchema);

beforeAll(async () => {
  app = await createApp(config);
});

beforeEach(async () => {
  await resetDatabase(config.databaseUrl);
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('home', () => {
  it('home lists published apps in admin order', async () => {
    const games = await seedCategory(db, { slug: 'games', name: 'Игры', icon: 'games', sort: 1 });
    await seedCategory(db, { slug: 'tools', name: 'Утилиты', icon: 'tools', sort: 0 });
    const alpha = await seedApp(db, {
      slug: 'alpha',
      name: 'Alpha',
      subtitle: 'Первая',
      iconKey: 'apps/a/icon-512.png',
      bannerKey: 'apps/a/banner.jpg',
      categoryId: games.id,
      rating: 4.5,
      ratingCount: 120,
    });
    const beta = await seedApp(db, { slug: 'beta', name: 'Beta' });
    const gamma = await seedApp(db, {
      slug: 'gamma',
      name: 'Gamma',
      bannerKey: 'apps/g/banner.jpg',
    });

    await seedCollection(db, {
      slug: 'hero',
      title: 'Главное',
      layout: 'banner',
      sort: 0,
      items: [{ appId: gamma.id }, { appId: beta.id }, { appId: alpha.id }],
    });
    await seedCollection(db, {
      slug: 'picks',
      title: 'Выбор редакции',
      sort: 2,
      items: [{ appId: beta.id }, { appId: alpha.id }, { appId: gamma.id }],
    });
    await seedCollection(db, {
      slug: 'fresh',
      title: 'Новое',
      layout: 'icons',
      source: 'recently_updated',
      sort: 1,
      limit: 2,
    });
    await seedCollection(db, {
      slug: 'off',
      title: 'Скрытая',
      sort: 3,
      onHome: false,
      items: [{ appId: beta.id }],
    });
    await seedCollection(db, { slug: 'empty', title: 'Пусто', sort: 4 });

    const res = await get('/catalog/home');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(CACHE);
    const home = homeViewSchema.parse(res.body);

    // banners keep admin order and skip apps without a banner image
    expect(home.banners.map((b) => [b.slug, b.imageUrl])).toEqual([
      ['gamma', `${media}/apps/g/banner.jpg`],
      ['alpha', `${media}/apps/a/banner.jpg`],
    ]);
    expect(home.collections.map((c) => c.slug)).toEqual(['fresh', 'picks']);
    expect(home.collections[0]?.items).toHaveLength(2);
    expect(slugs(home.collections[1]?.items ?? [])).toEqual(['beta', 'alpha', 'gamma']);
    expect(home.collections[1]?.items[1]).toEqual({
      slug: 'alpha',
      name: 'Alpha',
      subtitle: 'Первая',
      iconUrl: `${media}/apps/a/icon-512.png`,
      rating: 4.5,
      ratingCount: 120,
      category: { slug: 'games', name: 'Игры' },
    });
    expect(home.categories).toEqual([
      { slug: 'tools', name: 'Утилиты', icon: 'tools' },
      { slug: 'games', name: 'Игры', icon: 'games' },
    ]);
  });

  it('answers an empty catalog', async () => {
    const res = await get('/catalog/home');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ banners: [], collections: [], categories: [] });
  });
});

describe('app page', () => {
  it('shows the latest published version and the published history', async () => {
    await seedApp(db, {
      slug: 'yandex-maps',
      name: 'Яндекс Карты',
      description: 'Карты и навигатор',
      developer: 'Яндекс',
      languages: ['RU', 'EN'],
      screenshotKeys: ['apps/y/s1.png', 'apps/y/s2.png'],
      removedFromAppStore: true,
      accessLevel: 'addon:maps',
      versions: [
        { version: '1.0', build: '10', publishedAt: new Date('2026-01-01T00:00:00Z') },
        {
          version: '1.2',
          build: '12',
          publishedAt: new Date('2026-03-01T00:00:00Z'),
          sizeBytes: 5_000_000_000n,
          minIos: '15.0',
          changelog: 'Исправления',
        },
        { version: '1.1', build: '11', publishedAt: new Date('2026-02-01T00:00:00Z') },
        { version: '2.0', build: '20', status: 'draft' },
        { version: '1.9', build: '19', status: 'rejected' },
      ],
    });

    const res = await get('/catalog/apps/yandex-maps');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(CACHE);
    expect(appDetailSchema.parse(res.body)).toEqual({
      slug: 'yandex-maps',
      name: 'Яндекс Карты',
      description: 'Карты и навигатор',
      developer: 'Яндекс',
      languages: ['RU', 'EN'],
      sizeBytes: 5_000_000_000,
      version: '1.2',
      minIos: '15.0',
      screenshots: [`${media}/apps/y/s1.png`, `${media}/apps/y/s2.png`],
      versions: [
        {
          version: '1.2',
          build: '12',
          publishedAt: '2026-03-01T00:00:00.000Z',
          changelog: 'Исправления',
        },
        { version: '1.1', build: '11', publishedAt: '2026-02-01T00:00:00.000Z' },
        { version: '1.0', build: '10', publishedAt: '2026-01-01T00:00:00.000Z' },
      ],
      removedFromAppStore: true,
      accessLevel: 'addon:maps',
    });
  });

  it('answers 404 for an unknown slug', async () => {
    const res = await get('/catalog/apps/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' });
  });
});

describe('visibility', () => {
  it('hidden apps never leak', async () => {
    const cat = await seedCategory(db, { slug: 'games', name: 'Игры' });
    const shown = await seedApp(db, {
      slug: 'shown-app',
      name: 'Hidden Gems',
      categoryId: cat.id,
      rating: 5,
      ratingCount: 100,
      bannerKey: 'b.jpg',
    });
    const hidden = await seedApp(db, {
      slug: 'hidden-app',
      name: 'Hidden App',
      status: 'hidden',
      categoryId: cat.id,
      rating: 5,
      ratingCount: 100,
      bannerKey: 'b.jpg',
    });
    const draft = await seedApp(db, {
      slug: 'draft-app',
      name: 'Hidden Draft',
      status: 'draft',
      categoryId: cat.id,
      rating: 5,
      ratingCount: 100,
      bannerKey: 'b.jpg',
    });
    const noVersion = await seedApp(db, {
      slug: 'unreleased-app',
      name: 'Hidden Unreleased',
      categoryId: cat.id,
      rating: 5,
      ratingCount: 100,
      bannerKey: 'b.jpg',
      versions: [{ version: '1.0', status: 'draft' }],
    });
    const all = [shown, hidden, draft, noVersion].map((a) => ({ appId: a.id }));
    const pinnedAll = [hidden, draft, noVersion, shown].map((a) => ({ appId: a.id, pinned: true }));
    await seedCollection(db, { slug: 'picks', title: 'Выбор', items: all });
    await seedCollection(db, { slug: 'hero', title: 'Баннеры', layout: 'banner', items: all });
    await seedCollection(db, {
      slug: 'top',
      title: 'Лучшие',
      source: 'top_rated',
      sort: 1,
      items: pinnedAll,
    });
    await seedCollection(db, {
      slug: 'popular',
      title: 'Популярное',
      source: 'top_downloads',
      sort: 2,
    });
    for (const a of [hidden, draft, noVersion]) await seedInstalls(db, a.id, 10, 1);

    for (const slug of ['hidden-app', 'draft-app', 'unreleased-app']) {
      expect((await get(`/catalog/apps/${slug}`)).status).toBe(404);
    }
    expect(slugs((await get('/catalog/search?q=hidden')).body.items)).toEqual(['shown-app']);
    expect(slugs((await get('/catalog/lists/picks')).body.items)).toEqual(['shown-app']);
    expect(slugs((await get('/catalog/lists/top')).body.items)).toEqual(['shown-app']);
    expect(slugs((await get('/catalog/lists/popular')).body.items)).toEqual(['shown-app']);
    expect(slugs((await get('/catalog/categories/games')).body.items)).toEqual(['shown-app']);
    const home = homeViewSchema.parse((await get('/catalog/home')).body);
    expect(slugs(home.banners)).toEqual(['shown-app']);
    for (const c of home.collections) expect(slugs(c.items)).toEqual(['shown-app']);
  });
});

describe('categories', () => {
  it('lists categories by sort', async () => {
    await seedCategory(db, { slug: 'b', name: 'Б', sort: 2 });
    await seedCategory(db, { slug: 'a', name: 'А', sort: 1 });
    const res = await get('/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(CACHE);
    expect(
      categoryViewSchema
        .array()
        .parse(res.body)
        .map((c) => c.slug),
    ).toEqual(['a', 'b']);
  });

  it('pages a category by name, 24 at a time', async () => {
    const cat = await seedCategory(db, { slug: 'games', name: 'Игры' });
    const other = await seedCategory(db, { slug: 'tools', name: 'Утилиты' });
    for (let i = 30; i >= 1; i -= 1) {
      const n = String(i).padStart(2, '0');
      await seedApp(db, { slug: `game-${n}`, name: `Game ${n}`, categoryId: cat.id });
    }
    await seedApp(db, { slug: 'tool', name: 'Tool', categoryId: other.id });

    const first = await get('/catalog/categories/games');
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe(CACHE);
    const p1 = appPage.parse(first.body);
    expect(p1.items).toHaveLength(24);
    expect(p1.items[0]?.slug).toBe('game-01');
    expect(p1.items[23]?.slug).toBe('game-24');
    expect(p1.nextCursor).toEqual(expect.any(String));

    const p2 = appPage.parse(
      (await get(`/catalog/categories/games?cursor=${encodeURIComponent(p1.nextCursor ?? '')}`))
        .body,
    );
    expect(slugs(p2.items)).toEqual([
      'game-25',
      'game-26',
      'game-27',
      'game-28',
      'game-29',
      'game-30',
    ]);
    expect(p2.nextCursor).toBeNull();
  });

  it('keeps apps with the same name apart across pages', async () => {
    const cat = await seedCategory(db, { slug: 'games', name: 'Игры' });
    for (let i = 0; i < 25; i += 1)
      await seedApp(db, { slug: `same-${i}`, name: 'Same', categoryId: cat.id });
    const p1 = appPage.parse((await get('/catalog/categories/games')).body);
    const p2 = appPage.parse(
      (await get(`/catalog/categories/games?cursor=${encodeURIComponent(p1.nextCursor ?? '')}`))
        .body,
    );
    const seen = [...slugs(p1.items), ...slugs(p2.items)];
    expect(new Set(seen).size).toBe(25);
  });

  it('answers 404 for an unknown category and 400 for a broken cursor', async () => {
    await seedCategory(db, { slug: 'games', name: 'Игры' });
    expect((await get('/catalog/categories/nope')).status).toBe(404);
    const bad = await get('/catalog/categories/games?cursor=garbage');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION');
  });
});

describe('lists', () => {
  it('ranks an automatic list by installs and returns up to 100 apps', async () => {
    const quiet = await seedApp(db, { slug: 'quiet', name: 'Quiet' });
    const loud = await seedApp(db, { slug: 'loud', name: 'Loud' });
    const old = await seedApp(db, { slug: 'old', name: 'Old' });
    await seedInstalls(db, quiet.id, 2, 3);
    await seedInstalls(db, loud.id, 5, 10);
    await seedInstalls(db, old.id, 50, 40); // outside the 30-day window
    for (let i = 0; i < 110; i += 1)
      await seedApp(db, { slug: `filler-${i}`, name: `Filler ${i}` });
    await seedCollection(db, {
      slug: 'popular',
      title: 'Самое загружаемое',
      source: 'top_downloads',
      limit: 6,
    });

    const res = await get('/catalog/lists/popular');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(CACHE);
    const list = collectionViewSchema.parse(res.body);
    expect(list).toMatchObject({ slug: 'popular', title: 'Самое загружаемое', layout: 'grid3' });
    expect(list.items).toHaveLength(100);
    expect(slugs(list.items.slice(0, 2))).toEqual(['loud', 'quiet']);
  });

  it('ranks trending by growth week over week', async () => {
    const steady = await seedApp(db, { slug: 'steady', name: 'Steady' });
    const rising = await seedApp(db, { slug: 'rising', name: 'Rising' });
    await seedInstalls(db, steady.id, 8, 2);
    await seedInstalls(db, steady.id, 8, 9);
    await seedInstalls(db, rising.id, 4, 2);
    await seedCollection(db, { slug: 'trending', title: 'Тенденции', source: 'trending' });
    expect(slugs((await get('/catalog/lists/trending')).body.items)).toEqual(['rising', 'steady']);
  });

  it('reads the vote threshold for top rated from settings', async () => {
    await seedApp(db, { slug: 'few', name: 'Few', rating: 5, ratingCount: 3 });
    await seedApp(db, { slug: 'many', name: 'Many', rating: 4, ratingCount: 300 });
    await seedCollection(db, { slug: 'top', title: 'Лучшие', source: 'top_rated' });
    expect(slugs((await get('/catalog/lists/top')).body.items)).toEqual(['many']);
    await db.setting.create({ data: { key: 'catalog.topRatedMinVotes', value: 3 } });
    expect(slugs((await get('/catalog/lists/top')).body.items)).toEqual(['few', 'many']);
  });

  it('answers 404 for an unknown list', async () => {
    expect((await get('/catalog/lists/nope')).status).toBe(404);
  });
});

describe('search', () => {
  it('search finds Cyrillic names by prefix', async () => {
    await seedApp(db, { slug: 'navigator', name: 'Навигатор', subtitle: 'Карты от Яндекса' });
    await seedApp(db, { slug: 'yandex-maps', name: 'Яндекс Карты' });
    await seedApp(db, { slug: 'taxi', name: 'Такси', developer: 'ЯНДЕКС' });
    await seedApp(db, { slug: 'weather', name: 'Погода' });

    const res = await get(`/catalog/search?q=${encodeURIComponent('янд')}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(CACHE);
    const page = appPage.parse(res.body);
    expect(page.items[0]?.slug).toBe('yandex-maps');
    expect(slugs(page.items).sort()).toEqual(['navigator', 'taxi', 'yandex-maps']);
    expect(page.nextCursor).toBeNull();
  });

  it('finds a name with a typo', async () => {
    await seedApp(db, { slug: 'telegram', name: 'Telegram' });
    expect(slugs((await get('/catalog/search?q=telegarm')).body.items)).toEqual(['telegram']);
  });

  it('treats LIKE wildcards in the query as text', async () => {
    await seedApp(db, { slug: 'app', name: 'Some App' });
    expect((await get(`/catalog/search?q=${encodeURIComponent('%%')}`)).body.items).toEqual([]);
    expect((await get(`/catalog/search?q=${encodeURIComponent('__')}`)).body.items).toEqual([]);
  });

  it('pages search results', async () => {
    for (let i = 0; i < 30; i += 1)
      await seedApp(db, { slug: `photo-${i}`, name: `Photo ${String(i).padStart(2, '0')}` });
    const p1 = appPage.parse((await get('/catalog/search?q=photo')).body);
    expect(p1.items).toHaveLength(24);
    const p2 = appPage.parse(
      (await get(`/catalog/search?q=photo&cursor=${encodeURIComponent(p1.nextCursor ?? '')}`)).body,
    );
    expect(p2.items).toHaveLength(6);
    expect(p2.nextCursor).toBeNull();
    expect(new Set([...slugs(p1.items), ...slugs(p2.items)]).size).toBe(30);
  });

  it('rejects a one-letter query', async () => {
    for (const q of ['я', '  я  ', '', 'x'.repeat(65)]) {
      const res = await get(`/catalog/search?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'VALIDATION', message: 'Некорректные данные' });
    }
    expect((await get('/catalog/search')).status).toBe(400);
    expect((await get('/catalog/search?q=ok&cursor=garbage')).status).toBe(400);
  });
});
