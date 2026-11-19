import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * SHA-256 fingerprint of "Apple Root CA" as published at https://www.apple.com/certificateauthority/.
 * The answers iOS posts to the profile service chain up to it.
 */
export const APPLE_ROOT_CA_SHA256 =
  'B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24';

let cached: X509Certificate | null = null;

/** The bundled Apple Root CA; refuses a file whose fingerprint differs from the published one. */
export function appleRootCa(): X509Certificate {
  if (cached) return cached;
  const pem = readFileSync(new URL('./apple-root-ca.pem', import.meta.url), 'utf8');
  const block = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
  if (!block) throw new Error('apple-root-ca.pem has no certificate');
  const cert = new X509Certificate(block);
  if (cert.fingerprint256 !== APPLE_ROOT_CA_SHA256) {
    throw new Error('apple-root-ca.pem is not the published Apple Root CA');
  }
  cached = cert;
  return cert;
}
