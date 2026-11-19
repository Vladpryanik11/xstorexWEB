import { createHash, X509Certificate } from 'node:crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, it } from 'vitest';
import { createTestCa, signDeviceResponse } from '../../test/support/ios.js';
import {
  APPLE_DEVICE_CA_CN,
  APPLE_ROOT_CA_SHA256,
  appleRootCa,
  verifyDeviceCms,
} from './apple-root.js';
import { CmsError, type SigningIdentity, signCms, verifyCms } from './cms.js';
import { cryptoEngine, toSigningCryptoKey } from './x509.js';

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
    expect(signed.certificates).toHaveLength(3);
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

const answer = {
  UDID: '00008110-000A1B2C3D4E5F60',
  PRODUCT: 'iPhone16,2',
  VERSION: '22A3354',
  CHALLENGE: 'n',
};

describe('required intermediate', () => {
  it('accepts a chain through an intermediate with the required name', async () => {
    const ca = await createTestCa();
    const der = await signCms(content, ca.device);
    await expect(
      verifyCms(der, { anchors: [ca.root], requireIntermediateCn: [APPLE_DEVICE_CA_CN] }),
    ).resolves.toBeTruthy();
  });

  it('rejects a chain to the anchor without that intermediate', async () => {
    const ca = await createTestCa({ deviceCaCn: 'Apple Worldwide Developer Relations' });
    const der = await signCms(content, ca.device);
    await expect(verifyCms(der, { anchors: [ca.root] })).resolves.toBeTruthy();
    await expect(
      verifyCms(der, { anchors: [ca.root], requireIntermediateCn: [APPLE_DEVICE_CA_CN] }),
    ).rejects.toBeInstanceOf(CmsError);
  });

  it('rejects a signer that is itself the anchor when an intermediate is required', async () => {
    const ca = await createTestCa();
    const der = await signCms(content, ca.device);
    await expect(
      verifyCms(der, {
        anchors: [ca.device.certificate],
        requireIntermediateCn: [APPLE_DEVICE_CA_CN],
      }),
    ).rejects.toBeInstanceOf(CmsError);
  });
});

describe('device answers', () => {
  it('verifies against a test anchor with the Apple device rule', async () => {
    const ca = await createTestCa();
    const der = await signDeviceResponse(answer, ca);
    const { content: out } = await verifyDeviceCms(der, { testAnchors: [ca.root] });
    expect(out.toString('utf8')).toContain('<string>iPhone16,2</string>');
  });

  it('refuses a chain without Apple iPhone Device CA even under a trusted anchor', async () => {
    const ca = await createTestCa({ deviceCaCn: 'Apple Development' });
    const der = await signDeviceResponse(answer, ca);
    await expect(verifyDeviceCms(der, { testAnchors: [ca.root] })).rejects.toBeInstanceOf(CmsError);
  });

  it('refuses a test device without the test anchor', async () => {
    const ca = await createTestCa();
    const der = await signDeviceResponse(answer, ca);
    await expect(verifyDeviceCms(der)).rejects.toBeInstanceOf(CmsError);
  });

  it('accepts a SHA-1 answer with SHA-1 certificates', async () => {
    const ca = await createTestCa({ hash: 'SHA-1' });
    const der = await signDeviceResponse(answer, ca, { hash: 'SHA-1' });
    const signed = new pkijs.SignedData({
      schema: pkijs.ContentInfo.fromBER(new Uint8Array(der)).content,
    });
    expect(signed.signerInfos[0]?.digestAlgorithm.algorithmId).toBe('1.3.14.3.2.26');
    await expect(verifyDeviceCms(der, { testAnchors: [ca.root] })).resolves.toBeTruthy();
  });
});

describe('device answers with old Apple certificates', () => {
  // Ended twelve hours ago: the Apple iPhone intermediates of 2007 may be past their end date.
  const expired = { intermediateValidDays: -0.5, deviceValidDays: -0.5 };

  it('accepts an expired intermediate and an expired device certificate', async () => {
    const ca = await createTestCa(expired);
    const der = await signDeviceResponse(answer, ca);
    await expect(verifyDeviceCms(der, { testAnchors: [ca.root] })).resolves.toBeTruthy();
  });

  it('still refuses a broken signature in the chain', async () => {
    const ca = await createTestCa(expired);
    const [deviceCa, authority] = ca.device.chain;
    if (!deviceCa || !authority) throw new Error('test CA has two intermediates');
    const raw = Buffer.from(deviceCa.raw);
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0x01;
    const broken = new X509Certificate(raw);
    const der = await signDeviceResponse(answer, {
      ...ca,
      device: { ...ca.device, chain: [broken, authority] },
    });
    await expect(verifyDeviceCms(der, { testAnchors: [ca.root] })).rejects.toBeInstanceOf(CmsError);
  });

  it('still refuses a changed answer', async () => {
    const ca = await createTestCa(expired);
    const der = await signDeviceResponse(answer, ca);
    const at = der.indexOf(Buffer.from('iPhone16,2'));
    expect(at).toBeGreaterThan(0);
    const tampered = Buffer.from(der);
    tampered[at] = (tampered[at] ?? 0) ^ 0x01;
    await expect(verifyDeviceCms(tampered, { testAnchors: [ca.root] })).rejects.toBeInstanceOf(
      CmsError,
    );
  });

  it('keeps the date check for any other CMS', async () => {
    const ca = await createTestCa(expired);
    const der = await signDeviceResponse(answer, ca);
    await expect(
      verifyCms(der, {
        anchors: [ca.root],
        requireIntermediateCn: [APPLE_DEVICE_CA_CN],
      }),
    ).rejects.toBeInstanceOf(CmsError);
  });
});

describe('chain checks', () => {
  it('rejects an expired intermediate', async () => {
    const ca = await createTestCa({ intermediateValidDays: 30 });
    const der = await signCms(content, ca.device);
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    await expect(verifyCms(der, { anchors: [ca.root] })).resolves.toBeTruthy();
    await expect(verifyCms(der, { anchors: [ca.root], now: later })).rejects.toBeInstanceOf(
      CmsError,
    );
  });

  it('rejects a signed content type that differs from the embedded one', async () => {
    const ca = await createTestCa();
    const der = await signWithContentType(content, ca.device, '1.2.840.113549.1.7.2');
    await expect(verifyCms(der, { anchors: [ca.root] })).rejects.toBeInstanceOf(CmsError);
  });
});

/** SignedData whose signed contentType attribute names `contentType`, while eContent is id-data. */
async function signWithContentType(
  data: Buffer,
  identity: SigningIdentity,
  contentType: string,
): Promise<Buffer> {
  const signer = pkijs.Certificate.fromBER(identity.certificate.raw);
  const signedData = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: '1.2.840.113549.1.7.1',
      eContent: new asn1js.OctetString({ valueHex: data }),
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: signer.issuer,
          serialNumber: signer.serialNumber,
        }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new pkijs.Attribute({
              type: '1.2.840.113549.1.9.3',
              values: [new asn1js.ObjectIdentifier({ value: contentType })],
            }),
            new pkijs.Attribute({
              type: '1.2.840.113549.1.9.4',
              values: [
                new asn1js.OctetString({ valueHex: createHash('sha256').update(data).digest() }),
              ],
            }),
          ],
        }),
      }),
    ],
    certificates: [signer, ...identity.chain.map((c) => pkijs.Certificate.fromBER(c.raw))],
  });
  const key = await toSigningCryptoKey(identity.privateKey);
  await signedData.sign(key, 0, 'SHA-256', undefined, cryptoEngine);
  const info = new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signedData.toSchema(true),
  });
  return Buffer.from(info.toSchema().toBER(false));
}

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
