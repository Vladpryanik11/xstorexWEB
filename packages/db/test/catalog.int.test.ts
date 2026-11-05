import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';

const db = createPrismaClient(process.env.DATABASE_URL_TEST ?? '');
const marker = `m1test-${randomUUID()}`;
const categoryIds: string[] = [];
const appIds: string[] = [];
const collectionIds: string[] = [];

function slug(suffix: string): string {
  return `${marker}-${suffix}`;
}

async function createCategory(suffix: string) {
  const row = await db.category.create({
    data: { slug: slug(suffix), name: 'Тестовая категория', icon: 'apps', sort: 0 },
  });
  categoryIds.push(row.id);
  return row;
}

async function createApp(categoryId: string, suffix: string, rightsBasis = '') {
  const row = await db.app.create({
    data: {
      slug: slug(suffix),
      name: 'Тестовое приложение',
      developer: 'Xstore',
      categoryId,
      rightsBasis,
    },
  });
  appIds.push(row.id);
  return row;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST must be configured for integration tests');
  }
});

afterAll(async () => {
  try {
    await db.collectionItem.deleteMany({ where: { collectionId: { in: collectionIds } } });
    await db.appVersion.deleteMany({ where: { appId: { in: appIds } } });
    await db.collection.deleteMany({ where: { id: { in: collectionIds } } });
    await db.app.deleteMany({ where: { id: { in: appIds } } });
    await db.category.deleteMany({ where: { id: { in: categoryIds } } });
  } finally {
    await db.$disconnect();
  }
});

describe('M1 catalog persistence', () => {
  it('creates a draft application with safe defaults and a related category', async () => {
    const category = await createCategory('category-defaults');
    const app = await createApp(category.id, 'app-defaults');

    expect(app.status).toBe('draft');
    expect(app.accessLevel).toBe('free');
    expect(app.screenshotKeys).toEqual([]);
    expect(app.removedFromAppStore).toBe(false);
    expect(app.rightsBasis).toBe('');
    expect((await db.category.findUniqueOrThrow({ where: { id: category.id }, include: { apps: true } })).apps)
      .toHaveLength(1);
  });

  it('enforces unique application and category slugs', async () => {
    const category = await createCategory('unique');
    await createApp(category.id, 'unique-app');
    await expect(db.category.create({ data: { slug: category.slug, name: 'Дубль' } })).rejects.toThrow();
    await expect(createApp(category.id, 'unique-app')).rejects.toThrow();
  });

  it('does not allow an app to be published without a nonblank rights basis', async () => {
    const category = await createCategory('rights');
    for (const rightsBasis of ['', '   ', '\t']) {
      await expect(
        db.app.create({
          data: {
            slug: slug(`rights-${randomUUID()}`),
            name: 'Без прав',
            developer: 'Xstore',
            categoryId: category.id,
            rightsBasis,
            status: 'published',
          },
        }),
      ).rejects.toThrow();
    }
    const app = await createApp(category.id, 'rights-valid', 'Разрешение правообладателя № 123');
    const published = await db.app.update({ where: { id: app.id }, data: { status: 'published' } });
    expect(published.status).toBe('published');
  });

  it('tracks IPA versions, prevents duplicates and disallows publishing an encrypted version', async () => {
    const category = await createCategory('version-category');
    const app = await createApp(category.id, 'versions', 'Собственная разработка');
    const data = {
      appId: app.id,
      version: '1.2.0',
      build: '14',
      bundleId: 'ru.xstore.tests',
      minIos: '16.0',
      sizeBytes: BigInt(1024),
      sha256: 'a'.repeat(64),
      ipaKey: 'catalog/test.ipa',
    };
    const version = await db.appVersion.create({ data });
    expect(version.status).toBe('draft');
    expect(version.encrypted).toBe(false);
    expect(version.sizeBytes).toBe(BigInt(1024));
    await expect(db.appVersion.create({ data })).rejects.toThrow();
    const encrypted = await db.appVersion.create({
      data: { ...data, build: '15', encrypted: true },
    });
    await expect(
      db.appVersion.update({ where: { id: encrypted.id }, data: { status: 'published' } }),
    ).rejects.toThrow();
  });

  it('preserves collection order and rejects duplicate items or positions', async () => {
    const category = await createCategory('collection-category');
    const first = await createApp(category.id, 'collection-one');
    const second = await createApp(category.id, 'collection-two');
    const collection = await db.collection.create({
      data: {
        slug: slug('collection'),
        title: 'Подборка',
        layout: 'grid3',
        source: 'manual',
        sort: 1,
      },
    });
    collectionIds.push(collection.id);
    await expect(
      db.collection.create({
        data: { slug: collection.slug, title: 'Дубль', layout: 'icons', source: 'manual' },
      }),
    ).rejects.toThrow();

    await db.collectionItem.create({
      data: { collectionId: collection.id, appId: first.id, sort: 0 },
    });
    await expect(
      db.collectionItem.create({ data: { collectionId: collection.id, appId: first.id, sort: 1 } }),
    ).rejects.toThrow();
    await expect(
      db.collectionItem.create({ data: { collectionId: collection.id, appId: second.id, sort: 0 } }),
    ).rejects.toThrow();
    await db.collectionItem.create({
      data: { collectionId: collection.id, appId: second.id, sort: 1 },
    });
    const entries = await db.collectionItem.findMany({
      where: { collectionId: collection.id },
      orderBy: { sort: 'asc' },
    });
    expect(entries.map((entry) => entry.appId)).toEqual([first.id, second.id]);
  });

  it('prevents deleting a category that still has applications', async () => {
    const category = await createCategory('delete-category');
    await createApp(category.id, 'delete-app');
    await expect(db.category.delete({ where: { id: category.id } })).rejects.toThrow();
  });
});
