import plist from 'plist';
import { expect, it } from 'vitest';
import { buildEnrollmentProfile } from './profile.js';

const nonce = 'q1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c';

it('builds the profile service payload', () => {
  const xml = buildEnrollmentProfile({
    nonce,
    siteUrl: 'https://xstorex.ru',
    payloadUuid: '5B0A3C1E-4E0B-4A7A-9C55-2D7C2E1C8F01',
  });
  expect(xml.startsWith('<?xml')).toBe(true);
  expect(plist.parse(xml)).toEqual({
    PayloadType: 'Profile Service',
    PayloadIdentifier: 'ru.xstorex.enroll',
    PayloadDisplayName: 'Xstore — подключение iPhone',
    PayloadOrganization: 'Xstore',
    PayloadUUID: '5B0A3C1E-4E0B-4A7A-9C55-2D7C2E1C8F01',
    PayloadVersion: 1,
    PayloadContent: {
      URL: `https://xstorex.ru/api/v1/enrollment/callback?s=${nonce}`,
      DeviceAttributes: ['UDID', 'PRODUCT', 'VERSION'],
      Challenge: nonce,
    },
  });
});

it('drops a trailing slash of the site URL', () => {
  const xml = buildEnrollmentProfile({
    nonce,
    siteUrl: 'http://localhost:3000/',
    payloadUuid: '5B0A3C1E-4E0B-4A7A-9C55-2D7C2E1C8F01',
  });
  const parsed = plist.parse(xml) as { PayloadContent: { URL: string } };
  expect(parsed.PayloadContent.URL).toBe(
    `http://localhost:3000/api/v1/enrollment/callback?s=${nonce}`,
  );
});
