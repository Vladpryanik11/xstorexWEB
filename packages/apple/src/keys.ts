import { generateKeyPairSync, randomBytes } from 'node:crypto';
import forge from 'node-forge';

export function generateKeyAndCsr(commonName: string): { privateKeyPem: string; csrPem: string } {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  // Forge expects a universal tag number here; its declarations incorrectly use the Class enum.
  csr.setSubject([
    {
      name: 'commonName',
      value: commonName,
      valueTagClass: forge.asn1.Type.UTF8 as number as forge.asn1.Class,
    },
  ]);
  csr.sign(forge.pki.privateKeyFromPem(privateKeyPem), forge.md.sha256.create());
  return { privateKeyPem, csrPem: forge.pki.certificationRequestToPem(csr) };
}

export function buildP12(input: {
  privateKeyPem: string;
  certificateDer: Buffer;
  password: string;
}): Buffer {
  try {
    const key = forge.pki.privateKeyFromPem(input.privateKeyPem);
    const cert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(input.certificateDer.toString('binary')),
    );
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    if (!key.n.equals(publicKey.n) || !key.e.equals(publicKey.e)) throw new Error();
    const p12 = forge.pkcs12.toPkcs12Asn1(key, cert, input.password, {
      algorithm: 'aes256',
      count: 100_000,
    });
    return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
  } catch {
    throw new Error('Не удалось собрать сертификат PKCS#12');
  }
}

export function randomP12Password(): string {
  return randomBytes(18).toString('base64url');
}
