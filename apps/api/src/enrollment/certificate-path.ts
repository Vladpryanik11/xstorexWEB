import * as asn1js from 'asn1js';
import { BasicConstraints, Certificate, CertificateChainValidationEngine } from 'pkijs';
import { enrollmentCrypto } from './crypto-engine.js';

const MAX_CERTIFICATES = 32;
const MAX_DEPTH = 16;
const MAX_PATH_STEPS = 128;
// Only critical extensions whose semantics are handled here or by the path
// validator. Merely decoding an unknown extension's ASN.1 is not support for it.
const SUPPORTED_CRITICAL = new Set([
  '2.5.29.14',
  '2.5.29.15',
  '2.5.29.17',
  '2.5.29.19',
  '2.5.29.30',
  '2.5.29.32',
  '2.5.29.33',
  '2.5.29.35',
  '2.5.29.36',
  '2.5.29.54',
]);

/**
 * Apple hardware identities are signed directly by a pinned Device CA. Apple's
 * OTA protocol explicitly ignores validity dates for these identities; this
 * exception never applies to the general-purpose certificate path verifier.
 */
export async function verifyDeviceIssuer(
  signer: Certificate,
  issuers: Certificate[],
): Promise<boolean> {
  if (issuers.length === 0 || issuers.length > MAX_CERTIFICATES) return false;
  const leafConstraints = signer.extensions?.find((e) => e.extnID === '2.5.29.19')?.parsedValue;
  if (leafConstraints instanceof BasicConstraints && leafConstraints.cA) return false;
  for (const issuer of issuers) {
    const ca = issuer.extensions?.find((e) => e.extnID === '2.5.29.19')?.parsedValue;
    if (!(ca instanceof BasicConstraints) || !ca.cA || !signer.issuer.isEqual(issuer.subject))
      continue;
    if (!constraintsAllow([signer, issuer])) continue;
    if (await signer.verify(issuer, enrollmentCrypto)) return true;
  }
  return false;
}

function fingerprint(certificate: Certificate): string {
  return Buffer.from(certificate.toSchema().toBER(false)).toString('hex');
}

function constraintsAllow(path: Certificate[]): boolean {
  const leaf = path[0];
  if (!leaf) return false;
  const usage = leaf.extensions?.find((e) => e.extnID === '2.5.29.15');
  if (
    usage &&
    (!(usage.parsedValue instanceof asn1js.BitString) ||
      ((usage.parsedValue.valueBlock.valueHexView[0] ?? 0) & 0xc0) === 0)
  )
    return false;
  // PKIjs checks these for CAs, but does not check the end-entity certificate.
  for (const certificate of path.slice(0, -1)) {
    if (
      certificate.extensions?.some(
        (e) =>
          e.critical &&
          (!SUPPORTED_CRITICAL.has(e.extnID) || !e.parsedValue || 'parsingError' in e.parsedValue),
      )
    )
      return false;
  }
  for (let index = 1; index < path.length - 1; index++) {
    const constraints = path[index]?.extensions?.find((e) => e.extnID === '2.5.29.19')?.parsedValue;
    if (!(constraints instanceof BasicConstraints) || !constraints.cA) return false;
    if (constraints.pathLenConstraint !== undefined) {
      const limit =
        constraints.pathLenConstraint instanceof asn1js.Integer
          ? constraints.pathLenConstraint.toBigInt()
          : BigInt(constraints.pathLenConstraint);
      const subordinateCas = path
        .slice(1, index)
        .filter((c) => !c.subject.isEqual(c.issuer)).length;
      if (limit < BigInt(subordinateCas)) return false;
    }
  }
  return true;
}

export async function verifyCertificatePath(
  signer: Certificate,
  certificates: Certificate[],
  anchors: Certificate[],
  now: Date,
): Promise<boolean> {
  const pool = [...new Map([...anchors, ...certificates].map((c) => [fingerprint(c), c])).values()];
  if (pool.length > MAX_CERTIFICATES) return false;
  const trusted = new Set(anchors.map(fingerprint));
  const finder = new CertificateChainValidationEngine({ certs: pool, trustedCerts: anchors });
  const issuerCache = new Map<string, Promise<Certificate[]>>();
  let steps = 0;

  // PKIjs 3.x checks cycles only after recursion returns. Build bounded simple
  // paths first; use its one-step issuer lookup and signature checks, never its
  // recursive search on an untrusted certificate graph.
  async function* paths(path: Certificate[]): AsyncGenerator<Certificate[]> {
    if (++steps > MAX_PATH_STEPS || path.length > MAX_DEPTH) return;
    const certificate = path[path.length - 1];
    if (!certificate) return;
    const id = fingerprint(certificate);
    if (trusted.has(id)) {
      yield path;
      return;
    }
    let issuers = issuerCache.get(id);
    if (!issuers) {
      issuers = finder.defaultFindIssuer(certificate, finder, enrollmentCrypto);
      issuerCache.set(id, issuers);
    }
    const seen = new Set(path.map(fingerprint));
    for (const issuer of await issuers) {
      if (!seen.has(fingerprint(issuer))) yield* paths([...path, issuer]);
    }
  }

  for await (const path of paths([signer])) {
    if (!constraintsAllow(path)) continue;
    const anchor = path[path.length - 1];
    if (!anchor) continue;
    const ids = path.map(fingerprint);
    const validator = new CertificateChainValidationEngine({
      trustedCerts: [anchor],
      // The library expects the end-entity certificate last.
      certs: path.slice(0, -1).reverse(),
      checkDate: now,
      findIssuer: async (certificate) => {
        const index = ids.indexOf(fingerprint(certificate));
        const next = index < 0 ? undefined : path[index + 1];
        return next ? [next] : [];
      },
    });
    try {
      // Retain PKIjs name, date, policy, CA and signature validation, on a fixed
      // acyclic path. Failure of one candidate does not hide an alternate path.
      if ((await validator.verify({}, enrollmentCrypto)).result) return true;
    } catch {
      // Try the next bounded candidate.
    }
  }
  return false;
}
