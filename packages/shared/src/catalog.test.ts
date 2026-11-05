import { describe, expect, it } from 'vitest';
import {
  catalogAccessLevelSchema,
  catalogAppInputSchema,
  catalogPaginationSchema,
  catalogSearchSchema,
  catalogSlugSchema,
  catalogVersionInputSchema,
} from './catalog.js';

describe('M1 catalog input contracts', () => {
  it('accepts canonical slugs and rejects unsafe or unstable paths', () => {
    expect(catalogSlugSchema.safeParse('t-bank').success).toBe(true);
    for (const slug of ['', 'Uppercase', '../admin', 'with space', '-leading', 'a/'.repeat(80)]) {
      expect(catalogSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it('coerces bounded pagination and supplies defaults', () => {
    expect(catalogPaginationSchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(catalogPaginationSchema.parse({ page: '2', limit: '50' })).toEqual({
      page: 2,
      limit: 50,
    });
    for (const params of [{ page: 0 }, { limit: 0 }, { limit: 1000 }, { page: 'nope' }]) {
      expect(catalogPaginationSchema.safeParse(params).success).toBe(false);
    }
  });

  it('trims search queries and rejects empty or oversized inputs', () => {
    expect(catalogSearchSchema.parse({ q: '  фото  ' })).toMatchObject({ q: 'фото' });
    expect(catalogSearchSchema.safeParse({ q: '  ' }).success).toBe(false);
    expect(catalogSearchSchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });

  it('supports only free or named add-on access levels', () => {
    expect(catalogAccessLevelSchema.safeParse('free').success).toBe(true);
    expect(catalogAccessLevelSchema.safeParse('addon:pro').success).toBe(true);
    for (const level of ['premium', 'addon:', 'addon:some/path', 'free:any']) {
      expect(catalogAccessLevelSchema.safeParse(level).success).toBe(false);
    }
  });

  it('permits draft metadata without rights but forbids publishing it', () => {
    const draft = {
      slug: 'my-app',
      name: '  Моё приложение  ',
      developer: 'Xstore',
      categoryId: 'category-123',
      rightsBasis: '',
      accessLevel: 'free',
      status: 'draft',
    };
    expect(catalogAppInputSchema.parse(draft).name).toBe('Моё приложение');
    expect(
      catalogAppInputSchema.safeParse({ ...draft, status: 'published' }).success,
    ).toBe(false);
    expect(
      catalogAppInputSchema.safeParse({
        ...draft,
        status: 'published',
        rightsBasis: '  Правообладатель: собственная разработка  ',
      }).success,
    ).toBe(true);
  });

  it('rejects malformed IPA version metadata and impossible sizes', () => {
    const version = {
      version: '1.0.0',
      build: '1',
      bundleId: 'ru.xstore.example',
      sizeBytes: BigInt(1024),
      sha256: 'a'.repeat(64),
      ipaKey: 'catalog/example.ipa',
      encrypted: false,
      status: 'draft',
    };
    expect(catalogVersionInputSchema.safeParse(version).success).toBe(true);
    expect(
      catalogVersionInputSchema.safeParse({ ...version, sizeBytes: BigInt(-1) }).success,
    ).toBe(false);
    expect(catalogVersionInputSchema.safeParse({ ...version, sha256: 'zzz' }).success).toBe(
      false,
    );
    expect(
      catalogVersionInputSchema.safeParse({ ...version, encrypted: true, status: 'published' })
        .success,
    ).toBe(false);
  });
});
