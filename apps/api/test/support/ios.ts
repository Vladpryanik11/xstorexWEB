import { generateKeyPairSync, type X509Certificate } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { issueCertificate, type SigningHash } from '../../src/enrollment/x509.js';
import { type DeviceAnswerFields, signDeviceAnswer } from './device-answer.js';
import type { TestCa } from './test-ca.js';

export { createTestCa, type TestCa } from './test-ca.js';

const DAY = 24 * 60 * 60 * 1000;

/** The signed plist iOS posts to the profile service URL after the person installs the profile. */
export function signDeviceResponse(
  fields: DeviceAnswerFields,
  ca: TestCa,
  options: { hash?: SigningHash } = {},
): Promise<Buffer> {
  return signDeviceAnswer(fields, ca.device, options);
}

/**
 * A profile signer generated at runtime (self-signed EC P-256 "localhost"), written as PEM files
 * for `ENROLL_CERT_PATH` / `ENROLL_KEY_PATH`; tests verify downloaded profiles against `certificate`.
 */
export async function writeProfileSigner(
  dir: string,
): Promise<{ certPath: string; keyPath: string; certificate: X509Certificate }> {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const certificate = await issueCertificate({
    subject: 'localhost',
    keys,
    ca: false,
    notBefore: new Date(Date.now() - DAY),
    notAfter: new Date(Date.now() + 30 * DAY),
  });
  const certPath = join(dir, 'enroll-cert.pem');
  const keyPath = join(dir, 'enroll-key.pem');
  await writeFile(certPath, certificate.toString());
  await writeFile(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, {
    mode: 0o600,
  });
  return { certPath, keyPath, certificate };
}

/** Writes the test root as the PEM file `ENROLL_TEST_ANCHOR_PATH` points to. */
export async function writeTestAnchor(dir: string, ca: TestCa): Promise<string> {
  const path = join(dir, 'test-anchor.pem');
  await writeFile(path, ca.rootPem);
  return path;
}
