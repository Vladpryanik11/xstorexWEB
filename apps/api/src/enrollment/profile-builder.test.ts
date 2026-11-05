import { describe, expect, it } from 'vitest';
import { buildEnrollmentProfile } from './profile-builder.js';

const input = {
  nonce: 'n1',
  siteUrl: 'https://xstorex.ru',
  payloadUuid: '87FA8B36-EFA3-4700-B50A-343126587ED8',
};

describe('enrollment profile', () => {
  it('builds a Profile Service with the callback and requested attributes', () => {
    const xml = buildEnrollmentProfile(input);
    expect(xml).toContain('<key>PayloadType</key><string>Profile Service</string>');
    expect(xml).toContain(
      '<key>URL</key><string>https://xstorex.ru/api/v1/enrollment/callback?s=n1</string>',
    );
    expect(xml).toContain('<key>Challenge</key><string>n1</string>');
    expect(xml).toContain(
      '<key>DeviceAttributes</key><array><string>UDID</string><string>PRODUCT</string><string>VERSION</string><string>SERIAL</string></array>',
    );
    expect(xml).toContain('<key>PayloadIdentifier</key><string>ru.xstorex.enroll</string>');
    expect(xml).toContain(
      '<key>PayloadUUID</key><string>87FA8B36-EFA3-4700-B50A-343126587ED8</string>',
    );
    expect(xml).toContain('<key>PayloadVersion</key><integer>1</integer>');
    expect(xml).toContain('<key>PayloadDisplayName</key><string>Xstore — вход</string>');
    expect(xml).toContain('<key>PayloadOrganization</key><string>Xstore</string>');
  });

  it('escapes XML values and URL-encodes the nonce without adding query parameters', () => {
    const xml = buildEnrollmentProfile({ ...input, nonce: 'a&b<"\'>' });
    expect(xml).toContain('<key>Challenge</key><string>a&amp;b&lt;&quot;&apos;&gt;</string>');
    expect(xml).toContain('callback?s=a%26b%3C%22%27%3E');
  });

  it('accepts a trailing slash and localhost development URL', () => {
    expect(buildEnrollmentProfile({ ...input, siteUrl: 'http://localhost:3001/' })).toContain(
      'http://localhost:3001/api/v1/enrollment/callback?s=n1',
    );
  });

  it.each([
    'javascript:alert(1)',
    'https://user:pass@xstorex.ru',
    'http://xstorex.ru',
    'https://xstorex.ru/a?b=1',
  ])('rejects a non-origin or unsafe site URL: %s', (siteUrl) => {
    expect(() => buildEnrollmentProfile({ ...input, siteUrl })).toThrow();
  });

  it('rejects control characters that cannot be represented in XML', () => {
    expect(() => buildEnrollmentProfile({ ...input, nonce: 'a\u0000b' })).toThrow();
  });
});
