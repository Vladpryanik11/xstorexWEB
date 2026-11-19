import { createPrivateKey, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type SigningIdentity, verifyCms } from '../../../api/src/enrollment/cms';
import { type DeviceAnswerFields, signDeviceAnswer } from '../../../api/test/support/device-answer';

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

/**
 * The challenge and answer URL from the downloaded connection file, after checking its signature
 * against the e2e signer (cert.pem from `enroll:dev-cert`).
 */
export async function readProfile(file: Buffer): Promise<{ challenge: string; url: string }> {
  const signer = new X509Certificate(readFileSync(`${dir}cert.pem`));
  const xml = (await verifyCms(file, { anchors: [signer] })).content.toString('utf8');
  const challenge = xml.match(/<key>Challenge<\/key>\s*<string>([A-Za-z0-9_-]{43})<\/string>/)?.[1];
  const url = xml.match(/<key>URL<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (!challenge || !url) throw new Error('not a connection file');
  return { challenge, url: url.replaceAll('&amp;', '&') };
}

/** The signed answer iOS posts after «Установить», signed by the test device. */
export function deviceAnswer(fields: DeviceAnswerFields): Promise<Buffer> {
  return signDeviceAnswer(fields, testDevice());
}
