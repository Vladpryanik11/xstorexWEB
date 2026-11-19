import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, it } from 'vitest';
import { createTestCa, signDeviceResponse } from '../../test/support/ios.js';
import { APPLE_ROOT_CA_SHA256, appleRootCa } from './apple-root.js';
import { CmsError, signCms, verifyCms } from './cms.js';

const content = Buffer.from('<?xml version="1.0"?><plist><dict/></plist>', 'utf8');

describe('signCms → verifyCms', () => {
  for (const keyType of ['rsa', 'ec'] as const) {
    it(`returns the signed content (${keyType === 'rsa' ? 'RSA 2048' : 'ECDSA P-256'})`, async () => {
      const ca = await createTestCa({ keyType });
      const der = await signCms(content, ca.device);
      const result = await verifyCms(der, { anchors: [ca.root] });
      expect(result.content.equals(content)).toBe(true);
      expect(result.signer.fingerprint256).toBe(ca.device.certificate.fingerprint256);
    });
  }

  it('writes SignedData with embedded content, SHA-256, signed attributes and the chain', async () => {
    const ca = await createTestCa();
    const der = await signCms(content, ca.device);
    const info = pkijs.ContentInfo.fromBER(new Uint8Array(der));
    expect(info.contentType).toBe(pkijs.ContentInfo.SIGNED_DATA);
    const signed = new pkijs.SignedData({ schema: info.content });
    const embedded = signed.encapContentInfo.eContent as asn1js.OctetString;
    expect(Buffer.from(embedded.getValue()).equals(content)).toBe(true);
    const signer = signed.signerInfos[0];
    expect(signer?.digestAlgorithm.algorithmId).toBe('2.16.840.1.101.3.4.2.1');
    expect(signer?.signedAttrs?.attributes.map((a) => a.type)).toEqual(
      expect.arrayContaining(['1.2.840.113549.1.9.3', '1.2.840.113549.1.9.4']),
    );
    expect(signed.certificates).toHaveLength(2);
  });

  it('rejects a changed byte of the content', async () => {
    const ca = await createTestCa();
    const der = await signCms(content, ca.device);
    const at = der.indexOf(content);
    expect(at).toBeGreaterThan(0);
    const tampered = Buffer.from(der);
    tampered[at + 10] = (tampered[at + 10] ?? 0) ^ 0x01;
    await expect(verifyCms(tampered, { anchors: [ca.root] })).rejects.toBeInstanceOf(CmsError);
  });

  it('rejects a chain to a foreign root', async () => {
    const ca = await createTestCa();
    const other = await createTestCa();
    const der = await signCms(content, ca.device);
    await expect(verifyCms(der, { anchors: [other.root] })).rejects.toBeInstanceOf(CmsError);
  });

  it('rejects an expired signer certificate', async () => {
    const ca = await createTestCa({ deviceValidDays: 30 });
    const der = await signCms(content, ca.device);
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    await expect(verifyCms(der, { anchors: [ca.root], now: later })).rejects.toBeInstanceOf(
      CmsError,
    );
    await expect(verifyCms(der, { anchors: [ca.root] })).resolves.toBeTruthy();
  });

  it('rejects bytes that are not CMS', async () => {
    const ca = await createTestCa();
    await expect(
      verifyCms(Buffer.from('not a signature'), { anchors: [ca.root] }),
    ).rejects.toBeInstanceOf(CmsError);
  });

  it('rejects a signer that is not issued by the certificates it carries', async () => {
    const ca = await createTestCa();
    const other = await createTestCa();
    // The device of `other` signs, but only the chain of `ca` is trusted.
    const der = await signCms(content, { ...other.device, chain: ca.device.chain });
    await expect(verifyCms(der, { anchors: [ca.root] })).rejects.toBeInstanceOf(CmsError);
  });

  it('verifies a test device answer', async () => {
    const ca = await createTestCa();
    const der = await signDeviceResponse(
      {
        UDID: '00008110-000A1B2C3D4E5F60',
        PRODUCT: 'iPhone16,2',
        VERSION: '22A3354',
        CHALLENGE: 'n',
      },
      ca,
    );
    const { content: plistXml } = await verifyCms(der, { anchors: [ca.root] });
    expect(plistXml.toString('utf8')).toContain('<string>iPhone16,2</string>');
  });
});

describe('Apple Root CA', () => {
  it('is the published Apple Root CA', () => {
    const root = appleRootCa();
    expect(APPLE_ROOT_CA_SHA256).toBe(
      'B0:B1:73:0E:CB:C7:FF:45:05:14:2C:49:F1:29:5E:6E:DA:6B:CA:ED:7E:2C:68:C5:BE:91:B5:A1:10:01:F0:24',
    );
    expect(root.fingerprint256).toBe(APPLE_ROOT_CA_SHA256);
    expect(root.subject).toContain('CN=Apple Root CA');
    expect(root.ca).toBe(true);
  });
});
