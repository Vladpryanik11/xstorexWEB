/**
 * CMS (PKCS#7) SignedData: signs the connection profile and verifies the answer iOS posts back.
 */
import { createHash, type KeyObject, X509Certificate } from 'node:crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { cryptoEngine, type SigningHash, toSigningCryptoKey } from './x509.js';

export type X509 = X509Certificate;

/** Certificate, its intermediates (leaf excluded) and the private key that signs with it. */
export type SigningIdentity = {
  certificate: X509Certificate;
  chain: X509Certificate[];
  /** Never log or serialize. */
  privateKey: KeyObject;
};

/** Any reason a CMS signature is not accepted. The message is safe to log, never echo the body. */
export class CmsError extends Error {
  override name = 'CmsError';
}

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
/** Signer → intermediates → anchor; longer chains are refused. */
const MAX_CHAIN = 5;

const toPkijs = (cert: X509Certificate): pkijs.Certificate => pkijs.Certificate.fromBER(cert.raw);
/** `toSchema(false)` keeps the parsed bytes, so fingerprints and signatures stay exact. */
const toNode = (cert: pkijs.Certificate): X509Certificate =>
  new X509Certificate(Buffer.from(cert.toSchema(false).toBER(false)));

const HASH_NODE: Record<SigningHash, string> = { 'SHA-256': 'sha256', 'SHA-1': 'sha1' };

/**
 * DER `ContentInfo` with `SignedData`: content embedded, SHA-256, signed attributes (content type,
 * message digest, signing time), the signer certificate and its whole chain.
 */
export async function signCms(
  content: Buffer,
  identity: SigningIdentity,
  /** `hash: 'SHA-1'` only for test fixtures that model old iOS answers. */
  options: { hash?: SigningHash } = {},
): Promise<Buffer> {
  const hash = options.hash ?? 'SHA-256';
  const signer = toPkijs(identity.certificate);
  const signedData = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID_DATA,
      eContent: new asn1js.OctetString({ valueHex: content }),
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
              type: OID_CONTENT_TYPE,
              values: [new asn1js.ObjectIdentifier({ value: OID_DATA })],
            }),
            new pkijs.Attribute({
              type: OID_SIGNING_TIME,
              values: [new asn1js.UTCTime({ valueDate: new Date() })],
            }),
            new pkijs.Attribute({
              type: OID_MESSAGE_DIGEST,
              values: [
                new asn1js.OctetString({
                  valueHex: createHash(HASH_NODE[hash]).update(content).digest(),
                }),
              ],
            }),
          ],
        }),
      }),
    ],
    certificates: [signer, ...identity.chain.map(toPkijs)],
  });
  const key = await toSigningCryptoKey(identity.privateKey, hash);
  await signedData.sign(key, 0, hash, undefined, cryptoEngine);
  const info = new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signedData.toSchema(true),
  });
  return Buffer.from(info.toSchema().toBER(false));
}

function isValidAt(cert: X509Certificate, now: Date): boolean {
  return new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);
}

const issued = (child: X509Certificate, parent: X509Certificate): boolean =>
  child.checkIssued(parent) && child.verify(parent.publicKey);

/** Common names of a certificate subject (Node prints one `KEY=value` per line). */
function commonNames(cert: X509Certificate): string[] {
  return cert.subject
    .split('\n')
    .filter((line) => line.startsWith('CN='))
    .map((line) => line.slice(3));
}

/**
 * Builds a path from the signer through the certificates carried in the message to one of the
 * anchors. Every certificate on the path must be valid at `now` (unless `now` is `null`); every
 * issuer must be a CA. With
 * `requireIntermediateCn`, some intermediate strictly between the signer and the anchor must
 * carry one of those common names.
 * Path building is greedy (first matching issuer): a duplicate or cross-signed issuer can only
 * cause a false reject, never an accept.
 */
function checkChain(
  signer: X509Certificate,
  carried: X509Certificate[],
  anchors: X509Certificate[],
  /** `null` skips validity dates; signatures and CA flags are still checked. */
  now: Date | null,
  requireIntermediateCn: string[] | undefined,
): void {
  const intermediates: X509Certificate[] = [];
  const done = (): void => {
    if (!requireIntermediateCn) return;
    const found = intermediates.some((cert) =>
      commonNames(cert).some((cn) => requireIntermediateCn.includes(cn)),
    );
    if (!found) throw new CmsError('Chain lacks the required intermediate');
  };
  let current = signer;
  for (let depth = 0; depth < MAX_CHAIN; depth += 1) {
    if (now && !isValidAt(current, now))
      throw new CmsError('Certificate outside its validity period');
    if (anchors.some((anchor) => anchor.fingerprint256 === current.fingerprint256)) {
      done();
      return;
    }
    if (current !== signer) intermediates.push(current);
    const anchor = anchors.find((a) => a.ca && issued(current, a));
    if (anchor) {
      if (now && !isValidAt(anchor, now)) throw new CmsError('Anchor outside its validity period');
      done();
      return;
    }
    const next = carried.find(
      (c) => c.ca && c.fingerprint256 !== current.fingerprint256 && issued(current, c),
    );
    if (!next) throw new CmsError('Chain does not reach a trusted root');
    current = next;
  }
  throw new CmsError('Chain is too long');
}

/**
 * Verifies a DER CMS `SignedData` with embedded content: the message digest attribute, the
 * signature of the signed attributes, and the chain of the signer up to one of `anchors`.
 */
export async function verifyCms(
  der: Buffer,
  opts: {
    anchors: X509Certificate[];
    now?: Date;
    /** The path must pass through an intermediate with one of these subject common names. */
    requireIntermediateCn?: string[];
    /**
     * `false` accepts certificates outside their validity period; every signature on the path is
     * still verified. Only for answers whose freshness comes from elsewhere (a single-use nonce).
     */
    checkValidity?: boolean;
  },
): Promise<{ content: Buffer; signer: X509Certificate }> {
  const now = opts.checkValidity === false ? null : (opts.now ?? new Date());
  let signedData: pkijs.SignedData;
  try {
    const info = pkijs.ContentInfo.fromBER(new Uint8Array(der));
    if (info.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error('not SignedData');
    signedData = new pkijs.SignedData({ schema: info.content });
  } catch {
    throw new CmsError('Not a CMS SignedData message');
  }

  const eContent = signedData.encapContentInfo.eContent;
  const signerInfo = signedData.signerInfos[0];
  if (!eContent || signedData.signerInfos.length !== 1 || !signerInfo) {
    throw new CmsError('Expected one signer and embedded content');
  }
  const attributes = signerInfo.signedAttrs?.attributes ?? [];
  if (!attributes.some((a) => a.type === OID_MESSAGE_DIGEST)) {
    throw new CmsError('Signed attributes with a message digest are required');
  }
  // RFC 5652 §5.3: the signed content type must equal eContentType.
  const signedType = attributes.find((a) => a.type === OID_CONTENT_TYPE)?.values[0];
  if (
    !(signedType instanceof asn1js.ObjectIdentifier) ||
    signedType.getValue() !== signedData.encapContentInfo.eContentType
  ) {
    throw new CmsError('Signed content type does not match the content');
  }

  let signer: X509Certificate;
  try {
    const result = await signedData.verify(
      { signer: 0, checkChain: false, extendedMode: true },
      cryptoEngine,
    );
    if (!result.signatureVerified || !result.signerCertificate) throw new Error('bad signature');
    signer = toNode(result.signerCertificate);
  } catch {
    throw new CmsError('Signature does not match');
  }

  const carried: X509Certificate[] = [];
  for (const cert of signedData.certificates ?? []) {
    if (cert instanceof pkijs.Certificate) carried.push(toNode(cert));
  }
  checkChain(signer, carried, opts.anchors, now, opts.requireIntermediateCn);

  return { content: Buffer.from(eContent.getValue()), signer };
}
