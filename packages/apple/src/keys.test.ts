import { createPrivateKey } from 'node:crypto';
import forge from 'node-forge';
import { expect, it } from 'vitest';
import { buildP12, generateKeyAndCsr, randomP12Password } from './keys.js';

it.each(['Xstore test', 'Тестовый аккаунт'])(
  'generates a verifiable RSA-2048 CSR for %s',
  (commonName) => {
    const { privateKeyPem, csrPem } = generateKeyAndCsr(commonName);
    expect(createPrivateKey(privateKeyPem).asymmetricKeyDetails?.modulusLength).toBe(2048);
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    expect(csr.verify()).toBe(true);
    const cn = csr.subject.getField('CN');
    expect(cn.valueTagClass).toBe(forge.asn1.Type.UTF8);
    expect(Buffer.from(String(cn.value), 'binary').toString('utf8')).toBe(commonName);
    expect(csr.signatureOid).toBe(forge.pki.oids.sha256WithRSAEncryption);
  },
);

it('builds a password-protected p12 holding the matching key and certificate', () => {
  const { privateKeyPem } = generateKeyAndCsr('fixture');
  const key = forge.pki.privateKeyFromPem(privateKeyPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2027-01-01');
  cert.setSubject([{ name: 'commonName', value: 'fixture' }]);
  cert.setIssuer(cert.subject.attributes);
  cert.sign(key, forge.md.sha256.create());
  const certificateDer = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    'binary',
  );
  const buf = buildP12({ privateKeyPem, certificateDer, password: 'test-password' });
  const asn1 = forge.asn1.fromDer(buf.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, true, 'test-password');
  const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  expect(bags[forge.pki.oids.pkcs8ShroudedKeyBag ?? '']?.[0]?.key).toBeDefined();
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  expect(certBags[forge.pki.oids.certBag ?? '']?.[0]?.cert?.serialNumber).toBe('01');
  expect(() => forge.pkcs12.pkcs12FromAsn1(asn1, true, 'wrong')).toThrow();
}, 15_000);

it('creates distinct 24-character passwords using cryptographic randomness', () => {
  const passwords = Array.from({ length: 20 }, randomP12Password);
  expect(new Set(passwords).size).toBe(20);
  for (const password of passwords) expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);
});
