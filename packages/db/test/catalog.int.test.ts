import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, Prisma } from '../src/index.js';
import { resetDatabase } from '../src/testing.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const url = process.env.DATABASE_URL_TEST!;
const db = createPrismaClient(url);

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(url);
});

const version = (appId: string, over: Partial<Prisma.AppVersionUncheckedCreateInput> = {}) => ({
  appId,
  version: '1.0',
  build: '100',
  bundleId: 'ru.example.app',
  sizeBytes: 11n * 1024n ** 3n,
  sha256: 'a'.repeat(64),
  ipaKey: 'originals/u1.ipa',
  encrypted: false,
  ...over,
});

function uniqueTarget(err: unknown): unknown {
  expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  const known = err as Prisma.PrismaClientKnownRequestError;
  expect(known.code).toBe('P2002');
  return known.meta;
}

describe('catalog schema', () => {
  it('creates an app with defaults and the owner-approved fields', async () => {
    const category = await db.category.create({
      data: { slug: 'social', name: 'Общение', icon: 'chat', sort: 1 },
    });
    const app = await db.app.create({
      data: {
        slug: 'yandeks-karty',
        name: 'Яндекс Карты',
        categoryId: category.id,
        rating: 4.7,
        ratingCount: 1500,
        languages: ['RU', 'EN'],
        itunesId: '313877526',
        bannerKey: 'banners/yandex.png',
      },
      include: { category: true },
    });
    expect(app).toMatchObject({
      status: 'draft',
      accessLevel: 'free',
      removedFromAppStore: false,
      screenshotKeys: [],
      hiddenReason: null,
      rating: 4.7,
      ratingCount: 1500,
      languages: ['RU', 'EN'],
    });
    expect(app.category?.slug).toBe('social');
    expect(app.updatedAt).toBeInstanceOf(Date);
  });

  it('refuses a second app with the same slug', async () => {
    await db.app.create({ data: { slug: 'telegram', name: 'Telegram' } });
    const err = await db.app
      .create({ data: { slug: 'telegram', name: 'Telegram 2' } })
      .catch((e: unknown) => e);
    uniqueTarget(err);
  });

  it('refuses a second version with the same bundle id, version and build', async () => {
    const a = await db.app.create({ data: { slug: 'a', name: 'A' } });
    const b = await db.app.create({ data: { slug: 'b', name: 'B' } });
    const first = await db.appVersion.create({ data: version(a.id) });
    expect(first).toMatchObject({
      status: 'draft',
      publishedAt: null,
      sizeBytes: 11n * 1024n ** 3n,
    });
    const err = await db.appVersion.create({ data: version(b.id) }).catch((e: unknown) => e);
    uniqueTarget(err);
    // A new build of the same version is fine, and so is the `rejected` status.
    await db.appVersion.create({ data: version(a.id, { build: '101', status: 'rejected' }) });
    expect(await db.appVersion.count()).toBe(2);
  });

  it('deletes versions and collection items together with the app', async () => {
    const app = await db.app.create({ data: { slug: 'gone', name: 'Gone' } });
    await db.appVersion.create({ data: version(app.id) });
    const col = await db.collection.create({
      data: { slug: 'picks', title: 'Выбор редакции', layout: 'icons', source: 'manual', sort: 1 },
    });
    expect(col).toMatchObject({ limit: 12, onHome: true });
    await db.collectionItem.create({ data: { collectionId: col.id, appId: app.id, position: 0 } });
    const device = await db.device.create({
      data: {
        udid: 'a'.repeat(40),
        product: 'iPhone15,2',
        iosVersion: '22B83',
        name: 'Тест',
        user: { create: {} },
      },
    });
    await db.installEvent.create({ data: { appId: app.id, deviceId: device.id } });
    await db.app.delete({ where: { id: app.id } });
    expect(await db.appVersion.count()).toBe(0);
    expect(await db.collectionItem.count()).toBe(0);
    expect(await db.installEvent.count()).toBe(0);
  });

  it('keeps one collection item per app in a collection', async () => {
    const app = await db.app.create({ data: { slug: 'x', name: 'X' } });
    const col = await db.collection.create({
      data: {
        slug: 'top',
        title: 'Самый загружаемый',
        layout: 'grid3',
        source: 'top_downloads',
        sort: 0,
      },
    });
    const item = await db.collectionItem.create({
      data: { collectionId: col.id, appId: app.id, position: 3, pinned: true },
    });
    expect(item.pinned).toBe(true);
    const err = await db.collectionItem
      .create({ data: { collectionId: col.id, appId: app.id, position: 4 } })
      .catch((e: unknown) => e);
    uniqueTarget(err);
  });

  it('leaves an app without a category when the category is deleted', async () => {
    const category = await db.category.create({
      data: { slug: 'games', name: 'Игры', icon: 'gamepad', sort: 2 },
    });
    const app = await db.app.create({ data: { slug: 'g', name: 'G', categoryId: category.id } });
    await db.category.delete({ where: { id: category.id } });
    expect((await db.app.findUniqueOrThrow({ where: { id: app.id } })).categoryId).toBeNull();
  });

  it('has pg_trgm and a trigram index on lower(name)', async () => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const ext = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
      expect(ext.rowCount).toBe(1);
      const idx = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'App' AND indexdef ILIKE '%gin_trgm_ops%'`,
      );
      expect(idx.rows.map((r) => r.indexdef).join('\n')).toMatch(
        /USING gin \(lower\(name\) gin_trgm_ops\)/,
      );
      const plan = await client.query(
        `SELECT similarity(lower('Яндекс Карты'), lower('яндекс')) > 0.3 AS ok`,
      );
      expect(plan.rows[0].ok).toBe(true);
    } finally {
      await client.end();
    }
  });
});
