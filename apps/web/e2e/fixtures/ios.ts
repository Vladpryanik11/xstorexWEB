import { createPrivateKey, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type SigningIdentity, signCms } from '../../../api/src/enrollment/cms';

// iOS stand-in for e2e: the files `pnpm --filter @xstore/api enroll:dev-cert` and `enroll:test-ca`
// write to .secrets/enroll/. The e2e API trusts test-anchor.pem (ENROLL_TEST_ANCHOR_PATH, never
// in production; see playwright.config.ts) and the tests sign answers with the test device.

const dir = fileURLToPath(new URL('../../../../.secrets/enroll/', import.meta.url));

function testDevice(): SigningIdentity {
  const certPath = `${dir}test-device.pem`;
  const keyPath = `${dir}test-device-key.pem`;
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(
      'No test device: run `pnpm --filter @xstore/api enroll:dev-cert` and `enroll:test-ca`',
    );
  }
  const pems = readFileSync(certPath, 'utf8').match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  const [certificate, ...chain] = (pems ?? []).map((pem) => new X509Certificate(pem));
  if (!certificate) throw new Error(`${certPath} has no certificate`);
  return { certificate, chain, privateKey: createPrivateKey(readFileSync(keyPath)) };
}

/** A new UDID of the modern form for each test, so retries never meet a device bound earlier. */
export const randomUdid = (): string => `00008110-${randomBytes(8).toString('hex').toUpperCase()}`;

/** The challenge and answer URL from the downloaded connection file (signed, not encrypted). */
export function readProfile(file: Buffer): { challenge: string; url: string } {
  const xml = file.toString('utf8');
  const challenge = xml.match(/<key>Challenge<\/key>\s*<string>([A-Za-z0-9_-]{43})<\/string>/)?.[1];
  const url = xml.match(/<key>URL<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (!challenge || !url) throw new Error('not a connection file');
  return { challenge, url: url.replaceAll('&amp;', '&') };
}

const xmlText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** The signed plist iOS posts after «Установить»: UDID, PRODUCT, VERSION and the challenge. */
export async function deviceAnswer(fields: {
  UDID: string;
  PRODUCT: string;
  VERSION: string;
  CHALLENGE: string;
}): Promise<Buffer> {
  const entries = Object.entries(fields)
    .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${xmlText(value)}</string>\n`)
    .join('');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries}</dict>
</plist>
`;
  return signCms(Buffer.from(plist, 'utf8'), testDevice());
}
