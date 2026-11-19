/**
 * Test-only kits: a fake Apple chain (root → «WWDR» → developer certificate), a `.p12` and a
 * `.mobileprovision` signed by the test root. Never used outside tests and E2E seeding.
 */
import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import forge from 'node-forge';
import plist from 'plist';

export const TEST_TEAM_ID = 'TEAM123456';
export const TEST_UDID = '00008110-001A2B3C4D5E6F70';

type Issued = { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey };

function rsaKeys(): { privateKey: forge.pki.rsa.PrivateKey; publicKey: forge.pki.rsa.PublicKey } {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = forge.pki.privateKeyFromPem(
    pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  ) as forge.pki.rsa.PrivateKey;
  const publicKey = forge.pki.publicKeyFromPem(
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  ) as forge.pki.rsa.PublicKey;
  return { privateKey, publicKey };
}

function issue(input: {
  cn: string;
  issuer?: Issued;
  ca: boolean;
  notAfter: Date;
  ocspUrl?: string;
}): Issued {
  const keys = rsaKeys();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${randomBytes(8).toString('hex')}`;
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600_000);
  cert.validity.notAfter = input.notAfter;
  const subject = [
    { name: 'commonName', value: input.cn },
    { name: 'organizationalUnitName', value: TEST_TEAM_ID },
  ];
  cert.setSubject(subject);
  cert.setIssuer(input.issuer ? input.issuer.cert.subject.attributes : subject);
  const extensions: object[] = [
    { name: 'basicConstraints', cA: input.ca, critical: true },
    { name: 'keyUsage', keyCertSign: input.ca, cRLSign: input.ca, digitalSignature: true },
  ];
  if (input.ocspUrl) {
    extensions.push({
      name: 'authorityInfoAccess',
      id: '1.3.6.1.5.5.7.1.1',
      value: forge.asn1
        .toDer(
          forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              forge.asn1.create(
                forge.asn1.Class.UNIVERSAL,
                forge.asn1.Type.OID,
                false,
                forge.asn1.oidToDer('1.3.6.1.5.5.7.48.1').getBytes(),
              ),
              forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 6, false, input.ocspUrl),
            ]),
          ]),
        )
        .getBytes(),
    });
  }
  cert.setExtensions(extensions);
  cert.sign(input.issuer?.key ?? keys.privateKey, forge.md.sha256.create());
  return { cert, key: keys.privateKey };
}

const toNode = (cert: forge.pki.Certificate): X509Certificate =>
  new X509Certificate(
    Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary'),
  );

const der = (cert: forge.pki.Certificate): Buffer =>
  Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');

/** The test chain: the root anchors profiles, the «WWDR» issues developer certificates. */
export type TestChain = {
  root: Issued;
  wwdr: Issued;
  anchor: X509Certificate;
  issuer: X509Certificate;
};

let shared: TestChain | null = null;

/** One chain per process: RSA keys are slow, every kit hangs off the same root. */
export function testChain(): TestChain {
  if (!shared) {
    const far = new Date(Date.now() + 10 * 365 * 24 * 3600_000);
    const root = issue({ cn: 'Xstore Test Root', ca: true, notAfter: far });
    const wwdr = issue({ cn: 'Xstore Test WWDR', issuer: root, ca: true, notAfter: far });
    shared = { root, wwdr, anchor: toNode(root.cert), issuer: toNode(wwdr.cert) };
  }
  return shared;
}

export type KitOptions = {
  udids?: string[];
  appId?: string;
  allDevices?: boolean;
  /** End of both the certificate and the profile. */
  notAfter?: Date;
  /** The profile lists a different certificate than the one in the `.p12`. */
  otherCert?: boolean;
  password?: string;
  /** Put the «WWDR» into the `.p12` chain (suppliers usually do). */
  withChain?: boolean;
  ocspUrl?: string;
  /** Sign the profile with this root instead of the test chain's. */
  profileSigner?: Issued;
};

export type TestKit = {
  p12: Buffer;
  password: string;
  profile: Buffer;
  /** The plist inside the signed profile. */
  profileXml: Buffer;
  anchor: X509Certificate;
  issuer: X509Certificate;
  certificate: X509Certificate;
  /** For OCSP fixtures: the developer certificate and the issuing key. */
  developer: Issued;
};

export function makeKit(opts: KitOptions = {}): TestKit {
  const chain = testChain();
  const notAfter = opts.notAfter ?? new Date(Date.now() + 300 * 24 * 3600_000);
  const developer = issue({
    cn: `iPhone Distribution: Test (${TEST_TEAM_ID})`,
    issuer: chain.wwdr,
    ca: false,
    notAfter,
    ocspUrl: opts.ocspUrl ?? 'http://ocsp.test.invalid/ocsp',
  });
  const listed = opts.otherCert
    ? issue({ cn: 'Another order', issuer: chain.wwdr, ca: false, notAfter })
    : developer;
  const password = opts.password ?? 'test-password';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    developer.key,
    opts.withChain === false ? [developer.cert] : [developer.cert, chain.wwdr.cert],
    password,
    { algorithm: '3des' },
  );
  const p12 = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

  const body: Record<string, unknown> = {
    AppIDName: 'Xstore Test Wildcard',
    ApplicationIdentifierPrefix: [TEST_TEAM_ID],
    CreationDate: new Date(Date.now() - 3600_000),
    DeveloperCertificates: [der(listed.cert)],
    Entitlements: {
      'application-identifier': opts.appId ?? `${TEST_TEAM_ID}.*`,
      'get-task-allow': false,
      'com.apple.developer.team-identifier': TEST_TEAM_ID,
    },
    ExpirationDate: notAfter,
    Name: 'Xstore Test Ad Hoc',
    TeamIdentifier: [TEST_TEAM_ID],
    TeamName: 'Xstore Test',
    TimeToLive: 300,
    UUID: '0B6E1F0C-3D8A-4A43-9F7B-5D2B8E6C1A77',
    Version: 1,
  };
  if (opts.allDevices) body.ProvisionsAllDevices = true;
  else body.ProvisionedDevices = opts.udids ?? [TEST_UDID];
  const xml = plist.build(body as plist.PlistObject);

  const signer = opts.profileSigner ?? chain.root;
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, 'utf8');
  p7.addCertificate(signer.cert);
  p7.addSigner({
    key: signer.key,
    certificate: signer.cert,
    digestAlgorithm: forge.pki.oids.sha256 as string,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType as string, value: forge.pki.oids.data as string },
      { type: forge.pki.oids.messageDigest as string },
      { type: forge.pki.oids.signingTime as string, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  const profile = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');

  return {
    p12,
    password,
    profile,
    profileXml: Buffer.from(xml, 'utf8'),
    anchor: chain.anchor,
    issuer: chain.issuer,
    certificate: toNode(developer.cert),
    developer,
  };
}

/** A self-signed root that is not the test anchor: a profile signed by it must be refused. */
export function strangerRoot(): Issued {
  return issue({
    cn: 'Stranger Root',
    ca: true,
    notAfter: new Date(Date.now() + 365 * 24 * 3600_000),
  });
}

export const sha1Hex = (data: Buffer): string => createHash('sha1').update(data).digest('hex');
