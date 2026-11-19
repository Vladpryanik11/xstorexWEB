import { generateKeyPairSync, type KeyObject, type X509Certificate } from 'node:crypto';
import type { SigningIdentity } from '../../src/enrollment/cms.ts';
import { issueCertificate, type SigningHash } from '../../src/enrollment/x509.ts';

// Imports end in `.ts` and the cms import is type-only: `scripts/enroll-test-ca.ts` runs this file
// directly under Node's type stripping.

/**
 * A stand-in for Apple's device PKI with the same names below the root:
 * test root → "Apple iPhone Certification Authority" → "Apple iPhone Device CA" → device.
 * Tests pass `root` as an anchor (`ENROLL_TEST_ANCHOR_PATH` in the API) and sign iOS-like answers
 * with `device`, so they pass the same "Apple iPhone Device CA" rule as real answers.
 */
export type TestCa = {
  root: X509Certificate;
  rootPem: string;
  device: SigningIdentity;
};

const DAY = 24 * 60 * 60 * 1000;

function keyPair(type: 'rsa' | 'ec'): { publicKey: KeyObject; privateKey: KeyObject } {
  return type === 'rsa'
    ? generateKeyPairSync('rsa', { modulusLength: 2048 })
    : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

export async function createTestCa(
  options: {
    keyType?: 'rsa' | 'ec';
    deviceValidDays?: number;
    /** Validity of both intermediates. */
    intermediateValidDays?: number;
    /** Name of the CA that issues the device; anything else fails the Apple device rule. */
    deviceCaCn?: string;
    /** SHA-1 models old Apple chains (all certificates signed with RSA SHA-1). */
    hash?: SigningHash;
  } = {},
): Promise<TestCa> {
  const now = Date.now();
  const hash = options.hash ?? 'SHA-256';
  // WebCrypto ECDSA keys here are bound to SHA-256, so a SHA-1 chain uses RSA throughout.
  const caKeyType = hash === 'SHA-1' ? 'rsa' : 'ec';
  const intermediateEnd = new Date(now + (options.intermediateValidDays ?? 1825) * DAY);
  const rootKeys = keyPair(caKeyType);
  const root = await issueCertificate({
    subject: 'Xstore Test Root CA',
    keys: rootKeys,
    ca: true,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + 3650 * DAY),
    hash,
  });
  const authorityKeys = keyPair(caKeyType);
  const authority = await issueCertificate({
    subject: 'Apple iPhone Certification Authority',
    keys: authorityKeys,
    issuer: { certificate: root, privateKey: rootKeys.privateKey },
    ca: true,
    notBefore: new Date(now - DAY),
    notAfter: intermediateEnd,
    hash,
  });
  const deviceCaKeys = keyPair(caKeyType);
  const deviceCa = await issueCertificate({
    subject: options.deviceCaCn ?? 'Apple iPhone Device CA',
    keys: deviceCaKeys,
    issuer: { certificate: authority, privateKey: authorityKeys.privateKey },
    ca: true,
    notBefore: new Date(now - DAY),
    notAfter: intermediateEnd,
    hash,
  });
  const deviceKeys = keyPair(hash === 'SHA-1' ? 'rsa' : (options.keyType ?? 'rsa'));
  const device = await issueCertificate({
    subject: 'Xstore Test Device',
    keys: deviceKeys,
    issuer: { certificate: deviceCa, privateKey: deviceCaKeys.privateKey },
    ca: false,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + (options.deviceValidDays ?? 365) * DAY),
    hash,
  });
  return {
    root,
    rootPem: root.toString(),
    device: {
      certificate: device,
      chain: [deviceCa, authority],
      privateKey: deviceKeys.privateKey,
    },
  };
}
