export interface EnrollmentProfileInput {
  nonce: string;
  siteUrl: string;
  payloadUuid: string;
}

function xml(value: string): string {
  // XML 1.0 permits tabs, LF and CR, but not the remaining control characters.
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      !(
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        code >= 0x10000
      )
    ) {
      throw new Error('Недопустимые символы в профиле входа');
    }
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildEnrollmentProfile(input: EnrollmentProfileInput): string {
  const site = new URL(input.siteUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
  if (
    (site.protocol !== 'https:' && !(site.protocol === 'http:' && local)) ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  ) {
    throw new Error('Нужен HTTPS-адрес сайта без пути и параметров');
  }
  const callback = new URL('/api/v1/enrollment/callback', site);
  callback.searchParams.set('s', input.nonce);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>' +
    '<key>PayloadType</key><string>Profile Service</string>' +
    '<key>PayloadVersion</key><integer>1</integer>' +
    '<key>PayloadIdentifier</key><string>ru.xstorex.enroll</string>' +
    `<key>PayloadUUID</key><string>${xml(input.payloadUuid)}</string>` +
    '<key>PayloadDisplayName</key><string>Xstore — вход</string>' +
    '<key>PayloadOrganization</key><string>Xstore</string>' +
    '<key>PayloadContent</key><dict>' +
    `<key>URL</key><string>${xml(callback.href)}</string>` +
    '<key>DeviceAttributes</key><array><string>UDID</string><string>PRODUCT</string><string>VERSION</string><string>SERIAL</string></array>' +
    `<key>Challenge</key><string>${xml(input.nonce)}</string>` +
    '</dict></dict></plist>\n'
  );
}
