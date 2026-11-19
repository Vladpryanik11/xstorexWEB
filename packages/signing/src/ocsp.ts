import { X509Certificate } from 'node:crypto';
import type * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { cryptoEngine } from './engine.js';
import { APPLE_WWDR_PEMS } from './wwdr.js';

export type Revocation = 'good' | 'revoked' | 'unknown';

export const OCSP_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const OID_OCSP = '1.3.6.1.5.5.7.48.1';
/** Apple's responder for developer and distribution certificates. */
export const APPLE_OCSP_HOSTS: readonly string[] = ['ocsp.apple.com'];
const SKEW_MS = 5 * 60_000;
/** A response without nextUpdate is trusted for this long after thisUpdate. */
const MAX_AGE_MS = 7 * 24 * 3600_000;
const OID_AIA = '1.3.6.1.5.5.7.1.1';
const OID_BASIC = '1.3.6.1.5.5.7.48.1.1';

let wwdr: X509Certificate[] | null = null;
const appleWwdr = (): X509Certificate[] => {
  wwdr ??= APPLE_WWDR_PEMS.map((pem) => new X509Certificate(pem));
  return wwdr;
};

/** The certificate that issued `cert`: from the `.p12` chain first, then Apple WWDR G3–G6. */
export function findIssuer(
  cert: X509Certificate,
  chain: X509Certificate[],
  extra: X509Certificate[] = appleWwdr(),
): X509Certificate | null {
  for (const candidate of [...chain, ...extra]) {
    if (cert.checkIssued(candidate) && cert.verify(candidate.publicKey)) return candidate;
  }
  return null;
}

const toPkijs = (cert: X509Certificate): pkijs.Certificate => pkijs.Certificate.fromBER(cert.raw);

/** The OCSP responder URL from the certificate's Authority Information Access, if any. */
function ocspUrl(cert: pkijs.Certificate): string | null {
  const aia = cert.extensions?.find((e) => e.extnID === OID_AIA)?.parsedValue as
    | pkijs.InfoAccess
    | undefined;
  const location = aia?.accessDescriptions.find((d) => d.accessMethod === OID_OCSP)?.accessLocation;
  const url = location?.type === 6 ? String(location.value) : null;
  return url && /^https?:\/\//.test(url) ? url : null;
}

/**
 * Asks the certificate's OCSP responder whether it is revoked. Only a response signed by the
 * issuer (or a responder it delegated) about this exact certificate counts; anything else —
 * timeout, network error, malformed or foreign answer — is `unknown` and must change nothing.
 */
export async function checkRevocation(
  cert: X509Certificate,
  issuer: X509Certificate,
  opts: { fetchFn?: typeof fetch; allowedHosts?: readonly string[]; now?: Date } = {},
): Promise<Revocation> {
  const fetchFn = opts.fetchFn ?? fetch;
  const allowedHosts = opts.allowedHosts ?? APPLE_OCSP_HOSTS;
  const now = (opts.now ?? new Date()).getTime();
  try {
    // Only ask about a certificate this issuer really signed, and only Apple's responder: the
    // URL comes from an uploaded file and must not point the server anywhere else.
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) return 'unknown';
    const target = toPkijs(cert);
    const issuerCert = toPkijs(issuer);
    const url = ocspUrl(target);
    if (!url || !allowedHosts.includes(new URL(url).hostname.toLowerCase())) return 'unknown';

    const request = new pkijs.OCSPRequest();
    await request.createForCertificate(
      target,
      { hashAlgorithm: 'SHA-1', issuerCertificate: issuerCert },
      cryptoEngine,
    );
    const body = Buffer.from(request.toSchema(true).toBER(false));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OCSP_TIMEOUT_MS);
    let bytes: ArrayBuffer;
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/ocsp-request' },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      if (!res.ok) return 'unknown';
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > MAX_RESPONSE_BYTES) return 'unknown';
      const read = await readCapped(res, MAX_RESPONSE_BYTES);
      if (!read) {
        controller.abort();
        return 'unknown';
      }
      bytes = read;
    } finally {
      clearTimeout(timer);
    }
    if (bytes.byteLength === 0) return 'unknown';

    const response = pkijs.OCSPResponse.fromBER(bytes);
    if (response.responseStatus.valueBlock.valueDec !== 0) return 'unknown';
    if (response.responseBytes?.responseType !== OID_BASIC) return 'unknown';
    const basic = pkijs.BasicOCSPResponse.fromBER(
      new Uint8Array(response.responseBytes.response.valueBlock.valueHexView),
    );
    if (!(await signedByIssuer(basic, issuer, issuerCert))) return 'unknown';

    for (const single of basic.tbsResponseData.responses) {
      if (!(await single.certID.isEqual(await certIdFor(target, issuerCert)))) continue;
      if (!fresh(single, now)) return 'unknown';
      const tag = (single.certStatus as asn1js.BaseBlock).idBlock.tagNumber;
      if (tag === 0) return 'good';
      if (tag === 1) return 'revoked';
      return 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

const OID_OCSP_SIGNING = '1.3.6.1.5.5.7.3.9';

/** RFC 6960 §3.2: not from the future, not past nextUpdate, not older than a week without it. */
function fresh(single: pkijs.SingleResponse, now: number): boolean {
  const thisUpdate = single.thisUpdate.getTime();
  if (thisUpdate > now + SKEW_MS) return false;
  if (single.nextUpdate) return single.nextUpdate.getTime() + SKEW_MS >= now;
  return now - thisUpdate <= MAX_AGE_MS;
}

/** The body, or `null` as soon as it grows past `limit` (the rest is never read). */
async function readCapped(res: Response, limit: number): Promise<ArrayBuffer | null> {
  if (!res.body) return new ArrayBuffer(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * RFC 6960 §4.2.2.2: the response is signed by the issuer itself or by a responder certificate
 * the issuer issued for OCSP signing (extended key usage id-kp-OCSPSigning), valid now.
 */
async function signedByIssuer(
  basic: pkijs.BasicOCSPResponse,
  issuer: X509Certificate,
  issuerCert: pkijs.Certificate,
): Promise<boolean> {
  const candidates = [issuer];
  for (const c of basic.certs ?? []) {
    const node = new X509Certificate(Buffer.from(c.toSchema(false).toBER(false)));
    if (node.raw.equals(issuer.raw)) continue;
    const now = Date.now();
    if (
      node.checkIssued(issuer) &&
      node.verify(issuer.publicKey) &&
      node.keyUsage?.includes(OID_OCSP_SIGNING) &&
      new Date(node.validFrom).getTime() <= now &&
      new Date(node.validTo).getTime() > now
    ) {
      candidates.push(node);
    }
  }
  for (const signer of candidates) {
    const info = signer === issuer ? issuerCert : pkijs.Certificate.fromBER(signer.raw);
    try {
      const ok = await cryptoEngine.verifyWithPublicKey(
        new Uint8Array(basic.tbsResponseData.tbsView),
        basic.signature,
        info.subjectPublicKeyInfo,
        basic.signatureAlgorithm,
      );
      if (ok) return true;
    } catch {
      // next candidate
    }
  }
  return false;
}

async function certIdFor(
  cert: pkijs.Certificate,
  issuer: pkijs.Certificate,
): Promise<pkijs.CertID> {
  const id = new pkijs.CertID();
  await id.createForCertificate(
    cert,
    { hashAlgorithm: 'SHA-1', issuerCertificate: issuer },
    cryptoEngine,
  );
  return id;
}
