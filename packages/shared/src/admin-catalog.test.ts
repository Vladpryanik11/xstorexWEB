import { describe, expect, it } from 'vitest';
import {
  collectionItemsSchema,
  createCategorySchema,
  hideAppSchema,
  idOrderSchema,
  MAX_MEDIA_BYTES,
  presignMediaSchema,
  updateAppSchema,
} from './admin-catalog.js';

describe('updateAppSchema', () => {
  it('accepts a partial card typed in by hand', () => {
    expect(
      updateAppSchema.parse({
        rating: 4.5,
        ratingCount: 120,
        languages: ['RU', 'EN'],
        itunesId: '284882215',
      }),
    ).toEqual({ rating: 4.5, ratingCount: 120, languages: ['RU', 'EN'], itunesId: '284882215' });
  });

  it('rejects an empty patch and unknown fields', () => {
    expect(updateAppSchema.safeParse({}).success).toBe(false);
    expect(updateAppSchema.safeParse({ status: 'published' }).success).toBe(false);
  });

  it('rejects a bad slug, rating or access level', () => {
    expect(updateAppSchema.safeParse({ slug: 'Яндекс' }).success).toBe(false);
    expect(updateAppSchema.safeParse({ slug: 'a--b' }).success).toBe(false);
    expect(updateAppSchema.safeParse({ rating: 5.5 }).success).toBe(false);
    expect(updateAppSchema.safeParse({ accessLevel: 'vip' }).success).toBe(false);
  });

  it('clears optional text with null', () => {
    expect(updateAppSchema.parse({ subtitle: null, rightsBasis: null })).toEqual({
      subtitle: null,
      rightsBasis: null,
    });
  });
});

it('hide needs a reason', () => {
  expect(hideAppSchema.safeParse({ reason: '   ' }).success).toBe(false);
  expect(hideAppSchema.parse({ reason: ' Жалоба правообладателя ' })).toEqual({
    reason: 'Жалоба правообладателя',
  });
});

it('media is png or jpeg up to 5 MB', () => {
  expect(MAX_MEDIA_BYTES).toBe(5 * 1024 ** 2);
  expect(presignMediaSchema.safeParse({ contentType: 'image/png', sizeBytes: 1000 }).success).toBe(
    true,
  );
  expect(presignMediaSchema.safeParse({ contentType: 'image/gif', sizeBytes: 1000 }).success).toBe(
    false,
  );
  expect(
    presignMediaSchema.safeParse({ contentType: 'image/jpeg', sizeBytes: MAX_MEDIA_BYTES + 1 })
      .success,
  ).toBe(false);
});

it('orders and items reject duplicates', () => {
  expect(idOrderSchema.safeParse({ ids: ['a', 'a'] }).success).toBe(false);
  expect(
    collectionItemsSchema.safeParse({
      items: [
        { appId: 'a', pinned: false },
        { appId: 'a', pinned: true },
      ],
    }).success,
  ).toBe(false);
});

it('category icon is a short latin name', () => {
  expect(createCategorySchema.safeParse({ name: 'Игры', icon: 'games' }).success).toBe(true);
  expect(createCategorySchema.safeParse({ name: 'Игры', icon: '<svg>' }).success).toBe(false);
});
