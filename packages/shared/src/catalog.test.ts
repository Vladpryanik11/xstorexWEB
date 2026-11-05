import { describe, expect, it } from 'vitest';
import {
  accessLevelSchema,
  appCardSchema,
  appDetailSchema,
  homeViewSchema,
  pageSchema,
} from './index.js';

describe('accessLevelSchema', () => {
  it('accepts free and addon levels only', () => {
    expect(accessLevelSchema.safeParse('free').success).toBe(true);
    expect(accessLevelSchema.safeParse('addon:games-pack').success).toBe(true);
    expect(accessLevelSchema.safeParse('addon:').success).toBe(false);
    expect(accessLevelSchema.safeParse('addon:Games').success).toBe(false);
    expect(accessLevelSchema.safeParse(`addon:${'a'.repeat(41)}`).success).toBe(false);
    expect(accessLevelSchema.safeParse('premium').success).toBe(false);
  });
});

const card = { slug: 'telegram', name: 'Telegram', iconUrl: 'https://dl.example/i.png' };

describe('view schemas', () => {
  it('parses a minimal app card', () => {
    expect(appCardSchema.parse(card)).toEqual(card);
  });

  it('parses an app detail', () => {
    const detail = {
      ...card,
      rating: 4.5,
      ratingCount: 1200,
      category: { slug: 'social', name: 'Общение' },
      description: 'Мессенджер',
      developer: 'Telegram FZ-LLC',
      languages: ['RU', 'EN'],
      sizeBytes: 123_456_789,
      version: '11.2',
      minIos: '15.0',
      screenshots: ['https://dl.example/s1.png'],
      versions: [{ version: '11.2', build: '100', publishedAt: '2026-11-01T00:00:00.000Z' }],
      removedFromAppStore: false,
      accessLevel: 'free',
    };
    expect(appDetailSchema.parse(detail)).toEqual(detail);
    expect(appDetailSchema.safeParse({ ...detail, accessLevel: 'premium' }).success).toBe(false);
  });

  it('parses a home view and a page', () => {
    const home = {
      banners: [{ slug: 'telegram', name: 'Telegram', imageUrl: 'https://dl.example/b.png' }],
      collections: [{ slug: 'top', title: 'Самый загружаемый', layout: 'grid3', items: [card] }],
      categories: [{ slug: 'social', name: 'Общение', icon: 'chat' }],
    };
    expect(homeViewSchema.parse(home)).toEqual(home);
    expect(
      homeViewSchema.safeParse({ ...home, collections: [{ ...home.collections[0], layout: 'x' }] })
        .success,
    ).toBe(false);
    const page = pageSchema(appCardSchema).parse({ items: [card], nextCursor: null });
    expect(page.nextCursor).toBeNull();
  });
});
