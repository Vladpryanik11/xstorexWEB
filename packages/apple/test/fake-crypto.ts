import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import forge from 'node-forge';

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Ephemeral issuer for local tests, unrelated to Apple's trust chain.
export function createFakeAuthority() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = forge.pki.privateKeyFromPem(
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  );
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  );
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = new Date('2030-01-01T00:00:00Z');
  certificate.setSubject([{ name: 'commonName', value: 'Xstore LOCAL TEST CA' }]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.setExtensions([{ name: 'basicConstraints', cA: true }]);
  certificate.sign(privateKey, forge.md.sha256.create());

  return {
    issueCertificate(csrPem: string): { content: string; serial: string } {
      const csr = forge.pki.certificationRequestFromPem(csrPem);
      if (!csr.publicKey || !csr.verify()) throw new Error('Invalid test CSR');
      const leaf = forge.pki.createCertificate();
      leaf.publicKey = csr.publicKey;
      leaf.serialNumber = `01${randomBytes(8).toString('hex')}`;
      leaf.validity.notBefore = new Date('2026-01-01T00:00:00Z');
      leaf.validity.notAfter = new Date('2027-11-05T00:00:00Z');
      leaf.setSubject(
        csr.subject.attributes.map((attribute) => ({
          ...attribute,
          value:
            Number(attribute.valueTagClass) === forge.asn1.Type.UTF8
              ? forge.util.decodeUtf8(String(attribute.value))
              : attribute.value,
        })),
      );
      leaf.setIssuer(certificate.subject.attributes);
      leaf.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true },
      ]);
      leaf.sign(privateKey, forge.md.sha256.create());
      return {
        content: Buffer.from(
          forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes(),
          'binary',
        ).toString('base64'),
        serial: leaf.serialNumber,
      };
    },
    profile(input: {
      name: string;
      identifier: string;
      udids: string[];
      certificateBase64: string;
    }): string {
      const content = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>UUID</key><string>${randomUUID()}</string><key>Name</key><string>${xml(input.name)}</string><key>TeamIdentifier</key><array><string>TESTTEAM01</string></array><key>ExpirationDate</key><date>2027-11-05T00:00:00Z</date><key>ProvisionedDevices</key><array>${input.udids.map((udid) => `<string>${xml(udid)}</string>`).join('')}</array><key>DeveloperCertificates</key><array><data>${input.certificateBase64}</data></array><key>Entitlements</key><dict><key>application-identifier</key><string>TESTTEAM01.${xml(input.identifier)}</string><key>com.apple.developer.team-identifier</key><string>TESTTEAM01</string></dict></dict></plist>`;
      const cms = forge.pkcs7.createSignedData();
      cms.content = forge.util.createBuffer(content, 'utf8');
      cms.addCertificate(certificate);
      cms.addSigner({ key: privateKey, certificate, digestAlgorithm: '2.16.840.1.101.3.4.2.1' });
      cms.sign();
      return Buffer.from(forge.asn1.toDer(cms.toAsn1()).getBytes(), 'binary').toString('base64');
    },
  };
}
