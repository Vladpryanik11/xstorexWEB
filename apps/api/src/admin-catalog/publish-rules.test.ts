import { expect, it } from 'vitest';
import { publishBlockers, versionPublishBlockers } from './publish-rules.js';

const complete = {
  section: 'removed' as const,
  iconKey: 'apps/a/icon-512.png',
  categoryId: 'cat',
  usableVersions: 1,
};

it('lists every missing piece', () => {
  expect(
    publishBlockers({ section: null, iconKey: null, categoryId: null, usableVersions: 0 }),
  ).toEqual(['NO_SECTION', 'NO_CATEGORY', 'NO_ICON', 'NO_VERSION']);
});

it('a complete app has no blockers, without any rights text', () => {
  expect(publishBlockers(complete)).toEqual([]);
});

it('an encrypted version cannot be published', () => {
  expect(versionPublishBlockers({ encrypted: true })).toEqual(['ENCRYPTED']);
  expect(versionPublishBlockers({ encrypted: false })).toEqual([]);
});
