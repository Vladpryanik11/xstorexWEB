import { randomBytes } from 'node:crypto';
import * as asn1js from 'asn1js';
import {
  AttributeTypeAndValue,
  BasicConstraints,
  Certificate,
  CryptoEngine,
  Extension,
} from 'pkijs';

const crypto = new CryptoEngine({ name: 'enrollment-tests', crypto: globalThis.crypto });

export async function testIdentity(
  kind: 'RSA' | 'ECDSA' = 'RSA',
  issuer?: Awaited<ReturnType<typeof createTestCa>>,
) {
  return createIdentity(kind, false, issuer);
}

export async function createTestCa() {
  return createIdentity('RSA', true);
}

async function createIdentity(
  kind: 'RSA' | 'ECDSA',
  ca: boolean,
  issuer?: { certificate: Certificate; privateKey: CryptoKey; chain: Certificate[] },
) {
  const algorithm =
    kind === 'RSA'
      ? {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const keys = (await crypto.generateKey(algorithm, true, ['sign', 'verify'])) as CryptoKeyPair;
  const certificate = new Certificate();
  certificate.version = 2;
  const serial = randomBytes(12);
  // Canonical positive ASN.1 INTEGER, without sign padding or a leading zero.
  serial[0] = 1;
  certificate.serialNumber = new asn1js.Integer({ valueHex: serial });
  certificate.subject.typesAndValues.push(
    new AttributeTypeAndValue({
      type: '2.5.4.3',
      value: new asn1js.Utf8String({ value: ca ? 'Test CA' : `Test ${kind}` }),
    }),
  );
  certificate.issuer = issuer?.certificate.subject ?? certificate.subject;
  certificate.notBefore.value = new Date('2025-01-01T00:00:00Z');
  certificate.notAfter.value = new Date('2035-01-01T00:00:00Z');
  certificate.extensions = [
    new Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: new BasicConstraints({ cA: ca }).toSchema().toBER(false),
    }),
    new Extension({
      extnID: '2.5.29.15',
      critical: true,
      extnValue: new asn1js.BitString({
        unusedBits: ca ? 1 : 7,
        valueHex: new Uint8Array([ca ? 0x06 : 0x80]),
      }).toBER(false),
    }),
  ];
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey, crypto);
  await certificate.sign(issuer?.privateKey ?? keys.privateKey, 'SHA-256', crypto);
  return {
    certificate,
    privateKey: keys.privateKey,
    chain: issuer ? [issuer.certificate, ...issuer.chain] : [],
  };
}

export function certPem(certificate: Certificate) {
  return pem('CERTIFICATE', certificate.toSchema(true).toBER(false));
}

export async function keyPem(privateKey: CryptoKey) {
  return pem('PRIVATE KEY', await crypto.exportKey('pkcs8', privateKey));
}

function pem(label: string, der: ArrayBuffer) {
  return `-----BEGIN ${label}-----\n${Buffer.from(der)
    .toString('base64')
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END ${label}-----\n`;
}
