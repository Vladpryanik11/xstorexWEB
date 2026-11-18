/**
 * Demo catalog for local development and screenshots: 23 real apps with icons, screenshots,
 * texts written for Xstore, categories, home collections and installs for the automatic lists.
 * Icons and screenshots are App Store materials (owner decision 2026-11-18); texts are our own.
 * There are no IPA files: the app pages work, installing does not.
 *
 * Replaces only the catalog (apps, versions, categories, collections, installs); staff and
 * settings stay. Refuses to run against anything but a database on localhost.
 *
 * Run: `pnpm db:seed:demo` (or `pnpm --filter @xstore/db seed:demo`) with DATABASE_URL and S3_*
 * set, after `pnpm infra:up`, `pnpm db:migrate` and a build of this package.
 */

import { readFile } from 'node:fs/promises';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPrismaClient } from '@xstore/db';
import { z } from 'zod';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const databaseUrl = env('DATABASE_URL');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('seed:demo replaces the catalog: point DATABASE_URL at a local database');
}

const demoDir = new URL('../demo/', import.meta.url);
const mediaBucket = `${process.env.S3_BUCKET_PREFIX ?? 'xstore-'}media`;
const s3 = new S3Client({
  endpoint: env('S3_ENDPOINT'),
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
});

const catalogSchema = z.object({
  categories: z.array(z.object({ slug: z.string(), name: z.string(), icon: z.string() })),
  apps: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      subtitle: z.string(),
      category: z.string(),
      developer: z.string(),
      rating: z.number(),
      ratingCount: z.number().int(),
      languages: z.array(z.string()),
      sizeMb: z.number(),
      minIos: z.string(),
      deviceFamily: z.array(z.number().int()),
      removedFromAppStore: z.boolean(),
      description: z.string(),
      versions: z.array(
        z.object({
          version: z.string(),
          publishedAt: z.iso.datetime(),
          changelog: z.string().optional(),
        }),
      ),
    }),
  ),
  collections: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      layout: z.enum(['grid3', 'icons', 'screenshots', 'banner']),
      source: z.enum(['manual', 'top_downloads', 'trending', 'top_rated', 'recently_updated']),
      limit: z.number().int().optional(),
      onHome: z.boolean().optional(),
      apps: z.array(z.string()).optional(),
    }),
  ),
});

const SCREENSHOTS = 5;
const DAY = 86_400_000;

async function ensureMediaBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: mediaBucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: mediaBucket })).catch((err: unknown) => {
      if ((err as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw err;
    });
  }
}

/** Uploads `demo/media/<slug>/<file>`; `null` when the file is not there. */
async function upload(slug: string, file: string): Promise<string | null> {
  let body: Buffer;
  try {
    body = await readFile(new URL(`media/${slug}/${file}`, demoDir));
  } catch {
    return null;
  }
  const key = `demo/${slug}/${file}`;
  await s3.send(
    new PutObjectCommand({ Bucket: mediaBucket, Key: key, Body: body, ContentType: 'image/webp' }),
  );
  return key;
}

/** Deterministic pseudo-random installs, so «Популярное» and «Набирают популярность» fill up. */
function installs(index: number, total: number, now: number): Date[] {
  const count = 5 + ((index * 37) % 40) + (total - index);
  const fresh = index % 3 === 0;
  return Array.from({ length: count }, (_, n) => {
    const daysAgo = fresh ? n % 7 : (n * 13) % 28;
    return new Date(now - daysAgo * DAY - ((n * 7919) % DAY));
  });
}

async function main(): Promise<void> {
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(new URL('catalog.json', demoDir), 'utf8')),
  );
  await ensureMediaBucket();
  const db = createPrismaClient(databaseUrl);
  try {
    await db.$transaction([
      db.collectionItem.deleteMany(),
      db.collection.deleteMany(),
      db.installEvent.deleteMany(),
      db.appVersion.deleteMany(),
      db.app.deleteMany(),
      db.category.deleteMany(),
    ]);

    const categoryIds = new Map<string, string>();
    for (const [sort, category] of catalog.categories.entries()) {
      const row = await db.category.create({ data: { ...category, sort }, select: { id: true } });
      categoryIds.set(category.slug, row.id);
    }

    const appIds = new Map<string, string>();
    const now = Date.now();
    for (const [index, app] of catalog.apps.entries()) {
      const iconKey = await upload(app.slug, 'icon.webp');
      const bannerKey = await upload(app.slug, 'banner.webp');
      const screenshotKeys: string[] = [];
      for (let n = 1; n <= SCREENSHOTS; n++) {
        const key = await upload(app.slug, `${n}.webp`);
        if (key) screenshotKeys.push(key);
      }
      const row = await db.app.create({
        data: {
          slug: app.slug,
          name: app.name,
          subtitle: app.subtitle,
          description: app.description,
          developer: app.developer,
          categoryId: categoryIds.get(app.category),
          iconKey,
          bannerKey,
          screenshotKeys,
          languages: app.languages,
          rating: app.rating,
          ratingCount: app.ratingCount,
          removedFromAppStore: app.removedFromAppStore,
          rightsBasis: 'Демо-данные для разработки',
          status: 'published',
          versions: {
            create: app.versions.map((v, i) => ({
              version: v.version,
              build: `${i + 1}`,
              bundleId: `ru.xstorex.demo.${app.slug.replace(/[^a-z0-9]/g, '')}`,
              minIos: app.minIos,
              deviceFamily: app.deviceFamily,
              sizeBytes: BigInt(Math.round(app.sizeMb * 1024 * 1024)),
              sha256: '0'.repeat(64),
              ipaKey: `demo/${app.slug}-${v.version}.ipa`,
              encrypted: false,
              changelog: v.changelog ?? null,
              status: 'published',
              publishedAt: new Date(v.publishedAt),
            })),
          },
          installEvents: {
            create: installs(index, catalog.apps.length, now).map((createdAt) => ({ createdAt })),
          },
        },
        select: { id: true },
      });
      appIds.set(app.slug, row.id);
    }

    for (const [sort, collection] of catalog.collections.entries()) {
      const items = (collection.apps ?? []).map((slug, position) => {
        const appId = appIds.get(slug);
        if (!appId) throw new Error(`collection ${collection.slug}: unknown app ${slug}`);
        return { appId, position, pinned: false };
      });
      await db.collection.create({
        data: {
          slug: collection.slug,
          title: collection.title,
          layout: collection.layout,
          source: collection.source,
          sort,
          ...(collection.limit && { limit: collection.limit }),
          ...(collection.onHome !== undefined && { onHome: collection.onHome }),
          items: { create: items },
        },
      });
    }
    console.log(
      `Демо-каталог готов: приложений ${catalog.apps.length}, категорий ${catalog.categories.length}`,
    );
  } finally {
    await db.$disconnect();
    s3.destroy();
  }
}

await main();
