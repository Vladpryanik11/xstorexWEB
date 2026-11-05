import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asn1js from 'asn1js';
import {
  AttributeTypeAndValue,
  BasicConstraints,
  Certificate,
  CryptoEngine,
  Extension,
} from 'pkijs';

const output = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../../infra/dev-certs/', import.meta.url));
const certPath = resolve(output, 'enroll.crt');
const keyPath = resolve(output, 'enroll.key');
for (const path of [certPath, keyPath]) {
  if (
    await access(path).then(
      () => true,
      () => false,
    )
  )
    throw new Error('Сертификат или ключ уже существует. Сохраните его перед созданием нового.');
}
const crypto = new CryptoEngine({ name: 'xstore-dev-certs', crypto: globalThis.crypto });
const keys = (await crypto.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
)) as CryptoKeyPair;
const certificate = new Certificate();
certificate.version = 2;
const serial = randomBytes(16);
serial[0] = 1;
certificate.serialNumber = new asn1js.Integer({ valueHex: serial });
certificate.subject.typesAndValues.push(
  new AttributeTypeAndValue({
    type: '2.5.4.3',
    value: new asn1js.Utf8String({ value: 'Xstore local enrollment' }),
  }),
);
certificate.issuer = certificate.subject;
certificate.notBefore.value = new Date(Date.now() - 60_000);
certificate.notAfter.value = new Date(Date.now() + 30 * 86_400_000);
certificate.extensions = [
  new Extension({
    extnID: '2.5.29.19',
    critical: true,
    extnValue: new BasicConstraints({ cA: false }).toSchema().toBER(false),
  }),
];
await certificate.subjectPublicKeyInfo.importKey(keys.publicKey, crypto);
await certificate.sign(keys.privateKey, 'SHA-256', crypto);
function pem(label: string, bytes: ArrayBuffer): string {
  return `-----BEGIN ${label}-----\n${Buffer.from(bytes)
    .toString('base64')
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END ${label}-----\n`;
}
await mkdir(output, { recursive: true });
await writeFile(keyPath, pem('PRIVATE KEY', await crypto.exportKey('pkcs8', keys.privateKey)), {
  flag: 'wx',
  mode: 0o600,
});
await writeFile(certPath, pem('CERTIFICATE', certificate.toSchema(true).toBER(false)), {
  flag: 'wx',
});
console.log('Созданы локальные enroll.crt и enroll.key. iOS покажет «Не проверено».');
