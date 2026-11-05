import { expect, it } from 'vitest';
import { publishBlockers, versionPublishBlockers } from './publish-rules.js';

const complete = {
  rightsBasis: 'Лицензия разработчика от 01.11.2026',
  iconKey: 'apps/a/icon-512.png',
  categoryId: 'cat',
  publishedVersions: 1,
};

it('lists every missing field', () => {
  expect(
    publishBlockers({ rightsBasis: null, iconKey: null, categoryId: null, publishedVersions: 0 }),
  ).toEqual(['NO_RIGHTS_BASIS', 'NO_ICON', 'NO_PUBLISHED_VERSION', 'NO_CATEGORY']);
});

it('a whitespace-only rights basis counts as missing', () => {
  expect(publishBlockers({ ...complete, rightsBasis: '  \n ' })).toEqual(['NO_RIGHTS_BASIS']);
});

it('a complete app has no blockers', () => {
  expect(publishBlockers(complete)).toEqual([]);
});

it('an encrypted version cannot be published', () => {
  expect(versionPublishBlockers({ encrypted: true })).toEqual(['ENCRYPTED']);
  expect(versionPublishBlockers({ encrypted: false })).toEqual([]);
});
