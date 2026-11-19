import { generateKeyPairSync, type KeyObject, X509Certificate } from 'node:crypto';
import plist from 'plist';
import { type SigningIdentity, signCms } from '../../src/enrollment/cms.js';
import { issueCertificate } from '../../src/enrollment/x509.js';

/**
 * A stand-in for Apple's device PKI: root → "device CA" → one device identity. Tests pass `root`
 * as a verification anchor and sign recorded-like iOS answers with `device`.
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
  options: { keyType?: 'rsa' | 'ec'; deviceValidDays?: number } = {},
): Promise<TestCa> {
  const now = Date.now();
  const rootKeys = keyPair('ec');
  const root = await issueCertificate({
    subject: 'Xstore Test Root CA',
    keys: rootKeys,
    ca: true,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + 3650 * DAY),
  });
  const caKeys = keyPair('ec');
  const deviceCa = await issueCertificate({
    subject: 'Xstore Test Device CA',
    keys: caKeys,
    issuer: { certificate: root, privateKey: rootKeys.privateKey },
    ca: true,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + 1825 * DAY),
  });
  const deviceKeys = keyPair(options.keyType ?? 'rsa');
  const device = await issueCertificate({
    subject: 'Xstore Test Device',
    keys: deviceKeys,
    issuer: { certificate: deviceCa, privateKey: caKeys.privateKey },
    ca: false,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + (options.deviceValidDays ?? 365) * DAY),
  });
  return {
    root,
    rootPem: root.toString(),
    device: { certificate: device, chain: [deviceCa], privateKey: deviceKeys.privateKey },
  };
}

/** The signed plist iOS posts to the profile service URL after the person installs the profile. */
export async function signDeviceResponse(
  fields: { UDID: string; PRODUCT: string; VERSION: string; CHALLENGE: string },
  ca: TestCa,
): Promise<Buffer> {
  return signCms(Buffer.from(plist.build({ ...fields }), 'utf8'), ca.device);
}
