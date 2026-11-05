/**
 * E2E catalog: 3 categories, 12 published apps with icons in object storage, 1 hidden app and
 * home collections of every layout. Wipes the target database first, so it refuses to run
 * against anything but a database whose name ends in `_test`.
 *
 * Run: `pnpm --filter @xstore/db seed:e2e` with DATABASE_URL and S3_* set (the web e2e global
 * setup passes the *_TEST values). The package must be built (`dist/`).
 */

import { crc32, deflateSync } from 'node:zlib';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPrismaClient } from '@xstore/db';
import { applyMigrations, resetDatabase } from '@xstore/db/testing';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const databaseUrl = env('DATABASE_URL');
if (!new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('seed:e2e wipes the database: point DATABASE_URL at a *_test database');
}

const mediaBucket = `${process.env.S3_BUCKET_PREFIX ?? 'xstore-'}media`;
const s3 = new S3Client({
  endpoint: env('S3_ENDPOINT'),
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
});

// ---------------------------------------------------------------------------------------------
// Images: plain PNGs drawn here (a coloured square with a white disc), no external files.

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function png(width: number, height: number, hue: number): Buffer {
  const [r, g, b] = hsl(hue, 0.65, 0.5);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 4;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
      const at = row + 1 + x * 3;
      rows[at] = inside ? 255 : r;
      rows[at + 1] = inside ? 255 : g;
      rows[at + 2] = inside ? 255 : b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

async function ensureMediaBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: mediaBucket }));
  } catch {
    // The API also creates it (and its public-read policy) on start; whoever comes first wins.
    await s3.send(new CreateBucketCommand({ Bucket: mediaBucket })).catch((err: unknown) => {
      if ((err as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw err;
    });
  }
}

async function upload(key: string, body: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({ Bucket: mediaBucket, Key: key, Body: body, ContentType: 'image/png' }),
  );
  return key;
}

// ---------------------------------------------------------------------------------------------

const APP_COUNT = 12;
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 9, 1);

async function main(): Promise<void> {
  applyMigrations(databaseUrl);
  await resetDatabase(databaseUrl);
  await ensureMediaBucket();

  const db = createPrismaClient(databaseUrl);
  try {
    const categories = await Promise.all(
      [
        { slug: 'igry', name: 'Игры', icon: 'games', sort: 0 },
        { slug: 'utility', name: 'Утилиты', icon: 'tools', sort: 1 },
        { slug: 'foto', name: 'Фото', icon: 'photo', sort: 2 },
      ].map((data) => db.category.create({ data, select: { id: true } })),
    );

    const apps: { id: string }[] = [];
    for (let n = 1; n <= APP_COUNT; n++) {
      const slug = `testovoe-prilozhenie-${n}`;
      const hue = (n * 360) / APP_COUNT;
      const first = n === 1;
      const iconKey = await upload(`icons/${slug}.png`, png(120, 120, hue));
      const bannerKey = n <= 3 ? await upload(`banners/${slug}.png`, png(640, 480, hue)) : null;
      const screenshotKeys =
        n <= 4
          ? [
              await upload(`screenshots/${slug}-1.png`, png(390, 844, hue)),
              await upload(`screenshots/${slug}-2.png`, png(390, 844, hue + 40)),
            ]
          : [];
      const category = categories[(n - 1) % categories.length];
      const app = await db.app.create({
        data: {
          slug,
          name: `Тестовое приложение ${n}`,
          subtitle: `Подзаголовок приложения ${n}`,
          description: first
            ? 'Описание тестового приложения.\nВторая строка.\nТретья строка.\nЧетвёртая строка.'
            : `Описание тестового приложения ${n}.`,
          developer: 'Студия Xstore',
          categoryId: category?.id,
          iconKey,
          bannerKey,
          screenshotKeys,
          languages: first ? ['ru', 'en'] : ['en'],
          rating: first ? 4.5 : 3 + (n % 5) * 0.4,
          ratingCount: first ? 120 : 20 + n,
          removedFromAppStore: n <= 4,
          rightsBasis: 'Тестовые данные',
          status: 'published',
          versions: {
            create: (first ? ['1.0', '1.1'] : ['1.0']).map((version, i) => ({
              version,
              build: `${n}0${i}`,
              bundleId: `ru.xstorex.e2e.app${n}`,
              sizeBytes: BigInt(50 + n) * 1024n * 1024n,
              sha256: 'e'.repeat(64),
              ipaKey: `originals/e2e-${n}-${i}.ipa`,
              encrypted: false,
              minIos: '15.0',
              changelog: i > 0 ? 'Исправления ошибок' : null,
              status: 'published',
              publishedAt: new Date(BASE + (n + i * 30) * DAY),
            })),
          },
        },
        select: { id: true },
      });
      apps.push(app);
    }

    // Matches the search «тест» and sits in a manual collection: it must never show up.
    const hidden = await db.app.create({
      data: {
        slug: 'hidden-app',
        name: 'Скрытое тестовое приложение',
        status: 'hidden',
        hiddenReason: 'Жалоба правообладателя',
        rightsBasis: 'Тестовые данные',
        categoryId: categories[0]?.id,
        bannerKey: await upload('banners/hidden-app.png', png(640, 480, 0)),
        versions: {
          create: {
            version: '1.0',
            build: '1',
            bundleId: 'ru.xstorex.e2e.hidden',
            sizeBytes: 1024n,
            sha256: 'e'.repeat(64),
            ipaKey: 'originals/e2e-hidden.ipa',
            encrypted: false,
            status: 'published',
            publishedAt: new Date(BASE),
          },
        },
      },
      select: { id: true },
    });

    const items = (ids: { id: string }[]) => ({
      create: ids.map((a, position) => ({ appId: a.id, position, pinned: false })),
    });
    const at = (...ns: number[]) => ns.map((n) => apps[n - 1]).filter((a) => a !== undefined);

    await db.collection.create({
      data: {
        slug: 'hero',
        title: 'Главное',
        layout: 'banner',
        source: 'manual',
        sort: 0,
        items: items([hidden, ...at(1, 2, 3)]),
      },
    });
    await db.collection.create({
      data: {
        slug: 'top',
        title: 'Самый загружаемый',
        layout: 'grid3',
        source: 'top_downloads',
        sort: 1,
        limit: 12,
      },
    });
    await db.collection.create({
      data: { slug: 'trends', title: 'Тенденции', layout: 'icons', source: 'trending', sort: 2 },
    });
    await db.collection.create({
      data: {
        slug: 'rated',
        title: 'Самый рейтинговый',
        layout: 'grid3',
        source: 'top_rated',
        sort: 3,
      },
    });
    await db.collection.create({
      data: {
        slug: 'removed',
        title: 'Удалённые из App Store',
        layout: 'screenshots',
        source: 'manual',
        sort: 4,
        items: items([hidden, ...at(1, 2, 3, 4)]),
      },
    });
    await db.collection.create({
      data: {
        slug: 'fresh',
        title: 'Недавно обновлено',
        layout: 'icons',
        source: 'recently_updated',
        sort: 5,
      },
    });
  } finally {
    await db.$disconnect();
    s3.destroy();
  }
}

await main();
