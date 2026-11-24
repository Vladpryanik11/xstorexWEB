import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appPublishBlockers, createPrismaClient, syncAppPublication } from '../src/index.js';
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

let n = 0;
async function app(over: {
  section?: 'removed' | 'premium' | null;
  icon?: boolean;
  cat?: boolean;
}) {
  n += 1;
  const category =
    over.cat === false
      ? null
      : await db.category.create({
          data: { slug: `c${n}`, name: `C${n}`, icon: 'apps', sort: n },
        });
  return db.app.create({
    data: {
      slug: `a${n}`,
      name: `A${n}`,
      section: over.section === undefined ? 'removed' : over.section,
      iconKey: over.icon === false ? null : `media/apps/a${n}/icon.png`,
      categoryId: category?.id ?? null,
    },
  });
}

const version = (appId: string, build: string, encrypted = false) =>
  db.appVersion.create({
    data: {
      appId,
      version: `1.${build}`,
      build,
      bundleId: `ru.example.${appId}`,
      sizeBytes: 10n,
      sha256: 'a'.repeat(64),
      ipaKey: `originals/${appId}-${build}.ipa`,
      encrypted,
    },
  });

describe('appPublishBlockers', () => {
  it('lists every missing piece', () => {
    expect(
      appPublishBlockers({ section: null, categoryId: null, iconKey: null, usableVersions: 0 }),
    ).toEqual(['NO_SECTION', 'NO_CATEGORY', 'NO_ICON', 'NO_VERSION']);
    expect(
      appPublishBlockers({ section: 'premium', categoryId: 'c', iconKey: 'k', usableVersions: 1 }),
    ).toEqual([]);
  });
});

describe('syncAppPublication', () => {
  it('publishes the app and its newest unencrypted version once nothing is missing', async () => {
    const a = await app({});
    const v1 = await version(a.id, '1');
    const v2 = await version(a.id, '2');
    await version(a.id, '3', true);
    const result = await db.$transaction((tx) => syncAppPublication(tx, a.id));
    expect(result).toEqual({ status: 'published', blockers: [] });
    const versions = await db.appVersion.findMany({
      where: { appId: a.id },
      orderBy: { build: 'asc' },
    });
    expect(versions.map((v) => v.status)).toEqual(['draft', 'published', 'draft']);
    expect(versions[1]?.id).toBe(v2.id);
    expect(versions[1]?.publishedAt).not.toBeNull();
    expect(v1.id).toBeTruthy();
    const row = await db.app.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe('published');
    expect(row.removedFromAppStore).toBe(true);
  });

  it('keeps a draft without a section and returns blockers', async () => {
    const a = await app({ section: null });
    await version(a.id, '1');
    const result = await db.$transaction((tx) => syncAppPublication(tx, a.id));
    expect(result).toEqual({ status: 'draft', blockers: ['NO_SECTION'] });
    // The version is ready for the moment a section is chosen; a draft app is not public anyway.
    expect((await db.appVersion.findFirstOrThrow({ where: { appId: a.id } })).status).toBe(
      'published',
    );
  });

  it('takes a published app back to draft when its section is cleared', async () => {
    const a = await app({});
    await version(a.id, '1');
    await db.$transaction((tx) => syncAppPublication(tx, a.id));
    await db.app.update({ where: { id: a.id }, data: { section: null } });
    const result = await db.$transaction((tx) => syncAppPublication(tx, a.id));
    expect(result.status).toBe('draft');
  });

  it('replaces the published version with a newer upload', async () => {
    const a = await app({ section: 'premium' });
    const v1 = await version(a.id, '1');
    await db.$transaction((tx) => syncAppPublication(tx, a.id));
    const v2 = await version(a.id, '2');
    await db.$transaction((tx) => syncAppPublication(tx, a.id));
    const rows = await db.appVersion.findMany({ where: { appId: a.id } });
    expect(rows.find((r) => r.id === v1.id)?.status).toBe('draft');
    expect(rows.find((r) => r.id === v2.id)?.status).toBe('published');
    expect((await db.app.findUniqueOrThrow({ where: { id: a.id } })).removedFromAppStore).toBe(
      false,
    );
  });

  it('leaves a hidden app hidden', async () => {
    const a = await app({});
    await version(a.id, '1');
    await db.app.update({ where: { id: a.id }, data: { status: 'hidden', hiddenReason: 'x' } });
    const result = await db.$transaction((tx) => syncAppPublication(tx, a.id));
    expect(result.status).toBe('hidden');
    expect((await db.app.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('hidden');
  });
});
