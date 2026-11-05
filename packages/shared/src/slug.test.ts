import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './index.js';

describe('slugify', () => {
  it('transliterates', () => {
    expect(slugify('Яндекс Карты')).toBe('yandeks-karty');
  });

  it('covers the whole Cyrillic table', () => {
    expect(slugify('Ёжик Щука Цирк Чай Шум Хор Жук Юла Яма Объём Мыльный Эхо Йод')).toBe(
      'ezhik-shchuka-tsirk-chay-shum-khor-zhuk-yula-yama-obem-mylnyy-ekho-yod',
    );
  });

  it('keeps Latin and digits', () => {
    expect(slugify('  Telegram X 2.0 ')).toBe('telegram-x-2-0');
  });

  it('lower-cases and collapses separators', () => {
    expect(slugify('Foo -- Bar__Baz!!')).toBe('foo-bar-baz');
  });

  it('falls back for symbols only', () => {
    expect(slugify('★★★')).toBe('app');
    expect(slugify('')).toBe('app');
  });

  it('cuts to 80 characters without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(79)} b`);
    expect(slug).toBe('a'.repeat(79));
    expect(slugify('x'.repeat(200))).toHaveLength(80);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when it is free', async () => {
    expect(await uniqueSlug('telegram', async () => false)).toBe('telegram');
  });

  it('uniqueSlug appends a counter', async () => {
    const taken = new Set(['yandeks-karty', 'yandeks-karty-2']);
    expect(await uniqueSlug('yandeks-karty', async (s) => taken.has(s))).toBe('yandeks-karty-3');
  });

  it('keeps the suffixed slug within 80 characters', async () => {
    const base = 'a'.repeat(80);
    const slug = await uniqueSlug(base, async (s) => s === base);
    expect(slug).toBe(`${'a'.repeat(78)}-2`);
  });
});
