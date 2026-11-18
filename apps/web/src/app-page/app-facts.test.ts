import type { AppDetail } from '@xstore/shared';
import { describe, expect, it } from 'vitest';
import {
  appJsonLd,
  compatibility,
  devicesLabel,
  inlineJson,
  languageFact,
  languageNames,
  updatedLabel,
} from './app-facts';

describe('languageFact', () => {
  it('shows «Русский» when Russian is among the languages', () => {
    expect(languageFact(['en', 'ru'])).toBe('Русский +1');
    expect(languageFact(['RU'])).toBe('Русский');
  });
  it('otherwise shows the first code upper-cased', () => {
    expect(languageFact(['en'])).toBe('EN');
    expect(languageFact(['en', 'de', 'fr'])).toBe('EN +2');
  });
  it('is a dash when the admin has not filled the languages in', () => {
    expect(languageFact([])).toBe('—');
  });
});

describe('languageNames', () => {
  it('names languages in Russian with a capital letter', () => {
    expect(languageNames(['ru', 'en'])).toBe('Русский, Английский');
  });
  it('keeps an unknown code as is', () => {
    expect(languageNames(['zz-unknown'])).toBe('ZZ-UNKNOWN');
  });
});

describe('inlineJson', () => {
  it('cannot close the script tag', () => {
    expect(inlineJson({ name: '</script><script>alert(1)</script>' })).not.toContain('</');
  });
});

describe('compatibility', () => {
  it('reads «iOS N и новее»', () => {
    expect(compatibility('15.0')).toBe('iOS 15.0 и новее');
    expect(compatibility(undefined)).toBeUndefined();
  });
});

describe('appJsonLd', () => {
  const app = {
    slug: 'tg',
    name: 'Телеграм',
    iconUrl: 'http://s3/icon.png',
    category: { slug: 'social', name: 'Общение' },
    version: '1.2',
    sizeBytes: 1_288_490_189,
    languages: [],
    screenshots: [],
    versions: [],
    removedFromAppStore: false,
    accessLevel: 'free',
    devices: ['iphone'] as AppDetail['devices'],
    similar: [],
  };

  it('describes the app as a SoftwareApplication', () => {
    expect(appJsonLd(app)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Телеграм',
      operatingSystem: 'iOS',
      applicationCategory: 'Общение',
      softwareVersion: '1.2',
      fileSize: '1,2 ГБ',
      image: 'http://s3/icon.png',
    });
  });

  it('adds aggregateRating only when there are votes', () => {
    expect(appJsonLd({ ...app, rating: 4.5, ratingCount: 0 })).not.toHaveProperty(
      'aggregateRating',
    );
    expect(appJsonLd({ ...app, rating: 4.5, ratingCount: 120 }).aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      ratingCount: 120,
    });
  });
});

describe('devicesLabel', () => {
  it('names the devices the app runs on', () => {
    expect(devicesLabel(['iphone'])).toBe('iPhone');
    expect(devicesLabel(['iphone', 'ipad'])).toBe('iPhone, iPad');
    expect(devicesLabel(['ipad'])).toBe('iPad');
  });
});

describe('updatedLabel', () => {
  it('formats the latest version date in Moscow time', () => {
    expect(updatedLabel([{ version: '2', build: '2', publishedAt: '2026-11-02T22:30:00Z' }])).toBe(
      '3 ноября 2026 г.',
    );
  });

  it('is undefined without versions', () => {
    expect(updatedLabel([])).toBeUndefined();
  });
});
