/**
 * X.509 and WebCrypto helpers on top of pkijs. No relative imports: `scripts/enroll-dev-cert.ts`
 * runs this file directly under Node's type stripping.
 */
import { type KeyObject, randomBytes, webcrypto, X509Certificate } from 'node:crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

/** pkijs on Node's WebCrypto; set once for every pkijs call in the process. */
export const cryptoEngine = new pkijs.CryptoEngine({
  name: 'node',
  crypto: webcrypto as unknown as Crypto,
});
pkijs.setEngine('node', cryptoEngine);

/** SHA-1 only models old device answers in tests; everything Xstore signs uses SHA-256. */
export type SigningHash = 'SHA-256' | 'SHA-1';

/**
 * WebCrypto signing key for an RSA or ECDSA P-256 private key (SHA-256 by default). Other key
 * types are refused: the profile signer is Caddy's key (P-256 by default) or an RSA key.
 */
export async function toSigningCryptoKey(
  privateKey: KeyObject,
  hash: SigningHash = 'SHA-256',
): Promise<CryptoKey> {
  const type = privateKey.asymmetricKeyType;
  if (type === 'rsa') {
    return privateKey.toCryptoKey({ name: 'RSASSA-PKCS1-v1_5', hash }, false, [
      'sign',
    ]) as CryptoKey;
  }
  if (type === 'ec' && privateKey.asymmetricKeyDetails?.namedCurve === 'prime256v1') {
    return privateKey.toCryptoKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
    ]) as CryptoKey;
  }
  throw new Error('Unsupported signing key: RSA or ECDSA P-256 expected');
}

export type IssueCertificateInput = {
  /** Common name of the subject. */
  subject: string;
  keys: { publicKey: KeyObject; privateKey: KeyObject };
  /** Issuing CA; self-signed with `keys.privateKey` when absent. */
  issuer?: { certificate: X509Certificate; privateKey: KeyObject };
  ca: boolean;
  notBefore: Date;
  notAfter: Date;
  /** subjectAltName DNS names (leaf certificates). */
  dnsNames?: string[];
  /** Signature hash; SHA-256 unless a test models an old SHA-1 chain. */
  hash?: SigningHash;
};

function commonName(name: string): pkijs.RelativeDistinguishedNames {
  return new pkijs.RelativeDistinguishedNames({
    typesAndValues: [
      new pkijs.AttributeTypeAndValue({
        type: '2.5.4.3',
        value: new asn1js.Utf8String({ value: name }),
      }),
    ],
  });
}

/** Issues a certificate for development and tests (dev profile signer, test device PKI). */
export async function issueCertificate(input: IssueCertificateInput): Promise<X509Certificate> {
  const certificate = new pkijs.Certificate();
  certificate.version = 2;
  const serial = randomBytes(16);
  // Positive and minimally encoded in DER: first byte in 0x40..0x7f.
  serial[0] = ((serial[0] ?? 0) & 0x3f) | 0x40;
  certificate.serialNumber = new asn1js.Integer({ valueHex: serial });
  certificate.subject = commonName(input.subject);
  certificate.issuer = input.issuer
    ? pkijs.Certificate.fromBER(input.issuer.certificate.raw).subject
    : commonName(input.subject);
  certificate.notBefore.value = input.notBefore;
  certificate.notAfter.value = input.notAfter;
  certificate.subjectPublicKeyInfo = pkijs.PublicKeyInfo.fromBER(
    input.keys.publicKey.export({ type: 'spki', format: 'der' }),
  );

  // keyUsage bits (big-endian in the first byte): digitalSignature 0x80, keyCertSign 0x04, cRLSign 0x02.
  const usage = new Uint8Array([input.ca ? 0x86 : 0x80]);
  const extensions: pkijs.Extension[] = [
    new pkijs.Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: new pkijs.BasicConstraints({ cA: input.ca }).toSchema().toBER(false),
    }),
    new pkijs.Extension({
      extnID: '2.5.29.15',
      critical: true,
      extnValue: new asn1js.BitString({ valueHex: usage, unusedBits: input.ca ? 1 : 7 }).toBER(
        false,
      ),
    }),
  ];
  if (input.dnsNames && input.dnsNames.length > 0) {
    extensions.push(
      new pkijs.Extension({
        extnID: '2.5.29.17',
        extnValue: new pkijs.GeneralNames({
          names: input.dnsNames.map((value) => new pkijs.GeneralName({ type: 2, value })),
        })
          .toSchema()
          .toBER(false),
      }),
    );
  }
  certificate.extensions = extensions;

  const signingKey = input.issuer?.privateKey ?? input.keys.privateKey;
  const hash = input.hash ?? 'SHA-256';
  await certificate.sign(await toSigningCryptoKey(signingKey, hash), hash, cryptoEngine);
  return new X509Certificate(Buffer.from(certificate.toSchema(true).toBER(false)));
}
