import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appleRootCa } from '../enrollment/apple-root.js';

/**
 * Roots a supplier `.mobileprovision` must chain to: Apple Root CA, plus the PEM roots of
 * `SIGNING_TEST_ANCHOR_PATH` outside production (config refuses it in production).
 */
export function signingAnchors(testAnchorPath: string | null): X509Certificate[] {
  const anchors = [appleRootCa()];
  if (!testAnchorPath || process.env.NODE_ENV === 'production') return anchors;
  const pem = readFileSync(testAnchorPath, 'utf8');
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) throw new Error('SIGNING_TEST_ANCHOR_PATH has no certificate');
  return [...anchors, ...blocks.map((b) => new X509Certificate(b))];
}
