import * as asn1js from 'asn1js';
import {
  Attribute,
  type Certificate,
  ContentInfo,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
} from 'pkijs';
import { enrollmentCrypto } from './crypto-engine.js';
import type { SigningIdentity } from './signing-identity.js';

const CONTENT_TYPE = '1.2.840.113549.1.9.3';
const MESSAGE_DIGEST = '1.2.840.113549.1.9.4';

export class CmsError extends Error {
  constructor() {
    // Do not expose PEM, device payloads, file paths or library error details.
    super('Не удалось подписать или проверить профиль входа');
    this.name = 'CmsError';
  }
}

export async function signCms(content: Buffer, identity: SigningIdentity): Promise<Buffer> {
  try {
    const digest = await enrollmentCrypto.digest('SHA-256', Uint8Array.from(content));
    const data = new SignedData({
      encapContentInfo: new EncapsulatedContentInfo({
        eContentType: ContentInfo.DATA,
        eContent: new asn1js.OctetString({ valueHex: Uint8Array.from(content) }),
      }),
      certificates: [identity.certificate, ...identity.chain],
      signerInfos: [
        new SignerInfo({
          sid: new IssuerAndSerialNumber({
            issuer: identity.certificate.issuer,
            serialNumber: identity.certificate.serialNumber,
          }),
          signedAttrs: new SignedAndUnsignedAttributes({
            type: 0,
            attributes: [
              new Attribute({
                type: CONTENT_TYPE,
                values: [new asn1js.ObjectIdentifier({ value: ContentInfo.DATA })],
              }),
              new Attribute({
                type: MESSAGE_DIGEST,
                values: [new asn1js.OctetString({ valueHex: digest })],
              }),
            ],
          }),
        }),
      ],
    });
    await data.sign(identity.privateKey, 0, 'SHA-256', undefined, enrollmentCrypto);
    return Buffer.from(
      new ContentInfo({ contentType: ContentInfo.SIGNED_DATA, content: data.toSchema(true) })
        .toSchema()
        .toBER(false),
    );
  } catch {
    throw new CmsError();
  }
}

export async function verifyCms(
  der: Buffer,
  opts: { anchors: Certificate[]; now?: Date },
): Promise<{ content: Buffer; signer: Certificate }> {
  try {
    if (!opts.anchors.length) throw new CmsError();
    const decoded = asn1js.fromBER(Uint8Array.from(der));
    if (decoded.offset !== der.length || decoded.offset === -1) throw new CmsError();
    const envelope = new ContentInfo({ schema: decoded.result });
    if (envelope.contentType !== ContentInfo.SIGNED_DATA) throw new CmsError();
    const data = new SignedData({ schema: envelope.content });
    const attached = data.encapContentInfo.eContent;
    if (
      data.encapContentInfo.eContentType !== ContentInfo.DATA ||
      !(attached instanceof asn1js.OctetString) ||
      data.signerInfos.length !== 1
    )
      throw new CmsError();
    const attrs = data.signerInfos[0]?.signedAttrs?.attributes;
    const types = attrs?.filter((a) => a.type === CONTENT_TYPE);
    const digests = attrs?.filter((a) => a.type === MESSAGE_DIGEST);
    if (
      types?.length !== 1 ||
      digests?.length !== 1 ||
      types[0]?.values.length !== 1 ||
      digests[0]?.values.length !== 1 ||
      !(types[0]?.values[0] instanceof asn1js.ObjectIdentifier) ||
      types[0].values[0].valueBlock.toString() !== ContentInfo.DATA ||
      !(digests[0]?.values[0] instanceof asn1js.OctetString)
    )
      throw new CmsError();
    const now = opts.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new CmsError();
    const result = await data.verify(
      {
        signer: 0,
        checkChain: true,
        trustedCerts: opts.anchors,
        checkDate: now,
        extendedMode: true,
      },
      enrollmentCrypto,
    );
    if (
      !result.signatureVerified ||
      !result.signerCertificateVerified ||
      !result.signerCertificate
    ) {
      throw new CmsError();
    }
    return { content: Buffer.from(attached.getValue()), signer: result.signerCertificate };
  } catch {
    throw new CmsError();
  }
}
